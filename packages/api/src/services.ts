import { createDb } from './db/client';
import { dealRepositoryFactory } from './entities/deal/repository';
import { dealServiceFactory } from './entities/deal/service';
import type { DealService } from './entities/deal/types';
import { ingestRunRepositoryFactory } from './modules/ingestRun/repository';
import { ingestRunServiceFactory } from './modules/ingestRun/service';
import type { IngestRunService } from './modules/ingestRun/types';
import { merchantRepositoryFactory } from './entities/merchant/repository';
import { merchantServiceFactory } from './entities/merchant/service';
import type { MerchantService } from './entities/merchant/types';
import { couponTypeRepositoryFactory } from './entities/couponType/repository';
import { couponTypeServiceFactory } from './entities/couponType/service';
import type { CouponTypeService } from './entities/couponType/types';
import { settings } from './common/settings';
import { locationServiceFactory } from './entities/location/service';
import type { LocationService } from './entities/location/types';
import { zippopotamAdapterFactory } from './third-party/zippopotam/adapter';
import { trackingPrefRepositoryFactory } from './entities/trackingPref/repository';
import { trackingPrefServiceFactory } from './entities/trackingPref/service';
import type { TrackingPrefService } from './entities/trackingPref/types';

// The application's service surface. Resolvers and the worker use this shape via context.
export interface Services {
  dealService: DealService;
  merchantService: MerchantService;
  ingestRunService: IngestRunService;
  trackingPrefService: TrackingPrefService;
  couponTypeService: CouponTypeService;
  locationService: LocationService;
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
  const locationService = locationServiceFactory({
    zip: settings.USER_LOCATION,
    zipCoordinateLookup: zippopotamAdapterFactory(),
  });

  cached = {
    dealService,
    merchantService,
    ingestRunService,
    trackingPrefService,
    couponTypeService,
    locationService,
  };
  return cached;
}
