import { randomUUID } from 'node:crypto';
import { and, count, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import { deals } from '../../db/schema';
import type { Db } from '../../db/client';
import type { DealRepository, ListDealsInput, NewDeal } from './types';

// A deal is "active" when it has no expiry or expires in the future.
const notExpired = () => or(isNull(deals.expiresAt), gt(deals.expiresAt, new Date()));

// The ONLY layer that imports the db. Composes Drizzle queries into the DealRepository port.
export function dealRepositoryFactory({ db }: { db: Db }): DealRepository {
  return {
    async listAll(input: ListDealsInput) {
      return db
        .select()
        .from(deals)
        .where(
          and(
            input.activeOnly ? notExpired() : undefined,
            input.category ? eq(deals.category, input.category) : undefined,
          ),
        );
    },
    async findByIds(ids) {
      if (ids.length === 0) return [];
      return db
        .select()
        .from(deals)
        .where(inArray(deals.id, [...ids]));
    },
    async findById(id) {
      const rows = await db.select().from(deals).where(eq(deals.id, id)).limit(1);
      return rows[0] ?? null;
    },
    async insertIfNew(deal: NewDeal) {
      const result = await db
        .insert(deals)
        .values({ id: randomUUID(), ...deal })
        .onConflictDoNothing({ target: deals.dedupHash });
      return (result.rowsAffected ?? 0) > 0;
    },
    async countActive() {
      const rows = await db.select({ value: count() }).from(deals).where(notExpired());
      return rows[0]?.value ?? 0;
    },
    async count() {
      const rows = await db.select({ value: count() }).from(deals);
      return rows[0]?.value ?? 0;
    },
  };
}
