import DataLoader from 'dataloader';
import type { Maybe } from './common/types';
import type { CouponType } from './entities/couponType/types';
import type { Merchant } from './entities/merchant/types';
import type { PantryItem } from './entities/pantryItem/types';
import type { PriceEntry } from './entities/priceEntry/types';
import { getServices, type Services } from './services';

// Per-request batching. Loaders are rebuilt for each request so their cache never leaks
// across requests; repositories expose `findByIds` batch methods for them to call.
export interface Loaders {
  merchantById: DataLoader<string, Maybe<Merchant>>;
  couponTypeById: DataLoader<string, Maybe<CouponType>>;
  /** Every entry for an item, newest first — the field narrows it by `since`/`limit`. */
  priceEntriesByPantryItemId: DataLoader<string, PriceEntry[]>;
  /** A price entry reads its own item to know which unit to report itself in. */
  pantryItemById: DataLoader<string, Maybe<PantryItem>>;
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
      pantryItemById: new DataLoader<string, Maybe<PantryItem>>(async (ids) => {
        const found = await services.pantryItemService.findPantryItemsByIds(ids);
        const byId = new Map(found.map((item) => [item.id, item]));
        return ids.map((id) => byId.get(id) ?? null);
      }),
      priceEntriesByPantryItemId: new DataLoader<string, PriceEntry[]>(async (ids) => {
        const found = await services.priceEntryService.findPriceEntriesByPantryItemIds(ids);
        const byItemId = new Map<string, PriceEntry[]>(ids.map((id) => [id, []]));
        // The batch arrives already newest-first, so pushing preserves that per group.
        for (const entry of found) byItemId.get(entry.pantryItemId)?.push(entry);
        return ids.map((id) => byItemId.get(id) ?? []);
      }),
    },
  };
}
