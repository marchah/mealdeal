import { randomUUID } from 'node:crypto';
import { createYoga } from 'graphql-yoga';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Maybe } from '../../src/common/types';
import { createContext } from '../../src/context';
import { createDb } from '../../src/db/client';
import { ingestRuns } from '../../src/db/schema';
import { schema } from '../../src/schema';
import { resetDb } from './resetDb';

// INTEGRATION test for the appConfig feature. Proves what the unit spec cannot: the query resolves
// end-to-end through the real Yoga app (HTTP parse -> context -> composition root -> resolver ->
// service -> repository -> libsql), that the composition root really injects the parsed settings,
// and that lastIngestAt is read from the ingest_runs table rather than a mocked port. We drive
// yoga.fetch (not graphql-js) so there is a single graphql instance; beforeEach isolates each test.

const yoga = createYoga({ schema, context: createContext });

interface AppConfigResponse {
  errors?: unknown;
  data?: {
    appConfig: {
      couponIngestEnabled: boolean;
      lastIngestAt: Maybe<string>;
      receiptImportEnabled: boolean;
    };
  };
}

async function runQuery(app = yoga): Promise<AppConfigResponse> {
  const response = await app.fetch('http://localhost/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: '{ appConfig { couponIngestEnabled lastIngestAt receiptImportEnabled } }',
    }),
  });
  return (await response.json()) as AppConfigResponse;
}

// A finished run; `startedAt` is deliberately later than `finishedAt` nowhere — only finished runs
// count, which the unfinished-run test below relies on.
async function seedIngestRun(finishedAt: Maybe<Date>): Promise<void> {
  await createDb()
    .insert(ingestRuns)
    .values({
      id: randomUUID(),
      startedAt: new Date('2026-08-12T09:00:00Z'),
      finishedAt,
      messagesSeen: 4,
      dealsAdded: 2,
      messagesFailed: 0,
    });
}

beforeEach(resetDb);
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

test('reports coupon ingestion as paused by default, with no import yet', async () => {
  const body = await runQuery();

  expect(body.errors).toBeUndefined();
  // The suite runs without COUPON_INGEST_ENABLED set, which is the shipped default.
  expect(body.data?.appConfig.couponIngestEnabled).toBe(false);
  expect(body.data?.appConfig.lastIngestAt).toBeNull();
});

test('surfaces the most recent completed run from the real ingest_runs table', async () => {
  await seedIngestRun(new Date('2026-07-01T00:00:00Z'));
  await seedIngestRun(new Date('2026-08-12T09:30:00Z'));

  const body = await runQuery();

  expect(body.errors).toBeUndefined();
  expect(body.data?.appConfig.lastIngestAt).toBe('2026-08-12T09:30:00.000Z');
});

test('ignores a run that started but never finished', async () => {
  // A pass that crashed mid-flight must not be reported to the SPA as a completed import.
  await seedIngestRun(null);

  const body = await runQuery();

  expect(body.errors).toBeUndefined();
  expect(body.data?.appConfig.lastIngestAt).toBeNull();
});

test('reports receipt import as off while no OCR service is configured', async () => {
  const body = await runQuery();

  expect(body.errors).toBeUndefined();
  // The suite runs without OCR_BASE_URL set, which is the shipped default.
  expect(body.data?.appConfig.receiptImportEnabled).toBe(false);
});

test('reports receipt import as on once OCR_BASE_URL is set', async () => {
  // Settings are parsed once, when the module graph loads: rebuild it under the new environment,
  // so the real settings parse and composition root are what turn the flag on.
  vi.stubEnv('OCR_BASE_URL', 'http://ocr.example.test:8866');
  vi.resetModules();
  const { schema: ocrSchema } = await import('../../src/schema');
  const { createContext: ocrContext } = await import('../../src/context');

  const body = await runQuery(createYoga({ schema: ocrSchema, context: ocrContext }));

  expect(body.errors).toBeUndefined();
  expect(body.data?.appConfig.receiptImportEnabled).toBe(true);
  expect(body.data?.appConfig.couponIngestEnabled).toBe(false);
});
