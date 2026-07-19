import { createDb } from './db/client';
import { dealRepositoryFactory } from './modules/deal/repository';
import { dealServiceFactory } from './modules/deal/service';
import type { DealService } from './modules/deal/types';
import { ingestRunRepositoryFactory } from './modules/ingestRun/repository';
import { ingestRunServiceFactory } from './modules/ingestRun/service';
import type { IngestRunService } from './modules/ingestRun/types';
import { merchantRepositoryFactory } from './modules/merchant/repository';
import { merchantServiceFactory } from './modules/merchant/service';
import type { MerchantService } from './modules/merchant/types';
import { couponTypeRepositoryFactory } from './modules/couponType/repository';
import { couponTypeServiceFactory } from './modules/couponType/service';
import type { CouponTypeService } from './modules/couponType/types';
import { settings } from './common/settings';
import { userLocationResolverFactory } from './location/userLocationResolver';
import type { UserLocationResolver } from './location/types';
import { zippopotamZipCoordinateLookupFactory } from './location/zippopotam';
import { trackingPrefRepositoryFactory } from './modules/trackingPref/repository';
import { trackingPrefServiceFactory } from './modules/trackingPref/service';
import type { TrackingPrefService } from './modules/trackingPref/types';

// The application's service surface. Resolvers and the worker use this shape via context.
export interface Services {
  dealService: DealService;
  merchantService: MerchantService;
  ingestRunService: IngestRunService;
  trackingPrefService: TrackingPrefService;
  couponTypeService: CouponTypeService;
  userLocationResolver: UserLocationResolver;
}

let cached: Services | undefined;

/**
 * The composition root — the ONLY place the dependency graph is wired.
 * Memoized so the GraphQL context and the ingest worker share one service graph + db
 * handle. To add a module: build its repository + service here and expose it on `Services`.
 */
export function getServices(): Services {
  if (cached) return cached;
  const db = createDb();

  const merchantService = merchantServiceFactory({
    merchantRepository: merchantRepositoryFactory({ db }),
  });
  const ingestRunService = ingestRunServiceFactory({
    ingestRunRepository: ingestRunRepositoryFactory({ db }),
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
  const userLocationResolver = userLocationResolverFactory({
    zip: settings.USER_LOCATION,
    zipCoordinateLookup: zippopotamZipCoordinateLookupFactory(),
  });

  cached = {
    dealService,
    merchantService,
    ingestRunService,
    trackingPrefService,
    couponTypeService,
    userLocationResolver,
  };
  return cached;
}
