import { describe, expect, it, vi } from 'vitest';
import {
  ConflictError,
  NotFoundError,
  OcrServiceError,
  ReceiptImportDisabledError,
  ServerError,
} from '../../common/errors';
import type { Maybe } from '../../common/types';
import type { Merchant, MerchantService } from '../../entities/merchant/types';
import {
  ReceiptFlag,
  ReceiptStage,
  ReceiptStatus,
  type AddReceiptInput,
  type ListReceiptsByPurchaseInput,
  type ListReceiptsInput,
  type ParsedReceiptLine,
  type Receipt,
  type ReceiptImage,
  type ReceiptOcrInput,
  type ReceiptParseInput,
  type ReceiptPhotoInput,
  type ReceiptService,
} from '../../entities/receipt/types';
import type {
  ParsedReceipt,
  ReceiptParserService,
  ReceiptTextParseInput,
} from '../receiptParser/types';
import { receiptImportServiceFactory } from './service';
import type { ReceiptTextReader } from './types';

// Every receipt here is synthetic. The receipt service is a small in-memory stand-in for the
// functions the pipeline calls, so a test reads a receipt's status the way the app would.

const ALDI: Merchant = {
  id: 'merchant-aldi',
  name: 'Aldi',
  address: null,
  lat: null,
  lng: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const OCR_TEXT = '382719 Mixed Vegetables   0.96 FB\nSUBTOTAL   0.96';

const makeReceipt = (over: Partial<Receipt> = {}): Receipt => ({
  id: 'receipt-1',
  merchantId: null,
  purchasedAt: null,
  status: ReceiptStatus.UPLOADED,
  failedStage: null,
  error: null,
  ocrText: null,
  ocrEngine: null,
  subtotal: null,
  tax: null,
  total: null,
  imageHash: 'hash',
  flags: [],
  createdAt: new Date('2026-11-02T12:00:00Z'),
  ...over,
});

const line: ParsedReceiptLine = {
  itemNumber: '382719',
  printedText: 'Mixed Vegetables',
  description: 'Mixed vegetables',
  quantity: 1,
  unitPrice: 0.96,
  weight: null,
  weightUnit: null,
  lineTotal: 0.96,
  discount: null,
  taxFlag: 'FB',
  flags: [],
};

const makeParsed = (over: Partial<ParsedReceipt> = {}): ParsedReceipt => ({
  merchantId: ALDI.id,
  storeName: ALDI.name,
  purchasedAt: new Date(2026, 10, 2, 11, 30),
  subtotal: 0.96,
  tax: 0.02,
  total: 0.98,
  printedItemCount: 1,
  lines: [line],
  flags: [],
  ...over,
});

const upload = (...pages: string[]): AddReceiptInput => ({
  photos: pages.map((page) => ({
    bytes: new TextEncoder().encode(page),
    contentType: 'image/jpeg',
  })),
});

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// A promise that rejects, rather than a function that throws, when the work throws.
const settle = <T>(work: () => T) => new Promise<T>((resolve) => resolve(work()));

function makePipeline(
  over: {
    receipts?: Receipt[];
    /** Null turns receipt import off, as an unset OCR_BASE_URL does. */
    reader?: Maybe<ReceiptTextReader['readReceiptText']>;
    parse?: (input: ReceiptTextParseInput) => Promise<ParsedReceipt>;
    pages?: number;
  } = {},
) {
  const rows = new Map((over.receipts ?? []).map((receipt) => [receipt.id, receipt]));
  let added = 0;

  const stored = (id: string) => {
    const receipt = rows.get(id);
    if (!receipt) throw new NotFoundError(`No receipt with id ${id}`);
    return receipt;
  };
  const write = (id: string, update: Partial<Receipt>) =>
    settle(() => {
      const next = { ...stored(id), ...update };
      rows.set(id, next);
      return next;
    });

  const receiptFns = {
    getReceiptById: vi.fn((id: string) => settle(() => stored(id))),
    listReceipts: vi.fn(({ statuses }: ListReceiptsInput) =>
      Promise.resolve(
        [...rows.values()]
          .filter((receipt) => statuses === null || statuses.includes(receipt.status))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      ),
    ),
    listReceiptsByPurchase: vi.fn((input: ListReceiptsByPurchaseInput) =>
      Promise.resolve(
        [...rows.values()].filter(
          (receipt) =>
            receipt.merchantId === input.merchantId &&
            receipt.purchasedAt !== null &&
            receipt.purchasedAt >= input.purchasedFrom &&
            receipt.purchasedAt < input.purchasedBefore,
        ),
      ),
    ),
    listReceiptImages: vi.fn((receiptId: string) =>
      Promise.resolve(
        Array.from({ length: over.pages ?? 1 }, (_, position): ReceiptImage => ({
          id: `${receiptId}-image-${String(position)}`,
          receiptId,
          position,
          path: `${receiptId}/page-${String(position + 1)}`,
          contentType: 'image/jpeg',
          bytes: 10,
        })),
      ),
    ),
    readReceiptImage: vi.fn((image: ReceiptImage) =>
      Promise.resolve(new TextEncoder().encode(image.path)),
    ),
    addReceipt: vi.fn((_input: AddReceiptInput) => {
      added += 1;
      const receipt = makeReceipt({
        id: `receipt-${String(added)}`,
        createdAt: new Date(2026, 10, 2, 12, added),
      });
      rows.set(receipt.id, receipt);
      return Promise.resolve(receipt);
    }),
    updateReceiptStatus: vi.fn((id: string, status: ReceiptStatus) =>
      write(id, { status, failedStage: null, error: null }),
    ),
    updateReceiptOcrText: vi.fn((id: string, ocr: ReceiptOcrInput) =>
      write(id, { ...ocr, status: ReceiptStatus.OCR_DONE, failedStage: null, error: null }),
    ),
    updateReceiptParse: vi.fn((id: string, { lines: _lines, ...header }: ReceiptParseInput) =>
      write(id, { ...header, status: ReceiptStatus.PARSED, failedStage: null, error: null }),
    ),
    recordReceiptFailure: vi.fn((id: string, stage: ReceiptStage, error: string) =>
      write(id, { status: ReceiptStatus.FAILED, failedStage: stage, error }),
    ),
  };
  const merchantFns = {
    listMerchants: vi.fn(() => Promise.resolve([ALDI])),
    getOrCreateMerchant: vi.fn((name: string) =>
      Promise.resolve({ ...ALDI, id: `merchant-${name.toLowerCase()}`, name }),
    ),
  };
  const parserFns = {
    parseReceiptText: vi.fn(over.parse ?? (() => Promise.resolve(makeParsed()))),
  };
  const readReceiptText = vi.fn(
    over.reader === null
      ? () => Promise.reject(new Error('unreachable'))
      : (over.reader ??
          ((_photos: readonly ReceiptPhotoInput[]) =>
            Promise.resolve({ ocrText: OCR_TEXT, ocrEngine: 'test-engine' }))),
  );

  // @ts-expect-error partial mock: only the functions the pipeline calls are provided
  const receiptService: ReceiptService = receiptFns;
  // @ts-expect-error partial mock: only listMerchants and getOrCreateMerchant are used
  const merchantService: MerchantService = merchantFns;
  const receiptParserService: ReceiptParserService = parserFns;

  const service = receiptImportServiceFactory({
    receiptTextReader: over.reader === null ? null : { readReceiptText },
    receiptService,
    merchantService,
    receiptParserService,
  });

  return {
    service,
    receiptFns,
    merchantFns,
    parserFns,
    readReceiptText,
    receipt: (id: string) => stored(id),
    deleteRow: (id: string) => rows.delete(id),
    settled: (id: string, status: ReceiptStatus) =>
      vi.waitFor(() => {
        expect(stored(id).status).toBe(status);
      }),
  };
}

describe('receiptImportService.uploadReceipt', () => {
  it('answers with the UPLOADED receipt at once, then reads and parses it in the background', async () => {
    const ocr = deferred<ReceiptOcrInput>();
    const pipeline = makePipeline({ reader: () => ocr.promise });

    const receipt = await pipeline.service.uploadReceipt(upload('page one'));

    expect(receipt.status).toBe(ReceiptStatus.UPLOADED);
    expect(pipeline.receiptFns.addReceipt).toHaveBeenCalledWith(upload('page one'));
    await vi.waitFor(() => {
      expect(pipeline.readReceiptText).toHaveBeenCalled();
    });
    expect(pipeline.receipt(receipt.id).status).toBe(ReceiptStatus.UPLOADED);

    ocr.resolve({ ocrText: OCR_TEXT, ocrEngine: 'test-engine' });
    await pipeline.settled(receipt.id, ReceiptStatus.PARSED);
  });

  it('refuses while receipt import is off, and stores nothing', async () => {
    const pipeline = makePipeline({ reader: null });

    await expect(pipeline.service.uploadReceipt(upload('page one'))).rejects.toBeInstanceOf(
      ReceiptImportDisabledError,
    );
    expect(pipeline.receiptFns.addReceipt).not.toHaveBeenCalled();
  });

  it('passes on a refused duplicate photo, and queues nothing', async () => {
    const pipeline = makePipeline();
    const duplicate = new ConflictError('These photos are already uploaded as a receipt');
    pipeline.receiptFns.addReceipt.mockRejectedValueOnce(duplicate);

    await expect(pipeline.service.uploadReceipt(upload('page one'))).rejects.toBe(duplicate);
    expect(pipeline.readReceiptText).not.toHaveBeenCalled();
  });
});

describe('receiptImportService pipeline', () => {
  it('reads the photos in page order, saves the text, then parses it against the known stores', async () => {
    const pipeline = makePipeline({ pages: 2 });

    const { id } = await pipeline.service.uploadReceipt(upload('top', 'bottom'));
    await pipeline.settled(id, ReceiptStatus.PARSED);

    const encode = (text: string) => new TextEncoder().encode(text);
    expect(pipeline.readReceiptText).toHaveBeenCalledWith([
      { bytes: encode(`${id}/page-1`), contentType: 'image/jpeg' },
      { bytes: encode(`${id}/page-2`), contentType: 'image/jpeg' },
    ]);
    expect(pipeline.receiptFns.updateReceiptOcrText).toHaveBeenCalledWith(id, {
      ocrText: OCR_TEXT,
      ocrEngine: 'test-engine',
    });
    expect(pipeline.parserFns.parseReceiptText).toHaveBeenCalledWith({
      ocrText: OCR_TEXT,
      knownStores: [ALDI],
    });
    expect(pipeline.receiptFns.updateReceiptParse).toHaveBeenCalledWith(id, {
      merchantId: ALDI.id,
      purchasedAt: new Date(2026, 10, 2, 11, 30),
      subtotal: 0.96,
      tax: 0.02,
      total: 0.98,
      lines: [line],
      flags: [],
    });
    // PARSED is the last stage until matching lands, and it passed every check.
    expect(pipeline.receipt(id)).toMatchObject({ failedStage: null, error: null, flags: [] });
  });

  it('creates the store the parser names when it is not a known one', async () => {
    const pipeline = makePipeline({
      parse: () => Promise.resolve(makeParsed({ merchantId: null, storeName: 'Food Lion' })),
    });

    const { id } = await pipeline.service.uploadReceipt(upload('page one'));
    await pipeline.settled(id, ReceiptStatus.PARSED);

    expect(pipeline.merchantFns.getOrCreateMerchant).toHaveBeenCalledWith('Food Lion');
    expect(pipeline.receipt(id).merchantId).toBe('merchant-food lion');
  });

  it('reuses a known store without creating one', async () => {
    const pipeline = makePipeline();

    const { id } = await pipeline.service.uploadReceipt(upload('page one'));
    await pipeline.settled(id, ReceiptStatus.PARSED);

    expect(pipeline.merchantFns.getOrCreateMerchant).not.toHaveBeenCalled();
    expect(pipeline.receipt(id).merchantId).toBe(ALDI.id);
  });

  it('leaves the store empty when the receipt names none', async () => {
    const pipeline = makePipeline({
      parse: () => Promise.resolve(makeParsed({ merchantId: null, storeName: null })),
    });

    const { id } = await pipeline.service.uploadReceipt(upload('page one'));
    await pipeline.settled(id, ReceiptStatus.PARSED);

    expect(pipeline.merchantFns.getOrCreateMerchant).not.toHaveBeenCalled();
    expect(pipeline.receipt(id).merchantId).toBeNull();
  });

  it('stores the receipt-level flags the parser computed', async () => {
    const flags = [ReceiptFlag.SUBTOTAL_MISMATCH, ReceiptFlag.ITEM_COUNT_MISMATCH];
    const pipeline = makePipeline({ parse: () => Promise.resolve(makeParsed({ flags })) });

    const { id } = await pipeline.service.uploadReceipt(upload('page one'));
    await pipeline.settled(id, ReceiptStatus.PARSED);

    expect(pipeline.receipt(id).flags).toEqual(flags);
  });

  it.each(['', '  \n \n'])(
    'fails at the OCR stage when no text was read (%j), and never parses',
    async (ocrText) => {
      const pipeline = makePipeline({
        reader: () => Promise.resolve({ ocrText, ocrEngine: 'test-engine' }),
      });

      const { id } = await pipeline.service.uploadReceipt(upload('a photo of the table'));
      await pipeline.settled(id, ReceiptStatus.FAILED);

      expect(pipeline.receipt(id)).toMatchObject({
        failedStage: ReceiptStage.OCR,
        error: expect.stringContaining('No text could be read from the photos') as string,
        ocrText: null,
      });
      expect(pipeline.receiptFns.updateReceiptOcrText).not.toHaveBeenCalled();
      expect(pipeline.parserFns.parseReceiptText).not.toHaveBeenCalled();
    },
  );

  it('records an OCR failure with its stage and the service’s own message', async () => {
    const pipeline = makePipeline({
      reader: () => Promise.reject(new OcrServiceError('OCR service did not answer within 300 s')),
    });

    const { id } = await pipeline.service.uploadReceipt(upload('page one'));
    await pipeline.settled(id, ReceiptStatus.FAILED);

    expect(pipeline.receipt(id)).toMatchObject({
      failedStage: ReceiptStage.OCR,
      error: 'OCR service did not answer within 300 s',
    });
    expect(pipeline.parserFns.parseReceiptText).not.toHaveBeenCalled();
  });

  it('records a parse failure with its stage, keeping the text the OCR stage saved', async () => {
    const pipeline = makePipeline({
      parse: () => Promise.reject(new ServerError('LLM returned non-JSON output')),
    });

    const { id } = await pipeline.service.uploadReceipt(upload('page one'));
    await pipeline.settled(id, ReceiptStatus.FAILED);

    expect(pipeline.receipt(id)).toMatchObject({
      failedStage: ReceiptStage.PARSE,
      error: 'LLM returned non-JSON output',
      ocrText: OCR_TEXT,
    });
    expect(pipeline.receiptFns.updateReceiptParse).not.toHaveBeenCalled();
  });
});

describe('receiptImportService duplicate purchases', () => {
  const earlier = (over: Partial<Receipt>) =>
    makeReceipt({
      id: 'receipt-earlier',
      status: ReceiptStatus.PARSED,
      merchantId: ALDI.id,
      purchasedAt: new Date(2026, 10, 2, 9, 5),
      total: 0.98,
      createdAt: new Date(2026, 10, 2, 10),
      ...over,
    });

  it('flags a receipt with the same store, day and total as another, and still parses it', async () => {
    const pipeline = makePipeline({
      receipts: [earlier({})],
      parse: () => Promise.resolve(makeParsed({ flags: [ReceiptFlag.TOTAL_MISMATCH] })),
    });

    const { id } = await pipeline.service.uploadReceipt(upload('another photo of it'));
    await pipeline.settled(id, ReceiptStatus.PARSED);

    expect(pipeline.receipt(id).flags).toEqual([
      ReceiptFlag.TOTAL_MISMATCH,
      ReceiptFlag.POSSIBLE_DUPLICATE,
    ]);
    // The day is the server's calendar day the parser read the time in.
    expect(pipeline.receiptFns.listReceiptsByPurchase).toHaveBeenCalledWith({
      merchantId: ALDI.id,
      purchasedFrom: new Date(2026, 10, 2),
      purchasedBefore: new Date(2026, 10, 3),
    });
    // The earlier receipt is left as it was: it is the original.
    expect(pipeline.receipt('receipt-earlier').flags).toEqual([]);
  });

  it.each<[string, Partial<Receipt>]>([
    ['a different total', { total: 0.99 }],
    ['the day before', { purchasedAt: new Date(2026, 10, 1, 23, 59) }],
    ['the day after', { purchasedAt: new Date(2026, 10, 3, 0, 0) }],
    ['another store', { merchantId: 'merchant-costco' }],
    ['no total', { total: null }],
  ])('does not flag one that differs by %s', async (_case, over) => {
    const pipeline = makePipeline({ receipts: [earlier(over)] });

    const { id } = await pipeline.service.uploadReceipt(upload('page one'));
    await pipeline.settled(id, ReceiptStatus.PARSED);

    expect(pipeline.receipt(id).flags).toEqual([]);
  });

  it('matches a total to the cent, whatever float noise it carries', async () => {
    const pipeline = makePipeline({ receipts: [earlier({ total: 0.1 + 0.88 })] });

    const { id } = await pipeline.service.uploadReceipt(upload('page one'));
    await pipeline.settled(id, ReceiptStatus.PARSED);

    expect(pipeline.receipt(id).flags).toEqual([ReceiptFlag.POSSIBLE_DUPLICATE]);
  });

  it('does not count a re-parse of the same receipt as a twin of itself', async () => {
    const pipeline = makePipeline({
      receipts: [
        earlier({
          status: ReceiptStatus.FAILED,
          failedStage: ReceiptStage.PARSE,
          ocrText: OCR_TEXT,
        }),
      ],
    });

    await pipeline.service.retryReceipt('receipt-earlier');
    await pipeline.settled('receipt-earlier', ReceiptStatus.PARSED);

    expect(pipeline.receipt('receipt-earlier').flags).toEqual([]);
  });

  it.each<[string, Partial<ParsedReceipt>]>([
    ['no store', { merchantId: null, storeName: null }],
    ['no purchase date', { purchasedAt: null }],
    ['no total', { total: null }],
  ])('does not look for twins of a receipt with %s', async (_case, over) => {
    const pipeline = makePipeline({
      receipts: [earlier({})],
      parse: () => Promise.resolve(makeParsed(over)),
    });

    const { id } = await pipeline.service.uploadReceipt(upload('page one'));
    await pipeline.settled(id, ReceiptStatus.PARSED);

    expect(pipeline.receiptFns.listReceiptsByPurchase).not.toHaveBeenCalled();
    expect(pipeline.receipt(id).flags).toEqual([]);
  });
});

describe('receiptImportService.retryReceipt', () => {
  const failed = (stage: Maybe<ReceiptStage>, over: Partial<Receipt> = {}) =>
    makeReceipt({ status: ReceiptStatus.FAILED, failedStage: stage, error: 'boom', ...over });

  it('restarts an OCR failure from the photos', async () => {
    const pipeline = makePipeline({ receipts: [failed(ReceiptStage.OCR)] });

    const restarted = await pipeline.service.retryReceipt('receipt-1');

    expect(restarted).toMatchObject({ status: ReceiptStatus.UPLOADED, error: null });
    await pipeline.settled('receipt-1', ReceiptStatus.PARSED);
    expect(pipeline.readReceiptText).toHaveBeenCalledTimes(1);
    expect(pipeline.parserFns.parseReceiptText).toHaveBeenCalledTimes(1);
  });

  it('restarts a parse failure from the saved text, without reading the photos again', async () => {
    const pipeline = makePipeline({
      receipts: [failed(ReceiptStage.PARSE, { ocrText: 'SAVED TEXT', ocrEngine: 'test-engine' })],
    });

    const restarted = await pipeline.service.retryReceipt('receipt-1');

    expect(restarted.status).toBe(ReceiptStatus.OCR_DONE);
    await pipeline.settled('receipt-1', ReceiptStatus.PARSED);
    expect(pipeline.readReceiptText).not.toHaveBeenCalled();
    expect(pipeline.receiptFns.listReceiptImages).not.toHaveBeenCalled();
    expect(pipeline.parserFns.parseReceiptText).toHaveBeenCalledWith({
      ocrText: 'SAVED TEXT',
      knownStores: [ALDI],
    });
  });

  it('starts over from the photos when no stage was recorded', async () => {
    const pipeline = makePipeline({ receipts: [failed(null)] });

    await expect(pipeline.service.retryReceipt('receipt-1')).resolves.toMatchObject({
      status: ReceiptStatus.UPLOADED,
    });
    await pipeline.settled('receipt-1', ReceiptStatus.PARSED);
    expect(pipeline.readReceiptText).toHaveBeenCalledTimes(1);
  });

  it('records a second failure at the stage that failed again', async () => {
    const pipeline = makePipeline({
      receipts: [failed(ReceiptStage.PARSE, { ocrText: OCR_TEXT })],
      parse: () => Promise.reject(new ServerError('LLM output failed validation')),
    });

    await pipeline.service.retryReceipt('receipt-1');
    await vi.waitFor(() => {
      expect(pipeline.receiptFns.recordReceiptFailure).toHaveBeenCalled();
    });

    expect(pipeline.receipt('receipt-1')).toMatchObject({
      status: ReceiptStatus.FAILED,
      failedStage: ReceiptStage.PARSE,
      error: 'LLM output failed validation',
    });
  });

  it.each([ReceiptStatus.UPLOADED, ReceiptStatus.OCR_DONE, ReceiptStatus.PARSED])(
    'refuses a receipt that is %s rather than FAILED',
    async (status) => {
      const pipeline = makePipeline({ receipts: [makeReceipt({ status })] });

      await expect(pipeline.service.retryReceipt('receipt-1')).rejects.toBeInstanceOf(
        ConflictError,
      );
      expect(pipeline.receiptFns.updateReceiptStatus).not.toHaveBeenCalled();
    },
  );

  it('reports an unknown receipt as not found', async () => {
    const pipeline = makePipeline();

    await expect(pipeline.service.retryReceipt('nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses while receipt import is off', async () => {
    const pipeline = makePipeline({ reader: null, receipts: [failed(ReceiptStage.OCR)] });

    await expect(pipeline.service.retryReceipt('receipt-1')).rejects.toBeInstanceOf(
      ReceiptImportDisabledError,
    );
    expect(pipeline.receipt('receipt-1').status).toBe(ReceiptStatus.FAILED);
  });
});

describe('receiptImportService queue', () => {
  it('reads one receipt at a time: a second upload waits until the first has finished every stage', async () => {
    const first = deferred<ReceiptOcrInput>();
    let reads = 0;
    const pipeline = makePipeline({
      reader: () => {
        reads += 1;
        return reads === 1
          ? first.promise
          : Promise.resolve({ ocrText: OCR_TEXT, ocrEngine: 'test-engine' });
      },
    });

    const a = await pipeline.service.uploadReceipt(upload('receipt a'));
    const b = await pipeline.service.uploadReceipt(upload('receipt b'));
    await vi.waitFor(() => {
      expect(pipeline.readReceiptText).toHaveBeenCalledTimes(1);
    });
    // Give a second, concurrent read every chance to start.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(pipeline.readReceiptText).toHaveBeenCalledTimes(1);
    expect(pipeline.receipt(b.id).status).toBe(ReceiptStatus.UPLOADED);

    first.resolve({ ocrText: OCR_TEXT, ocrEngine: 'test-engine' });
    await pipeline.settled(b.id, ReceiptStatus.PARSED);

    expect(pipeline.receipt(a.id).status).toBe(ReceiptStatus.PARSED);
    const [readA, readB] = pipeline.readReceiptText.mock.invocationCallOrder;
    const [parseA] = pipeline.receiptFns.updateReceiptParse.mock.invocationCallOrder;
    // A was parsed — its last stage — before B was even read.
    expect(parseA).toBeGreaterThan(readA ?? Infinity);
    expect(readB).toBeGreaterThan(parseA ?? Infinity);
    expect(pipeline.receiptFns.updateReceiptParse.mock.calls.map(([id]) => id)).toEqual([
      a.id,
      b.id,
    ]);
  });

  it('moves on to the next receipt after one fails', async () => {
    let reads = 0;
    const pipeline = makePipeline({
      reader: () => {
        reads += 1;
        return reads === 1
          ? Promise.reject(new OcrServiceError('OCR service answered 500: engine failed'))
          : Promise.resolve({ ocrText: OCR_TEXT, ocrEngine: 'test-engine' });
      },
    });

    const a = await pipeline.service.uploadReceipt(upload('receipt a'));
    const b = await pipeline.service.uploadReceipt(upload('receipt b'));

    await pipeline.settled(b.id, ReceiptStatus.PARSED);
    expect(pipeline.receipt(a.id).status).toBe(ReceiptStatus.FAILED);
  });

  it('skips a receipt deleted while it waited, and starts again for the next upload', async () => {
    const first = deferred<ReceiptOcrInput>();
    let reads = 0;
    const pipeline = makePipeline({
      reader: () => {
        reads += 1;
        return reads === 1
          ? first.promise
          : Promise.resolve({ ocrText: OCR_TEXT, ocrEngine: 'test-engine' });
      },
    });

    const a = await pipeline.service.uploadReceipt(upload('receipt a'));
    const b = await pipeline.service.uploadReceipt(upload('receipt b'));
    pipeline.deleteRow(b.id);
    first.resolve({ ocrText: OCR_TEXT, ocrEngine: 'test-engine' });
    await pipeline.settled(a.id, ReceiptStatus.PARSED);
    await vi.waitFor(() => {
      expect(pipeline.receiptFns.getReceiptById).toHaveBeenCalledWith(b.id);
    });
    expect(pipeline.receiptFns.recordReceiptFailure).not.toHaveBeenCalled();

    // The queue went idle; a new upload must start it again.
    const c = await pipeline.service.uploadReceipt(upload('receipt c'));
    await pipeline.settled(c.id, ReceiptStatus.PARSED);
    expect(pipeline.readReceiptText).toHaveBeenCalledTimes(2);
  });

  it('survives a receipt deleted mid-stage, when there is no row left to record the failure on', async () => {
    const first = deferred<ReceiptOcrInput>();
    let reads = 0;
    const pipeline = makePipeline({
      reader: () => {
        reads += 1;
        return reads === 1
          ? first.promise
          : Promise.resolve({ ocrText: OCR_TEXT, ocrEngine: 'test-engine' });
      },
    });

    const a = await pipeline.service.uploadReceipt(upload('receipt a'));
    await vi.waitFor(() => {
      expect(pipeline.readReceiptText).toHaveBeenCalledTimes(1);
    });
    pipeline.deleteRow(a.id);
    first.resolve({ ocrText: OCR_TEXT, ocrEngine: 'test-engine' });
    await vi.waitFor(() => {
      expect(pipeline.receiptFns.recordReceiptFailure).toHaveBeenCalled();
    });

    const b = await pipeline.service.uploadReceipt(upload('receipt b'));
    await pipeline.settled(b.id, ReceiptStatus.PARSED);
  });
});

describe('receiptImportService.resumeReceiptImports', () => {
  const at = (minute: number) => new Date(2026, 10, 2, 9, minute);

  it('queues what a restart left mid-pipeline, oldest first, each from its own stage', async () => {
    const pipeline = makePipeline({
      receipts: [
        makeReceipt({
          id: 'newer',
          status: ReceiptStatus.OCR_DONE,
          ocrText: 'NEWER TEXT',
          createdAt: at(2),
        }),
        makeReceipt({ id: 'older', status: ReceiptStatus.UPLOADED, createdAt: at(1) }),
        makeReceipt({ id: 'done', status: ReceiptStatus.PARSED, createdAt: at(0) }),
        makeReceipt({
          id: 'failed',
          status: ReceiptStatus.FAILED,
          failedStage: ReceiptStage.OCR,
          createdAt: at(3),
        }),
      ],
    });

    await expect(pipeline.service.resumeReceiptImports()).resolves.toBe(2);

    await pipeline.settled('newer', ReceiptStatus.PARSED);
    await pipeline.settled('older', ReceiptStatus.PARSED);
    expect(pipeline.receiptFns.listReceipts).toHaveBeenCalledWith({
      statuses: [ReceiptStatus.UPLOADED, ReceiptStatus.OCR_DONE],
    });
    // Only the UPLOADED one needed its photos read.
    expect(pipeline.readReceiptText).toHaveBeenCalledTimes(1);
    expect(pipeline.receiptFns.updateReceiptParse.mock.calls.map(([id]) => id)).toEqual([
      'older',
      'newer',
    ]);
    // A failure waits for someone to press retry.
    expect(pipeline.receipt('failed').status).toBe(ReceiptStatus.FAILED);
  });

  it('answers 0 and starts nothing when no receipt was left unfinished', async () => {
    const pipeline = makePipeline({ receipts: [makeReceipt({ status: ReceiptStatus.PARSED })] });

    await expect(pipeline.service.resumeReceiptImports()).resolves.toBe(0);
    expect(pipeline.receiptFns.getReceiptById).not.toHaveBeenCalled();
  });

  it('queues nothing while receipt import is off', async () => {
    const pipeline = makePipeline({
      reader: null,
      receipts: [makeReceipt({ status: ReceiptStatus.OCR_DONE, ocrText: OCR_TEXT })],
    });

    await expect(pipeline.service.resumeReceiptImports()).resolves.toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(pipeline.parserFns.parseReceiptText).not.toHaveBeenCalled();
    expect(pipeline.receipt('receipt-1').status).toBe(ReceiptStatus.OCR_DONE);
  });
});
