import { NotFoundError } from '../../common/errors';
import type { TrackingPrefService } from '../trackingPref/types';
import type { CouponTypeService } from '../couponType/types';
import type { Deal, DealRepository, DealService, ListDealsInput, NewDeal } from './types';

// Business logic. The repository is injected whole and first; collaborator services are
// destructured down to the functions actually used.
export function dealServiceFactory({
  dealRepository,
  trackingPrefService: { mutedValues },
  couponTypeService: { findCouponTypeById },
}: {
  dealRepository: DealRepository;
  trackingPrefService: TrackingPrefService;
  couponTypeService: CouponTypeService;
}): DealService {
  async function getDealById(id: string) {
    const deal = await dealRepository.findDealById(id);
    if (!deal) throw new NotFoundError(`No deal with id ${id}`);
    return deal;
  }

  async function listDeals(input: ListDealsInput) {
    const rows = await dealRepository.listDeals(input);
    if (!input.activeOnly) return rows;
    // Hide muted items/categories from the active list.
    const { items, categories } = await mutedValues();
    return rows.filter((deal) => {
      const item = deal.item?.toLowerCase();
      const category = deal.category?.toLowerCase();
      if (item && items.has(item)) return false;
      if (category && categories.has(category)) return false;
      return true;
    });
  }

  function countDeals() {
    return dealRepository.countDeals();
  }

  function addDeal(deal: NewDeal) {
    return dealRepository.insertDealIfNew(deal);
  }

  function getDealCouponType(deal: Deal) {
    return deal.couponTypeId ? findCouponTypeById(deal.couponTypeId) : Promise.resolve(null);
  }

  return { getDealById, listDeals, countDeals, addDeal, getDealCouponType };
}
