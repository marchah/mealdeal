import { describe, expect, it } from 'vitest';
import { couponTypeServiceFactory, DEFAULT_COUPON_TYPES } from './service';
import type { CouponType, CouponTypeRepository, NewCouponType } from './types';

// Reference test for the factory-DI pattern: build the service with a hand-mocked PORT — a plain
// in-memory object satisfying CouponTypeRepository (no database, no framework). The fake models the
// real `upsertCouponTypeByKey` contract (unique key, no-op on conflict) so seedCouponTypes()
// behaviour is exercised against a faithful stand-in rather than a lookup that always agrees with
// itself.

function makeService(seed: NewCouponType[] = []) {
  const rows = new Map<string, CouponType>();
  let seq = 0;
  const put = (ct: NewCouponType) => {
    seq += 1;
    rows.set(ct.key, {
      id: `ct-${String(seq)}`,
      key: ct.key,
      label: ct.label,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
  };
  for (const ct of seed) put(ct);

  // @ts-expect-error partial mock: only the functions used are provided
  const couponTypeRepository: CouponTypeRepository = {
    listCouponTypes: () => Promise.resolve([...rows.values()]),
    findCouponTypeByKey: (key) => Promise.resolve(rows.get(key) ?? null),
    // Atomic no-op on an existing key — the real ON CONFLICT DO NOTHING contract.
    upsertCouponTypeByKey: (ct) => {
      if (!rows.has(ct.key)) put(ct);
      return Promise.resolve();
    },
  };

  return { service: couponTypeServiceFactory({ couponTypeRepository }), rows };
}

describe('couponTypeService', () => {
  it('returns all stored coupon types', async () => {
    const { service } = makeService([
      { key: 'food', label: 'Food' },
      { key: 'beverages', label: 'Beverages' },
    ]);
    const result = await service.getCouponTypes();
    expect(result.map((ct) => ct.key)).toEqual(['food', 'beverages']);
    expect(result.map((ct) => ct.label)).toEqual(['Food', 'Beverages']);
  });

  it('returns the matching coupon type for a known key', async () => {
    const { service } = makeService([{ key: 'food', label: 'Food' }]);
    const result = await service.getCouponTypeByKey('food');
    expect(result).toMatchObject({ key: 'food', label: 'Food' });
  });

  it('returns null for a missing key', async () => {
    const { service } = makeService([{ key: 'food', label: 'Food' }]);
    expect(await service.getCouponTypeByKey('nonexistent')).toBeNull();
  });

  it('seedCouponTypes() inserts every default when the table is empty', async () => {
    const { service, rows } = makeService([]);
    await service.seedCouponTypes();
    expect(rows.size).toBe(DEFAULT_COUPON_TYPES.length);
    expect([...rows.keys()].sort()).toEqual(DEFAULT_COUPON_TYPES.map((c) => c.key).sort());
  });

  it('seedCouponTypes() is idempotent — a second pass inserts nothing new', async () => {
    const { service, rows } = makeService([]);
    await service.seedCouponTypes();
    const afterFirst = new Map(rows);
    await service.seedCouponTypes();
    expect(rows.size).toBe(afterFirst.size);
    // Ids are unchanged → no rows were re-inserted on the second pass.
    expect([...rows.values()].map((c) => c.id)).toEqual([...afterFirst.values()].map((c) => c.id));
  });

  it('seedCouponTypes() repairs a partial taxonomy left by an interrupted seed', async () => {
    // Only one default present (an earlier seed died mid-loop). count-then-skip would leave it
    // broken forever; upsert-by-key must fill the missing rows without duplicating 'food'.
    const { service, rows } = makeService([{ key: 'food', label: 'Food' }]);
    await service.seedCouponTypes();
    expect(rows.size).toBe(DEFAULT_COUPON_TYPES.length);
    expect([...rows.keys()].filter((k) => k === 'food')).toHaveLength(1);
  });
});
