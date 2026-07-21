import { randomUUID } from 'node:crypto';
import { createYoga } from 'graphql-yoga';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { settings } from '../../src/common/settings';
import { createContext } from '../../src/context';
import { createDb } from '../../src/db/client';
import { couponTypes, deals, merchants, newsletters } from '../../src/db/schema';
import { schema } from '../../src/schema';

const yoga = createYoga({ schema, context: createContext });

async function runQuery(query: string): Promise<Record<string, unknown>> {
  const response = await yoga.fetch('http://localhost/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return (await response.json()) as Record<string, unknown>;
}

async function seedMerchant(name: string, lat: number, lng: number): Promise<string> {
  const id = randomUUID();
  await createDb().insert(merchants).values({ id, name, lat, lng });
  return id;
}

beforeEach(async () => {
  settings.USER_LOCATION = null;
  const db = createDb();
  await db.delete(deals);
  await db.delete(newsletters);
  await db.delete(merchants);
  await db.delete(couponTypes);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test('near-me fields return a typed result when no user location is configured', async () => {
  const body = await runQuery(
    '{ storesNearMe { __typename ... on LocationNotConfiguredError { message status } } }',
  );

  expect(body).toMatchObject({
    data: {
      storesNearMe: {
        __typename: 'LocationNotConfiguredError',
        message: 'USER_LOCATION is not configured',
        status: 503,
      },
    },
  });
});

test('near-me fields return a typed result when the configured ZIP has no coordinates', async () => {
  settings.USER_LOCATION = '99999';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

  const body = await runQuery(
    '{ storesNearMe { __typename ... on LocationNotFoundError { message status } } }',
  );

  expect(body).toMatchObject({
    data: {
      storesNearMe: {
        __typename: 'LocationNotFoundError',
        message: 'No coordinates found for ZIP code 99999',
        status: 404,
      },
    },
  });
});

test('near-me fields validate radius boundaries before resolving the user location', async () => {
  const body = await runQuery(
    '{ storesNearMe(radiusMiles: 501) { __typename ... on ValidationError { status } } }',
  );

  expect(body).toMatchObject({
    data: { storesNearMe: { __typename: 'ValidationError', status: 422 } },
  });
});

test('near-me queries use the configured ZIP, inclusive radius, active deals, and stable groups', async () => {
  settings.USER_LOCATION = '02139';
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ places: [{ latitude: '40', longitude: '-73' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    ),
  );
  const nearbyMerchantId = await seedMerchant('Nearby Market', 40, -73);
  await seedMerchant('Far Market', 41, -73);
  const foodId = randomUUID();
  const snacksId = randomUUID();
  await createDb()
    .insert(couponTypes)
    .values([
      { id: snacksId, key: 'snacks', label: 'Snacks' },
      { id: foodId, key: 'food', label: 'Food' },
    ]);
  await createDb()
    .insert(deals)
    .values([
      {
        id: 'food-z',
        merchantId: nearbyMerchantId,
        title: 'Zucchini sale',
        couponTypeId: foodId,
        dedupHash: randomUUID(),
      },
      {
        id: 'food-a',
        merchantId: nearbyMerchantId,
        title: 'Apple sale',
        couponTypeId: foodId,
        dedupHash: randomUUID(),
      },
      {
        id: 'unclassified',
        merchantId: nearbyMerchantId,
        title: 'Mystery markdown',
        dedupHash: randomUUID(),
      },
      {
        id: 'expired',
        merchantId: nearbyMerchantId,
        title: 'Expired nearby deal',
        couponTypeId: snacksId,
        expiresAt: new Date('2026-01-01T00:00:00Z'),
        dedupHash: randomUUID(),
      },
    ]);

  const body = await runQuery(
    '{ storesNearMe(radiusMiles: 0) { __typename ... on QueryStoresNearMeSuccess { data { name distanceMiles } } } dealsNearMe { __typename ... on QueryDealsNearMeSuccess { data { couponType { key } deals { id } } } } }',
  );

  expect(body).toMatchObject({
    data: {
      storesNearMe: {
        __typename: 'QueryStoresNearMeSuccess',
        data: [{ name: 'Nearby Market', distanceMiles: 0 }],
      },
      dealsNearMe: {
        __typename: 'QueryDealsNearMeSuccess',
        data: [
          { couponType: { key: 'food' }, deals: [{ id: 'food-a' }, { id: 'food-z' }] },
          { couponType: null, deals: [{ id: 'unclassified' }] },
        ],
      },
    },
  });
});

test('recommendedNewsletters returns only nearby recommended newsletters in stable order', async () => {
  settings.USER_LOCATION = '02139';
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ places: [{ latitude: '40', longitude: '-73' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    ),
  );
  const nearbyMerchantId = await seedMerchant('Nearby Market', 40, -73);
  const farMerchantId = await seedMerchant('Far Market', 41, -73);
  await createDb()
    .insert(newsletters)
    .values([
      {
        id: 'z',
        merchantId: nearbyMerchantId,
        name: 'Zebra Savings',
        signupUrl: 'https://example.test/z',
        recommended: true,
      },
      {
        id: 'a',
        merchantId: nearbyMerchantId,
        name: 'Alpha Savings',
        signupUrl: 'https://example.test/a',
        recommended: true,
      },
      {
        id: 'not-recommended',
        merchantId: nearbyMerchantId,
        name: 'No Thanks',
        signupUrl: 'https://example.test/no',
        recommended: false,
      },
      {
        id: 'far',
        merchantId: farMerchantId,
        name: 'Far Savings',
        signupUrl: 'https://example.test/far',
        recommended: true,
      },
    ]);

  const body = await runQuery(
    '{ recommendedNewsletters { __typename ... on QueryRecommendedNewslettersSuccess { data { id } } } }',
  );

  expect(body).toMatchObject({
    data: {
      recommendedNewsletters: {
        __typename: 'QueryRecommendedNewslettersSuccess',
        data: [{ id: 'a' }, { id: 'z' }],
      },
    },
  });
});
