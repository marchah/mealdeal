import type { AppConfigSettings } from '../common/settings';
import type { Maybe } from '../common/types';
import type { Db } from '../db/client';
import type { EntitiesServices } from '../entities';
import type { JsonChatCompletion } from '../ingest/extractor';
import { appConfigServiceFactory } from './appConfig/service';
import type { AppConfigService } from './appConfig/types';
import { dashboardServiceFactory } from './dashboard/service';
import type { DashboardService } from './dashboard/types';
import { ingestRunRepositoryFactory } from './ingestRun/repository';
import { ingestRunServiceFactory } from './ingestRun/service';
import type { IngestRunService } from './ingestRun/types';
import { nearMeServiceFactory } from './nearMe/service';
import type { NearMeService } from './nearMe/types';
import { priceInsightServiceFactory } from './priceInsight/service';
import type { PriceInsightService } from './priceInsight/types';
import { receiptImportServiceFactory } from './receiptImport/service';
import type { ReceiptImportService, ReceiptTextReader } from './receiptImport/types';
import { receiptParserServiceFactory } from './receiptParser/service';
import type { ReceiptParserService } from './receiptParser/types';
import { storeRepositoryFactory } from './store/repository';
import { storeServiceFactory } from './store/service';
import type { StoreService } from './store/types';

import './appConfig/graphql/type';
import './appConfig/graphql/query';
import './dashboard/graphql/type';
import './dashboard/graphql/query';
import './priceInsight/graphql/type';
import './receiptImport/graphql/mutation';
import './store/graphql/type';
import './store/graphql/query';

// The features module: higher-level services that compose entities (dashboard, near-me) plus the
// ingestRun/store feature data. Built from the db + the already-built entity services injected by
// the composition root — features depend on entities, never the reverse.
export interface FeaturesServices {
  appConfigService: AppConfigService;
  ingestRunService: IngestRunService;
  storeService: StoreService;
  dashboardService: DashboardService;
  nearMeService: NearMeService;
  priceInsightService: PriceInsightService;
  receiptParserService: ReceiptParserService;
  receiptImportService: ReceiptImportService;
}

export function getFeaturesServices({
  db,
  entities,
  config,
  jsonChatCompletion,
  receiptTextReader,
}: {
  db: Db;
  entities: EntitiesServices;
  config: AppConfigSettings;
  jsonChatCompletion: JsonChatCompletion;
  /** Null while OCR_BASE_URL is unset: receipt import is off. */
  receiptTextReader: Maybe<ReceiptTextReader>;
}): FeaturesServices {
  const ingestRunService = ingestRunServiceFactory({
    ingestRunRepository: ingestRunRepositoryFactory({ db }),
  });
  const appConfigService = appConfigServiceFactory({ config, ingestRunService });
  const storeService = storeServiceFactory({ storeRepository: storeRepositoryFactory({ db }) });
  const priceInsightService = priceInsightServiceFactory({
    pantryItemService: entities.pantryItemService,
    priceEntryService: entities.priceEntryService,
  });
  const dashboardService = dashboardServiceFactory({
    dealService: entities.dealService,
    merchantService: entities.merchantService,
    ingestRunService,
    pantryItemService: entities.pantryItemService,
    priceInsightService,
  });
  const nearMeService = nearMeServiceFactory({
    locationService: entities.locationService,
    storeService,
    dealService: entities.dealService,
    couponTypeService: entities.couponTypeService,
    newsletterService: entities.newsletterService,
  });
  const receiptParserService = receiptParserServiceFactory({ jsonChatCompletion });
  const receiptImportService = receiptImportServiceFactory({
    receiptTextReader,
    receiptService: entities.receiptService,
    merchantService: entities.merchantService,
    receiptParserService,
  });
  return {
    appConfigService,
    ingestRunService,
    storeService,
    dashboardService,
    nearMeService,
    priceInsightService,
    receiptParserService,
    receiptImportService,
  };
}
