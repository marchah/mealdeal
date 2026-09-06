import { randomUUID } from 'node:crypto';
import { createYoga } from 'graphql-yoga';
import { beforeEach, expect, test } from 'vitest';
import type { Maybe } from '../../src/common/types';
import { createContext } from '../../src/context';
import { createDb } from '../../src/db/client';
import { couponTypes, merchants, pantryItems, priceEntries } from '../../src/db/schema';
import { schema } from '../../src/schema';

// INTEGRATION test for the priceEntry slice. Proves what the unit spec cannot: the mutation and
// the nested PantryItem.priceEntries field resolve end-to-end through the real Yoga app, the
// per-request DataLoader groups history to the right item, and the unit price stored in libsql is
// the comparable number the feature depends on. We drive yoga.fetch so there is one graphql
// instance; beforeEach isolates each test.

const yoga = createYoga({ schema, context: createContext });

interface GraphQLResponse<T> {
  errors?: unknown;
  data?: T;
}

async function run<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<GraphQLResponse<T>> {
  const response = await yoga.fetch('http://localhost/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  return (await response.json()) as GraphQLResponse<T>;
}

interface AddEntryResult {
  addPriceEntry: {
    __typename: string;
    message?: string;
    data?: {
      id: string;
      price: number;
      currency: string;
      unitPrice: number;
      quantity: number;
      source: string;
      onSale: boolean;
      merchant: Maybe<{ name: string }>;
    };
  };
}

const ADD_ENTRY = `mutation Add($input: PriceEntryInput!) {
  addPriceEntry(input: $input) {
    __typename
    ... on MutationAddPriceEntrySuccess {
      data { id price currency unitPrice quantity source onSale merchant { name } }
    }
    ... on ConflictError { message status }
    ... on NotFoundError { message status }
    ... on ValidationError { message status }
  }
}`;

async function seedItem(name: string, unitPriceUnit = 'FLUID_OUNCE'): Promise<string> {
  const id = randomUUID();
  await createDb()
    .insert(pantryItems)
    .values({ id, name, unitPriceUnit: unitPriceUnit as never });
  return id;
}

function addEntry(input: Record<string, unknown>) {
  return run<AddEntryResult>(ADD_ENTRY, { input });
}

beforeEach(async () => {
  const db = createDb();
  await db.delete(priceEntries);
  await db.delete(pantryItems);
  await db.delete(merchants);
  await db.delete(couponTypes);
});

test('records a price and stores the comparable unit price', async () => {
  const pantryItemId = await seedItem('Tide Free & Gentle');

  const added = await addEntry({
    pantryItemId,
    price: 19.94,
    sizeAmount: 150,
    sizeUnit: 'FLUID_OUNCE',
  });

  expect(added.errors).toBeUndefined();
  expect(added.data?.addPriceEntry.__typename).toBe('MutationAddPriceEntrySuccess');
  expect(added.data?.addPriceEntry.data?.unitPrice).toBeCloseTo(19.94 / 150, 10);
  // Defaults survive the round trip through libsql, not just through drizzle's insert.
  expect(added.data?.addPriceEntry.data).toMatchObject({
    currency: 'USD',
    quantity: 1,
    source: 'MANUAL',
    onSale: false,
  });
});

test('ranks a multi-pack against a jug by unit price, not sticker price', async () => {
  const pantryItemId = await seedItem('Laundry detergent');

  const jug = await addEntry({
    pantryItemId,
    price: 19.94,
    sizeAmount: 150,
    sizeUnit: 'FLUID_OUNCE',
  });
  const twoPack = await addEntry({
    pantryItemId,
    price: 12.98,
    sizeAmount: 46,
    quantity: 2,
    sizeUnit: 'FLUID_OUNCE',
  });

  const jugUnit = jug.data?.addPriceEntry.data?.unitPrice ?? 0;
  const packUnit = twoPack.data?.addPriceEntry.data?.unitPrice ?? 0;
  expect(packUnit).toBeGreaterThan(jugUnit);
});

test('reads an item’s history newest first, narrowed by since and limit', async () => {
  const pantryItemId = await seedItem('Coffee', 'OUNCE');
  const at = (iso: string) => ({
    pantryItemId,
    price: 11.99,
    sizeAmount: 12,
    sizeUnit: 'OUNCE',
    observedAt: iso,
  });
  await addEntry({ ...at('2026-01-01T00:00:00.000Z'), note: 'january' });
  await addEntry({ ...at('2026-03-01T00:00:00.000Z'), note: 'march' });
  await addEntry({ ...at('2026-02-01T00:00:00.000Z'), note: 'february' });

  const all = await run<{ pantryItems: { priceEntries: { note: string }[] }[] }>(
    '{ pantryItems { priceEntries { note } } }',
  );
  expect(all.data?.pantryItems[0]?.priceEntries.map((e) => e.note)).toEqual([
    'march',
    'february',
    'january',
  ]);

  const recent = await run<{ pantryItems: { priceEntries: { note: string }[] }[] }>(
    `query Recent($since: DateTime!) {
       pantryItems { priceEntries(since: $since) { note } }
     }`,
    { since: '2026-02-01T00:00:00.000Z' },
  );
  expect(recent.data?.pantryItems[0]?.priceEntries.map((e) => e.note)).toEqual([
    'march',
    'february',
  ]);

  const latest = await run<{ pantryItems: { priceEntries: { note: string }[] }[] }>(
    '{ pantryItems { priceEntries(limit: 1) { note } } }',
  );
  expect(latest.data?.pantryItems[0]?.priceEntries.map((e) => e.note)).toEqual(['march']);
});

test('keeps each item’s history to itself when several are loaded at once', async () => {
  // The DataLoader groups one batched query by item; mis-grouping would silently mix histories.
  const tideId = await seedItem('Tide');
  const coffeeId = await seedItem('Coffee', 'OUNCE');
  await addEntry({ pantryItemId: tideId, price: 19.94, sizeAmount: 150, sizeUnit: 'FLUID_OUNCE' });
  await addEntry({ pantryItemId: tideId, price: 17.49, sizeAmount: 150, sizeUnit: 'FLUID_OUNCE' });
  await addEntry({ pantryItemId: coffeeId, price: 11.99, sizeAmount: 12, sizeUnit: 'OUNCE' });

  const listed = await run<{
    pantryItems: { id: string; name: string; priceEntries: { price: number }[] }[];
  }>('{ pantryItems { id name priceEntries { price } } }');

  const byName = new Map(listed.data?.pantryItems.map((item) => [item.name, item]));
  expect(byName.get('Tide')?.priceEntries.map((e) => e.price)).toEqual([19.94, 17.49]);
  expect(byName.get('Coffee')?.priceEntries.map((e) => e.price)).toEqual([11.99]);
});

test('reports an item with no history as an empty list, not an error', async () => {
  await seedItem('Tide');

  const listed = await run<{ pantryItems: { priceEntries: unknown[] }[] }>(
    '{ pantryItems { priceEntries { id } } }',
  );

  expect(listed.errors).toBeUndefined();
  expect(listed.data?.pantryItems[0]?.priceEntries).toEqual([]);
});

test('creates the store on first sight and reuses it afterwards', async () => {
  const pantryItemId = await seedItem('Tide');

  const first = await addEntry({
    pantryItemId,
    price: 19.94,
    sizeAmount: 150,
    sizeUnit: 'FLUID_OUNCE',
    merchantName: 'Costco',
  });
  await addEntry({
    pantryItemId,
    price: 17.49,
    sizeAmount: 150,
    sizeUnit: 'FLUID_OUNCE',
    merchantName: 'Costco',
  });

  expect(first.data?.addPriceEntry.data?.merchant?.name).toBe('Costco');
  const stored = await createDb().select().from(merchants);
  expect(stored).toHaveLength(1);
});

test('refuses a size measuring something other than the item', async () => {
  const pantryItemId = await seedItem('Tide');

  const added = await addEntry({ pantryItemId, price: 8, sizeAmount: 2, sizeUnit: 'POUND' });

  expect(added.data?.addPriceEntry.__typename).toBe('ValidationError');
  expect(added.data?.addPriceEntry.message).toContain('FLUID_OUNCE');
});

test('refuses a currency the item’s history is not kept in', async () => {
  const pantryItemId = await seedItem('Tide');
  await addEntry({ pantryItemId, price: 19.94, sizeAmount: 150, sizeUnit: 'FLUID_OUNCE' });

  const euros = await addEntry({
    pantryItemId,
    price: 18,
    sizeAmount: 150,
    sizeUnit: 'FLUID_OUNCE',
    currency: 'EUR',
  });

  expect(euros.data?.addPriceEntry.__typename).toBe('ConflictError');
});

test('refuses a non-positive price at the argument boundary', async () => {
  const pantryItemId = await seedItem('Tide');

  const added = await addEntry({
    pantryItemId,
    price: 0,
    sizeAmount: 150,
    sizeUnit: 'FLUID_OUNCE',
  });

  expect(added.data?.addPriceEntry.__typename).toBe('ValidationError');
});

test('reports an unknown pantry item as a typed not-found', async () => {
  const added = await addEntry({
    pantryItemId: randomUUID(),
    price: 5,
    sizeAmount: 10,
    sizeUnit: 'OUNCE',
  });

  expect(added.errors).toBeUndefined();
  expect(added.data?.addPriceEntry.__typename).toBe('NotFoundError');
});

test('deletes one entry, leaving the rest of the history', async () => {
  const pantryItemId = await seedItem('Tide');
  const doomed = await addEntry({
    pantryItemId,
    price: 19.94,
    sizeAmount: 150,
    sizeUnit: 'FLUID_OUNCE',
  });
  await addEntry({ pantryItemId, price: 17.49, sizeAmount: 150, sizeUnit: 'FLUID_OUNCE' });

  const deleted = await run<{ deletePriceEntry: { __typename: string; data?: { id: string } } }>(
    `mutation Delete($id: ID!) {
       deletePriceEntry(id: $id) {
         __typename
         ... on MutationDeletePriceEntrySuccess { data { id } }
       }
     }`,
    { id: doomed.data?.addPriceEntry.data?.id ?? '' },
  );

  expect(deleted.data?.deletePriceEntry.data?.id).toBe(doomed.data?.addPriceEntry.data?.id);
  const left = await run<{ pantryItems: { priceEntries: { price: number }[] }[] }>(
    '{ pantryItems { priceEntries { price } } }',
  );
  expect(left.data?.pantryItems[0]?.priceEntries.map((e) => e.price)).toEqual([17.49]);
});
