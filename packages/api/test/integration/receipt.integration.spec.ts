import { randomUUID } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, test } from 'vitest';
import { NotFoundError } from '../../src/common/errors';
import { settings } from '../../src/common/settings';
import type { Maybe } from '../../src/common/types';
import { Unit } from '../../src/common/units';
import { createDb } from '../../src/db/client';
import {
  merchants,
  pantryItems,
  priceEntries,
  receiptAliases,
  receiptImages,
  receipts,
} from '../../src/db/schema';
import { PriceSource } from '../../src/entities/priceEntry/types';
import {
  ReceiptLineDecision,
  ReceiptLineFlag,
  ReceiptMatchSource,
  ReceiptStage,
  ReceiptStatus,
  type ParsedReceiptLine,
} from '../../src/entities/receipt/types';
import { getServices } from '../../src/services';

// INTEGRATION test for the receipt and receiptAlias slices: the real composition root against the
// migrated test db and a real RECEIPTS_DIR (the `test:integration` script gives the suite its own).
// Proves what the unit specs cannot — the batched writes, the upsert on the unique index, the
// ordering, and that photo files and rows stay in step. There is no GraphQL for receipts yet
// (slice 4), so this drives the services directly. Every receipt here is synthetic.

const photo = (text: string) => ({
  bytes: new TextEncoder().encode(text),
  contentType: 'image/jpeg',
});

const line = (over: Partial<ParsedReceiptLine> = {}): ParsedReceiptLine => ({
  itemNumber: null,
  printedText: 'Org Black Beans',
  description: null,
  quantity: 1,
  unitPrice: null,
  weight: null,
  weightUnit: null,
  lineTotal: 0.89,
  discount: null,
  taxFlag: null,
  flags: [],
  ...over,
});

const parse = (lines: ParsedReceiptLine[], merchantId: Maybe<string> = null) => ({
  merchantId,
  purchasedAt: new Date('2026-10-30T00:00:00Z'),
  subtotal: 10.5,
  tax: 0.21,
  total: 10.71,
  lines,
});

async function seedMerchant(): Promise<string> {
  const id = randomUUID();
  await createDb()
    .insert(merchants)
    .values({ id, name: `Synthetic Mart ${id}` });
  return id;
}

async function seedItem(): Promise<string> {
  const id = randomUUID();
  await createDb()
    .insert(pantryItems)
    .values({ id, name: `Black beans ${id}`, unitPriceUnit: Unit.OUNCE });
  return id;
}

async function seedPrice(pantryItemId: string, receiptId: string): Promise<string> {
  const id = randomUUID();
  await createDb()
    .insert(priceEntries)
    .values({
      id,
      pantryItemId,
      price: 0.89,
      sizeAmount: 15,
      sizeUnit: Unit.OUNCE,
      unitPrice: 0.89 / 15,
      source: PriceSource.RECEIPT,
      receiptId,
    });
  return id;
}

const fileExists = (path: string) =>
  access(join(settings.RECEIPTS_DIR, path)).then(
    () => true,
    () => false,
  );

// Other specs clear `merchants` without knowing receipts reference it, so this file leaves nothing
// behind — and never deletes merchants itself, seeding uniquely named ones instead.
async function clearReceipts() {
  const db = createDb();
  await db.delete(receiptAliases);
  await db.delete(receipts);
  await db.delete(priceEntries);
  await db.delete(pantryItems);
}

beforeEach(clearReceipts);
afterAll(clearReceipts);

