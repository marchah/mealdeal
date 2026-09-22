import { randomUUID } from 'node:crypto';
import { createYoga } from 'graphql-yoga';
import { beforeEach, expect, test } from 'vitest';
import type { Maybe } from '../../src/common/types';
import { createContext } from '../../src/context';
import { createDb } from '../../src/db/client';
import { couponTypes, merchants, pantryItems, priceEntries } from '../../src/db/schema';
import { schema } from '../../src/schema';

// INTEGRATION test for the priceInsight feature. Proves the verdict survives the whole round trip
// — real rows in libsql, the per-request DataLoader, the nested PantryItem.insight field — rather
// than only holding for hand-built objects in the unit spec. We drive yoga.fetch so there is one
// graphql instance; beforeEach isolates each test.

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

interface Insight {
  verdict: string;
  observationCount: number;
  windowDays: number;
  latestUnitPrice: Maybe<number>;
  lowestUnitPrice: Maybe<number>;
  medianUnitPrice: Maybe<number>;
  percentile: Maybe<number>;
  savingsVsMedianPct: Maybe<number>;
  meetsTargetPrice: Maybe<boolean>;
  formattedLatestUnitPrice: Maybe<string>;
  displayUnit: string;
  currency: Maybe<string>;
  cheapestMerchant: Maybe<{ name: string }>;
  latest: Maybe<{ price: number }>;
}

const INSIGHT_FIELDS = `
  verdict observationCount windowDays latestUnitPrice lowestUnitPrice medianUnitPrice
  percentile savingsVsMedianPct meetsTargetPrice formattedLatestUnitPrice displayUnit currency
  cheapestMerchant { name }
  latest { price }
`;

async function seedItem(over: { targetPrice?: number; unitPriceUnit?: string } = {}) {
  const id = randomUUID();
  await createDb()
    .insert(pantryItems)
    .values({
      id,
      name: `Detergent ${id}`,
      unitPriceUnit: (over.unitPriceUnit ?? 'FLUID_OUNCE') as never,
      targetPrice: over.targetPrice ?? null,
    });
  return id;
}

const DAY_MS = 24 * 60 * 60 * 1_000;

async function logPrice(
  pantryItemId: string,
  opts: { price: number; daysAgo: number; merchantName?: string },
) {
  const result = await run<{ addPriceEntry: { __typename: string; message?: string } }>(
    `mutation Add($input: PriceEntryInput!) {
       addPriceEntry(input: $input) {
         __typename
         ... on ValidationError { message }
         ... on ConflictError { message }
         ... on NotFoundError { message }
       }
     }`,
    {
      input: {
        pantryItemId,
        price: opts.price,
        sizeAmount: 150,
        sizeUnit: 'FLUID_OUNCE',
        merchantName: opts.merchantName,
        observedAt: new Date(Date.now() - opts.daysAgo * DAY_MS).toISOString(),
      },
    },
  );
  // Fail loudly here rather than letting a rejected write look like "no history" downstream.
  expect(result.data?.addPriceEntry.__typename).toBe('MutationAddPriceEntrySuccess');
}

async function insightFor(id: string, windowDays?: number): Promise<Insight> {
  const query = windowDays
    ? `query One($id: ID!, $w: Int!) {
         pantryItem(id: $id) {
           ... on QueryPantryItemSuccess { data { insight(windowDays: $w) { ${INSIGHT_FIELDS} } } }
         }
       }`
    : `query One($id: ID!) {
         pantryItem(id: $id) {
           ... on QueryPantryItemSuccess { data { insight { ${INSIGHT_FIELDS} } } }
         }
       }`;
  const body = await run<{ pantryItem: { data?: { insight: Insight } } }>(query, {
    id,
    ...(windowDays ? { w: windowDays } : {}),
  });
  expect(body.errors).toBeUndefined();
  const insight = body.data?.pantryItem.data?.insight;
  if (!insight) throw new Error('no insight returned');
  return insight;
}

beforeEach(async () => {
  const db = createDb();
  await db.delete(priceEntries);
  await db.delete(pantryItems);
  await db.delete(merchants);
  await db.delete(couponTypes);
});

test('withholds a verdict until there is enough history', async () => {
  const id = await seedItem();
  await logPrice(id, { price: 19.94, daysAgo: 1 });

  const insight = await insightFor(id);

  expect(insight.verdict).toBe('UNKNOWN');
  expect(insight.observationCount).toBe(1);
  expect(insight.windowDays).toBe(365);
  // The price is still reported: "unknown" is about the judgement, not the data.
  expect(insight.formattedLatestUnitPrice).toBe('$0.13/fl oz');
});

