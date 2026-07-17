import { describe, expect, it } from 'vitest';
import { merchantServiceFactory } from './service';
import type { Merchant, MerchantRepository } from './types';

const makeMerchant = (over: Partial<Merchant> = {}): Merchant => ({
  id: 'm1',
  name: 'Test Merchant',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

describe('merchantService', () => {
  it('updates location with full args', async () => {
    let updateCalled = false;
    const merchantRepository: MerchantRepository = {
      findByIds: () => Promise.resolve([]),
      findByName: () => Promise.resolve(null),
      create: () => Promise.resolve(makeMerchant()),
      updateLocation: async (_merchantId, args) => {
        updateCalled = true;
        expect(args).toEqual({
          address: '123 Main St',
          lat: 40.7128,
          lng: -74.006,
        });
      },
      count: () => Promise.resolve(1),
    };
    const service = merchantServiceFactory({ merchantRepository });
    await service.updateLocation('m1', {
      address: '123 Main St',
      lat: 40.7128,
      lng: -74.006,
    });
    expect(updateCalled).toBe(true);
  });

  it('updates location with partial args', async () => {
    let updateCalled = false;
    const merchantRepository: MerchantRepository = {
      findByIds: () => Promise.resolve([]),
      findByName: () => Promise.resolve(null),
      create: () => Promise.resolve(makeMerchant()),
      updateLocation: async (merchantId, args) => {
        updateCalled = true;
        expect(args).toEqual({ address: '456 Oak Ave' });
      },
      count: () => Promise.resolve(1),
    };
    const service = merchantServiceFactory({ merchantRepository });
    await service.updateLocation('m1', { address: '456 Oak Ave' });
    expect(updateCalled).toBe(true);
  });

  it('does not call repository when args are empty', async () => {
    let updateCalled = false;
    const merchantRepository: MerchantRepository = {
      findByIds: () => Promise.resolve([]),
      findByName: () => Promise.resolve(null),
      create: () => Promise.resolve(makeMerchant()),
      updateLocation: async () => {
        updateCalled = true;
      },
      count: () => Promise.resolve(1),
    };
    const service = merchantServiceFactory({ merchantRepository });
    await service.updateLocation('m1', {});
    expect(updateCalled).toBe(false);
  });

  it('updates location with only lat/lng', async () => {
    let updateCalled = false;
    const merchantRepository: MerchantRepository = {
      findByIds: () => Promise.resolve([]),
      findByName: () => Promise.resolve(null),
      create: () => Promise.resolve(makeMerchant()),
      updateLocation: async (_merchantId, args) => {
        updateCalled = true;
        expect(args).toEqual({ lat: 40.7128, lng: -74.006 });
      },
      count: () => Promise.resolve(1),
    };
    const service = merchantServiceFactory({ merchantRepository });
    await service.updateLocation('m1', { lat: 40.7128, lng: -74.006 });
    expect(updateCalled).toBe(true);
  });
});
