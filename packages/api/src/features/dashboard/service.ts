import type { DealService } from '../../entities/deal/types';
import type { MerchantService } from '../../entities/merchant/types';
import type { IngestRunService } from '../ingestRun/types';
import type { DashboardService } from './types';

// Composes the app-overview read model from lower-level entities (deal, merchant) and the
// ingestRun feature. A feature may depend on entities; it uses their PORTS, never a repository.
export function dashboardServiceFactory({
  dealService,
  merchantService,
  ingestRunService,
}: {
  dealService: DealService;
  merchantService: MerchantService;
  ingestRunService: IngestRunService;
}): DashboardService {
  async function getStats() {
    // activeDeals reuses dealService.listDeals so it stays consistent with the rendered list
    // (both exclude muted items/categories).
    const [active, totalDeals, merchants, lastIngestAt] = await Promise.all([
      dealService.listDeals({ activeOnly: true, category: null }),
      dealService.count(),
      merchantService.count(),
      ingestRunService.lastCompletedAt(),
    ]);
    return { activeDeals: active.length, totalDeals, merchants, lastIngestAt };
  }

  return { getStats };
}
