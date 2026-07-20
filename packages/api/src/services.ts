import { settings } from './common/settings';
import { createDb } from './db/client';
import { getEntitiesServices, type EntitiesServices } from './entities';
import { getModulesServices, type ModulesServices } from './modules';
import { getThirdPartyServices } from './third-party';

// The application's service surface, composed from the independent packages. Resolvers and the
// worker reach it via context (`ctx.services.<name>`).
export type Services = EntitiesServices & ModulesServices;

let cached: Services | undefined;

/**
 * The composition root — the ONLY place the packages are wired together. Memoized so the GraphQL
 * context and the ingest worker share one service graph + db handle. Each package builds its own
 * services (`getXServices`); cross-package deps (a module service, a third-party port) are
 * injected here.
 */
export function getServices(): Services {
  if (cached) return cached;
  const db = createDb();
  const { zipCoordinateLookup } = getThirdPartyServices();
  const modules = getModulesServices({ db });
  const entities = getEntitiesServices({
    db,
    ingestRunService: modules.ingestRunService,
    zipCoordinateLookup,
    userLocationZip: settings.USER_LOCATION,
  });
  cached = { ...entities, ...modules };
  return cached;
}
