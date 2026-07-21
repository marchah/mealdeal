import { describe, expect, it } from 'vitest';
import type { Deal, DealService } from '../../entities/deal/types';
import type { MerchantService } from '../../entities/merchant/types';
import type { IngestRunService } from '../ingestRun/types';
import { dashboardServiceFactory } from './service';

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
  over: { active?: Deal[]; total?: number; merchants?: number; lastIngestAt?: Date | null } = {},
) {
  const active = over.active ?? [makeDeal({ id: 'a' }), makeDeal({ id: 'b' })];
  const dealService = {
    listDeals: () => Promise.resolve(active),
    count: () => Promise.resolve(over.total ?? active.length),
  } as unknown as DealService;
  const merchantService = {
    count: () => Promise.resolve(over.merchants ?? 3),
  } as unknown as MerchantService;
  const ingestRunService = {
    lastCompletedAt: () => Promise.resolve(over.lastIngestAt ?? null),
  } as unknown as IngestRunService;
  return dashboardServiceFactory({ dealService, merchantService, ingestRunService });
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
