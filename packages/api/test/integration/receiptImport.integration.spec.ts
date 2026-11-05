import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { count, eq } from 'drizzle-orm';
import { createYoga } from 'graphql-yoga';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { settings } from '../../src/common/settings';
import type { Maybe } from '../../src/common/types';
import { createDb } from '../../src/db/client';
import { merchants, receiptImages, receipts } from '../../src/db/schema';
import type { getServices } from '../../src/services';
import { resetDb } from './resetDb';

// INTEGRATION test for receipt import: the whole pipeline through the real composition root —
// a multipart upload over HTTP, the photo store, the paddleocr adapter and service, the openai
// adapter, the parser, the merchant entity and the receipt tables — with the two services on the
// far side of the network replaced by in-test HTTP stubs. The OCR stub answers with slice 1's
// recorded boxes and the LLM stub with slice 2's recorded reply, so what reaches the parser is
// the real rebuilt text. The photos are synthetic bytes: no real receipt photo is ever committed.

const fixture = (path: string) =>
  readFileSync(new URL(`../fixtures/${path}`, import.meta.url), 'utf8');
const OCR_BOXES = fixture('paddleocr/aldi-2026-11-02.json');
// The rows the OCR stage rebuilds from those boxes; the fixture file ends in a newline they lack.
const OCR_TEXT = fixture('receiptParser/aldi-2026-11-02.txt').trimEnd();
const LLM_REPLY = fixture('receiptParser/aldi-2026-11-02.reply.json');

type StubMode = 'ok' | 'fail';

interface Stub {
  server: Server;
  url: string;
  mode: StubMode;
  requests: { contentType: Maybe<string>; body: Buffer }[];
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

async function startStub(
  answer: (stub: Stub, req: IncomingMessage, res: ServerResponse) => void,
): Promise<Stub> {
  const stub: Stub = { server: createServer(), url: '', mode: 'ok', requests: [] };
  stub.server.on('request', (req: IncomingMessage, res: ServerResponse) => {
    void readBody(req).then((body) => {
      stub.requests.push({ contentType: req.headers['content-type'] ?? null, body });
      answer(stub, req, res);
    });
  });
  await new Promise<void>((resolve) => stub.server.listen(0, '127.0.0.1', resolve));
  const address = stub.server.address();
  if (address === null || typeof address === 'string') throw new Error('stub has no port');
  stub.url = `http://127.0.0.1:${String(address.port)}`;
  return stub;
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

// deploy/ocr/server.py: POST /ocr with one photo's bytes, its boxes back.
const ocrStub = await startStub((stub, req, res) => {
  if (req.method !== 'POST' || req.url !== '/ocr') return json(res, 404, { error: 'not found' });
  if (stub.mode === 'fail') return json(res, 500, { error: 'engine failed' });
  json(res, 200, OCR_BOXES);
});

// An OpenAI-compatible /chat/completions. A 200 with prose rather than JSON, when failing: the
// SDK retries a 5xx on its own, and the parser's own refusal is the failure under test.
const llmStub = await startStub((stub, req, res) => {
  if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
    return json(res, 404, { error: { message: 'not found' } });
  }
  json(res, 200, {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: 0,
    model: 'test-model',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: stub.mode === 'fail' ? 'Sorry, I cannot read that receipt.' : LLM_REPLY,
        },
        finish_reason: 'stop',
      },
    ],
  });
});

interface App {
  url: string;
  server: Server;
  services: typeof getServices;
}

