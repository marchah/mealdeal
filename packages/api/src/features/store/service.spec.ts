import { describe, expect, it } from 'vitest';
import { storeServiceFactory } from './service';
import type { Store, StoreRepository } from './types';

const makeStore = (over: Partial<Store> = {}): Store => ({
  id: 'store-1',
  name: 'Test Market',
  address: '1 Main Street',
  lat: 0,
  lng: 0,
  distanceMiles: 0,
  ...over,
});

function makeService(stores: Store[]) {
  const storeRepository: StoreRepository = { listWithLocation: () => Promise.resolve(stores) };
  return storeServiceFactory({ storeRepository });
}

describe('storeService', () => {
  it('includes a store whose calculated distance is exactly on the radius boundary', async () => {
    const service = makeService([makeStore({ distanceMiles: 69.093418985531 })]);

    await expect(
      service.storesNearLocation({ lat: 0, lng: 0, radiusMiles: 69.093418985531 }),
    ).resolves.toHaveLength(1);
  });

  it('excludes stores beyond the radius and preserves a deterministic id order for distance ties', async () => {
    const service = makeService([
      makeStore({ id: 'store-b', distanceMiles: 0 }),
      makeStore({ id: 'store-outside', distanceMiles: 138 }),
      makeStore({ id: 'store-a', distanceMiles: 0 }),
    ]);

    const stores = await service.storesNearLocation({ lat: 0, lng: 0, radiusMiles: 1 });

    expect(stores.map((store) => store.id)).toEqual(['store-a', 'store-b']);
  });
});
