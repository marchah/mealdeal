import type { Maybe } from '../../common/types';
import type { CouponType, CouponTypeService } from '../../entities/couponType/types';
import type { Deal, DealService } from '../../entities/deal/types';
import type { LocationService } from '../../entities/location/types';
import type { Newsletter, NewsletterService } from '../../entities/newsletter/types';
import type { Store, StoreService } from '../store/types';

export interface NearMeInput {
  radiusMiles: number;
}

export interface NearbyDealGroup {
  couponType: Maybe<CouponType>;
  deals: Deal[];
}

export interface NearMeService {
  storesNearMe(input: NearMeInput): Promise<Store[]>;
  dealsNearMe(input: NearMeInput): Promise<NearbyDealGroup[]>;
  recommendedNewsletters(input: NearMeInput): Promise<Newsletter[]>;
}

export interface NearMeDependencies {
  locationService: LocationService;
  storeService: StoreService;
  dealService: DealService;
  couponTypeService: CouponTypeService;
  newsletterService: NewsletterService;
}
