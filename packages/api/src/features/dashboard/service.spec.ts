import { describe, expect, it } from 'vitest';
import type { Deal, DealService } from '../../entities/deal/types';
import type { MerchantService } from '../../entities/merchant/types';
import type { PantryItemService } from '../../entities/pantryItem/types';
import type { IngestRunService } from '../ingestRun/types';
import { PriceVerdict, type PriceInsight, type PriceInsightService } from '../priceInsight/types';
import { dashboardServiceFactory } from './service';
import type { Maybe } from '../../common/types';

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

// Only the verdict is read, so the rest of the insight is irrelevant to these assertions.
const makeInsight = (verdict: PriceVerdict): PriceInsight =>
  ({ verdict }) as unknown as PriceInsight;

function makeService(
  over: {
    active?: Deal[];
    total?: number;
    merchants?: number;
    lastIngestAt?: Maybe<Date>;
    pantryItems?: number;
    verdicts?: PriceVerdict[];
  } = {},
) {
  const active = over.active ?? [makeDeal({ id: 'a' }), makeDeal({ id: 'b' })];
  // @ts-expect-error partial mock: only listDeals and countDeals are used
  const dealService: DealService = {
    listDeals: () => Promise.resolve(active),
    countDeals: () => Promise.resolve(over.total ?? active.length),
  };
  // @ts-expect-error partial mock: only countMerchants is used
  const merchantService: MerchantService = {
    countMerchants: () => Promise.resolve(over.merchants ?? 3),
  };
  // @ts-expect-error partial mock: only lastIngestCompletedAt is used
  const ingestRunService: IngestRunService = {
    lastIngestCompletedAt: () => Promise.resolve(over.lastIngestAt ?? null),
  };
  // @ts-expect-error partial mock: only countPantryItems is used
  const pantryItemService: PantryItemService = {
    countPantryItems: () => Promise.resolve(over.pantryItems ?? 0),
  };
  // @ts-expect-error partial mock: only listPriceInsights is used
  const priceInsightService: PriceInsightService = {
    listPriceInsights: () => Promise.resolve((over.verdicts ?? []).map(makeInsight)),
  };

  return dashboardServiceFactory({
    dealService,
    merchantService,
    ingestRunService,
    pantryItemService,
    priceInsightService,
  });
}

describe('dashboardService', () => {
  it('aggregates the overview stats from deal, merchant and ingestRun', async () => {
    const lastIngestAt = new Date('2026-02-02T00:00:00Z');
    const service = makeService({
      active: [makeDeal({ id: 'a' }), makeDeal({ id: 'b' })],
      total: 5,
      merchants: 3,
      lastIngestAt,
    });
    await expect(service.getStats()).resolves.toEqual({
      totalDeals: 5,
      activeDeals: 2,
      merchants: 3,
      lastIngestAt,
      pantryItems: 0,
      itemsWorthBuyingNow: 0,
    });
  });

  it('activeDeals tracks the deal active-list length, distinct from the total count', async () => {
    const service = makeService({ active: [makeDeal({ id: 'a' })], total: 4 });
    const stats = await service.getStats();
    expect(stats.activeDeals).toBe(1);
    expect(stats.totalDeals).toBe(4);
    expect(stats.lastIngestAt).toBeNull();
  });
});

describe('dashboardService pantry counts', () => {
  it('counts only the items whose price is worth acting on', async () => {
    // GOOD, TYPICAL and UNKNOWN are not buy signals; counting them would make the number
    // decoration rather than a prompt.
    const service = makeService({
      pantryItems: 5,
      verdicts: [
        PriceVerdict.GREAT,
        PriceVerdict.GREAT,
        PriceVerdict.GOOD,
        PriceVerdict.TYPICAL,
        PriceVerdict.HIGH,
        PriceVerdict.UNKNOWN,
      ],
    });

    const stats = await service.getStats();
    expect(stats.pantryItems).toBe(5);
    expect(stats.itemsWorthBuyingNow).toBe(2);
  });

  it('reports zero for an empty pantry rather than omitting the counts', async () => {
    const stats = await makeService().getStats();
    expect(stats.pantryItems).toBe(0);
    expect(stats.itemsWorthBuyingNow).toBe(0);
  });
});
