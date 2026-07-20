import { describe, expect, it } from 'vitest';
import type { IngestRunService } from '../../modules/ingestRun/types';
import type { MerchantService } from '../merchant/types';
import type { TrackingPrefService } from '../trackingPref/types';
import { dealServiceFactory } from './service';
import type { Deal, DealRepository } from './types';

// Reference test for the factory-DI pattern: build the service with hand-mocked PORTS
// (plain objects satisfying the interface) — no database, no framework.

const makeDeal = (over: Partial<Deal> = {}): Deal => ({
  id: 'd1',
  merchantId: 'm1',
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
  const merchantService = { count: () => Promise.resolve(3) } as unknown as MerchantService;
  const ingestRunService = {
    lastCompletedAt: () => Promise.resolve(null),
  } as unknown as IngestRunService;
  const trackingPrefService = {
    mutedValues: () =>
      Promise.resolve(over.muted ?? { items: new Set<string>(), categories: new Set<string>() }),
  } as unknown as TrackingPrefService;

  return dealServiceFactory({
    dealRepository,
    merchantService,
    ingestRunService,
    trackingPrefService,
  });
}

describe('dealService', () => {
  it('aggregates stats across repositories and collaborator services', async () => {
    const service = makeService({ deals: [makeDeal({ id: 'a' }), makeDeal({ id: 'b' })] });
    await expect(service.getStats()).resolves.toEqual({
      totalDeals: 2,
      activeDeals: 2,
      merchants: 3,
      lastIngestAt: null,
    });
  });

  it('filters muted categories out of the active list', async () => {
    const service = makeService({
      deals: [makeDeal({ id: 'a', category: 'dairy' }), makeDeal({ id: 'b', category: 'produce' })],
      muted: { items: new Set(), categories: new Set(['dairy']) },
    });
    const result = await service.listDeals({ activeOnly: true, category: null });
    expect(result.map((d) => d.id)).toEqual(['b']);
  });

  it('stats.activeDeals excludes muted deals and matches the rendered list', async () => {
    const service = makeService({
      deals: [makeDeal({ id: 'a', category: 'dairy' }), makeDeal({ id: 'b', category: 'produce' })],
      muted: { items: new Set(), categories: new Set(['dairy']) },
    });
    const stats = await service.getStats();
    const active = await service.listDeals({ activeOnly: true, category: null });
    expect(stats.totalDeals).toBe(2);
    expect(stats.activeDeals).toBe(1);
    expect(stats.activeDeals).toBe(active.length);
  });

  it('throws NotFoundError for a missing id', async () => {
    const service = makeService({ deals: [] });
    await expect(service.getById('nope')).rejects.toThrow('No deal with id nope');
  });
});
