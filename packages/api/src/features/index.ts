import type { Db } from '../db/client';
import type { EntitiesServices } from '../entities';
import { dashboardServiceFactory } from './dashboard/service';
import type { DashboardService } from './dashboard/types';
import { ingestRunRepositoryFactory } from './ingestRun/repository';
import { ingestRunServiceFactory } from './ingestRun/service';
import type { IngestRunService } from './ingestRun/types';
import { nearMeServiceFactory } from './nearMe/service';
import type { NearMeService } from './nearMe/types';
import { storeRepositoryFactory } from './store/repository';
import { storeServiceFactory } from './store/service';
import type { StoreService } from './store/types';

import './dashboard/graphql/type';
import './dashboard/graphql/query';
import './store/graphql/type';
import './store/graphql/query';

// The features module: higher-level services that compose entities (dashboard, near-me) plus the
// ingestRun/store feature data. Built from the db + the already-built entity services injected by
// the composition root — features depend on entities, never the reverse.
export interface FeaturesServices {
  ingestRunService: IngestRunService;
  storeService: StoreService;
  dashboardService: DashboardService;
  nearMeService: NearMeService;
}

export function getFeaturesServices({
  db,
  entities,
}: {
  db: Db;
  entities: EntitiesServices;
}): FeaturesServices {
  const ingestRunService = ingestRunServiceFactory({
    ingestRunRepository: ingestRunRepositoryFactory({ db }),
  });
  const storeService = storeServiceFactory({ storeRepository: storeRepositoryFactory({ db }) });
  const dashboardService = dashboardServiceFactory({
    dealService: entities.dealService,
    merchantService: entities.merchantService,
    ingestRunService,
  });
  const nearMeService = nearMeServiceFactory({
    locationService: entities.locationService,
    storeService,
    dealService: entities.dealService,
    couponTypeService: entities.couponTypeService,
    newsletterService: entities.newsletterService,
  });
  return { ingestRunService, storeService, dashboardService, nearMeService };
}
