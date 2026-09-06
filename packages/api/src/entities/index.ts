import type { Db } from '../db/client';

// Register each slice's GraphQL on the shared builder (side-effect imports; a type before the
// resolvers that reference it).
import './merchant/graphql/type';
import './deal/graphql/type';
import './deal/graphql/query';
import './couponType/graphql/type';
import './couponType/graphql/query';
import './pantryItem/graphql/type';
import './pantryItem/graphql/query';
import './pantryItem/graphql/mutation';
import './priceEntry/graphql/type';
import './priceEntry/graphql/mutation';
import './trackingPref/graphql/type';
import './trackingPref/graphql/query';
import './trackingPref/graphql/mutation';
import './newsletter/graphql/type';
import './newsletter/graphql/query';
import './newsletter/graphql/mutation';

import { couponTypeRepositoryFactory } from './couponType/repository';
import { couponTypeServiceFactory } from './couponType/service';
import type { CouponTypeService } from './couponType/types';
import { dealRepositoryFactory } from './deal/repository';
import { dealServiceFactory } from './deal/service';
import type { DealService } from './deal/types';
import { locationServiceFactory } from './location/service';
import type { LocationService, ZipCoordinateLookup } from './location/types';
import { merchantRepositoryFactory } from './merchant/repository';
import { merchantServiceFactory } from './merchant/service';
import type { AddressCoordinateLookup, MerchantService } from './merchant/types';
import type { ProductLookup } from './pantryItem/types';
import { pantryItemRepositoryFactory } from './pantryItem/repository';
import { pantryItemServiceFactory } from './pantryItem/service';
import type { PantryItemService } from './pantryItem/types';
import { priceEntryRepositoryFactory } from './priceEntry/repository';
import { priceEntryServiceFactory } from './priceEntry/service';
import type { PriceEntryService } from './priceEntry/types';
import { newsletterRepositoryFactory } from './newsletter/repository';
import { newsletterServiceFactory } from './newsletter/service';
import type { NewsletterService } from './newsletter/types';
import { trackingPrefRepositoryFactory } from './trackingPref/repository';
import { trackingPrefServiceFactory } from './trackingPref/service';
import type { TrackingPrefService } from './trackingPref/types';

// The entities module: low-level data slices. Built with the db + any cross-module deps (a
// feature service, a third-party port) injected by the composition root.
export interface EntitiesServices {
  dealService: DealService;
  pantryItemService: PantryItemService;
  priceEntryService: PriceEntryService;
  merchantService: MerchantService;
  trackingPrefService: TrackingPrefService;
  couponTypeService: CouponTypeService;
  locationService: LocationService;
  newsletterService: NewsletterService;
}

export function getEntitiesServices({
  db,
  zipCoordinateLookup,
  addressCoordinateLookup,
  productLookup,
}: {
  db: Db;
  zipCoordinateLookup: ZipCoordinateLookup;
  addressCoordinateLookup: AddressCoordinateLookup;
  productLookup: ProductLookup;
}): EntitiesServices {
  const merchantService = merchantServiceFactory({
    merchantRepository: merchantRepositoryFactory({ db }),
    addressCoordinateLookup,
  });
  const trackingPrefService = trackingPrefServiceFactory({
    trackingPrefRepository: trackingPrefRepositoryFactory({ db }),
  });
  const couponTypeService = couponTypeServiceFactory({
    couponTypeRepository: couponTypeRepositoryFactory({ db }),
  });
  const dealService = dealServiceFactory({
    dealRepository: dealRepositoryFactory({ db }),
    trackingPrefService,
    couponTypeService,
  });
  const pantryItemService = pantryItemServiceFactory({
    pantryItemRepository: pantryItemRepositoryFactory({ db }),
    productLookup,
    couponTypeService,
  });
  const priceEntryService = priceEntryServiceFactory({
    priceEntryRepository: priceEntryRepositoryFactory({ db }),
    pantryItemService,
    merchantService,
  });
  const locationService = locationServiceFactory({ zipCoordinateLookup });
  const newsletterService = newsletterServiceFactory({
    newsletterRepository: newsletterRepositoryFactory({ db }),
    merchantService,
  });
  return {
    dealService,
    pantryItemService,
    priceEntryService,
    merchantService,
    trackingPrefService,
    couponTypeService,
    locationService,
    newsletterService,
  };
}