// Settings are parsed once, when the module graph loads, so each configuration gets a graph of
// its own: the real settings parse and composition root decide whether import is on.
async function loadApp(env: Record<string, string>): Promise<App> {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  vi.resetModules();
  const { schema } = await import('../../src/schema');
  const { createContext } = await import('../../src/context');
  const { getServices: services } = await import('../../src/services');
  const yoga = createYoga({ schema, context: createContext });
  const server = createServer((req, res) => {
    void yoga(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('app has no port');
  return { url: `http://127.0.0.1:${String(address.port)}/graphql`, server, services };
}

let on: App;
let off: App;

beforeAll(async () => {
  off = await loadApp({ OCR_BASE_URL: '' });
  on = await loadApp({
    OCR_BASE_URL: ocrStub.url,
    OPENAI_BASE_URL: `${llmStub.url}/v1`,
    OPENAI_API_KEY: 'test-key',
  });
  vi.unstubAllEnvs();
});

afterAll(async () => {
  vi.resetModules();
  for (const server of [on.server, off.server, ocrStub.server, llmStub.server]) {
    await new Promise((resolve) => server.close(resolve));
  }
});

beforeEach(async () => {
  await resetDb();
  ocrStub.mode = 'ok';
  llmStub.mode = 'ok';
  ocrStub.requests = [];
  llmStub.requests = [];
});

interface GraphQLResponse<T> {
  errors?: unknown;
  data?: T;
}

async function graphql<T>(app: App, query: string, variables: Record<string, unknown> = {}) {
  const response = await fetch(app.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  return (await response.json()) as GraphQLResponse<T>;
}

// The error members each result union can hold; spreading one a union lacks is invalid.
const errors = (...types: string[]) =>
  ['__typename', ...types.map((type) => `... on ${type} { message }`)].join(' ');

const RECEIPT_FIELDS = `
  id status failedStage error purchasedAt subtotal tax total flags photoCount createdAt
  merchant { id name }
  lines { position itemNumber printedText quantity unitPrice weight weightUnit lineTotal taxFlag flags }
`;

interface ReceiptData {
  id: string;
  status: string;
  failedStage: Maybe<string>;
  error: Maybe<string>;
  purchasedAt: Maybe<string>;
  subtotal: Maybe<number>;
  tax: Maybe<number>;
  total: Maybe<number>;
  flags: string[];
  photoCount: number;
  merchant: Maybe<{ id: string; name: string }>;
  lines: {
    position: number;
    itemNumber: Maybe<string>;
    lineTotal: number;
    weight: Maybe<number>;
  }[];
}

type Result = { __typename: string; message?: string; data?: ReceiptData };

const photo = (text: string, type = 'image/jpeg') =>
  new File([new TextEncoder().encode(text)], 'receipt.jpg', { type });

// A real multipart request (graphql-multipart-request-spec), as urql sends one.
async function upload(app: App, files: File[]): Promise<Result> {
  const form = new FormData();
  form.append(
    'operations',
    JSON.stringify({
      query: `mutation Upload($images: [File!]!) {
        uploadReceipt(images: $images) {
          ${errors('ConflictError', 'ReceiptImportDisabledError', 'ValidationError', 'ServerError')}
          ... on MutationUploadReceiptSuccess { data { ${RECEIPT_FIELDS} } }
        }
      }`,
      variables: { images: files.map(() => null) },
    }),
  );
  form.append(
    'map',
    JSON.stringify(
      Object.fromEntries(files.map((_, index) => [index, [`variables.images.${String(index)}`]])),
    ),
  );
  files.forEach((file, index) => {
    form.append(String(index), file);
  });
  const response = await fetch(app.url, { method: 'POST', body: form });
  const body = (await response.json()) as GraphQLResponse<{ uploadReceipt: Result }>;
  expect(body.errors).toBeUndefined();
  if (!body.data) throw new Error('no data');
  return body.data.uploadReceipt;
}

async function uploaded(app: App, files: File[]): Promise<ReceiptData> {
  const result = await upload(app, files);
  if (!result.data) throw new Error(`upload refused: ${result.__typename} ${result.message ?? ''}`);
  return result.data;
}

async function getReceipt(app: App, id: string): Promise<Result> {
  const body = await graphql<{ receipt: Result }>(
    app,
    `query Receipt($id: ID!) { receipt(id: $id) { ${errors('NotFoundError', 'ServerError')} ... on QueryReceiptSuccess { data { ${RECEIPT_FIELDS} } } } }`,
    { id },
  );
  expect(body.errors).toBeUndefined();
  if (!body.data) throw new Error('no data');
  return body.data.receipt;
}

async function mutate(app: App, name: 'retryReceipt' | 'deleteReceipt', id: string) {
  const [success, refusals] =
    name === 'retryReceipt'
      ? ['MutationRetryReceiptSuccess', errors('ConflictError', 'NotFoundError', 'ServerError')]
      : ['MutationDeleteReceiptSuccess', errors('NotFoundError', 'ServerError')];
  const body = await graphql<Record<string, Result>>(
    app,
    `mutation Act($id: ID!) { ${name}(id: $id) { ${refusals} ... on ${success} { data { id status } } } }`,
    { id },
  );
  expect(body.errors).toBeUndefined();
  const result = body.data?.[name];
  if (!result) throw new Error('no data');
  return result;
}

// Polls the way the web view does, until the background pipeline has stopped on the receipt.
async function settled(app: App, id: string): Promise<ReceiptData> {
  let receipt: Maybe<ReceiptData> = null;
  await vi.waitFor(
    async () => {
      receipt = (await getReceipt(app, id)).data ?? null;
      expect(['PARSED', 'FAILED']).toContain(receipt?.status);
    },
    { timeout: 15_000, interval: 25 },
  );
  if (!receipt) throw new Error('unreachable');
  return receipt;
}

const countRows = async (table: typeof receipts | typeof merchants) =>
  (await createDb().select({ value: count() }).from(table))[0]?.value ?? 0;

const fileExists = (path: string) =>
  access(join(settings.RECEIPTS_DIR, path)).then(
    () => true,
    () => false,
  );

describe('uploadReceipt and the pipeline', () => {
  test('reads an uploaded photo through OCR and the parser into a PARSED receipt', async () => {
    const receipt = await uploaded(on, [photo('synthetic receipt photo')]);

    // Answered before the slow part: stored, counted, and not read yet.
    expect(receipt).toMatchObject({ status: 'UPLOADED', photoCount: 1, lines: [], merchant: null });

    const parsed = await settled(on, receipt.id);
    expect(parsed).toMatchObject({
      status: 'PARSED',
      failedStage: null,
      error: null,
      subtotal: 78.72,
      tax: 1.99,
      total: 80.71,
      flags: [],
      photoCount: 1,
      merchant: { name: 'Aldi' },
    });
    expect(parsed.lines).toHaveLength(31);
    expect(parsed.lines.map((line) => line.position)).toEqual([...Array(31).keys()]);
    expect(parsed.lines[0]).toMatchObject({ itemNumber: '382719', lineTotal: 0.96 });
    expect(parsed.lines.filter((line) => line.weight !== null)).toHaveLength(2);

    // The OCR service got the stored photo's bytes, as an image.
    expect(ocrStub.requests).toHaveLength(1);
    expect(ocrStub.requests[0]?.contentType).toBe('image/jpeg');
    expect(ocrStub.requests[0]?.body.toString()).toBe('synthetic receipt photo');
    // The model got slice 1's rows rebuilt from the boxes — slice 2's text, byte for byte — and,
    // with no store known yet, an empty list of them.
    expect(llmStub.requests).toHaveLength(1);
    const completion = JSON.parse(llmStub.requests[0]?.body.toString() ?? '{}') as {
      messages: { role: string; content: string }[];
    };
    expect(completion.messages.find((m) => m.role === 'user')?.content).toBe(OCR_TEXT);
    expect(completion.messages.find((m) => m.role === 'system')?.content).toContain(
      'Known stores: []',
    );

    // The store the receipt named was created; the OCR text and engine were kept.
    const [stored] = await createDb().select().from(receipts).where(eq(receipts.id, receipt.id));
    expect(stored?.merchantId).toBe(parsed.merchant?.id);
    expect(stored).toMatchObject({
      ocrText: OCR_TEXT,
      ocrEngine: 'PP-OCRv6_medium (paddleocr 3.7.0)',
    });
    expect(await countRows(merchants)).toBe(1);
  }, 20_000);

  test('hands the parser the known stores and reuses the one it picks', async () => {
    const aldiId = randomUUID();
    await createDb().insert(merchants).values({ id: aldiId, name: 'Aldi' });

    const parsed = await settled(on, (await uploaded(on, [photo('synthetic photo')])).id);

    expect(parsed.merchant).toEqual({ id: aldiId, name: 'Aldi' });
    expect(await countRows(merchants)).toBe(1);
    expect(llmStub.requests[0]?.body.toString()).toContain('Known stores: [\\"Aldi\\"]');
  }, 20_000);

  test('refuses the same photos twice, and flags a different photo of the same purchase', async () => {
    const first = await settled(on, (await uploaded(on, [photo('synthetic photo')])).id);
    expect(first.flags).toEqual([]);

    const again = await upload(on, [photo('synthetic photo')]);
    expect(again).toMatchObject({
      __typename: 'ConflictError',
      message: expect.stringContaining('already uploaded') as string,
    });
    expect(await countRows(receipts)).toBe(1);

    // Another photo of the same receipt: new bytes, but the same store, day and total.
    const second = await settled(on, (await uploaded(on, [photo('a second synthetic photo')])).id);
    expect(second).toMatchObject({ status: 'PARSED', flags: ['POSSIBLE_DUPLICATE'] });
    expect((await getReceipt(on, first.id)).data?.flags).toEqual([]);
  }, 20_000);

  test('refuses an upload while receipt import is off, and stores nothing', async () => {
    const result = await upload(off, [photo('synthetic photo')]);

    expect(result).toMatchObject({
      __typename: 'ReceiptImportDisabledError',
      message: expect.stringContaining('OCR_BASE_URL') as string,
    });
    expect(await countRows(receipts)).toBe(0);
    expect(ocrStub.requests).toHaveLength(0);
  });

  test.each<[string, File[], string]>([
    ['a file that is not an image', [photo('plain text', 'text/plain')], 'Only image files'],
    ['an empty photo', [photo('')], 'must not be empty'],
    ['no photos at all', [], 'at least one photo'],
    [
      'more photos than a receipt can have',
      Array.from({ length: 11 }, (_, page) => photo(`synthetic page ${String(page)}`)),
      'at most 10 photos',
    ],
  ])('refuses %s, and stores nothing', async (_case, files, message) => {
    const result = await upload(on, files);

    expect(result).toMatchObject({
      __typename: 'ValidationError',
      message: expect.stringContaining(message) as string,
    });
    expect(await countRows(receipts)).toBe(0);
  });
});

describe('failures, retries and restarts', () => {
  test('records an OCR failure, then a retry reads the photo again and finishes', async () => {
    ocrStub.mode = 'fail';
    const { id } = await uploaded(on, [photo('synthetic photo')]);

    const failed = await settled(on, id);
    expect(failed).toMatchObject({
      status: 'FAILED',
      failedStage: 'OCR',
      error: 'OCR service answered 500: engine failed',
    });
    expect(llmStub.requests).toHaveLength(0);

    ocrStub.mode = 'ok';
    expect(await mutate(on, 'retryReceipt', id)).toMatchObject({ data: { status: 'UPLOADED' } });

    expect(await settled(on, id)).toMatchObject({
      status: 'PARSED',
      failedStage: null,
      error: null,
    });
    expect(ocrStub.requests).toHaveLength(2);
  }, 20_000);

  test('a retried parse uses the saved text and does not read the photo again', async () => {
    llmStub.mode = 'fail';
    const { id } = await uploaded(on, [photo('synthetic photo')]);

    expect(await settled(on, id)).toMatchObject({
      status: 'FAILED',
      failedStage: 'PARSE',
      error: 'LLM returned non-JSON output',
    });

    llmStub.mode = 'ok';
    expect(await mutate(on, 'retryReceipt', id)).toMatchObject({ data: { status: 'OCR_DONE' } });

    expect(await settled(on, id)).toMatchObject({ status: 'PARSED', total: 80.71 });
    expect(ocrStub.requests).toHaveLength(1);
    expect(llmStub.requests).toHaveLength(2);
  }, 20_000);

  test('refuses to retry a receipt that has not failed', async () => {
    const parsed = await settled(on, (await uploaded(on, [photo('synthetic photo')])).id);

    expect(await mutate(on, 'retryReceipt', parsed.id)).toMatchObject({
      __typename: 'ConflictError',
    });
  }, 20_000);

  test('resumes a receipt a restart left mid-pipeline', async () => {
    // Stored but never queued, as after a crash between the upload and the OCR stage.
    const { receiptService, receiptImportService } = on.services();
    const { id } = await receiptService.addReceipt({
      photos: [{ bytes: new TextEncoder().encode('synthetic photo'), contentType: 'image/png' }],
    });

    await expect(receiptImportService.resumeReceiptImports()).resolves.toBe(1);

    expect(await settled(on, id)).toMatchObject({ status: 'PARSED', total: 80.71 });
    expect(ocrStub.requests[0]?.contentType).toBe('image/png');
  }, 20_000);

  test('deletes a failed receipt with its photo, after which the photo can be uploaded again', async () => {
    ocrStub.mode = 'fail';
    const { id } = await uploaded(on, [photo('synthetic photo')]);
    await settled(on, id);
    const [image] = await createDb()
      .select()
      .from(receiptImages)
      .where(eq(receiptImages.receiptId, id));
    if (!image) throw new Error('expected an image row');
    expect(await fileExists(image.path)).toBe(true);

    expect(await mutate(on, 'deleteReceipt', id)).toMatchObject({ data: { id } });

    expect(await getReceipt(on, id)).toMatchObject({ __typename: 'NotFoundError' });
    expect(await fileExists(image.path)).toBe(false);
    ocrStub.mode = 'ok';
    expect(await settled(on, (await uploaded(on, [photo('synthetic photo')])).id)).toMatchObject({
      status: 'PARSED',
    });
  }, 20_000);
});

describe('receipts query', () => {
  test('lists receipts newest first, filtered by status when asked', async () => {
    const parsed = await settled(on, (await uploaded(on, [photo('synthetic photo one')])).id);
    // A different purchase in the same second would tie on created_at; keep them a second apart.
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    ocrStub.mode = 'fail';
    const failed = await settled(on, (await uploaded(on, [photo('synthetic photo two')])).id);

    const list = async (statuses: Maybe<string[]>) => {
      const body = await graphql<{ receipts: { id: string }[] }>(
        on,
        'query List($statuses: [ReceiptStatus!]) { receipts(statuses: $statuses) { id } }',
        { statuses },
      );
      expect(body.errors).toBeUndefined();
      return body.data?.receipts.map((receipt) => receipt.id);
    };

    expect(await list(null)).toEqual([failed.id, parsed.id]);
    expect(await list(['FAILED'])).toEqual([failed.id]);
    expect(await list(['UPLOADED', 'OCR_DONE'])).toEqual([]);
  }, 20_000);
});
