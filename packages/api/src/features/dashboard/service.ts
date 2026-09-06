import type { DealService } from '../../entities/deal/types';
import type { MerchantService } from '../../entities/merchant/types';
import type { PantryItemService } from '../../entities/pantryItem/types';
import type { IngestRunService } from '../ingestRun/types';
import { DEFAULT_WINDOW_DAYS, PriceVerdict, type PriceInsightService } from '../priceInsight/types';
import type { DashboardService } from './types';

// Composes the app-overview read model from lower-level entities (deal, merchant) and the
// ingestRun feature. A feature may depend on entities; it uses their PORTS, never a repository.
export function dashboardServiceFactory({
  dealService: { listDeals, countDeals },
  merchantService: { countMerchants },
  ingestRunService: { lastIngestCompletedAt },
  pantryItemService: { countPantryItems },
  priceInsightService: { listPriceInsights },
}: {
  dealService: DealService;
  merchantService: MerchantService;
  ingestRunService: IngestRunService;
  pantryItemService: PantryItemService;
  priceInsightService: PriceInsightService;
}): DashboardService {
  async function getStats() {
    // activeDeals reuses dealService.listDeals so it stays consistent with the rendered list
    // (both exclude muted items/categories).
    const [active, totalDeals, merchants, lastIngestAt, pantryItems, insights] = await Promise.all([
      listDeals({ activeOnly: true, category: null }),
      countDeals(),
      countMerchants(),
      lastIngestCompletedAt(),
      countPantryItems(),
      listPriceInsights({ windowDays: DEFAULT_WINDOW_DAYS }),
    ]);
    return {
      activeDeals: active.length,
      totalDeals,
      merchants,
      lastIngestAt,
      pantryItems,
      // GREAT only: "worth buying now" has to mean something, or the number is decoration.
      itemsWorthBuyingNow: insights.filter((insight) => insight.verdict === PriceVerdict.GREAT)
        .length,
    };
  }

  return { getStats };
}
