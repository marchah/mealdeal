import { NotFoundError } from '../../common/errors';
import type { TrackingPrefService } from '../trackingPref/types';
import type { CouponTypeService } from '../couponType/types';
import type { Deal, DealRepository, DealService, ListDealsInput, NewDeal } from './types';

// Business logic. Depends on repository + collaborator service PORT types — never the db.
export function dealServiceFactory({
  dealRepository,
  trackingPrefService,
  couponTypeService,
}: {
  dealRepository: DealRepository;
  trackingPrefService: TrackingPrefService;
  couponTypeService: CouponTypeService;
}): DealService {
  async function getById(id: string) {
    const deal = await dealRepository.findById(id);
    if (!deal) throw new NotFoundError(`No deal with id ${id}`);
    return deal;
  }

  async function listDeals(input: ListDealsInput) {
    const rows = await dealRepository.listAll(input);
    if (!input.activeOnly) return rows;
    // Hide muted items/categories from the active list.
    const { items, categories } = await trackingPrefService.mutedValues();
    return rows.filter((deal) => {
      const item = deal.item?.toLowerCase();
      const category = deal.category?.toLowerCase();
      if (item && items.has(item)) return false;
      if (category && categories.has(category)) return false;
      return true;
    });
  }

  function count() {
    return dealRepository.count();
  }

  function add(deal: NewDeal) {
    return dealRepository.insertIfNew(deal);
  }

  function getCouponType(deal: Deal) {
    return deal.couponTypeId
      ? couponTypeService.findById(deal.couponTypeId)
      : Promise.resolve(null);
  }

  return { getById, listDeals, count, add, getCouponType };
}
