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
  it('delegates findByIds to the repository', async () => {
    const repo: MerchantRepository = {
      findByIds: (ids) => Promise.resolve([makeMerchant({ id: ids[0] })]),
      findByName: () => Promise.resolve(null),
      create: () => Promise.resolve(makeMerchant()),
      count: () => Promise.resolve(0),
      updateLocation: () => Promise.resolve(),
    };
    const service = merchantServiceFactory({ merchantRepository: repo });
    const result = await service.findByIds(['m1']);
    expect(result).toEqual([makeMerchant({ id: 'm1' })]);
  });

  it('getOrCreate returns existing when findByName succeeds', async () => {
    const existing = makeMerchant({ name: 'TestMart' });
    const create = vi.fn();
    const repo: MerchantRepository = {
      findByIds: () => Promise.resolve([]),
      findByName: () => Promise.resolve(existing),
      create,
      count: () => Promise.resolve(0),
      updateLocation: () => Promise.resolve(),
    };
    const service = merchantServiceFactory({ merchantRepository: repo });
    const result = await service.getOrCreate('TestMart');
    expect(result).toEqual(existing);
    expect(create).not.toHaveBeenCalled();
  });

  it('getOrCreate creates when findByName returns null', async () => {
    const created = makeMerchant({ name: 'NewMart', id: 'm2' });
    const repo: MerchantRepository = {
      findByIds: () => Promise.resolve([]),
      findByName: () => Promise.resolve(null),
      create: (name) => Promise.resolve({ ...created, name }),
      count: () => Promise.resolve(0),
      updateLocation: () => Promise.resolve(),
    };
    const service = merchantServiceFactory({ merchantRepository: repo });
    const result = await service.getOrCreate('NewMart');
    expect(result.name).toBe('NewMart');
  });

  it('count delegates to the repository', async () => {
    const repo: MerchantRepository = {
      findByIds: () => Promise.resolve([]),
      findByName: () => Promise.resolve(null),
      create: () => Promise.resolve(makeMerchant()),
      count: () => Promise.resolve(42),
      updateLocation: () => Promise.resolve(),
    };
    const service = merchantServiceFactory({ merchantRepository: repo });
    expect(await service.count()).toBe(42);
  });

  it('updateLocation passes full args to the repository', async () => {
    const updateLocation = vi.fn();
    const repo: MerchantRepository = {
      findByIds: () => Promise.resolve([]),
      findByName: () => Promise.resolve(null),
      create: () => Promise.resolve(makeMerchant()),
      count: () => Promise.resolve(0),
      updateLocation,
    };
    const service = merchantServiceFactory({ merchantRepository: repo });
    await service.updateLocation('m1', { address: '123 Main St', lat: 40.7, lng: -74.0 });
    expect(updateLocation).toHaveBeenCalledWith('m1', {
      address: '123 Main St',
      lat: 40.7,
      lng: -74.0,
    });
  });

  it('updateLocation passes partial args to the repository', async () => {
    const updateLocation = vi.fn();
    const repo: MerchantRepository = {
      findByIds: () => Promise.resolve([]),
      findByName: () => Promise.resolve(null),
      create: () => Promise.resolve(makeMerchant()),
      count: () => Promise.resolve(0),
      updateLocation,
    };
    const service = merchantServiceFactory({ merchantRepository: repo });
    await service.updateLocation('m2', { lat: 51.5 });
    expect(updateLocation).toHaveBeenCalledWith('m2', { lat: 51.5 });
  });

  it('surfaces persisted location through the read path (not write-only)', async () => {
    const located = makeMerchant({ id: 'm3', address: '5 Market St', lat: 40.7, lng: -74.0 });
    const repo: MerchantRepository = {
      findByIds: (ids) => Promise.resolve(ids.includes('m3') ? [located] : []),
      findByName: () => Promise.resolve(null),
      create: () => Promise.resolve(makeMerchant()),
      count: () => Promise.resolve(0),
      updateLocation: () => Promise.resolve(),
    };
    const service = merchantServiceFactory({ merchantRepository: repo });
    const [m] = await service.findByIds(['m3']);
    expect(m).toMatchObject({ address: '5 Market St', lat: 40.7, lng: -74.0 });
  });
});
