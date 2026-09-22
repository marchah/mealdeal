import { createYoga } from 'graphql-yoga';
import { expect, test } from 'vitest';
import { createContext } from '../../src/context';
import { schema } from '../../src/schema';

// INTEGRATION test for the URL importer. It deliberately exercises only the REFUSALS, because
// those are the paths that must hold against the real composition root — the real adapter, the
// real DNS lookup, no mocked fetcher. A successful read cannot be tested here without either a
// live network or a local server, and a local server is exactly what the guard exists to block;
// the reading itself is covered by third-party/productPage/service.spec.ts.

const yoga = createYoga({ schema, context: createContext });

interface DraftResponse {
  errors?: unknown;
  data?: {
    draftPantryItemFromUrl: { __typename: string; message?: string; data?: { found: boolean } };
  };
}

async function draft(url: string): Promise<DraftResponse> {
  const response = await yoga.fetch('http://localhost/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: `mutation Draft($url: String!) {
        draftPantryItemFromUrl(url: $url) {
          __typename
          ... on MutationDraftPantryItemFromUrlSuccess { data { found name } }
          ... on ValidationError { message status }
        }
      }`,
      variables: { url },
    }),
  });
  return (await response.json()) as DraftResponse;
}

test('refuses a link that is not http(s), at the argument boundary', async () => {
  for (const url of ['file:///etc/passwd', 'ftp://example.test/x']) {
    const body = await draft(url);
    expect(body.errors, url).toBeUndefined();
    expect(body.data?.draftPantryItemFromUrl.__typename, url).toBe('ValidationError');
  }
});

test('refuses a link pointing at this machine', async () => {
  // The server must not fetch its own loopback interface for whoever pasted the link.
  const body = await draft('http://127.0.0.1:4000/internal/ingest');

  expect(body.errors).toBeUndefined();
  expect(body.data?.draftPantryItemFromUrl.__typename).toBe('ValidationError');
  expect(body.data?.draftPantryItemFromUrl.message).toContain('private network');
});

test('refuses a link pointing at the cloud metadata endpoint', async () => {
  const body = await draft('http://169.254.169.254/latest/meta-data/');

  expect(body.data?.draftPantryItemFromUrl.__typename).toBe('ValidationError');
});

test('refuses a link pointing at a private network address', async () => {
  const body = await draft('http://192.168.1.1/admin');

  expect(body.data?.draftPantryItemFromUrl.__typename).toBe('ValidationError');
});

test('reports a hostname that does not resolve as a typed error, not a crash', async () => {
  const body = await draft('https://this-host-does-not-exist.invalid/product');

  expect(body.errors).toBeUndefined();
  expect(body.data?.draftPantryItemFromUrl.__typename).toBe('ValidationError');
});
