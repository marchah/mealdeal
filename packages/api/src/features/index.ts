import type { Db } from '../db/client';
import { ingestRunRepositoryFactory } from './ingestRun/repository';
import { ingestRunServiceFactory } from './ingestRun/service';
import type { IngestRunService } from './ingestRun/types';

// The features module: services with more complex business logic (currently ingestRun). Each
// is built from its repository (+ any injected deps) and exposed on FeaturesServices.
export interface FeaturesServices {
  ingestRunService: IngestRunService;
}

export function getFeaturesServices({ db }: { db: Db }): FeaturesServices {
  return {
    ingestRunService: ingestRunServiceFactory({
      ingestRunRepository: ingestRunRepositoryFactory({ db }),
    }),
  };
}
