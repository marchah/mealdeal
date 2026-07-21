import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { createYoga } from 'graphql-yoga';
import { beforeEach, expect, test } from 'vitest';
import type { Maybe } from '../../src/common/types';
import { createContext } from '../../src/context';
import { createDb } from '../../src/db/client';
import { couponTypes, deals, merchants, newsletters } from '../../src/db/schema';
import { schema } from '../../src/schema';

// INTEGRATION reference test. Exercises the `deals` query end-to-end through the real Yoga app
// (HTTP parse -> context -> resolver -> service -> repository -> libsql), including the `merchant`
// relation resolved via DataLoader. Template for future integration specs: reset in beforeEach for
// isolation, seed via the db with the reusable helper, then assert through a GraphQL request. We drive
// Yoga's `fetch` (not graphql-js directly) so there is a single graphql instance.

const yoga = createYoga({ schema, context: createContext });

interface GraphQLResponse {
  errors?: unknown;
  data?: {
    deals: Array<{
      id: string;
      title: string;
      category: Maybe<string>;
      couponTypeId: Maybe<string>;
      couponType: Maybe<{ id: string; key: string; label: string }>;
      merchant: {
        name: string;
        address: Maybe<string>;
        lat: Maybe<number>;
        lng: Maybe<number>;
      };
    }>;
  };
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
  category?: Maybe<string>;
  couponTypeId?: Maybe<string>;
  address?: Maybe<string>;
  lat?: Maybe<number>;
  lng?: Maybe<number>;
}): Promise<void> {
  const db = createDb();
  const merchantId = randomUUID();
  await db.insert(merchants).values({
    id: merchantId,
    name: opts.merchant,
    address: opts.address ?? null,
    lat: opts.lat ?? null,
    lng: opts.lng ?? null,
  });
  await db.insert(deals).values({
    id: randomUUID(),
    merchantId,
    title: opts.title,
    category: opts.category ?? 'grocery',
    couponTypeId: opts.couponTypeId ?? null,
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
  await db.delete(newsletters);
  await db.delete(merchants);
  await db.delete(couponTypes);
});

test('deals query returns the seeded active deal with its merchant', async () => {
  await seedDeal({ title: '50% off olive oil', merchant: 'Trader Vals' });

  const body = await runQuery('{ deals { id title merchant { name } } }');

  expect(body.errors).toBeUndefined();
  expect(body.data?.deals).toHaveLength(1);
  expect(body.data?.deals[0]?.title).toBe('50% off olive oil');
  expect(body.data?.deals[0]?.merchant.name).toBe('Trader Vals');
});

test('deals query exposes populated merchant location fields', async () => {
  await seedDeal({
    title: '30% off produce',
    merchant: 'Green Grocer',
    address: '123 Market Street',
    lat: 40.7128,
    lng: -74.006,
  });

  const body = await runQuery('{ deals { merchant { address lat lng } } }');

  expect(body.errors).toBeUndefined();
  expect(body.data?.deals[0]?.merchant).toMatchObject({
    address: '123 Market Street',
    lat: 40.7128,
    lng: -74.006,
  });
});

test('deals query exposes absent merchant location fields as null', async () => {
  await seedDeal({ title: '15% off staples', merchant: 'Corner Market' });

  const body = await runQuery('{ deals { merchant { address lat lng } } }');

  expect(body.errors).toBeUndefined();
  expect(body.data?.deals[0]?.merchant).toMatchObject({
    address: null,
    lat: null,
    lng: null,
  });
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

test('deals query exposes a classified deal without changing its free-text category', async () => {
  const couponTypeId = randomUUID();
  await createDb().insert(couponTypes).values({ id: couponTypeId, key: 'food', label: 'Food' });
  await seedDeal({
    title: '25% off pasta',
    merchant: 'Pasta Place',
    category: 'Italian grocery',
    couponTypeId,
  });

  const body = await runQuery(
    '{ deals { title category couponTypeId couponType { id key label } merchant { name } } }',
  );

  expect(body.errors).toBeUndefined();
  expect(body.data?.deals).toHaveLength(1);
  expect(body.data?.deals[0]).toMatchObject({
    title: '25% off pasta',
    category: 'Italian grocery',
    couponTypeId,
    couponType: { id: couponTypeId, key: 'food', label: 'Food' },
  });
});

test('deals query returns null for a stale coupon-type reference instead of failing the deal', async () => {
  const db = createDb();
  const merchantId = randomUUID();
  await db.insert(merchants).values({ id: merchantId, name: 'Legacy Mart' });
  // SQLite normally prevents this. It models an orphaned row from a legacy/imported database so
  // the nullable GraphQL relationship's missing-row policy is exercised end-to-end.
  await db.run(sql`PRAGMA foreign_keys = OFF`);
  await db.insert(deals).values({
    id: randomUUID(),
    merchantId,
    title: 'Legacy deal',
    category: 'grocery',
    couponTypeId: 'missing-coupon-type',
    dedupHash: randomUUID(),
  });
  await db.run(sql`PRAGMA foreign_keys = ON`);

  const body = await runQuery(
    '{ deals { title couponTypeId couponType { key } merchant { name } } }',
  );

  expect(body.errors).toBeUndefined();
  expect(body.data?.deals[0]).toMatchObject({
    title: 'Legacy deal',
    couponTypeId: 'missing-coupon-type',
    couponType: null,
  });
});

test('deals query preserves an unclassified deal as a null relationship', async () => {
  await seedDeal({
    title: 'Mystery markdown',
    merchant: 'General Store',
    category: 'weekly special',
    couponTypeId: null,
  });

  const body = await runQuery(
    '{ deals { title category couponTypeId couponType { key } merchant { name } } }',
  );

  expect(body.errors).toBeUndefined();
  expect(body.data?.deals[0]).toMatchObject({
    title: 'Mystery markdown',
    category: 'weekly special',
    couponTypeId: null,
    couponType: null,
  });
});
