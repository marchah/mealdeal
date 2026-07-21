import type { Db } from '../db/client';
import { ingestRunRepositoryFactory } from './ingestRun/repository';
import { ingestRunServiceFactory } from './ingestRun/service';
import type { IngestRunService } from './ingestRun/types';
import { storeRepositoryFactory } from './store/repository';
import { storeServiceFactory } from './store/service';
import type { StoreService } from './store/types';

import './store/graphql/type';
import './store/graphql/query';

// The features module: services with more complex business logic (currently ingestRun). Each
// is built from its repository (+ any injected deps) and exposed on FeaturesServices.
export interface FeaturesServices {
  ingestRunService: IngestRunService;
  storeService: StoreService;
}

export function getFeaturesServices({ db }: { db: Db }): FeaturesServices {
  return {
    ingestRunService: ingestRunServiceFactory({
      ingestRunRepository: ingestRunRepositoryFactory({ db }),
    }),
    storeService: storeServiceFactory({ storeRepository: storeRepositoryFactory({ db }) }),
  };
}
