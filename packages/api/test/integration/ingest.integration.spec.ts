import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createYoga } from 'graphql-yoga';
import { beforeEach, expect, test, vi } from 'vitest';
import { settings } from '../../src/common/settings';
import { createContext } from '../../src/context';
import { createDb } from '../../src/db/client';
import { deals, merchants, newsletters } from '../../src/db/schema';
import type { EmailSource } from '../../src/ingest/email';
import type { DealExtractor } from '../../src/ingest/extractor';
import { folderEmailSourceFactory } from '../../src/ingest/folder';
import { ingestOnce } from '../../src/ingest/run';
import { schema } from '../../src/schema';
import { getServices } from '../../src/services';

const fixtureDirectory = new URL('../fixtures/ingest/', import.meta.url);
const yoga = createYoga({ schema, context: createContext });

function urlString(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

beforeEach(async () => {
  const db = createDb();
  await db.delete(deals);
  await db.delete(newsletters);
  await db.delete(merchants);
  await getServices().couponTypeService.seedCouponTypes();
});

async function runQuery(query: string): Promise<{
  errors?: unknown;
  data?: {
    deals: Array<{
      title: string;
      couponTypeId: string | null;
      couponType: { key: string } | null;
    }>;
  };
}> {
  const response = await yoga.fetch('http://localhost/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return (await response.json()) as {
    errors?: unknown;
    data?: {
      deals: Array<{
        title: string;
        couponTypeId: string | null;
        couponType: { key: string } | null;
      }>;
    };
  };
}

test('folder-backed ingest uses the real database composition and remains idempotent on replay', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mealdeal-ingest-fixture-'));
  try {
    await cp(fixtureDirectory, directory, { recursive: true });
    const source = folderEmailSourceFactory({ directory });
    const extractor: DealExtractor = {
      extract: () =>
        Promise.resolve([{ merchant: 'Fixture Market', title: 'Sweet corn special', price: 2 }]),
    };

    const first = await ingestOnce({ emailSource: source, extractor, services: getServices() });
    await cp(join(directory, 'processed', 'market-week.md'), join(directory, 'market-week.md'));
    const replay = await ingestOnce({ emailSource: source, extractor, services: getServices() });

    expect(first).toMatchObject({ messagesSeen: 1, dealsAdded: 1, messagesFailed: 0 });
    expect(replay).toMatchObject({ messagesSeen: 1, dealsAdded: 0, messagesFailed: 0 });
    expect(await createDb().select().from(deals)).toHaveLength(1);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('ingest persists a seeded coupon type that resolves through the Deal GraphQL relationship', async () => {
  const source: EmailSource = {
    fetchUnseen: () =>
      Promise.resolve([
        {
          uid: 1,
          from: 'market@example.com',
          subject: 'Grocery deals',
          date: new Date('2026-01-01T00:00:00Z'),
          text: 'Pasta on sale',
          html: null,
        },
      ]),
    markSeen: () => Promise.resolve(),
  };
  const extractor: DealExtractor = {
    extract: () =>
      Promise.resolve([
        { merchant: 'Fixture Market', title: 'Pasta special', couponTypeKey: 'food' },
      ]),
  };

  const result = await ingestOnce({ emailSource: source, extractor, services: getServices() });
  const food = await getServices().couponTypeService.getCouponTypeByKey('food');
  const body = await runQuery('{ deals { title couponTypeId couponType { key } } }');

  expect(result).toMatchObject({ messagesSeen: 1, dealsAdded: 1, messagesFailed: 0 });
  expect(food).not.toBeNull();
  expect(body.errors).toBeUndefined();
  expect(body.data?.deals).toEqual([
    { title: 'Pasta special', couponTypeId: food?.id, couponType: { key: 'food' } },
  ]);
});

test('ingest geocodes an extracted merchant address for the real near-me query', async () => {
  settings.USER_LOCATION = '02139';
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = urlString(input);
    if (url.includes('/search?')) {
      return Promise.resolve(
        new Response(JSON.stringify([{ lat: '40', lon: '-73' }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify({ places: [{ latitude: '40', longitude: '-73' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  const source: EmailSource = {
    fetchUnseen: () =>
      Promise.resolve([
        {
          uid: 1,
          from: 'market@example.com',
          subject: 'Grocery deals',
          date: new Date('2026-01-01T00:00:00Z'),
          text: 'Pasta on sale',
          html: null,
        },
      ]),
    markSeen: () => Promise.resolve(),
  };
  const extractor: DealExtractor = {
    extract: () =>
      Promise.resolve([
        {
          merchant: 'Fixture Market',
          merchantAddress: '12 Market Street, Exampleville',
          title: 'Pasta special',
          couponTypeKey: 'food',
        },
      ]),
  };

  try {
    await ingestOnce({ emailSource: source, extractor, services: getServices() });
    const [merchant] = await createDb().select().from(merchants);
    const body = await runQuery(
      '{ storesNearMe(radiusMiles: 0) { __typename ... on QueryStoresNearMeSuccess { data { name lat lng } } } }',
    );

    expect(merchant).toMatchObject({
      name: 'Fixture Market',
      address: '12 Market Street, Exampleville',
      lat: 40,
      lng: -73,
    });
    expect(body).toMatchObject({
      data: {
        storesNearMe: {
          __typename: 'QueryStoresNearMeSuccess',
          data: [{ name: 'Fixture Market', lat: 40, lng: -73 }],
        },
      },
    });
    const geocoderCall = (
      fetchMock.mock.calls as unknown as [RequestInfo | URL, RequestInit?][]
    ).find(([input]) => urlString(input).includes('/search?'));
    expect(geocoderCall).toEqual([
      expect.any(URL),
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': expect.any(String) }),
      }),
    ]);
  } finally {
    settings.USER_LOCATION = null;
    vi.unstubAllGlobals();
  }
});
