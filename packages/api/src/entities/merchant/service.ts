import type {
  AddressCoordinateLookup,
  Merchant,
  MerchantRepository,
  MerchantService,
} from './types';

// Business logic. Depends on the repository PORT type only.
export function merchantServiceFactory({
  merchantRepository,
  addressCoordinateLookup,
}: {
  merchantRepository: MerchantRepository;
  addressCoordinateLookup: AddressCoordinateLookup;
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

  async function resolveMerchantLocation(merchant: Merchant, address: string) {
    if (merchant.lat !== null && merchant.lng !== null) return merchant;
    const coordinates = await addressCoordinateLookup.lookupAddress(address);
    if (!coordinates) return merchant;
    await merchantRepository.updateMerchantLocation(merchant.id, { address, ...coordinates });
    return { ...merchant, address, ...coordinates };
  }

  return {
    findMerchantsByIds,
    countMerchants,
    updateMerchantLocation,
    getOrCreateMerchant,
    resolveMerchantLocation,
  };
}
