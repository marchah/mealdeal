import type { Maybe } from '../../common/types';

/**
 * What the SPA must know about the running deployment to render honest state: which halves of the
 * app are live. A read model over settings + the ingest history, not a stored entity.
 */
export interface AppConfig {
  couponIngestEnabled: boolean;
  lastIngestAt: Maybe<Date>;
}

export interface AppConfigService {
  getAppConfig: () => Promise<AppConfig>;
}
