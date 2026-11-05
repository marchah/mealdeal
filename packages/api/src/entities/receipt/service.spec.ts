import { describe, expect, it, vi } from 'vitest';
import { ConflictError, NotFoundError, ValidationError } from '../../common/errors';
import type { Maybe } from '../../common/types';
import { Unit } from '../../common/units';
import { receiptServiceFactory } from './service';
import {
  ReceiptFlag,
  ReceiptLineDecision,
  ReceiptLineFlag,
  ReceiptMatchSource,
  ReceiptStage,
  ReceiptStatus,
  type NewReceipt,
  type ParsedReceiptLine,
  type Receipt,
  type ReceiptImage,
  type ReceiptLine,
  type ReceiptLineMatchInput,
  type ReceiptParseInput,
  type ReceiptPhotoStore,
  type ReceiptRepository,
} from './types';

// Every receipt below is synthetic — invented rows and prices, never a real receipt.

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
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

const makeImage = (over: Partial<ReceiptImage> = {}): ReceiptImage => ({
  id: 'image-1',
  receiptId: 'receipt-1',
  position: 0,
  path: 'photo-a',
  contentType: 'image/jpeg',
  bytes: 3,
  ...over,
});

const makeParsedLine = (over: Partial<ParsedReceiptLine> = {}): ParsedReceiptLine => ({
  itemNumber: '717662',
  printedText: 'Org Black Beans',
  description: 'Organic black beans',
  quantity: 1,
  unitPrice: 0.89,
  weight: null,
  weightUnit: null,
  lineTotal: 0.89,
  discount: null,
  taxFlag: 'FB',
  flags: [],
  ...over,
});

const makeLine = (over: Partial<ReceiptLine> = {}): ReceiptLine => ({
  id: 'line-1',
  receiptId: 'receipt-1',
  position: 0,
  ...makeParsedLine(),
  pantryItemId: null,
  sizeAmount: null,
  sizeUnit: null,
  matchSource: null,
  decision: ReceiptLineDecision.PENDING,
  priceEntryId: null,
  ...over,
});

const makeMatch = (over: Partial<ReceiptLineMatchInput> = {}): ReceiptLineMatchInput => ({
  pantryItemId: 'item-1',
  sizeAmount: 15,
  sizeUnit: Unit.OUNCE,
  matchSource: ReceiptMatchSource.ALIAS,
  decision: ReceiptLineDecision.PENDING,
  ...over,
});

const makeParse = (over: Partial<ReceiptParseInput> = {}): ReceiptParseInput => ({
  merchantId: 'merchant-1',
  purchasedAt: new Date('2026-10-30T00:00:00Z'),
  subtotal: 0.89,
  tax: 0.02,
  total: 0.91,
  lines: [makeParsedLine()],
  flags: [],
  ...over,
});

const photo = (text: string, contentType = 'image/jpeg') => ({
  bytes: new TextEncoder().encode(text),
  contentType,
});

