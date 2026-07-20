import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { couponTypes } from '../../db/schema';
import type { Db } from '../../db/client';
import type { CouponType, CouponTypeRepository, NewCouponType } from './types';

// The ONLY layer that imports the db. Composes Drizzle queries into the CouponTypeRepository port.
// Persistence primitives only — orchestration (e.g. seeding) lives in the service, never here.
export function couponTypeRepositoryFactory({ db }: { db: Db }): CouponTypeRepository {
  return {
    async listAll() {
      return db.select().from(couponTypes);
    },
    async findById(id: string): Promise<CouponType | null> {
      const rows = await db.select().from(couponTypes).where(eq(couponTypes.id, id)).limit(1);
      return rows[0] ?? null;
    },
    async findByKey(key: string): Promise<CouponType | null> {
      const rows = await db.select().from(couponTypes).where(eq(couponTypes.key, key)).limit(1);
      return rows[0] ?? null;
    },
    // Idempotent + repairable: a single atomic INSERT ... ON CONFLICT DO NOTHING on the unique
    // `key`. An existing key is a no-op, so re-running seed fills only the missing rows and never
    // duplicates. Mirrors the deal repository's `insertIfNew`.
    async upsertByKey(newCouponType: NewCouponType): Promise<void> {
      await db
        .insert(couponTypes)
        .values({ id: randomUUID(), ...newCouponType })
        .onConflictDoNothing({ target: couponTypes.key });
    },
  };
}
