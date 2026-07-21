import type { MerchantRepository, MerchantService } from './types';

// Business logic. Depends on the repository PORT type only.
export function merchantServiceFactory({
  merchantRepository,
}: {
  merchantRepository: MerchantRepository;
}): MerchantService {
  function findByIds(ids: readonly string[]) {
    return merchantRepository.findByIds(ids);
  }

  function count() {
    return merchantRepository.count();
  }

  function updateLocation(id: string, args: { address?: string; lat?: number; lng?: number }) {
    return merchantRepository.updateLocation(id, args);
  }

  async function getOrCreate(name: string) {
    const existing = await merchantRepository.findByName(name);
    return existing ?? merchantRepository.create(name);
  }

  return { findByIds, count, updateLocation, getOrCreate };
}
