import type { Deal } from '../../entities/deal/types';
import type { NearMeDependencies, NearMeInput, NearMeService } from './types';

function compareDeals(left: Deal, right: Deal): number {
  return left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
}

// Coordinates come exclusively from LocationService and distances exclusively from StoreService.
// This orchestration keeps each underlying concern reusable while defining the near-me contract.
export function nearMeServiceFactory({
  locationService: { getUserLocation },
  storeService: { storesNearLocation },
  dealService: { listDeals },
  couponTypeService: { getCouponTypes },
  newsletterService: { listRecommendedByMerchantIds },
}: NearMeDependencies): NearMeService {
  async function storesNearMe({ radiusMiles }: { radiusMiles: number }) {
    const coordinates = await getUserLocation();
    return storesNearLocation({ ...coordinates, radiusMiles });
  }

  async function recommendedNewsletters(input: NearMeInput) {
    const stores = await storesNearMe(input);
    return listRecommendedByMerchantIds(stores.map((store) => store.id));
  }

  async function dealsNearMe(input: NearMeInput) {
    const [stores, deals, couponTypes] = await Promise.all([
      storesNearMe(input),
      listDeals({ activeOnly: true, category: null }),
      getCouponTypes(),
    ]);
    const nearbyMerchantIds = new Set(stores.map((store) => store.id));
    const couponTypesById = new Map(couponTypes.map((couponType) => [couponType.id, couponType]));
    const groups = new Map<string | null, Deal[]>();

    for (const deal of deals) {
      if (!nearbyMerchantIds.has(deal.merchantId)) continue;
      const key = couponTypesById.has(deal.couponTypeId ?? '') ? deal.couponTypeId : null;
      const group = groups.get(key) ?? [];
      group.push(deal);
      groups.set(key, group);
    }

    return [...groups.entries()]
      .map(([couponTypeId, groupedDeals]) => ({
        couponType: couponTypeId ? (couponTypesById.get(couponTypeId) ?? null) : null,
        deals: groupedDeals.sort(compareDeals),
      }))
      .sort((left, right) => {
        if (!left.couponType) return right.couponType ? 1 : 0;
        if (!right.couponType) return -1;
        return (
          left.couponType.key.localeCompare(right.couponType.key) ||
          left.couponType.id.localeCompare(right.couponType.id)
        );
      });
  }

  return { storesNearMe, recommendedNewsletters, dealsNearMe };
}
