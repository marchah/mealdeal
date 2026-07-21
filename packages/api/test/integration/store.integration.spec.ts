import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { createYoga } from 'graphql-yoga';
import { beforeEach, expect, test } from 'vitest';
import { createContext } from '../../src/context';
import { createDb } from '../../src/db/client';
import { deals, merchants, newsletters } from '../../src/db/schema';
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

async function seedStore(opts: { name: string; address?: string; lat?: number; lng?: number }) {
  const id = randomUUID();
  await createDb()
    .insert(merchants)
    .values({
      id,
      name: opts.name,
      address: opts.address ?? null,
      lat: opts.lat ?? null,
      lng: opts.lng ?? null,
    });
  return id;
}

beforeEach(async () => {
  const db = createDb();
  await db.delete(deals);
  await db.delete(newsletters);
  await db.delete(merchants);
});

test('the real libsql integration runtime provides SQLite trigonometric functions', async () => {
  const result = await createDb().get<{ acos_value: number; sin_value: number; cos_value: number }>(
    sql`select acos(1) as acos_value, sin(0) as sin_value, cos(0) as cos_value`,
  );

  expect(result).toEqual({ acos_value: 0, sin_value: 0, cos_value: 1 });
});

test('storesNearLocation returns only stores inside the radius with their deterministic distance', async () => {
  const insideId = await seedStore({
    name: 'Inside Market',
    address: '1 Main St',
    lat: 40,
    lng: -73,
  });
  await seedStore({ name: 'Outside Market', lat: 41, lng: -73 });

  const body = await runQuery(
    '{ storesNearLocation(lat: 40, lng: -73, radiusMiles: 1) { __typename ... on QueryStoresNearLocationSuccess { data { id name address lat lng distanceMiles } } } }',
  );

  expect(body).toMatchObject({
    data: {
      storesNearLocation: {
        __typename: 'QueryStoresNearLocationSuccess',
        data: [
          {
            id: insideId,
            name: 'Inside Market',
            address: '1 Main St',
            lat: 40,
            lng: -73,
            distanceMiles: 0,
          },
        ],
      },
    },
  });
});

test('storesNearLocation includes a store exactly on its inclusive zero-mile boundary', async () => {
  const id = await seedStore({ name: 'Exact Market', lat: 42.3601, lng: -71.0589 });

  const body = await runQuery(
    '{ storesNearLocation(lat: 42.3601, lng: -71.0589, radiusMiles: 0) { __typename ... on QueryStoresNearLocationSuccess { data { id distanceMiles } } } }',
  );

  expect(body).toMatchObject({
    data: {
      storesNearLocation: {
        __typename: 'QueryStoresNearLocationSuccess',
        data: [{ id, distanceMiles: 0 }],
      },
    },
  });
});

test('storesNearLocation excludes merchants without both coordinates', async () => {
  await seedStore({ name: 'No Coordinates Market' });
  const locatedId = await seedStore({ name: 'Located Market', lat: 40, lng: -73 });

  const body = await runQuery(
    '{ storesNearLocation(lat: 40, lng: -73, radiusMiles: 1) { __typename ... on QueryStoresNearLocationSuccess { data { id } } } }',
  );

  expect(body).toMatchObject({
    data: {
      storesNearLocation: {
        __typename: 'QueryStoresNearLocationSuccess',
        data: [{ id: locatedId }],
      },
    },
  });
});

test('storesNearLocation rejects coordinates and radius outside their supported bounds', async () => {
  const body = await runQuery(
    '{ storesNearLocation(lat: 91, lng: -181, radiusMiles: 501) { __typename ... on ValidationError { message status } } }',
  );

  expect(body).toMatchObject({
    data: {
      storesNearLocation: {
        __typename: 'ValidationError',
        status: 422,
      },
    },
  });
});
