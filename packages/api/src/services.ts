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
 * context and the ingest worker share one service graph + db handle. Modules are built low → high
 * (third-party → entities → features); each higher module is injected with the lower ones it
 * composes (features receive the entity services; entities receive third-party ports).
 */
export function getServices(): Services {
  if (cached) return cached;
  const db = createDb();
  const { zippopotamAdapter } = getThirdPartyServices();
  const entities = getEntitiesServices({ db, zipCoordinateLookup: zippopotamAdapter });
  const features = getFeaturesServices({ db, entities });
  cached = { ...entities, ...features };
  return cached;
}
