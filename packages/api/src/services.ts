import { createDb } from './db/client';
import { getEntitiesServices, type EntitiesServices } from './entities';
import { getFeaturesServices, type FeaturesServices } from './features';
import { getThirdPartyServices } from './third-party';

// The application's service surface, composed from the independent modules. Resolvers and the
// worker reach it via context (`ctx.services.<name>`).
export type Services = EntitiesServices & FeaturesServices;

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
    zippopotamAdapter,
  });
  cached = { ...entities, ...features };
  return cached;
}
