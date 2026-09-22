import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import { Unit } from '../../src/common/units';
import { createDb } from '../../src/db/client';
import { couponTypes, pantryItems, priceEntries } from '../../src/db/schema';
import { PriceSource } from '../../src/entities/priceEntry/types';

// INTEGRATION test for the pantry migration. It pins BEHAVIOUR, not the column list: that the
// committed migration applies at all (these queries would throw "no such table" otherwise), and
// that the referential rules the schema declares are ones libsql actually performs. Worth its own
// spec because a declared `onDelete` is inert unless foreign keys are enforced, and because the
// first cut of this migration emitted SQL that failed at migration time.

async function seedItem(over: { couponTypeId?: string } = {}): Promise<string> {
  const id = randomUUID();
  await createDb()
    .insert(pantryItems)
    .values({
      id,
      name: `Tide ${id}`,
      unitPriceUnit: Unit.FLUID_OUNCE,
      couponTypeId: over.couponTypeId ?? null,
    });
  return id;
}

async function seedPrice(pantryItemId: string): Promise<string> {
  const id = randomUUID();
  await createDb().insert(priceEntries).values({
    id,
    pantryItemId,
    price: 19.94,
    sizeAmount: 150,
    sizeUnit: Unit.FLUID_OUNCE,
    unitPrice: 0.13293333,
    source: PriceSource.MANUAL,
  });
  return id;
}

beforeEach(async () => {
  const db = createDb();
  await db.delete(priceEntries);
  await db.delete(pantryItems);
  await db.delete(couponTypes);
});

test('the migration created both pantry tables', async () => {
  const db = createDb();
  await expect(db.select().from(pantryItems)).resolves.toEqual([]);
  await expect(db.select().from(priceEntries)).resolves.toEqual([]);
});

test('a price entry omitting the optional fields lands with sane values', async () => {
  // Drizzle sends its schema defaults in the INSERT rather than leaving them to SQLite, so this
  // pins the values a caller actually gets; the migration's DEFAULT clauses are the backstop for
  // anything that writes outside drizzle.
  const itemId = await seedItem();
  const priceId = await seedPrice(itemId);

  const [entry] = await createDb().select().from(priceEntries).where(eq(priceEntries.id, priceId));

  expect(entry?.currency).toBe('USD');
  expect(entry?.quantity).toBe(1);
  expect(entry?.onSale).toBe(false);
  // observedAt lands at now, so a price logged without a date is not stranded at the epoch.
  expect(entry?.observedAt.getTime()).toBeGreaterThan(0);
});

test('archiving is a soft delete: an item defaults to not archived', async () => {
  const itemId = await seedItem();

  const [item] = await createDb().select().from(pantryItems).where(eq(pantryItems.id, itemId));

  expect(item?.archived).toBe(false);
});

test('deleting an item cascades its price history', async () => {
  const db = createDb();
  const itemId = await seedItem();
  await seedPrice(itemId);
  await seedPrice(itemId);

  await db.delete(pantryItems).where(eq(pantryItems.id, itemId));

  // Not merely declared: foreign keys must actually be enforced for this to hold.
  await expect(
    db.select().from(priceEntries).where(eq(priceEntries.pantryItemId, itemId)),
  ).resolves.toEqual([]);
});

test('refuses a price entry pointing at no item', async () => {
  // Drizzle wraps the driver error, so the constraint that actually fired is on `cause`.
  // Asserting on the wrapper alone would pass for any failed insert and prove nothing.
  const failure = await seedPrice('does-not-exist').catch((error: unknown) => error);

  expect(failure).toBeInstanceOf(Error);
  expect(String((failure as Error).cause)).toMatch(/FOREIGN KEY constraint failed/i);
});

test('deleting a category clears it without taking the item with it', async () => {
  const db = createDb();
  const couponTypeId = randomUUID();
  await db.insert(couponTypes).values({ id: couponTypeId, key: 'household', label: 'Household' });
  const itemId = await seedItem({ couponTypeId });

  await db.delete(couponTypes).where(eq(couponTypes.id, couponTypeId));

  // set null, not cascade: losing a taxonomy row must never destroy a tracked item's history.
  const [item] = await db.select().from(pantryItems).where(eq(pantryItems.id, itemId));
  expect(item?.id).toBe(itemId);
  expect(item?.couponTypeId).toBeNull();
});
