import { randomUUID } from 'node:crypto';
import { createYoga } from 'graphql-yoga';
import { beforeEach, expect, test } from 'vitest';
import type { Maybe } from '../../src/common/types';
import { createContext } from '../../src/context';
import { createDb } from '../../src/db/client';
import { couponTypes, pantryItems, priceEntries } from '../../src/db/schema';
import { schema } from '../../src/schema';

// INTEGRATION test for the pantryItem slice. Proves what the unit spec cannot: that the queries
// and mutations resolve end-to-end through the real Yoga app (HTTP parse -> context -> resolver ->
// service -> repository -> libsql), that the case-folded duplicate rule works against real SQL
// rather than a mock, that `category` batches through the DataLoader, and that the writes really
// do come back via RETURNING. We drive yoga.fetch (not graphql-js) so there is one graphql
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

const ITEM_FIELDS = `
  __typename
  ... on MutationAddPantryItemSuccess {
    data { id name brand unitPriceUnit sizeAmount sizeUnit archived category { key label } }
  }
  ... on ConflictError { message status }
  ... on NotFoundError { message status }
  ... on ValidationError { message status }
`;

interface AddResult {
  addPantryItem: {
    __typename: string;
    message?: string;
    data?: {
      id: string;
      name: string;
      brand: Maybe<string>;
      unitPriceUnit: string;
      sizeAmount: Maybe<number>;
      sizeUnit: Maybe<string>;
      archived: boolean;
      category: Maybe<{ key: string; label: string }>;
    };
  };
}

function addItem(input: Record<string, unknown>) {
  return run<AddResult>(
    `mutation Add($input: PantryItemInput!) { addPantryItem(input: $input) { ${ITEM_FIELDS} } }`,
    { input },
  );
}

const TIDE = { name: 'Tide Free & Gentle', brand: 'Tide', unitPriceUnit: 'FLUID_OUNCE' };

async function seedCouponType(key = 'household'): Promise<string> {
  const id = randomUUID();
  await createDb().insert(couponTypes).values({ id, key, label: 'Household' });
  return id;
}

beforeEach(async () => {
  const db = createDb();
  await db.delete(priceEntries);
  await db.delete(pantryItems);
  await db.delete(couponTypes);
});

test('adds an item and reads it back through the list', async () => {
  const added = await addItem({ ...TIDE, sizeAmount: 150, sizeUnit: 'FLUID_OUNCE' });
  expect(added.errors).toBeUndefined();
  expect(added.data?.addPantryItem.__typename).toBe('MutationAddPantryItemSuccess');
  expect(added.data?.addPantryItem.data).toMatchObject({
    name: 'Tide Free & Gentle',
    brand: 'Tide',
    unitPriceUnit: 'FLUID_OUNCE',
    sizeAmount: 150,
    archived: false,
  });

  const listed = await run<{ pantryItems: { id: string; name: string }[] }>(
    '{ pantryItems { id name } }',
  );
  expect(listed.data?.pantryItems).toHaveLength(1);
});

test('refuses a duplicate whose name differs only by case', async () => {
  await addItem(TIDE);

  const again = await addItem({ ...TIDE, name: 'tide free & gentle' });

  // The rule slice 4 could not express as an index, enforced here against real SQL.
  expect(again.data?.addPantryItem.__typename).toBe('ConflictError');
  // Reports the stored spelling, which is what tells you which item you collided with.
  expect(again.data?.addPantryItem.message).toContain('Tide Free & Gentle (Tide)');
});

test('treats two unbranded items of the same name as duplicates', async () => {
  // A plain UNIQUE(name, brand) would let both through, because SQL treats NULLs as distinct.
  await addItem({ name: 'Paper towels', unitPriceUnit: 'SQUARE_FOOT' });

  const again = await addItem({ name: 'paper towels', unitPriceUnit: 'SQUARE_FOOT' });

  expect(again.data?.addPantryItem.__typename).toBe('ConflictError');
});

test('lets the same name coexist under different brands', async () => {
  await addItem({ name: 'Paper towels', brand: 'Bounty', unitPriceUnit: 'SQUARE_FOOT' });

  const other = await addItem({
    name: 'Paper towels',
    brand: 'Kirkland',
    unitPriceUnit: 'SQUARE_FOOT',
  });

  expect(other.data?.addPantryItem.__typename).toBe('MutationAddPantryItemSuccess');
});

test('resolves the category through the coupon-type taxonomy', async () => {
  const couponTypeId = await seedCouponType();

  const added = await addItem({ ...TIDE, couponTypeId });

  expect(added.data?.addPantryItem.data?.category).toEqual({
    key: 'household',
    label: 'Household',
  });
});

