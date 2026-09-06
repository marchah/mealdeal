import DataLoader from 'dataloader';
import type { Maybe } from './common/types';
import type { CouponType } from './entities/couponType/types';
import type { Merchant } from './entities/merchant/types';
import { getServices, type Services } from './services';

// Per-request batching. Loaders are rebuilt for each request so their cache never leaks
// across requests; repositories expose `findByIds` batch methods for them to call.
export interface Loaders {
  merchantById: DataLoader<string, Maybe<Merchant>>;
  couponTypeById: DataLoader<string, Maybe<CouponType>>;
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
      merchantById: new DataLoader<string, Maybe<Merchant>>(async (ids) => {
        const found = await services.merchantService.findMerchantsByIds(ids);
        const byId = new Map(found.map((m) => [m.id, m]));
        return ids.map((id) => byId.get(id) ?? null);
      }),
      couponTypeById: new DataLoader<string, Maybe<CouponType>>(async (ids) => {
        const found = await services.couponTypeService.findCouponTypesByIds(ids);
        const byId = new Map(found.map((couponType) => [couponType.id, couponType]));
        return ids.map((id) => byId.get(id) ?? null);
      }),
    },
  };
}
