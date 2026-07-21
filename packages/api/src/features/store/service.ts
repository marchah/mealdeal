import type { StoreRepository, StoreService, StoresNearLocationInput } from './types';

// Business logic. The repository calculates Haversine distance; this layer applies the inclusive
// radius boundary and stable tie-breaking that define the search contract.
export function storeServiceFactory({
  storeRepository,
}: {
  storeRepository: StoreRepository;
}): StoreService {
  return {
    async storesNearLocation(input: StoresNearLocationInput) {
      const stores = await storeRepository.listWithLocation(input);
      return stores
        .filter((store) => store.distanceMiles <= input.radiusMiles)
        .sort(
          (left, right) =>
            left.distanceMiles - right.distanceMiles || left.id.localeCompare(right.id),
        );
    },
  };
}
