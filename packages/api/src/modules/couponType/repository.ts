import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { couponTypes } from '../../db/schema';
import type { Db } from '../../db/client';
import type { CouponType, CouponTypeRepository, CouponTypeService, NewCouponType } from './types';

// The ONLY layer that imports the db. Composes Drizzle queries into the CouponTypeRepository port.
export function couponTypeRepositoryFactory({ db }: { db: Db }): CouponTypeRepository {
  return {
    async listAll() {
      return db.select().from(couponTypes);
    },
    async findByKey(key: string): Promise<CouponType | null> {
      const rows = await db.select().from(couponTypes).where(eq(couponTypes.key, key)).limit(1);
      return rows[0] ?? null;
    },
    async insert(newCouponType: NewCouponType): Promise<CouponType> {
      const result = await db
        .insert(couponTypes)
        .values({ id: randomUUID(), ...newCouponType })
        .returning();
      if (!result[0]) throw new Error('Failed to insert coupon type');
      return result[0];
    },
    async count(): Promise<number> {
      const rows = await db.select({ value: sql<number>`count(*)` }).from(couponTypes);
      return rows[0]?.value ?? 0;
    },
  };
}

// Seed the coupon_types table with defaults on init.
export async function seedCouponTypes(service: CouponTypeService): Promise<void> {
  await service.seed();
}
