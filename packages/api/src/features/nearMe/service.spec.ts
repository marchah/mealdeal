import { describe, expect, it, vi } from 'vitest';
import type { CouponTypeService } from '../../entities/couponType/types';
import type { Deal, DealService } from '../../entities/deal/types';
import type { Newsletter, NewsletterService } from '../../entities/newsletter/types';
import type { Store } from '../store/types';
import { nearMeServiceFactory } from './service';

const makeDeal = (over: Partial<Deal> = {}): Deal => ({
  id: 'deal-1',
  merchantId: 'store-1',
  couponTypeId: null,
  title: 'Weekly deal',
  category: null,
  item: null,
  discountText: null,
  discountPct: null,
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

const makeStore = (over: Partial<Store> = {}): Store => ({
  id: 'store-1',
  name: 'Nearby Market',
  address: null,
  lat: 40,
  lng: -73,
  distanceMiles: 0,
  ...over,
});

const makeNewsletter = (over: Partial<Newsletter> = {}): Newsletter => ({
  id: 'newsletter-1',
  merchantId: 'store-1',
  name: 'Weekly Savings',
  signupUrl: 'https://example.test/weekly',
  recommended: true,
  ...over,
});

function makeService({
  stores = [makeStore()],
  deals = [],
  newsletters = [],
  couponTypes = [],
}: {
  stores?: Store[];
  deals?: Deal[];
  newsletters?: Newsletter[];
  couponTypes?: { id: string; key: string; label: string; createdAt: Date }[];
} = {}) {
  const getUserLocation = vi.fn().mockResolvedValue({ lat: 40, lng: -73 });
  const storesNearLocation = vi.fn().mockResolvedValue(stores);
  const listDeals = vi.fn().mockResolvedValue(deals);
  const listRecommendedByMerchantIds = vi.fn().mockResolvedValue(newsletters);
  const service = nearMeServiceFactory({
    locationService: { getUserLocation },
    storeService: { storesNearLocation },
    dealService: { listDeals } as unknown as DealService,
    couponTypeService: { getCouponTypes: () => Promise.resolve(couponTypes) } as CouponTypeService,
    newsletterService: { listRecommendedByMerchantIds } as unknown as NewsletterService,
  });
  return { service, getUserLocation, storesNearLocation, listDeals, listRecommendedByMerchantIds };
}

describe('nearMeService', () => {
  it('resolves the configured location before searching stores with the requested radius', async () => {
    const { service, getUserLocation, storesNearLocation } = makeService();

    await expect(service.storesNearMe({ radiusMiles: 12 })).resolves.toEqual([makeStore()]);
    expect(getUserLocation).toHaveBeenCalledOnce();
    expect(storesNearLocation).toHaveBeenCalledWith({ lat: 40, lng: -73, radiusMiles: 12 });
  });

  it('groups active nearby deals by canonical type and keeps null classifications unclassified', async () => {
    const food = { id: 'food', key: 'food', label: 'Food', createdAt: new Date('2026-01-01') };
    const snacks = {
      id: 'snacks',
      key: 'snacks',
      label: 'Snacks',
      createdAt: new Date('2026-01-01'),
    };
    const { service, listDeals } = makeService({
      deals: [
        makeDeal({ id: 'z', title: 'Zucchini', couponTypeId: 'food' }),
        makeDeal({ id: 'a', title: 'Apples', couponTypeId: 'food' }),
        makeDeal({ id: 'unclassified', title: 'Mystery markdown' }),
        makeDeal({ id: 'far', merchantId: 'store-elsewhere', couponTypeId: 'snacks' }),
      ],
      couponTypes: [snacks, food],
    });

    const groups = await service.dealsNearMe({ radiusMiles: 25 });

    expect(listDeals).toHaveBeenCalledWith({ activeOnly: true, category: null });
    expect(groups.map((group) => group.couponType?.key ?? 'unclassified')).toEqual([
      'food',
      'unclassified',
    ]);
    expect(groups[0]?.deals.map((deal) => deal.id)).toEqual(['a', 'z']);
  });

  it('asks the newsletter port only for merchants inside the selected radius', async () => {
    const { service, listRecommendedByMerchantIds } = makeService({
      stores: [makeStore({ id: 'near-a' }), makeStore({ id: 'near-b' })],
      newsletters: [makeNewsletter({ merchantId: 'near-a' })],
    });

    await expect(service.recommendedNewsletters({ radiusMiles: 5 })).resolves.toEqual([
      makeNewsletter({ merchantId: 'near-a' }),
    ]);
    expect(listRecommendedByMerchantIds).toHaveBeenCalledWith(['near-a', 'near-b']);
  });
});
