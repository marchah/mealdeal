import type { Db } from '../db/client';
import { ingestRunRepositoryFactory } from './ingestRun/repository';
import { ingestRunServiceFactory } from './ingestRun/service';
import type { IngestRunService } from './ingestRun/types';

// The modules "package": services with more complex business logic (currently ingestRun). Each
// is built from its repository (+ any injected deps) and exposed on ModulesServices.
export interface ModulesServices {
  ingestRunService: IngestRunService;
}

export function getModulesServices({ db }: { db: Db }): ModulesServices {
  return {
    ingestRunService: ingestRunServiceFactory({
      ingestRunRepository: ingestRunRepositoryFactory({ db }),
    }),
  };
}