function makeService(
  over: {
    receipt?: Maybe<Receipt>;
    images?: ReceiptImage[];
    line?: Maybe<ReceiptLine>;
    sameHash?: Maybe<Receipt>;
    insertReceipt?: (receipt: NewReceipt) => Promise<Receipt>;
    saveReceiptPhoto?: (bytes: Uint8Array) => Promise<string>;
    deleteReceiptPhoto?: (path: string) => Promise<void>;
  } = {},
) {
  const found = over.receipt === undefined ? makeReceipt() : over.receipt;
  const foundLine = over.line === undefined ? makeLine() : over.line;
  const receiptRepository = {
    findReceiptById: vi.fn((_id: string) => Promise.resolve(found)),
    findReceiptByImageHash: vi.fn((_imageHash: string) => Promise.resolve(over.sameHash ?? null)),
    findReceiptImagesByReceiptIds: vi.fn((_ids: readonly string[]) =>
      Promise.resolve([makeImage()]),
    ),
    findReceiptLinesByReceiptIds: vi.fn((_ids: readonly string[]) => Promise.resolve([makeLine()])),
    listReceipts: vi.fn(() => Promise.resolve(found ? [found] : [])),
    listReceiptsByPurchase: vi.fn(() => Promise.resolve(found ? [found] : [])),
    listReceiptImages: vi.fn((_receiptId: string) => Promise.resolve(over.images ?? [])),
    listReceiptLines: vi.fn((_receiptId: string) => Promise.resolve([makeLine()])),
    insertReceipt: vi.fn(
      over.insertReceipt ??
        ((receipt: NewReceipt) =>
          Promise.resolve(makeReceipt({ status: receipt.status, imageHash: receipt.imageHash }))),
    ),
    updateReceipt: vi.fn((_id: string, update: Partial<Receipt>) =>
      Promise.resolve(found && { ...found, ...update }),
    ),
    replaceReceiptLines: vi.fn(
      (_id: string, update: Partial<Receipt>, _lines: readonly ParsedReceiptLine[]) =>
        Promise.resolve(found && { ...found, ...update }),
    ),
    updateReceiptLineMatch: vi.fn((_lineId: string, match: ReceiptLineMatchInput) =>
      Promise.resolve(foundLine && { ...foundLine, ...match }),
    ),
    updateReceiptLinePriceEntry: vi.fn((_lineId: string, priceEntryId: string) =>
      Promise.resolve(foundLine && { ...foundLine, priceEntryId }),
    ),
    deleteReceipt: vi.fn((_id: string) => Promise.resolve(found)),
  } satisfies ReceiptRepository;

  let saved = 0;
  const receiptPhotoStore = {
    readReceiptPhoto: vi.fn((path: string) => Promise.resolve(new TextEncoder().encode(path))),
    saveReceiptPhoto: vi.fn(
      over.saveReceiptPhoto ?? ((_bytes: Uint8Array) => Promise.resolve(`photo-${++saved}`)),
    ),
    deleteReceiptPhoto: vi.fn(over.deleteReceiptPhoto ?? ((_path: string) => Promise.resolve())),
  } satisfies ReceiptPhotoStore;

  return {
    service: receiptServiceFactory({ receiptRepository, receiptPhotoStore }),
    receiptRepository,
    receiptPhotoStore,
  };
}

/** The image hash addReceipt computed for a set of photos, read off the row it inserted. */
async function hashOf(photos: ReturnType<typeof photo>[]): Promise<string> {
  const { service, receiptRepository } = makeService();
  await service.addReceipt({ photos });
  const [receipt] = receiptRepository.insertReceipt.mock.calls[0] ?? [];
  if (!receipt) throw new Error('insertReceipt was not called');
  return receipt.imageHash;
}