describe('receiptService', () => {
  test('adds a receipt: photos on disk, rows in the db, both readable back in page order', async () => {
    const { receiptService } = getServices();

    const receipt = await receiptService.addReceipt({
      photos: [photo('synthetic page one'), photo('synthetic page two')],
    });

    expect(receipt).toMatchObject({ status: ReceiptStatus.UPLOADED, failedStage: null });
    expect(receipt.imageHash).toMatch(/^[0-9a-f]{64}$/);
    await expect(receiptService.getReceiptById(receipt.id)).resolves.toEqual(receipt);

    const images = await receiptService.listReceiptImages(receipt.id);
    expect(images.map((image) => [image.position, image.contentType, image.bytes])).toEqual([
      [0, 'image/jpeg', 18],
      [1, 'image/jpeg', 18],
    ]);
    const [first, second] = images;
    if (!first || !second) throw new Error('expected two images');
    expect(await readFile(join(settings.RECEIPTS_DIR, first.path), 'utf8')).toBe(
      'synthetic page one',
    );
    expect(new TextDecoder().decode(await receiptService.readReceiptImage(second))).toBe(
      'synthetic page two',
    );
  });

  test('carries a receipt through every stage write', async () => {
    const { receiptService } = getServices();
    const merchantId = await seedMerchant();
    const itemId = await seedItem();
    const { id } = await receiptService.addReceipt({ photos: [photo('page')] });

    const ocr = await receiptService.updateReceiptOcrText(id, {
      ocrText: '717662 Org Black Beans 0.89 FB',
      ocrEngine: 'synthetic-ocr',
    });
    expect(ocr).toMatchObject({ status: ReceiptStatus.OCR_DONE, ocrEngine: 'synthetic-ocr' });

    const parsed = await receiptService.updateReceiptParse(
      id,
      parse(
        [
          line({ itemNumber: '717662', taxFlag: 'FB' }),
          line({
            printedText: 'Bananas',
            unitPrice: 0.58,
            weight: 1.63,
            weightUnit: Unit.POUND,
            lineTotal: 0.95,
            flags: [ReceiptLineFlag.LINE_TOTAL_MISMATCH],
          }),
        ],
        merchantId,
      ),
    );
    expect(parsed).toMatchObject({ status: ReceiptStatus.PARSED, merchantId, total: 10.71 });
    expect(parsed.purchasedAt?.toISOString()).toBe('2026-10-30T00:00:00.000Z');

    const lines = await receiptService.listReceiptLines(id);
    expect(lines.map((row) => [row.position, row.printedText, row.decision])).toEqual([
      [0, 'Org Black Beans', ReceiptLineDecision.PENDING],
      [1, 'Bananas', ReceiptLineDecision.PENDING],
    ]);
    expect(lines[1]).toMatchObject({
      weight: 1.63,
      weightUnit: Unit.POUND,
      flags: [ReceiptLineFlag.LINE_TOTAL_MISMATCH],
      pantryItemId: null,
      priceEntryId: null,
    });

    const [beans] = lines;
    if (!beans) throw new Error('expected a line');
    await receiptService.updateReceiptLineMatch(beans.id, {
      pantryItemId: itemId,
      sizeAmount: 15,
      sizeUnit: Unit.OUNCE,
      matchSource: ReceiptMatchSource.ALIAS,
      decision: ReceiptLineDecision.INCLUDE,
    });
    await expect(
      receiptService.updateReceiptStatus(id, ReceiptStatus.READY),
    ).resolves.toMatchObject({ status: ReceiptStatus.READY });
    const priceId = await seedPrice(itemId, id);
    await receiptService.updateReceiptLinePriceEntry(beans.id, priceId);

    const [confirmed] = await receiptService.listReceiptLines(id);
    expect(confirmed).toMatchObject({
      pantryItemId: itemId,
      sizeAmount: 15,
      sizeUnit: Unit.OUNCE,
      matchSource: ReceiptMatchSource.ALIAS,
      decision: ReceiptLineDecision.INCLUDE,
      priceEntryId: priceId,
    });
  });

  test('re-running the parse replaces the lines rather than adding to them', async () => {
    const { receiptService } = getServices();
    const { id } = await receiptService.addReceipt({ photos: [photo('page')] });

    await receiptService.updateReceiptParse(
      id,
      parse([line({ printedText: 'A' }), line({ printedText: 'B' }), line({ printedText: 'C' })]),
    );
    await receiptService.updateReceiptParse(
      id,
      parse([line({ printedText: 'X' }), line({ printedText: 'Y' })]),
    );

    const lines = await receiptService.listReceiptLines(id);
    expect(lines.map((row) => [row.position, row.printedText])).toEqual([
      [0, 'X'],
      [1, 'Y'],
    ]);

    await receiptService.updateReceiptParse(id, parse([]));
    await expect(receiptService.listReceiptLines(id)).resolves.toEqual([]);
  });

  test('a failure records its stage; moving on clears it', async () => {
    const { receiptService } = getServices();
    const { id } = await receiptService.addReceipt({ photos: [photo('page')] });

    await expect(
      receiptService.recordReceiptFailure(id, ReceiptStage.PARSE, 'LLM returned non-JSON output'),
    ).resolves.toMatchObject({
      status: ReceiptStatus.FAILED,
      failedStage: ReceiptStage.PARSE,
      error: 'LLM returned non-JSON output',
    });

    await expect(
      receiptService.updateReceiptStatus(id, ReceiptStatus.OCR_DONE),
    ).resolves.toMatchObject({ status: ReceiptStatus.OCR_DONE, failedStage: null, error: null });
  });

  test('lists receipts newest first, by status', async () => {
    const { receiptService } = getServices();
    const db = createDb();
    const oldest = await receiptService.addReceipt({ photos: [photo('1')] });
    const middle = await receiptService.addReceipt({ photos: [photo('2')] });
    const newest = await receiptService.addReceipt({ photos: [photo('3')] });
    for (const [receipt, day] of [
      [oldest, 1],
      [middle, 2],
      [newest, 3],
    ] as const) {
      await db
        .update(receipts)
        .set({ createdAt: new Date(`2026-10-0${String(day)}T00:00:00Z`) })
        .where(eq(receipts.id, receipt.id));
    }
    await receiptService.updateReceiptStatus(middle.id, ReceiptStatus.CONFIRMED);

    const ids = async (statuses: Maybe<ReceiptStatus[]>) =>
      (await receiptService.listReceipts({ statuses })).map((receipt) => receipt.id);

    expect(await ids(null)).toEqual([newest.id, middle.id, oldest.id]);
    expect(await ids([ReceiptStatus.UPLOADED])).toEqual([newest.id, oldest.id]);
    expect(await ids([ReceiptStatus.CONFIRMED, ReceiptStatus.UPLOADED])).toEqual([
      newest.id,
      middle.id,
      oldest.id,
    ]);
    expect(await ids([ReceiptStatus.FAILED])).toEqual([]);
    expect(await ids([])).toEqual([]);
  });

  test('deletes a receipt: its rows, its photos, and its price entries’ link to it', async () => {
    const { receiptService } = getServices();
    const itemId = await seedItem();
    const { id } = await receiptService.addReceipt({ photos: [photo('one'), photo('two')] });
    await receiptService.updateReceiptParse(id, parse([line()]));
    const paths = (await receiptService.listReceiptImages(id)).map((image) => image.path);
    const priceId = await seedPrice(itemId, id);
    expect(await Promise.all(paths.map(fileExists))).toEqual([true, true]);

    await expect(receiptService.deleteReceipt(id)).resolves.toMatchObject({ id });

    await expect(receiptService.getReceiptById(id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(receiptService.listReceiptImages(id)).resolves.toEqual([]);
    await expect(receiptService.listReceiptLines(id)).resolves.toEqual([]);
    expect(await Promise.all(paths.map(fileExists))).toEqual([false, false]);
    const [entry] = await createDb()
      .select()
      .from(priceEntries)
      .where(eq(priceEntries.id, priceId));
    expect(entry).toMatchObject({ id: priceId, receiptId: null });
  });

  test('deleting a receipt whose photo is already gone still deletes the receipt', async () => {
    const { receiptService } = getServices();
    const { id } = await receiptService.addReceipt({ photos: [photo('one')] });
    const [image] = await receiptService.listReceiptImages(id);
    if (!image) throw new Error('expected an image');
    await receiptService.deleteReceipt(id);
    // Same path, as if a backup restore brought the row back without the file.
    const { id: again } = await receiptService.addReceipt({ photos: [photo('two')] });
    await createDb()
      .update(receiptImages)
      .set({ path: image.path })
      .where(eq(receiptImages.receiptId, again));

    await expect(receiptService.deleteReceipt(again)).resolves.toMatchObject({ id: again });
  });

  test('reports unknown receipts and lines as not found, writing nothing', async () => {
    const { receiptService } = getServices();

    await expect(receiptService.getReceiptById('nope')).rejects.toBeInstanceOf(NotFoundError);
    await expect(receiptService.deleteReceipt('nope')).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      receiptService.updateReceiptStatus('nope', ReceiptStatus.READY),
    ).rejects.toBeInstanceOf(NotFoundError);
    // Not a foreign-key failure from inserting lines for a receipt that is not there.
    await expect(receiptService.updateReceiptParse('nope', parse([line()]))).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      receiptService.updateReceiptLineMatch('nope', {
        pantryItemId: null,
        sizeAmount: null,
        sizeUnit: null,
        matchSource: null,
        decision: ReceiptLineDecision.EXCLUDE,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(receiptService.updateReceiptLinePriceEntry('nope', 'x')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(createDb().select().from(receipts)).resolves.toEqual([]);
  });

  test('reports a stored photo that has gone missing as not found', async () => {
    const { receiptService } = getServices();
    const { id } = await receiptService.addReceipt({ photos: [photo('one')] });
    const [image] = await receiptService.listReceiptImages(id);
    if (!image) throw new Error('expected an image');

    await expect(
      receiptService.readReceiptImage({ ...image, path: randomUUID() }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('receiptAliasService', () => {
  const learn = (merchantId: string, pantryItemId: string, over: object = {}) =>
    getServices().receiptAliasService.upsertReceiptAlias({
      merchantId,
      itemNumber: null,
      printedText: 'Org Black Beans',
      pantryItemId,
      sizeAmount: 15,
      sizeUnit: Unit.OUNCE,
      ignored: false,
      ...over,
    });

  test('finds a learned name again from a row OCR read differently', async () => {
    const { receiptAliasService } = getServices();
    const merchantId = await seedMerchant();
    const itemId = await seedItem();
    await learn(merchantId, itemId);

    await expect(
      receiptAliasService.findReceiptAliasByLine(merchantId, {
        itemNumber: null,
        printedText: '0RG  BLACK BEANS',
      }),
    ).resolves.toMatchObject({ pantryItemId: itemId, sizeAmount: 15, sizeUnit: Unit.OUNCE });
  });

  test('relearning a row overwrites the old name: one per (store, match key), latest wins', async () => {
    const merchantId = await seedMerchant();
    const firstItem = await seedItem();
    const secondItem = await seedItem();
    const first = await learn(merchantId, firstItem, { itemNumber: '717662' });

    const second = await learn(merchantId, secondItem, {
      itemNumber: '717662',
      printedText: 'ORG BLK BEANS',
      sizeAmount: 2,
      sizeUnit: Unit.POUND,
    });

    expect(second).toMatchObject({
      id: first.id,
      matchKey: 'item:717662',
      printedText: 'ORG BLK BEANS',
      pantryItemId: secondItem,
      sizeAmount: 2,
      sizeUnit: Unit.POUND,
    });
    expect(second.updatedAt.getTime()).toBeGreaterThanOrEqual(first.updatedAt.getTime());
    await expect(createDb().select().from(receiptAliases)).resolves.toHaveLength(1);
  });

  test('a learned item can be relearned as an ignore, and back', async () => {
    const merchantId = await seedMerchant();
    const itemId = await seedItem();
    await learn(merchantId, itemId);

    const ignored = await learn(merchantId, itemId, {
      pantryItemId: null,
      sizeAmount: null,
      sizeUnit: null,
      ignored: true,
    });
    expect(ignored).toMatchObject({ pantryItemId: null, sizeAmount: null, ignored: true });

    await expect(learn(merchantId, itemId)).resolves.toMatchObject({
      pantryItemId: itemId,
      ignored: false,
    });
  });

  test('a name learned at one store does not apply at another', async () => {
    const { receiptAliasService } = getServices();
    const costco = await seedMerchant();
    const aldi = await seedMerchant();
    await learn(costco, await seedItem());

    await expect(
      receiptAliasService.findReceiptAliasByLine(aldi, {
        itemNumber: null,
        printedText: 'Org Black Beans',
      }),
    ).resolves.toBeNull();
  });

  test('a learned name goes with its deleted pantry item', async () => {
    const { receiptAliasService, pantryItemService } = getServices();
    const merchantId = await seedMerchant();
    const itemId = await seedItem();
    await learn(merchantId, itemId);

    await pantryItemService.deletePantryItem(itemId);

    await expect(
      receiptAliasService.findReceiptAliasByLine(merchantId, {
        itemNumber: null,
        printedText: 'Org Black Beans',
      }),
    ).resolves.toBeNull();
  });

  test('deletes a learned name, and a second delete is not found', async () => {
    const { receiptAliasService } = getServices();
    const merchantId = await seedMerchant();
    const alias = await learn(merchantId, await seedItem());

    await expect(receiptAliasService.deleteReceiptAlias(alias.id)).resolves.toMatchObject({
      id: alias.id,
    });
    await expect(receiptAliasService.deleteReceiptAlias(alias.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
