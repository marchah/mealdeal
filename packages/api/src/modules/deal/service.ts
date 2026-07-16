import { NotFoundError } from '../../common/errors';
import type { IngestRunService } from '../ingestRun/types';
import type { MerchantService } from '../merchant/types';
import type { TrackingPrefService } from '../trackingPref/types';
import type { DealRepository, DealService, Deal, ListDealsInput, Stats } from './types';

// Business logic. Depends on repository + collaborator service PORT types — never the db.
export function dealServiceFactory({
  dealRepository,
  merchantService,
  ingestRunService,
  trackingPrefService,
}: {
  dealRepository: DealRepository;
  merchantService: MerchantService;
  ingestRunService: IngestRunService;
  trackingPrefService: TrackingPrefService;
}): DealService {
  async function listDeals(input: ListDealsInput) {
    const rows = await dealRepository.listAll(input);
    if (!input.activeOnly) return rows;
    // Hide muted items/categories from the active list.
    const { items, categories } = await trackingPrefService.mutedValues();
    return rows.filter((deal) => {
      const item = deal.item?.toLowerCase();
      const category = deal.category?.toLowerCase();
      if (item && items.has(item)) return false;
      if (category && categories.has(category)) return false;
      return true;
    });
  }

  async function dealsByMerchant(merchantId: string): Promise<Deal[]> {
    return dealRepository.listByMerchant(merchantId);
  }

  return {
    listDeals,
    dealsByMerchant,
    async getById(id) {
      const deal = await dealRepository.findById(id);
      if (!deal) throw new NotFoundError(`No deal with id ${id}`);
      return deal;
    },
    async getStats(): Promise<Stats> {
      // activeDeals reuses listDeals so it stays consistent with the rendered list
      // (both exclude muted items/categories).
      const [active, totalDeals, merchants, lastIngestAt] = await Promise.all([
        listDeals({ activeOnly: true, category: null }),
        dealRepository.count(),
        merchantService.count(),
        ingestRunService.lastCompletedAt(),
      ]);
      return { activeDeals: active.length, totalDeals, merchants, lastIngestAt };
    },
    add: (deal) => dealRepository.insertIfNew(deal),
  };
}
