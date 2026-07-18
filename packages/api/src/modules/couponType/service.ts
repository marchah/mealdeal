import type { CouponTypeRepository, CouponTypeService, NewCouponType } from './types';

// The controlled default taxonomy seeded on startup. Exported so tests and tooling assert against
// the canonical list instead of duplicating it.
export const DEFAULT_COUPON_TYPES: readonly NewCouponType[] = [
  { key: 'food', label: 'Food' },
  { key: 'household', label: 'Household' },
  { key: 'beverages', label: 'Beverages' },
  { key: 'snacks', label: 'Snacks' },
  { key: 'personal-care', label: 'Personal Care' },
  { key: 'pharmacy', label: 'Pharmacy' },
  { key: 'pet-supplies', label: 'Pet Supplies' },
  { key: 'other', label: 'Other' },
];

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

  // Upsert every default by key. Unlike a count-then-skip guard, a nonzero count no longer
  // suppresses missing rows, so an interrupted seed is repaired on the next run. Each upsert is
  // atomic (INSERT ... ON CONFLICT DO NOTHING), making repeated seeding a safe no-op.
  async function seed() {
    for (const couponType of DEFAULT_COUPON_TYPES) {
      await couponTypeRepository.upsertByKey(couponType);
    }
  }

  return { getCouponTypes, getCouponTypeByKey, seed };
}
