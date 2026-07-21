import { describe, expect, it } from 'vitest';
import type { CouponType, CouponTypeService } from '../couponType/types';
import type { TrackingPrefService } from '../trackingPref/types';
import { dealServiceFactory } from './service';
import type { Deal, DealRepository } from './types';

// Reference test for the factory-DI pattern: build the service with hand-mocked PORTS
// (plain objects satisfying the interface) — no database, no framework.

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
  const dealRepository: DealRepository = {
    listAll: () => Promise.resolve(rows),
    findByIds: () => Promise.resolve(rows),
    findById: (id) => Promise.resolve(rows.find((d) => d.id === id) ?? null),
    insertIfNew: () => Promise.resolve(true),
    count: () => Promise.resolve(rows.length),
  };
  const trackingPrefService = {
    mutedValues: () =>
      Promise.resolve(over.muted ?? { items: new Set<string>(), categories: new Set<string>() }),
  } as unknown as TrackingPrefService;
  const couponTypeService = {
    findById: (id: string) =>
      Promise.resolve(over.couponTypes?.find((couponType) => couponType.id === id) ?? null),
  } as unknown as CouponTypeService;

  return dealServiceFactory({
    dealRepository,
    trackingPrefService,
    couponTypeService,
  });
}

describe('dealService', () => {
  it('count returns the total number of deals', async () => {
    const service = makeService({ deals: [makeDeal({ id: 'a' }), makeDeal({ id: 'b' })] });
    await expect(service.count()).resolves.toBe(2);
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
    await expect(service.getById('nope')).rejects.toThrow('No deal with id nope');
  });

  it('loads coupon types through the injected service and tolerates missing classifications', async () => {
    const couponType: CouponType = {
      id: 'ct-food',
      key: 'food',
      label: 'Food',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    const service = makeService({ couponTypes: [couponType] });

    await expect(service.getCouponType(makeDeal({ couponTypeId: couponType.id }))).resolves.toEqual(
      couponType,
    );
    await expect(service.getCouponType(makeDeal({ couponTypeId: 'missing' }))).resolves.toBeNull();
    await expect(service.getCouponType(makeDeal({ couponTypeId: null }))).resolves.toBeNull();
  });
});
