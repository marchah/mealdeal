import DataLoader from 'dataloader';
import type { Merchant } from './entities/merchant/types';
import { getServices, type Services } from './services';

// Per-request batching. Loaders are rebuilt for each request so their cache never leaks
// across requests; repositories expose `findByIds` batch methods for them to call.
export interface Loaders {
  merchantById: DataLoader<string, Merchant | null>;
}

// The GraphQL context threaded into every resolver. Resolvers reach data ONLY through
// `ctx.services` (never the db) and batch relations through `ctx.loaders`.
export interface YogaContext {
  services: Services;
  loaders: Loaders;
}

export function createContext(): YogaContext {
  const services = getServices();
  return {
    services,
    loaders: {
      merchantById: new DataLoader<string, Merchant | null>(async (ids) => {
        const found = await services.merchantService.findByIds(ids);
        const byId = new Map(found.map((m) => [m.id, m]));
        return ids.map((id) => byId.get(id) ?? null);
      }),
    },
  };
}
