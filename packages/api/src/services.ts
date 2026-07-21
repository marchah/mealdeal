import { createDb } from './db/client';
import { getEntitiesServices, type EntitiesServices } from './entities';
import { getFeaturesServices, getNearMeService, type FeaturesServices } from './features';
import type { NearMeService } from './features/nearMe/types';
import { getThirdPartyServices } from './third-party';

// The application's service surface, composed from the independent modules. Resolvers and the
// worker reach it via context (`ctx.services.<name>`).
export type Services = EntitiesServices & FeaturesServices & { nearMeService: NearMeService };

let cached: Services | undefined;

/**
 * The composition root — the ONLY place the modules are wired together. Memoized so the GraphQL
 * context and the ingest worker share one service graph + db handle. Each package builds its own
 * services (`getXServices`); cross-module deps (a feature service, a third-party port) are
 * injected here.
 */
export function getServices(): Services {
  if (cached) return cached;
  const db = createDb();
  const { zippopotamAdapter } = getThirdPartyServices();
  const features = getFeaturesServices({ db });
  const entities = getEntitiesServices({
    db,
    ingestRunService: features.ingestRunService,
    zipCoordinateLookup: zippopotamAdapter,
  });
  const nearMeService = getNearMeService({
    locationService: entities.locationService,
    storeService: features.storeService,
    dealService: entities.dealService,
    couponTypeService: entities.couponTypeService,
    newsletterService: entities.newsletterService,
  });
  cached = { ...entities, ...features, nearMeService };
  return cached;
}