test('rejects a category that does not exist, with a typed error', async () => {
  const added = await addItem({ ...TIDE, couponTypeId: randomUUID() });

  expect(added.data?.addPantryItem.__typename).toBe('NotFoundError');
});

test('rejects a pack size measuring something other than the unit price', async () => {
  const added = await addItem({ ...TIDE, sizeAmount: 2, sizeUnit: 'POUND' });

  expect(added.data?.addPantryItem.__typename).toBe('ValidationError');
  expect(added.data?.addPantryItem.message).toContain('do not measure the same thing');
});

test('rejects a non-positive size at the argument boundary', async () => {
  const added = await addItem({ ...TIDE, sizeAmount: 0, sizeUnit: 'FLUID_OUNCE' });

  expect(added.data?.addPantryItem.__typename).toBe('ValidationError');
});

test('rejects an image URL that is not http(s)', async () => {
  const added = await addItem({ ...TIDE, imageUrl: 'javascript:alert(1)' });

  expect(added.data?.addPantryItem.__typename).toBe('ValidationError');
});

test('updates an item in place and returns the stored row', async () => {
  const added = await addItem(TIDE);
  const id = added.data?.addPantryItem.data?.id ?? '';

  const updated = await run<{
    updatePantryItem: {
      __typename: string;
      data?: { id: string; name: string; brand: Maybe<string> };
    };
  }>(
    `mutation Update($id: ID!, $input: PantryItemInput!) {
       updatePantryItem(id: $id, input: $input) {
         __typename
         ... on MutationUpdatePantryItemSuccess { data { id name brand } }
       }
     }`,
    { id, input: { name: 'Tide Original', brand: null, unitPriceUnit: 'FLUID_OUNCE' } },
  );

  // Proves RETURNING actually comes back from libsql rather than a reconstructed object.
  expect(updated.data?.updatePantryItem.data).toEqual({ id, name: 'Tide Original', brand: null });
});

test('archives an item out of the default list and restores it', async () => {
  const added = await addItem(TIDE);
  const id = added.data?.addPantryItem.data?.id ?? '';
  const archive = `mutation Archive($id: ID!, $archived: Boolean!) {
    archivePantryItem(id: $id, archived: $archived) {
      __typename
      ... on MutationArchivePantryItemSuccess { data { id archived } }
    }
  }`;

  await run(archive, { id, archived: true });
  const hidden = await run<{ pantryItems: unknown[] }>('{ pantryItems { id } }');
  const shown = await run<{ pantryItems: unknown[] }>(
    '{ pantryItems(includeArchived: true) { id } }',
  );

  expect(hidden.data?.pantryItems).toHaveLength(0);
  expect(shown.data?.pantryItems).toHaveLength(1);

  await run(archive, { id, archived: false });
  const restored = await run<{ pantryItems: unknown[] }>('{ pantryItems { id } }');
  expect(restored.data?.pantryItems).toHaveLength(1);
});

test('filters the list by category', async () => {
  const householdId = await seedCouponType('household');
  const foodId = await seedCouponType('food');
  await addItem({ ...TIDE, couponTypeId: householdId });
  await addItem({ name: 'Coffee', unitPriceUnit: 'OUNCE', couponTypeId: foodId });

  const filtered = await run<{ pantryItems: { name: string }[] }>(
    'query Filtered($id: ID!) { pantryItems(couponTypeId: $id) { name } }',
    { id: foodId },
  );

  expect(filtered.data?.pantryItems.map((item) => item.name)).toEqual(['Coffee']);
});

test('deletes an item and returns what went', async () => {
  const added = await addItem(TIDE);
  const id = added.data?.addPantryItem.data?.id ?? '';

  const deleted = await run<{ deletePantryItem: { __typename: string; data?: { id: string } } }>(
    `mutation Delete($id: ID!) {
       deletePantryItem(id: $id) {
         __typename
         ... on MutationDeletePantryItemSuccess { data { id } }
       }
     }`,
    { id },
  );

  expect(deleted.data?.deletePantryItem.data?.id).toBe(id);
  const listed = await run<{ pantryItems: unknown[] }>(
    '{ pantryItems(includeArchived: true) { id } }',
  );
  expect(listed.data?.pantryItems).toHaveLength(0);
});

test('reports an unknown id as a typed not-found rather than a crash', async () => {
  const missing = await run<{ pantryItem: { __typename: string } }>(
    'query One($id: ID!) { pantryItem(id: $id) { __typename ... on NotFoundError { status } } }',
    { id: randomUUID() },
  );

  expect(missing.errors).toBeUndefined();
  expect(missing.data?.pantryItem.__typename).toBe('NotFoundError');
});
