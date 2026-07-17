import { randomUUID } from 'node:crypto';
import { createYoga } from 'graphql-yoga';
import { beforeEach, expect, test } from 'vitest';
import { createContext } from '../../src/context';
import { createDb } from '../../src/db/client';
import { deals, merchants } from '../../src/db/schema';
import { schema } from '../../src/schema';

// INTEGRATION reference test. Exercises the `deals` query end-to-end through the real Yoga app
// (HTTP parse -> context -> resolver -> service -> repository -> libsql), including the `merchant`
// relation resolved via DataLoader. Template for future integration specs: reset in beforeEach for
// isolation, seed via the db with the reusable helper, then assert through a GraphQL request. We drive
// Yoga's `fetch` (not graphql-js directly) so there is a single graphql instance.

const yoga = createYoga({ schema, context: createContext });

interface GraphQLResponse {
  errors?: unknown;
  data?: { deals: Array<{ id: string; title: string; merchant: { name: string } }> };
}

async function runQuery(query: string): Promise<GraphQLResponse> {
  const response = await yoga.fetch('http://localhost/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return (await response.json()) as GraphQLResponse;
}

// Reusable seed helper — each test seeds exactly the rows it asserts on.
async function seedDeal(opts: {
  title: string;
  merchant: string;
  expiresAt?: Date;
}): Promise<void> {
  const db = createDb();
  const merchantId = randomUUID();
  await db.insert(merchants).values({ id: merchantId, name: opts.merchant });
  await db.insert(deals).values({
    id: randomUUID(),
    merchantId,
    title: opts.title,
    category: 'grocery',
    dedupHash: randomUUID(),
    expiresAt: opts.expiresAt ?? null,
  });
}

// Per-test isolation: the integration DB is shared across the whole suite, so clear the tables before
// each test. Without this, specs leak rows into one another and assertions become order-dependent as
// the suite grows. (deals first — it FKs merchants.)
beforeEach(async () => {
  const db = createDb();
  await db.delete(deals);
  await db.delete(merchants);
});

test('deals query returns the seeded active deal with its merchant', async () => {
  await seedDeal({ title: '50% off olive oil', merchant: 'Trader Vals' });

  const body = await runQuery('{ deals { id title merchant { name } } }');

  expect(body.errors).toBeUndefined();
  expect(body.data?.deals).toHaveLength(1);
  expect(body.data?.deals[0]?.title).toBe('50% off olive oil');
  expect(body.data?.deals[0]?.merchant.name).toBe('Trader Vals');
});

test('deals query excludes expired deals (and is isolated from the previous test)', async () => {
  // Expired yesterday → the default activeOnly view (expiresAt IS NULL OR > now) must filter it out.
  // The length-0 result also proves isolation: the active deal seeded above was cleared by beforeEach.
  await seedDeal({
    title: 'expired coupon',
    merchant: 'Yesterday Mart',
    expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
  });

  const body = await runQuery('{ deals { id title merchant { name } } }');

  expect(body.errors).toBeUndefined();
  expect(body.data?.deals).toHaveLength(0);
});
