import { describe, expect, it, vi } from 'vitest';
import { merchantServiceFactory } from './service';
import type { Merchant, MerchantRepository } from './types';

const makeMerchant = (over: Partial<Merchant> = {}): Merchant => ({
  id: 'm1',
  name: 'TestMart',
  address: null,
  lat: null,
  lng: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

describe('merchantService', () => {
  it('delegates findMerchantsByIds to the repository', async () => {
    // @ts-expect-error partial mock: only the functions used are provided
    const repo: MerchantRepository = {
      findMerchantsByIds: (ids) => Promise.resolve([makeMerchant({ id: ids[0] })]),
    };
    const service = merchantServiceFactory({ merchantRepository: repo });
    const result = await service.findMerchantsByIds(['m1']);
    expect(result).toEqual([makeMerchant({ id: 'm1' })]);
  });

  it('getOrCreateMerchant returns existing when findMerchantByName succeeds', async () => {
    const existing = makeMerchant({ name: 'TestMart' });
    const createMerchant = vi.fn();
    // @ts-expect-error partial mock: only the functions used are provided
    const repo: MerchantRepository = {
      findMerchantByName: () => Promise.resolve(existing),
      createMerchant,
    };
    const service = merchantServiceFactory({ merchantRepository: repo });
    const result = await service.getOrCreateMerchant('TestMart');
    expect(result).toEqual(existing);
    expect(createMerchant).not.toHaveBeenCalled();
  });

  it('getOrCreateMerchant creates when findMerchantByName returns null', async () => {
    const created = makeMerchant({ name: 'NewMart', id: 'm2' });
    // @ts-expect-error partial mock: only the functions used are provided
    const repo: MerchantRepository = {
      findMerchantByName: () => Promise.resolve(null),
      createMerchant: (name) => Promise.resolve({ ...created, name }),
    };
    const service = merchantServiceFactory({ merchantRepository: repo });
    const result = await service.getOrCreateMerchant('NewMart');
    expect(result.name).toBe('NewMart');
  });

  it('countMerchants delegates to the repository', async () => {
    // @ts-expect-error partial mock: only the functions used are provided
    const repo: MerchantRepository = {
      countMerchants: () => Promise.resolve(42),
    };
    const service = merchantServiceFactory({ merchantRepository: repo });
    expect(await service.countMerchants()).toBe(42);
  });

  it('updateMerchantLocation passes full args to the repository', async () => {
    const updateMerchantLocation = vi.fn();
    // @ts-expect-error partial mock: only the functions used are provided
    const repo: MerchantRepository = {
      updateMerchantLocation,
    };
    const service = merchantServiceFactory({ merchantRepository: repo });
    await service.updateMerchantLocation('m1', { address: '123 Main St', lat: 40.7, lng: -74.0 });
    expect(updateMerchantLocation).toHaveBeenCalledWith('m1', {
      address: '123 Main St',
      lat: 40.7,
      lng: -74.0,
    });
  });

  it('updateMerchantLocation passes partial args to the repository', async () => {
    const updateMerchantLocation = vi.fn();
    // @ts-expect-error partial mock: only the functions used are provided
    const repo: MerchantRepository = {
      updateMerchantLocation,
    };
    const service = merchantServiceFactory({ merchantRepository: repo });
    await service.updateMerchantLocation('m2', { lat: 51.5 });
    expect(updateMerchantLocation).toHaveBeenCalledWith('m2', { lat: 51.5 });
  });

  it('surfaces persisted location through the read path (not write-only)', async () => {
    const located = makeMerchant({ id: 'm3', address: '5 Market St', lat: 40.7, lng: -74.0 });
    // @ts-expect-error partial mock: only the functions used are provided
    const repo: MerchantRepository = {
      findMerchantsByIds: (ids) => Promise.resolve(ids.includes('m3') ? [located] : []),
    };
    const service = merchantServiceFactory({ merchantRepository: repo });
    const [m] = await service.findMerchantsByIds(['m3']);
    expect(m).toMatchObject({ address: '5 Market St', lat: 40.7, lng: -74.0 });
  });
});
