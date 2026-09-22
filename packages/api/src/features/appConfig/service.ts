import type { AppConfigSettings } from '../../common/settings';
import type { IngestRunService } from '../ingestRun/types';
import type { AppConfigService } from './types';

// Settings arrive injected (never the module-level `settings` singleton), so both flag states are
// reachable from a unit test without mutating the environment.
export function appConfigServiceFactory({
  config,
  ingestRunService: { lastIngestCompletedAt },
}: {
  config: AppConfigSettings;
  ingestRunService: IngestRunService;
}): AppConfigService {
  // Reported whether or not ingestion is enabled: while it is paused, "last import was N weeks ago"
  // is exactly what tells the reader the pause is intentional rather than a stalled pipeline.
  async function getAppConfig() {
    return {
      couponIngestEnabled: config.COUPON_INGEST_ENABLED,
      lastIngestAt: await lastIngestCompletedAt(),
    };
  }

  return { getAppConfig };
}
