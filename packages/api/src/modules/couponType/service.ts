import type { CouponTypeRepository, CouponTypeService } from './types';

// Business logic. Depends on repository + collaborator service PORT types — never the db.
export function couponTypeServiceFactory({
  couponTypeRepository,
}: {
  couponTypeRepository: CouponTypeRepository;
}): CouponTypeService {
  async function getCouponTypes() {
    return couponTypeRepository.listAll();
  }

  async function getCouponTypeByKey(key: string) {
    return couponTypeRepository.findByKey(key);
  }

  async function seed() {
    const count = await couponTypeRepository.count();
    if (count > 0) return; // already seeded
    const defaults: { key: string; label: string }[] = [
      { key: 'food', label: 'Food' },
      { key: 'household', label: 'Household' },
      { key: 'beverages', label: 'Beverages' },
      { key: 'snacks', label: 'Snacks' },
      { key: 'personal-care', label: 'Personal Care' },
      { key: 'pharmacy', label: 'Pharmacy' },
      { key: 'pet-supplies', label: 'Pet Supplies' },
      { key: 'other', label: 'Other' },
    ];
    for (const ct of defaults) {
      await couponTypeRepository.insert(ct);
    }
  }

  return { getCouponTypes, getCouponTypeByKey, seed };
}
