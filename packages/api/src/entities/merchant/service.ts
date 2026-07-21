import type { MerchantRepository, MerchantService } from './types';

// Business logic. Depends on the repository PORT type only.
export function merchantServiceFactory({
  merchantRepository,
}: {
  merchantRepository: MerchantRepository;
}): MerchantService {
  function findMerchantsByIds(ids: readonly string[]) {
    return merchantRepository.findMerchantsByIds(ids);
  }

  function countMerchants() {
    return merchantRepository.countMerchants();
  }

  function updateMerchantLocation(
    id: string,
    args: { address?: string; lat?: number; lng?: number },
  ) {
    return merchantRepository.updateMerchantLocation(id, args);
  }

  async function getOrCreateMerchant(name: string) {
    const existing = await merchantRepository.findMerchantByName(name);
    return existing ?? merchantRepository.createMerchant(name);
  }

  return { findMerchantsByIds, countMerchants, updateMerchantLocation, getOrCreateMerchant };
}
