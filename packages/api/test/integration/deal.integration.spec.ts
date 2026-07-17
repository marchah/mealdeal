import { randomUUID } from 'node:crypto';
import { createYoga } from 'graphql-yoga';
import { beforeAll, expect, test } from 'vitest';
import { createContext } from '../../src/context';
import { createDb } from '../../src/db/client';
import { deals, merchants } from '../../src/db/schema';
import { schema } from '../../src/schema';

// INTEGRATION reference test. Exercises the `deals` query end-to-end through the real Yoga app
// (HTTP parse -> context -> resolver -> service -> repository -> libsql), including the `merchant`
// relation resolved via DataLoader. This is the template for future integration specs: seed via the
// db, then assert through a GraphQL request. We drive Yoga's `fetch` rather than graphql-js directly
// so there is a single graphql instance (schema, executor, and validation all share Yoga's copy).

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

const MERCHANT = 'Trader Vals';
const TITLE = '50% off olive oil';

beforeAll(async () => {
  const db = createDb();
  const merchantId = randomUUID();
  await db.insert(merchants).values({ id: merchantId, name: MERCHANT });
  await db.insert(deals).values({
    id: randomUUID(),
    merchantId,
    title: TITLE,
    category: 'grocery',
    dedupHash: randomUUID(), // no expiresAt => active, so the default activeOnly:true returns it
  });
});

test('deals query returns the seeded active deal with its merchant', async () => {
  const body = await runQuery('{ deals { id title merchant { name } } }');

  expect(body.errors).toBeUndefined();
  expect(body.data?.deals).toHaveLength(1);
  expect(body.data?.deals[0]?.title).toBe(TITLE);
  expect(body.data?.deals[0]?.merchant.name).toBe(MERCHANT);
});
