import type { Maybe } from '../../common/types';

// The app-overview read model: a cross-entity aggregate (deal + merchant counts + the last
// ingest time), not a property of any single entity. A feature that composes lower layers.
export interface Stats {
  totalDeals: number;
  activeDeals: number;
  merchants: number;
  lastIngestAt: Maybe<Date>;
}

export interface DashboardService {
  getStats(): Promise<Stats>;
}
