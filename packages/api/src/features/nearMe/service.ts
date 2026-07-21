import type { Deal } from '../../entities/deal/types';
import type { NearMeDependencies, NearMeService } from './types';

function compareDeals(left: Deal, right: Deal): number {
  return left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
}

// Coordinates come exclusively from LocationService and distances exclusively from StoreService.
// This orchestration keeps each underlying concern reusable while defining the near-me contract.
export function nearMeServiceFactory(dependencies: NearMeDependencies): NearMeService {
  async function storesNearMe({ radiusMiles }: { radiusMiles: number }) {
    const coordinates = await dependencies.locationService.getUserLocation();
    return dependencies.storeService.storesNearLocation({ ...coordinates, radiusMiles });
  }

  return {
    storesNearMe,
    async dealsNearMe(input) {
      const [stores, deals, couponTypes] = await Promise.all([
        storesNearMe(input),
        dependencies.dealService.listDeals({ activeOnly: true, category: null }),
        dependencies.couponTypeService.getCouponTypes(),
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
    },
    async recommendedNewsletters(input) {
      const stores = await storesNearMe(input);
      return dependencies.newsletterService.listRecommendedByMerchantIds(
        stores.map((store) => store.id),
      );
    },
  };
}