test('calls the cheapest price in a real history GREAT and names the store', async () => {
  const id = await seedItem();
  await logPrice(id, { price: 24.99, daysAgo: 40, merchantName: 'Target' });
  await logPrice(id, { price: 23.49, daysAgo: 30, merchantName: 'Target' });
  await logPrice(id, { price: 22.99, daysAgo: 20, merchantName: 'Walgreens' });
  await logPrice(id, { price: 23.99, daysAgo: 10, merchantName: 'Target' });
  await logPrice(id, { price: 16.49, daysAgo: 1, merchantName: 'Costco' });

  const insight = await insightFor(id);

  expect(insight.verdict).toBe('GREAT');
  expect(insight.observationCount).toBe(5);
  expect(insight.cheapestMerchant?.name).toBe('Costco');
  expect(insight.latest?.price).toBe(16.49);
  expect(insight.savingsVsMedianPct ?? 0).toBeGreaterThan(0);
  expect(insight.currency).toBe('USD');
  expect(insight.displayUnit).toBe('FLUID_OUNCE');
});

test('calls the dearest price in the same history HIGH', async () => {
  const id = await seedItem();
  await logPrice(id, { price: 16.49, daysAgo: 40 });
  await logPrice(id, { price: 17.99, daysAgo: 30 });
  await logPrice(id, { price: 18.49, daysAgo: 20 });
  await logPrice(id, { price: 24.99, daysAgo: 1 });

  const insight = await insightFor(id);

  expect(insight.verdict).toBe('HIGH');
  expect(insight.savingsVsMedianPct ?? 0).toBeLessThan(0);
});

test('honours a target price stored on the item', async () => {
  // 0.12 per fluid ounce is $18 for the 150 oz pack.
  const id = await seedItem({ targetPrice: 0.12 });
  await logPrice(id, { price: 17.5, daysAgo: 1 });

  const insight = await insightFor(id);

  expect(insight.meetsTargetPrice).toBe(true);
  expect(insight.verdict).toBe('GREAT');
});

test('drops prices outside the requested window', async () => {
  const id = await seedItem();
  await logPrice(id, { price: 24.99, daysAgo: 200 });
  await logPrice(id, { price: 23.99, daysAgo: 100 });
  await logPrice(id, { price: 19.94, daysAgo: 2 });

  const year = await insightFor(id);
  const month = await insightFor(id, 30);

  expect(year.observationCount).toBe(3);
  expect(month.observationCount).toBe(1);
  expect(month.verdict).toBe('UNKNOWN');
  // The window narrows the statistics, not the record of what was last paid.
  expect(month.latest?.price).toBe(19.94);
});

test('reports an item with no history without erroring', async () => {
  const id = await seedItem();

  const insight = await insightFor(id);

  expect(insight.verdict).toBe('UNKNOWN');
  expect(insight.observationCount).toBe(0);
  expect(insight.latest).toBeNull();
  expect(insight.medianUnitPrice).toBeNull();
  expect(insight.formattedLatestUnitPrice).toBeNull();
});

test('gives every item on a page its own verdict in one request', async () => {
  const cheap = await seedItem();
  const dear = await seedItem();
  for (const daysAgo of [40, 30, 20]) await logPrice(cheap, { price: 24.99, daysAgo });
  await logPrice(cheap, { price: 12.99, daysAgo: 1 });
  for (const daysAgo of [40, 30, 20]) await logPrice(dear, { price: 12.99, daysAgo });
  await logPrice(dear, { price: 24.99, daysAgo: 1 });

  const listed = await run<{ pantryItems: { id: string; insight: Insight }[] }>(
    `{ pantryItems { id insight { verdict observationCount } } }`,
  );

  const byId = new Map(listed.data?.pantryItems.map((item) => [item.id, item.insight]));
  expect(byId.get(cheap)?.verdict).toBe('GREAT');
  expect(byId.get(dear)?.verdict).toBe('HIGH');
  expect(byId.get(cheap)?.observationCount).toBe(4);
});

test('counts items worth buying now in the dashboard stats', async () => {
  const cheap = await seedItem();
  const ordinary = await seedItem();
  for (const daysAgo of [40, 30, 20]) await logPrice(cheap, { price: 24.99, daysAgo });
  await logPrice(cheap, { price: 12.99, daysAgo: 1 });
  for (const daysAgo of [40, 30, 20, 1]) await logPrice(ordinary, { price: 19.99, daysAgo });

  const stats = await run<{ stats: { pantryItems: number; itemsWorthBuyingNow: number } }>(
    '{ stats { pantryItems itemsWorthBuyingNow } }',
  );

  expect(stats.data?.stats.pantryItems).toBe(2);
  // Only the one whose latest price is actually a buy signal.
  expect(stats.data?.stats.itemsWorthBuyingNow).toBe(1);
});
