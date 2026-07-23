import { randomUUID } from 'node:crypto';
import { createYoga } from 'graphql-yoga';
import { beforeEach, expect, test } from 'vitest';
import { createContext } from '../../src/context';
import { createDb } from '../../src/db/client';
import { deals, merchants, newsletters } from '../../src/db/schema';
import { schema } from '../../src/schema';

const yoga = createYoga({ schema, context: createContext });

async function runOperation(query: string): Promise<Record<string, unknown>> {
  const response = await yoga.fetch('http://localhost/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return (await response.json()) as Record<string, unknown>;
}

async function seedMerchant(): Promise<string> {
  const id = randomUUID();
  await createDb().insert(merchants).values({ id, name: 'Newsletter Mart' });
  return id;
}

beforeEach(async () => {
  const db = createDb();
  // Other integration specs seed deals, which also reference merchants. Clear every dependent
  // table before merchants so this file remains isolated regardless of suite ordering.
  await db.delete(deals);
  await db.delete(newsletters);
  await db.delete(merchants);
});

test('migration creates newsletters and newsletter query resolves a stored newsletter', async () => {
  const merchantId = await seedMerchant();
  const id = randomUUID();
  await createDb().insert(newsletters).values({
    id,
    merchantId,
    name: 'Weekly Deals',
    signupUrl: 'https://example.test/weekly',
    recommended: true,
  });

  const body = await runOperation(
    `{ newsletter(id: "${id}") { __typename ... on QueryNewsletterSuccess { data { id merchantId name signupUrl recommended } } } }`,
  );

  expect(body).toMatchObject({
    data: {
      newsletter: {
        __typename: 'QueryNewsletterSuccess',
        data: {
          id,
          merchantId,
          name: 'Weekly Deals',
          signupUrl: 'https://example.test/weekly',
          recommended: true,
        },
      },
    },
  });
});

test('addNewsletter applies its explicit false default and removeNewsletter removes it', async () => {
  const merchantId = await seedMerchant();
  const added = await runOperation(
    `mutation { addNewsletter(merchantId: "${merchantId}", name: "Offers", signupUrl: "https://example.test/offers") { __typename ... on MutationAddNewsletterSuccess { data { id recommended } } } }`,
  );
  const newsletter = (
    added.data as { addNewsletter?: { data?: { id?: string; recommended?: boolean } } }
  ).addNewsletter?.data;
  expect(newsletter?.recommended).toBe(false);
  expect(newsletter?.id).toBeTruthy();

  const removed = await runOperation(
    `mutation { removeNewsletter(id: "${newsletter?.id}") { __typename ... on MutationRemoveNewsletterSuccess { data { id name } } } }`,
  );
  expect(removed).toMatchObject({
    data: {
      removeNewsletter: {
        __typename: 'MutationRemoveNewsletterSuccess',
        data: { id: newsletter?.id, name: 'Offers' },
      },
    },
  });
  expect(await createDb().select().from(newsletters)).toEqual([]);
});

test('addNewsletter reports a typed not-found error for a missing merchant', async () => {
  const body = await runOperation(
    'mutation { addNewsletter(merchantId: "missing", name: "Offers", signupUrl: "https://example.test/offers") { __typename ... on NotFoundError { message status } } }',
  );
  expect(body).toMatchObject({
    data: {
      addNewsletter: {
        __typename: 'NotFoundError',
        message: 'No merchant with id missing',
        status: 404,
      },
    },
  });
});

test('addNewsletter validates the signup URL before invoking the service', async () => {
  const merchantId = await seedMerchant();
  const body = await runOperation(
    `mutation { addNewsletter(merchantId: "${merchantId}", name: "Offers", signupUrl: "not-a-url") { __typename ... on ValidationError { message status } } }`,
  );
  expect(body).toMatchObject({
    data: { addNewsletter: { __typename: 'ValidationError', status: 422 } },
  });
  expect(await createDb().select().from(newsletters)).toEqual([]);
});

test('addNewsletter rejects a non-http(s) signup URL scheme (e.g. javascript:)', async () => {
  const merchantId = await seedMerchant();
  // `javascript:alert(1)` is a valid URL per z.string().url(), so only the scheme refinement blocks it.
  const body = await runOperation(
    `mutation { addNewsletter(merchantId: "${merchantId}", name: "Offers", signupUrl: "javascript:alert(1)") { __typename ... on ValidationError { message status } } }`,
  );
  expect(body).toMatchObject({
    data: { addNewsletter: { __typename: 'ValidationError', status: 422 } },
  });
  expect(await createDb().select().from(newsletters)).toEqual([]);
});

test('newsletter and removeNewsletter report typed not-found errors for a missing newsletter', async () => {
  const query = await runOperation(
    '{ newsletter(id: "missing") { __typename ... on NotFoundError { message status } } }',
  );
  const mutation = await runOperation(
    'mutation { removeNewsletter(id: "missing") { __typename ... on NotFoundError { message status } } }',
  );
  expect(query).toMatchObject({
    data: {
      newsletter: {
        __typename: 'NotFoundError',
        message: 'No newsletter with id missing',
        status: 404,
      },
    },
  });
  expect(mutation).toMatchObject({
    data: {
      removeNewsletter: {
        __typename: 'NotFoundError',
        message: 'No newsletter with id missing',
        status: 404,
      },
    },
  });
});
