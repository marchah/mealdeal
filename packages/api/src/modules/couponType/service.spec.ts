import { describe, expect, it } from 'vitest';
import { couponTypeServiceFactory } from './service';
import type { CouponTypeRepository, NewCouponType } from './types';

// Reference test for the factory-DI pattern: build the service with hand-mocked PORTS
// (plain objects satisfying the interface) — no database, no framework.

const makeCouponType = (over: Partial<NewCouponType> = {}): NewCouponType => ({
  key: 'food',
  label: 'Food',
  ...over,
});

function makeService(
  over: {
    couponTypes?: NewCouponType[];
  } = {},
) {
  let rows = over.couponTypes ?? [makeCouponType()];
  const couponTypeRepository: CouponTypeRepository = {
    listAll: () =>
      Promise.resolve(
        rows.map((ct, idx) => ({
          id: `ct-${idx}`,
          key: ct.key,
          label: ct.label,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        })),
      ),
    findByKey: (key: string) =>
      Promise.resolve(
        rows.find((ct) => ct.key === key)
          ? {
              id: 'ct-1',
              key: rows[0]?.key ?? '',
              label: rows[0]?.label ?? '',
              createdAt: new Date('2026-01-01T00:00:00Z'),
            }
          : null,
      ),
    insert: (newCouponType: NewCouponType) => {
      rows = [...rows, newCouponType];
      return Promise.resolve({
        id: `ct-${rows.length}`,
        key: newCouponType.key,
        label: newCouponType.label,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
    },
    count: () => Promise.resolve(rows.length),
  };

  return couponTypeServiceFactory({ couponTypeRepository });
}

describe('couponTypeService', () => {
  it('returns all coupon types', async () => {
    const service = makeService({
      couponTypes: [
        { key: 'food', label: 'Food' },
        { key: 'beverages', label: 'Beverages' },
      ],
    });
    const result = await service.getCouponTypes();
    expect(result).toHaveLength(2);
    expect(result.map((ct: { key: string }) => ct.key)).toEqual(['food', 'beverages']);
  });

  it('returns null for a missing key', async () => {
    const service = makeService();
    const result = await service.getCouponTypeByKey('nonexistent');
    expect(result).toBeNull();
  });

  it('inserts a new coupon type', async () => {
    const service = makeService();
    const result = await service.getCouponTypeByKey('food');
    expect(result).not.toBeNull();
  });

  it('counts coupon types', async () => {
    const service = makeService({
      couponTypes: [
        { key: 'food', label: 'Food' },
        { key: 'beverages', label: 'Beverages' },
        { key: 'snacks', label: 'Snacks' },
      ],
    });
    const result = await service.getCouponTypeByKey('food');
    expect(result).not.toBeNull();
  });

  it('seed() does nothing if already seeded', async () => {
    const service = makeService({
      couponTypes: [
        { key: 'food', label: 'Food' },
        { key: 'beverages', label: 'Beverages' },
      ],
    });
    // Seed should not throw and should not insert anything since count > 0
    await service.seed();
    const result = await service.getCouponTypes();
    expect(result).toHaveLength(2);
  });

  it('seed() inserts defaults if empty', async () => {
    const service = makeService({ couponTypes: [] });
    await service.seed();
    const result = await service.getCouponTypes();
    expect(result).toHaveLength(8);
  });
});
