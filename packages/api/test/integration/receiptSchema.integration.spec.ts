import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, expect, test } from 'vitest';
import type { Maybe } from '../../src/common/types';
import { Unit } from '../../src/common/units';
import { createDb } from '../../src/db/client';
import {
  merchants,
  pantryItems,
  priceEntries,
  receiptAliases,
  receiptImages,
  receiptLines,
  receipts,
} from '../../src/db/schema';
import { PriceSource } from '../../src/entities/priceEntry/types';
import {
  ReceiptLineDecision,
  ReceiptLineFlag,
  ReceiptStatus,
} from '../../src/entities/receipt/types';

// INTEGRATION test for the receipt migration. Like pantrySchema, it pins BEHAVIOUR rather than the
// column list: that the committed migrations apply, and that every referential rule the schema
// declares is one libsql actually performs. Worth its own spec twice over here: drizzle-kit
// silently drops ON DELETE from a column it adds to an existing table, which is why
// price_entries.receipt_id took a second, table-rebuilding migration to get right.

/** Drizzle wraps the driver error; the constraint that actually fired is on `cause`. */
async function constraintFailure(write: Promise<unknown>): Promise<string> {
  const failure = await write.then(
    () => null,
    (error: unknown) => error,
  );
  expect(failure).toBeInstanceOf(Error);
  return String((failure as Error).cause);
}

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

async function seedReceipt(): Promise<string> {
  const id = randomUUID();
  await createDb().insert(receipts).values({ id, status: ReceiptStatus.READY });
  return id;
}

async function seedImage(receiptId: string, position: number): Promise<string> {
  const id = randomUUID();
  await createDb()
    .insert(receiptImages)
    .values({ id, receiptId, position, path: randomUUID(), contentType: 'image/jpeg', bytes: 3 });
  return id;
}

async function seedLine(
  receiptId: string,
  over: {
    position?: number;
    pantryItemId?: string;
    priceEntryId?: string;
    flags?: ReceiptLineFlag[];
  } = {},
): Promise<string> {
  const id = randomUUID();
  await createDb()
    .insert(receiptLines)
    .values({
      id,
      receiptId,
      position: over.position ?? 0,
      printedText: 'Org Black Beans',
      lineTotal: 0.89,
      decision: ReceiptLineDecision.PENDING,
      pantryItemId: over.pantryItemId ?? null,
      priceEntryId: over.priceEntryId ?? null,
      ...(over.flags ? { flags: over.flags } : {}),
    });
  return id;
}