describe('receiptService.addReceipt', () => {
  it('stores each photo, then creates the receipt as UPLOADED with its images in order', async () => {
    const { service, receiptRepository, receiptPhotoStore } = makeService();

    const receipt = await service.addReceipt({
      photos: [photo('page one'), photo('page two!', ' image/png ')],
    });

    expect(receipt.status).toBe(ReceiptStatus.UPLOADED);
    expect(receiptPhotoStore.saveReceiptPhoto).toHaveBeenCalledTimes(2);
    expect(receiptRepository.insertReceipt).toHaveBeenCalledWith({
      status: ReceiptStatus.UPLOADED,
      imageHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      images: [
        { path: 'photo-1', contentType: 'image/jpeg', bytes: 8 },
        { path: 'photo-2', contentType: 'image/png', bytes: 9 },
      ],
    });
    // Files before the row: a crash in between must never leave a row without its photo.
    const lastSave = Math.max(...receiptPhotoStore.saveReceiptPhoto.mock.invocationCallOrder);
    const insert = receiptRepository.insertReceipt.mock.invocationCallOrder[0] ?? 0;
    expect(lastSave).toBeLessThan(insert);
  });

  it('hashes the same photos the same way, so a re-upload is recognisable', async () => {
    expect(await hashOf([photo('a'), photo('b')])).toBe(await hashOf([photo('a'), photo('b')]));
    // The content type is not part of what was photographed.
    expect(await hashOf([photo('a', 'image/png')])).toBe(await hashOf([photo('a')]));
  });

  it('hashes different photos, a different order or a different split differently', async () => {
    const reference = await hashOf([photo('ab'), photo('c')]);

    expect(await hashOf([photo('ab'), photo('d')])).not.toBe(reference);
    expect(await hashOf([photo('c'), photo('ab')])).not.toBe(reference);
    // Plain concatenation would make these two identical.
    expect(await hashOf([photo('a'), photo('bc')])).not.toBe(reference);
    expect(await hashOf([photo('abc')])).not.toBe(reference);
  });

  it.each([
    ['no photos', []],
    ['an empty photo', [photo('page one'), photo('')]],
    ['a photo without a content type', [photo('page one', '  ')]],
  ])('refuses %s, and stores nothing', async (_case, photos) => {
    const { service, receiptRepository, receiptPhotoStore } = makeService();

    await expect(service.addReceipt({ photos })).rejects.toBeInstanceOf(ValidationError);
    expect(receiptPhotoStore.saveReceiptPhoto).not.toHaveBeenCalled();
    expect(receiptRepository.insertReceipt).not.toHaveBeenCalled();
  });

  it('refuses photos already uploaded as a receipt, and stores nothing', async () => {
    const reference = await hashOf([photo('page one'), photo('page two')]);
    const { service, receiptRepository, receiptPhotoStore } = makeService({
      sameHash: makeReceipt({ id: 'receipt-0', imageHash: reference }),
    });

    await expect(
      service.addReceipt({ photos: [photo('page one'), photo('page two')] }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(receiptRepository.findReceiptByImageHash).toHaveBeenCalledWith(reference);
    expect(receiptPhotoStore.saveReceiptPhoto).not.toHaveBeenCalled();
    expect(receiptRepository.insertReceipt).not.toHaveBeenCalled();
  });

  it('takes back the photos it stored when the receipt cannot be created', async () => {
    const failure = new Error('db unavailable');
    const { service, receiptPhotoStore } = makeService({
      insertReceipt: () => Promise.reject(failure),
    });

    await expect(service.addReceipt({ photos: [photo('one'), photo('two')] })).rejects.toBe(
      failure,
    );
    expect(receiptPhotoStore.deleteReceiptPhoto.mock.calls).toEqual([['photo-1'], ['photo-2']]);
  });

  it('takes back the earlier photos when a later one cannot be stored', async () => {
    const failure = new Error('disk full');
    let calls = 0;
    const { service, receiptRepository, receiptPhotoStore } = makeService({
      saveReceiptPhoto: () =>
        ++calls === 1 ? Promise.resolve('photo-1') : Promise.reject(failure),
    });

    await expect(service.addReceipt({ photos: [photo('one'), photo('two')] })).rejects.toBe(
      failure,
    );
    expect(receiptRepository.insertReceipt).not.toHaveBeenCalled();
    expect(receiptPhotoStore.deleteReceiptPhoto.mock.calls).toEqual([['photo-1']]);
  });

  it('reports the original failure even when cleaning up fails too', async () => {
    const failure = new Error('db unavailable');
    const { service, receiptPhotoStore } = makeService({
      insertReceipt: () => Promise.reject(failure),
      deleteReceiptPhoto: () => Promise.reject(new Error('read-only volume')),
    });

    await expect(service.addReceipt({ photos: [photo('one'), photo('two')] })).rejects.toBe(
      failure,
    );
    // One stuck photo does not stop the next from being tried.
    expect(receiptPhotoStore.deleteReceiptPhoto).toHaveBeenCalledTimes(2);
  });
});

describe('receiptService reads', () => {
  it('gets a receipt by id', async () => {
    const { service } = makeService();
    await expect(service.getReceiptById('receipt-1')).resolves.toMatchObject({ id: 'receipt-1' });
  });

  it('reports an unknown receipt as not found', async () => {
    const { service } = makeService({ receipt: null });
    await expect(service.getReceiptById('nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lists receipts with the caller’s status filter', async () => {
    const { service, receiptRepository } = makeService();
    const input = { statuses: [ReceiptStatus.UPLOADED, ReceiptStatus.OCR_DONE] };

    await expect(service.listReceipts(input)).resolves.toHaveLength(1);
    expect(receiptRepository.listReceipts).toHaveBeenCalledWith(input);
  });

  it('lists one store’s receipts bought in a time range', async () => {
    const { service, receiptRepository } = makeService();
    const input = {
      merchantId: 'merchant-1',
      purchasedFrom: new Date(2026, 9, 30),
      purchasedBefore: new Date(2026, 9, 31),
    };

    await expect(service.listReceiptsByPurchase(input)).resolves.toHaveLength(1);
    expect(receiptRepository.listReceiptsByPurchase).toHaveBeenCalledWith(input);
  });

  it('finds the images and lines of several receipts in one call each', async () => {
    const { service, receiptRepository } = makeService();

    await expect(service.findReceiptImagesByReceiptIds(['receipt-1'])).resolves.toHaveLength(1);
    await expect(service.findReceiptLinesByReceiptIds(['receipt-1'])).resolves.toHaveLength(1);
    expect(receiptRepository.findReceiptImagesByReceiptIds).toHaveBeenCalledWith(['receipt-1']);
    expect(receiptRepository.findReceiptLinesByReceiptIds).toHaveBeenCalledWith(['receipt-1']);
  });

  it('reads a photo from the path its image row stores', async () => {
    const { service, receiptPhotoStore } = makeService();

    const bytes = await service.readReceiptImage(makeImage({ path: 'photo-z' }));

    expect(receiptPhotoStore.readReceiptPhoto).toHaveBeenCalledWith('photo-z');
    expect(new TextDecoder().decode(bytes)).toBe('photo-z');
  });
});

describe('receiptService stage writes', () => {
  it('moves a receipt on and clears a recorded failure', async () => {
    const { service, receiptRepository } = makeService({
      receipt: makeReceipt({
        status: ReceiptStatus.FAILED,
        failedStage: ReceiptStage.OCR,
        error: 'timeout',
      }),
    });

    const receipt = await service.updateReceiptStatus('receipt-1', ReceiptStatus.UPLOADED);

    expect(receiptRepository.updateReceipt).toHaveBeenCalledWith('receipt-1', {
      status: ReceiptStatus.UPLOADED,
      failedStage: null,
      error: null,
    });
    expect(receipt).toMatchObject({ status: ReceiptStatus.UPLOADED, failedStage: null });
  });

  it('refuses to mark a receipt FAILED without the stage a retry needs', async () => {
    const { service, receiptRepository } = makeService();

    await expect(
      service.updateReceiptStatus('receipt-1', ReceiptStatus.FAILED),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(receiptRepository.updateReceipt).not.toHaveBeenCalled();
  });

  it('records a failure with its stage and error', async () => {
    const { service, receiptRepository } = makeService();

    await service.recordReceiptFailure('receipt-1', ReceiptStage.PARSE, 'LLM returned non-JSON');

    expect(receiptRepository.updateReceipt).toHaveBeenCalledWith('receipt-1', {
      status: ReceiptStatus.FAILED,
      failedStage: ReceiptStage.PARSE,
      error: 'LLM returned non-JSON',
    });
  });

  it('saves the OCR text and engine together with OCR_DONE', async () => {
    const { service, receiptRepository } = makeService();

    await service.updateReceiptOcrText('receipt-1', {
      ocrText: 'ORG BLACK BEANS 0.89 FB',
      ocrEngine: 'pp-ocrv6-medium',
    });

    expect(receiptRepository.updateReceipt).toHaveBeenCalledWith('receipt-1', {
      ocrText: 'ORG BLACK BEANS 0.89 FB',
      ocrEngine: 'pp-ocrv6-medium',
      status: ReceiptStatus.OCR_DONE,
      failedStage: null,
      error: null,
    });
  });

  it('saves the parse — header, flags and lines in one write — together with PARSED', async () => {
    const { service, receiptRepository } = makeService();
    const lines = [
      makeParsedLine(),
      makeParsedLine({
        itemNumber: null,
        printedText: 'BANANAS',
        quantity: 1,
        unitPrice: 0.58,
        weight: 1.63,
        weightUnit: Unit.POUND,
        lineTotal: 0.95,
        flags: [ReceiptLineFlag.LINE_TOTAL_MISMATCH],
      }),
    ];

    await service.updateReceiptParse(
      'receipt-1',
      makeParse({ lines, flags: [ReceiptFlag.SUBTOTAL_MISMATCH, ReceiptFlag.POSSIBLE_DUPLICATE] }),
    );

    expect(receiptRepository.replaceReceiptLines).toHaveBeenCalledWith(
      'receipt-1',
      {
        merchantId: 'merchant-1',
        purchasedAt: new Date('2026-10-30T00:00:00Z'),
        subtotal: 0.89,
        tax: 0.02,
        total: 0.91,
        flags: [ReceiptFlag.SUBTOTAL_MISMATCH, ReceiptFlag.POSSIBLE_DUPLICATE],
        status: ReceiptStatus.PARSED,
        failedStage: null,
        error: null,
      },
      lines,
    );
  });

  it('accepts a parse that found no lines', async () => {
    const { service, receiptRepository } = makeService();

    await service.updateReceiptParse('receipt-1', makeParse({ lines: [] }));

    expect(receiptRepository.replaceReceiptLines.mock.calls[0]?.[2]).toEqual([]);
  });

  it.each<[string, Partial<ParsedReceiptLine>]>([
    ['a line without printed text', { printedText: '  ' }],
    ['a weight without its unit', { weight: 1.63 }],
    ['a weight unit without the weight', { weightUnit: Unit.POUND }],
  ])('refuses a parse with %s, and writes nothing', async (_case, over) => {
    const { service, receiptRepository } = makeService();

    await expect(
      service.updateReceiptParse(
        'receipt-1',
        makeParse({ lines: [makeParsedLine(), makeParsedLine(over)] }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(receiptRepository.replaceReceiptLines).not.toHaveBeenCalled();
  });

  it('reports every stage write on an unknown receipt as not found', async () => {
    const { service } = makeService({ receipt: null });

    await expect(service.updateReceiptStatus('nope', ReceiptStatus.READY)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      service.updateReceiptOcrText('nope', { ocrText: 'x', ocrEngine: 'y' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.updateReceiptParse('nope', makeParse())).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      service.recordReceiptFailure('nope', ReceiptStage.OCR, 'timeout'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('receiptService line writes', () => {
  it('replaces a line’s match and decision', async () => {
    const { service, receiptRepository } = makeService();
    const match = makeMatch({ decision: ReceiptLineDecision.INCLUDE });

    const line = await service.updateReceiptLineMatch('line-1', match);

    expect(receiptRepository.updateReceiptLineMatch).toHaveBeenCalledWith('line-1', match);
    expect(line).toMatchObject({ pantryItemId: 'item-1', decision: ReceiptLineDecision.INCLUDE });
  });

  it('accepts clearing a match back to nothing', async () => {
    const { service, receiptRepository } = makeService();
    const cleared = makeMatch({
      pantryItemId: null,
      sizeAmount: null,
      sizeUnit: null,
      matchSource: null,
      decision: ReceiptLineDecision.PENDING,
    });

    await service.updateReceiptLineMatch('line-1', cleared);

    expect(receiptRepository.updateReceiptLineMatch).toHaveBeenCalledWith('line-1', cleared);
  });

  it.each<[string, Partial<ReceiptLineMatchInput>]>([
    ['a size without its unit', { sizeUnit: null }],
    ['a unit without its size', { sizeAmount: null }],
    ['a zero size', { sizeAmount: 0 }],
    ['a negative size', { sizeAmount: -1 }],
  ])('refuses a match with %s, and writes nothing', async (_case, over) => {
    const { service, receiptRepository } = makeService();

    await expect(service.updateReceiptLineMatch('line-1', makeMatch(over))).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(receiptRepository.updateReceiptLineMatch).not.toHaveBeenCalled();
  });

  it('records the price entry a line produced', async () => {
    const { service } = makeService();
    await expect(service.updateReceiptLinePriceEntry('line-1', 'entry-1')).resolves.toMatchObject({
      priceEntryId: 'entry-1',
    });
  });

  it('reports a write to an unknown line as not found', async () => {
    const { service } = makeService({ line: null });

    await expect(service.updateReceiptLineMatch('nope', makeMatch())).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(service.updateReceiptLinePriceEntry('nope', 'entry-1')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('receiptService.deleteReceipt', () => {
  it('deletes the rows, then every photo the receipt had', async () => {
    const { service, receiptRepository, receiptPhotoStore } = makeService({
      images: [makeImage({ path: 'photo-a' }), makeImage({ id: 'image-2', path: 'photo-b' })],
    });

    await expect(service.deleteReceipt('receipt-1')).resolves.toMatchObject({ id: 'receipt-1' });

    expect(receiptPhotoStore.deleteReceiptPhoto.mock.calls).toEqual([['photo-a'], ['photo-b']]);
    // The paths have to be read before the cascade takes the image rows away.
    const [listed] = receiptRepository.listReceiptImages.mock.invocationCallOrder;
    const [deleted] = receiptRepository.deleteReceipt.mock.invocationCallOrder;
    const [firstPhoto] = receiptPhotoStore.deleteReceiptPhoto.mock.invocationCallOrder;
    expect(listed).toBeLessThan(deleted ?? 0);
    expect(deleted).toBeLessThan(firstPhoto ?? 0);
  });

  it('reports an unknown receipt as not found and deletes no photo', async () => {
    const { service, receiptPhotoStore } = makeService({ receipt: null });

    await expect(service.deleteReceipt('nope')).rejects.toBeInstanceOf(NotFoundError);
    expect(receiptPhotoStore.deleteReceiptPhoto).not.toHaveBeenCalled();
  });

  it('still succeeds when a photo will not delete, and tries the rest', async () => {
    const { service, receiptPhotoStore } = makeService({
      images: [makeImage({ path: 'photo-a' }), makeImage({ id: 'image-2', path: 'photo-b' })],
      deleteReceiptPhoto: (path) =>
        path === 'photo-a' ? Promise.reject(new Error('read-only volume')) : Promise.resolve(),
    });

    await expect(service.deleteReceipt('receipt-1')).resolves.toMatchObject({ id: 'receipt-1' });
    expect(receiptPhotoStore.deleteReceiptPhoto).toHaveBeenCalledTimes(2);
  });
});
