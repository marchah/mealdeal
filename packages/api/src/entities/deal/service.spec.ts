import { describe, expect, it } from 'vitest';
import type { CouponType, CouponTypeService } from '../couponType/types';
import type { TrackingPrefService } from '../trackingPref/types';
import { dealServiceFactory } from './service';
import type { Deal, DealRepository } from './types';

// Reference test for the factory-DI pattern. The repository is injected whole; each collaborator is a
// PARTIAL mock — only the functions this suite exercises — with `@ts-expect-error partial mock` above
// it to accept the intentionally-incomplete object. If the code reaches an un-mocked function the test
// fails (it is `undefined`), which is exactly the signal we want.

const makeDeal = (over: Partial<Deal> = {}): Deal => ({
  id: 'd1',
  merchantId: 'm1',
  couponTypeId: null,
  title: 'Cheese 2-for-1',
  category: 'dairy',
  item: 'cheese',
  discountText: '2-for-1',
  discountPct: 50,
  price: null,
  currency: null,
  code: null,
  minSpend: null,
  url: null,
  sourceAlias: null,
  startsAt: null,
  expiresAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

function makeService(
  over: {
    deals?: Deal[];
    muted?: { items: Set<string>; categories: Set<string> };
    couponTypes?: CouponType[];
  } = {},
) {
  const rows = over.deals ?? [makeDeal()];
  // @ts-expect-error partial mock: only the repository functions used are provided
  const dealRepository: DealRepository = {
    findDealById: (id) => Promise.resolve(rows.find((d) => d.id === id) ?? null),
    listDeals: () => Promise.resolve(rows),
    countDeals: () => Promise.resolve(rows.length),
  };
  // @ts-expect-error partial mock: only mutedValues is used
  const trackingPrefService: TrackingPrefService = {
    mutedValues: () =>
      Promise.resolve(over.muted ?? { items: new Set<string>(), categories: new Set<string>() }),
  };
  // @ts-expect-error partial mock: only findCouponTypeById is used
  const couponTypeService: CouponTypeService = {
    findCouponTypeById: (id: string) =>
      Promise.resolve(over.couponTypes?.find((couponType) => couponType.id === id) ?? null),
  };

  return dealServiceFactory({ dealRepository, trackingPrefService, couponTypeService });
}

describe('dealService', () => {
  it('countDeals returns the total number of deals', async () => {
    const service = makeService({ deals: [makeDeal({ id: 'a' }), makeDeal({ id: 'b' })] });
    await expect(service.countDeals()).resolves.toBe(2);
  });

  it('filters muted categories out of the active list', async () => {
    const service = makeService({
      deals: [makeDeal({ id: 'a', category: 'dairy' }), makeDeal({ id: 'b', category: 'produce' })],
      muted: { items: new Set(), categories: new Set(['dairy']) },
    });
    const result = await service.listDeals({ activeOnly: true, category: null });
    expect(result.map((d) => d.id)).toEqual(['b']);
  });

  it('throws NotFoundError for a missing id', async () => {
    const service = makeService({ deals: [] });
    await expect(service.getDealById('nope')).rejects.toThrow('No deal with id nope');
  });

  it('loads coupon types through the injected service and tolerates missing classifications', async () => {
    const couponType: CouponType = {
      id: 'ct-food',
      key: 'food',
      label: 'Food',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    const service = makeService({ couponTypes: [couponType] });

    await expect(
      service.getDealCouponType(makeDeal({ couponTypeId: couponType.id })),
    ).resolves.toEqual(couponType);
    await expect(
      service.getDealCouponType(makeDeal({ couponTypeId: 'missing' })),
    ).resolves.toBeNull();
    await expect(service.getDealCouponType(makeDeal({ couponTypeId: null }))).resolves.toBeNull();
  });
});
