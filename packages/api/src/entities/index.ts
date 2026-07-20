import type { Db } from '../db/client';
import type { IngestRunService } from '../features/ingestRun/types';

// Register each slice's GraphQL on the shared builder (side-effect imports; a type before the
// resolvers that reference it).
import './merchant/graphql/type';
import './deal/graphql/type';
import './deal/graphql/query';
import './couponType/graphql/type';
import './couponType/graphql/query';
import './trackingPref/graphql/type';
import './trackingPref/graphql/query';
import './trackingPref/graphql/mutation';

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
import type { MerchantService } from './merchant/types';
import { trackingPrefRepositoryFactory } from './trackingPref/repository';
import { trackingPrefServiceFactory } from './trackingPref/service';
import type { TrackingPrefService } from './trackingPref/types';

// The entities module: low-level data slices. Built with the db + any cross-module deps (a
// feature service, a third-party port) injected by the composition root.
export interface EntitiesServices {
  dealService: DealService;
  merchantService: MerchantService;
  trackingPrefService: TrackingPrefService;
  couponTypeService: CouponTypeService;
  locationService: LocationService;
}

export function getEntitiesServices({
  db,
  ingestRunService,
  zippopotamAdapter,
}: {
  db: Db;
  ingestRunService: IngestRunService;
  zippopotamAdapter: ZipCoordinateLookup;
}): EntitiesServices {
  const merchantService = merchantServiceFactory({
    merchantRepository: merchantRepositoryFactory({ db }),
  });
  const trackingPrefService = trackingPrefServiceFactory({
    trackingPrefRepository: trackingPrefRepositoryFactory({ db }),
  });
  const dealService = dealServiceFactory({
    dealRepository: dealRepositoryFactory({ db }),
    merchantService,
    ingestRunService,
    trackingPrefService,
  });
  const couponTypeService = couponTypeServiceFactory({
    couponTypeRepository: couponTypeRepositoryFactory({ db }),
  });
  const locationService = locationServiceFactory({ zippopotamAdapter });
  return { dealService, merchantService, trackingPrefService, couponTypeService, locationService };
}
