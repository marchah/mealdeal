import type { MerchantRepository, MerchantService } from './types';

// Business logic. Depends on the repository PORT type only.
export function merchantServiceFactory({
  merchantRepository,
}: {
  merchantRepository: MerchantRepository;
}): MerchantService {
  return {
    findByIds: (ids) => merchantRepository.findByIds(ids),
    count: () => merchantRepository.count(),
    async getOrCreate(name) {
      const existing = await merchantRepository.findByName(name);
      return existing ?? merchantRepository.create(name);
    },
  };
}
