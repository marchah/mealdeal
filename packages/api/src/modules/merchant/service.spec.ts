import { describe, expect, it } from 'vitest';
import { merchantServiceFactory } from './service';
import type { Merchant, MerchantRepository } from './types';

const makeMerchant = (over: Partial<Merchant> = {}): Merchant => ({
  id: 'm1',
  name: 'Woolworths',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

function makeService(overrides: { count?: number; createName?: string } = {}) {
  const merchantRepository: MerchantRepository = {
    findByIds: () => Promise.resolve([]),
    findByName: () => Promise.resolve(null),
    create: (name) => Promise.resolve(makeMerchant({ name: overrides.createName ?? name })),
    count: () => Promise.resolve(overrides.count ?? 0),
  };

  return merchantServiceFactory({ merchantRepository });
}

describe('merchantService', () => {
  it('count() delegates to the repository', async () => {
    const service = makeService({ count: 42 });
    await expect(service.count()).resolves.toBe(42);
  });

  it('count() returns 0 when repository reports none', async () => {
    const service = makeService();
    await expect(service.count()).resolves.toBe(0);
  });

  it('getOrCreate() returns existing merchant when found', async () => {
    const expected = makeMerchant();
    const merchantRepository: MerchantRepository = {
      findByIds: () => Promise.resolve([]),
      findByName: () => Promise.resolve(expected),
      create: () => Promise.resolve(makeMerchant({ id: 'new' })),
      count: () => Promise.resolve(0),
    };
    const service = merchantServiceFactory({ merchantRepository });
    const result = await service.getOrCreate('Woolworths');
    expect(result.id).toBe('m1');
  });

  it('getOrCreate() creates a new merchant when not found', async () => {
    const service = makeService();
    const result = await service.getOrCreate('Aldi');
    expect(result.name).toBe('Aldi');
    expect(result.id).toBeDefined();
  });
});