async function seedPrice(pantryItemId: string, receiptId: Maybe<string> = null): Promise<string> {
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

async function seedAlias(
  merchantId: string,
  matchKey: string,
  pantryItemId: Maybe<string>,
): Promise<string> {
  const id = randomUUID();
  await createDb()
    .insert(receiptAliases)
    .values({
      id,
      merchantId,
      matchKey,
      printedText: 'Org Black Beans',
      pantryItemId,
      ignored: pantryItemId === null,
    });
  return id;
}

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

test('the migrations created the receipt tables', async () => {
  const db = createDb();
  await expect(db.select().from(receipts)).resolves.toEqual([]);
  await expect(db.select().from(receiptImages)).resolves.toEqual([]);
  await expect(db.select().from(receiptLines)).resolves.toEqual([]);
  await expect(db.select().from(receiptAliases)).resolves.toEqual([]);
});

test('deleting a receipt takes its images and lines with it, and only its own', async () => {
  const db = createDb();
  const doomed = await seedReceipt();
  const kept = await seedReceipt();
  await seedImage(doomed, 0);
  await seedImage(doomed, 1);
  await seedLine(doomed, { position: 0 });
  await seedLine(doomed, { position: 1 });
  const keptImage = await seedImage(kept, 0);
  const keptLine = await seedLine(kept);

  await db.delete(receipts).where(eq(receipts.id, doomed));

  await expect(
    db.select().from(receiptImages).where(eq(receiptImages.receiptId, doomed)),
  ).resolves.toEqual([]);
  await expect(
    db.select().from(receiptLines).where(eq(receiptLines.receiptId, doomed)),
  ).resolves.toEqual([]);
  expect((await db.select().from(receiptImages)).map((image) => image.id)).toEqual([keptImage]);
  expect((await db.select().from(receiptLines)).map((line) => line.id)).toEqual([keptLine]);
});

test('deleting a receipt keeps the prices it produced, unlinked', async () => {
  const db = createDb();
  const itemId = await seedItem();
  const receiptId = await seedReceipt();
  const priceId = await seedPrice(itemId, receiptId);

  await db.delete(receipts).where(eq(receipts.id, receiptId));

  // set null, not cascade: the history is the precious part.
  const [entry] = await db.select().from(priceEntries).where(eq(priceEntries.id, priceId));
  expect(entry).toMatchObject({ id: priceId, pantryItemId: itemId, price: 0.89, receiptId: null });
});

test('a price entry need not come from a receipt, but cannot name one that does not exist', async () => {
  const itemId = await seedItem();
  const priceId = await seedPrice(itemId);

  const [entry] = await createDb().select().from(priceEntries).where(eq(priceEntries.id, priceId));
  expect(entry?.receiptId).toBeNull();

  expect(await constraintFailure(seedPrice(itemId, 'no-such-receipt'))).toMatch(
    /FOREIGN KEY constraint failed/i,
  );
});

test('the receipt rebuild kept price entries cascading from their item', async () => {
  // 0008 rebuilt price_entries to add receipt_id's ON DELETE; the older rules had to survive it.
  const db = createDb();
  const itemId = await seedItem();
  const receiptId = await seedReceipt();
  await seedPrice(itemId, receiptId);

  await db.delete(pantryItems).where(eq(pantryItems.id, itemId));

  await expect(
    db.select().from(priceEntries).where(eq(priceEntries.pantryItemId, itemId)),
  ).resolves.toEqual([]);
});

test('one learned name per (store, match key)', async () => {
  const costco = await seedMerchant();
  const aldi = await seedMerchant();
  const itemId = await seedItem();
  await seedAlias(costco, 'item:717662', itemId);

  expect(await constraintFailure(seedAlias(costco, 'item:717662', null))).toMatch(
    /UNIQUE constraint failed/i,
  );

  // The same key at another store, and another key at the same store, are different names.
  await seedAlias(aldi, 'item:717662', itemId);
  await seedAlias(costco, 'text:orgblackbeans', itemId);
  await expect(createDb().select().from(receiptAliases)).resolves.toHaveLength(3);
});

test('a learned name goes with its deleted pantry item; a learned ignore stays', async () => {
  const db = createDb();
  const merchantId = await seedMerchant();
  const itemId = await seedItem();
  const otherItemId = await seedItem();
  const learned = await seedAlias(merchantId, 'item:717662', itemId);
  const other = await seedAlias(merchantId, 'item:100200', otherItemId);
  const ignore = await seedAlias(merchantId, 'text:bagfee', null);

  await db.delete(pantryItems).where(eq(pantryItems.id, itemId));

  const left = (await db.select().from(receiptAliases)).map((alias) => alias.id).sort();
  expect(left).toEqual([other, ignore].sort());
  expect(left).not.toContain(learned);
});

test('a learned name must belong to a known store and point at a known item', async () => {
  const merchantId = await seedMerchant();

  expect(await constraintFailure(seedAlias('no-such-store', 'text:x', null))).toMatch(
    /FOREIGN KEY constraint failed/i,
  );
  expect(await constraintFailure(seedAlias(merchantId, 'text:x', 'no-such-item'))).toMatch(
    /FOREIGN KEY constraint failed/i,
  );
});

test('a line un-matches, rather than disappears, when its item or price entry is deleted', async () => {
  const db = createDb();
  const itemId = await seedItem();
  const receiptId = await seedReceipt();
  const priceId = await seedPrice(itemId, receiptId);
  const lineId = await seedLine(receiptId, { pantryItemId: itemId, priceEntryId: priceId });

  await db.delete(priceEntries).where(eq(priceEntries.id, priceId));
  const [afterEntry] = await db.select().from(receiptLines).where(eq(receiptLines.id, lineId));
  expect(afterEntry).toMatchObject({ pantryItemId: itemId, priceEntryId: null });

  await db.delete(pantryItems).where(eq(pantryItems.id, itemId));
  const [afterItem] = await db.select().from(receiptLines).where(eq(receiptLines.id, lineId));
  expect(afterItem).toMatchObject({ pantryItemId: null, printedText: 'Org Black Beans' });
});

test('a receipt has one line and one image per position', async () => {
  const receiptId = await seedReceipt();
  const otherId = await seedReceipt();
  await seedLine(receiptId, { position: 0 });
  await seedImage(receiptId, 0);

  expect(await constraintFailure(seedLine(receiptId, { position: 0 }))).toMatch(
    /UNIQUE constraint failed/i,
  );
  expect(await constraintFailure(seedImage(receiptId, 0))).toMatch(/UNIQUE constraint failed/i);

  // Position is per receipt.
  await seedLine(otherId, { position: 0 });
  await seedImage(otherId, 0);
});

test('a line or image cannot belong to no receipt', async () => {
  expect(await constraintFailure(seedLine('no-such-receipt'))).toMatch(
    /FOREIGN KEY constraint failed/i,
  );
  expect(await constraintFailure(seedImage('no-such-receipt', 0))).toMatch(
    /FOREIGN KEY constraint failed/i,
  );
});

test('a line’s flags default to none and round-trip as a list', async () => {
  const db = createDb();
  const receiptId = await seedReceipt();
  const plain = await seedLine(receiptId, { position: 0 });
  const flagged = await seedLine(receiptId, {
    position: 1,
    flags: [ReceiptLineFlag.LINE_TOTAL_MISMATCH],
  });

  const [plainRow] = await db.select().from(receiptLines).where(eq(receiptLines.id, plain));
  const [flaggedRow] = await db.select().from(receiptLines).where(eq(receiptLines.id, flagged));
  expect(plainRow?.flags).toEqual([]);
  expect(flaggedRow?.flags).toEqual([ReceiptLineFlag.LINE_TOTAL_MISMATCH]);
});
