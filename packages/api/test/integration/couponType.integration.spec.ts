import { randomUUID } from 'node:crypto';
import { createYoga } from 'graphql-yoga';
import { beforeEach, expect, test } from 'vitest';
import { createContext } from '../../src/context';
import { createDb } from '../../src/db/client';
import { couponTypes } from '../../src/db/schema';
import { DEFAULT_COUPON_TYPES } from '../../src/entities/couponType/service';
import { getServices } from '../../src/services';
import { schema } from '../../src/schema';

// INTEGRATION test for the CouponType module. Proves the three things the unit spec can't: the
// committed migration actually creates `coupon_types` (queries would throw "no such table" otherwise),
// seed() is idempotent + repairable against a REAL libsql db, and `getCouponTypes` resolves end-to-end
// through the Yoga app (HTTP parse -> context -> resolver -> service -> repository -> libsql). We drive
// yoga.fetch (not graphql-js) so there is a single graphql instance; beforeEach isolates each test.

const yoga = createYoga({ schema, context: createContext });

interface GetCouponTypesResponse {
  errors?: unknown;
  data?: { getCouponTypes: Array<{ id: string; key: string; label: string }> };
}

async function runQuery(query: string): Promise<GetCouponTypesResponse> {
  const response = await yoga.fetch('http://localhost/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return (await response.json()) as GetCouponTypesResponse;
}

const sortedDefaultKeys = [...DEFAULT_COUPON_TYPES].map((c) => c.key).sort();

// Per-test isolation: the integration db is shared across the suite, so clear the table first.
beforeEach(async () => {
  await createDb().delete(couponTypes);
});

test('migration created coupon_types: getCouponTypes returns [] before seeding', async () => {
  // If the migration were missing (Codex blocker), the query would error with "no such table".
  const body = await runQuery('{ getCouponTypes { id key label } }');
  expect(body.errors).toBeUndefined();
  expect(body.data?.getCouponTypes).toEqual([]);
});

test('seed populates the full default taxonomy, surfaced via getCouponTypes', async () => {
  await getServices().couponTypeService.seed();

  const body = await runQuery('{ getCouponTypes { id key label } }');
  expect(body.errors).toBeUndefined();
  expect(body.data?.getCouponTypes.map((c) => c.key).sort()).toEqual(sortedDefaultKeys);
  // Every row carries a real id + label from the db (not a placeholder).
  expect(body.data?.getCouponTypes.every((c) => c.id.length > 0 && c.label.length > 0)).toBe(true);
});

test('seed repairs a partial taxonomy and stays idempotent across re-runs', async () => {
  // Simulate an interrupted seed: only one default present in the real table.
  await createDb().insert(couponTypes).values({ id: randomUUID(), key: 'food', label: 'Food' });

  await getServices().couponTypeService.seed();
  await getServices().couponTypeService.seed(); // second pass must be a pure no-op (no conflict error)

  const body = await runQuery('{ getCouponTypes { key } }');
  expect(body.errors).toBeUndefined();
  const keys = body.data?.getCouponTypes.map((c) => c.key) ?? [];
  expect(keys.sort()).toEqual(sortedDefaultKeys); // missing rows filled...
  expect(new Set(keys).size).toBe(keys.length); // ...and 'food' not duplicated
});
