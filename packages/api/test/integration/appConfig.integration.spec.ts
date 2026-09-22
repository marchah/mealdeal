import { randomUUID } from 'node:crypto';
import { createYoga } from 'graphql-yoga';
import { beforeEach, expect, test } from 'vitest';
import type { Maybe } from '../../src/common/types';
import { createContext } from '../../src/context';
import { createDb } from '../../src/db/client';
import { ingestRuns } from '../../src/db/schema';
import { schema } from '../../src/schema';

// INTEGRATION test for the appConfig feature. Proves what the unit spec cannot: the query resolves
// end-to-end through the real Yoga app (HTTP parse -> context -> composition root -> resolver ->
// service -> repository -> libsql), that the composition root really injects the parsed settings,
// and that lastIngestAt is read from the ingest_runs table rather than a mocked port. We drive
// yoga.fetch (not graphql-js) so there is a single graphql instance; beforeEach isolates each test.

const yoga = createYoga({ schema, context: createContext });

interface AppConfigResponse {
  errors?: unknown;
  data?: { appConfig: { couponIngestEnabled: boolean; lastIngestAt: Maybe<string> } };
}

async function runQuery(): Promise<AppConfigResponse> {
  const response = await yoga.fetch('http://localhost/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: '{ appConfig { couponIngestEnabled lastIngestAt } }' }),
  });
  return (await response.json()) as AppConfigResponse;
}

// A finished run; `startedAt` is deliberately later than `finishedAt` nowhere — only finished runs
// count, which the unfinished-run test below relies on.
async function seedIngestRun(finishedAt: Maybe<Date>): Promise<void> {
  await createDb()
    .insert(ingestRuns)
    .values({
      id: randomUUID(),
      startedAt: new Date('2026-08-12T09:00:00Z'),
      finishedAt,
      messagesSeen: 4,
      dealsAdded: 2,
      messagesFailed: 0,
    });
}

beforeEach(async () => {
  await createDb().delete(ingestRuns);
});

test('reports coupon ingestion as paused by default, with no import yet', async () => {
  const body = await runQuery();

  expect(body.errors).toBeUndefined();
  // The suite runs without COUPON_INGEST_ENABLED set, which is the shipped default.
  expect(body.data?.appConfig.couponIngestEnabled).toBe(false);
  expect(body.data?.appConfig.lastIngestAt).toBeNull();
});

test('surfaces the most recent completed run from the real ingest_runs table', async () => {
  await seedIngestRun(new Date('2026-07-01T00:00:00Z'));
  await seedIngestRun(new Date('2026-08-12T09:30:00Z'));

  const body = await runQuery();

  expect(body.errors).toBeUndefined();
  expect(body.data?.appConfig.lastIngestAt).toBe('2026-08-12T09:30:00.000Z');
});

test('ignores a run that started but never finished', async () => {
  // A pass that crashed mid-flight must not be reported to the SPA as a completed import.
  await seedIngestRun(null);

  const body = await runQuery();

  expect(body.errors).toBeUndefined();
  expect(body.data?.appConfig.lastIngestAt).toBeNull();
});
