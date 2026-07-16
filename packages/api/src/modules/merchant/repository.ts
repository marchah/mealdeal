import { randomUUID } from 'node:crypto';
import { count, eq, inArray } from 'drizzle-orm';
import { merchants } from '../../db/schema';
import type { Db } from '../../db/client';
import type { Merchant, MerchantRepository } from './types';

// The ONLY layer that imports the db. Composes Drizzle queries into the MerchantRepository port.
export function merchantRepositoryFactory({ db }: { db: Db }): MerchantRepository {
  return {
    async findByIds(ids) {
      if (ids.length === 0) return [];
      return db
        .select()
        .from(merchants)
        .where(inArray(merchants.id, [...ids]));
    },
    async findByName(name) {
      const rows = await db.select().from(merchants).where(eq(merchants.name, name)).limit(1);
      return rows[0] ?? null;
    },
    async create(name) {
      const row: Merchant = { id: randomUUID(), name, createdAt: new Date() };
      await db.insert(merchants).values(row);
      return row;
    },
    async count() {
      const rows = await db.select({ value: count() }).from(merchants);
      return rows[0]?.value ?? 0;
    },
  };
}
