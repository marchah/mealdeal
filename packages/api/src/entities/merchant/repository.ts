import { randomUUID } from 'node:crypto';
import { count, eq, inArray } from 'drizzle-orm';
import { merchants } from '../../db/schema';
import type { Db } from '../../db/client';
import type { Merchant, MerchantRepository } from './types';

type LocationUpdate = { address?: string; lat?: number; lng?: number };

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
      const row: Merchant = {
        id: randomUUID(),
        name,
        address: null,
        lat: null,
        lng: null,
        createdAt: new Date(),
      };
      await db.insert(merchants).values(row);
      return row;
    },
    async count() {
      const rows = await db.select({ value: count() }).from(merchants);
      return rows[0]?.value ?? 0;
    },
    async updateLocation(id, args: LocationUpdate) {
      if (args.address === undefined && args.lat === undefined && args.lng === undefined) return;
      await db
        .update(merchants)
        .set({
          address: args.address,
          lat: args.lat,
          lng: args.lng,
        })
        .where(eq(merchants.id, id));
    },
  };
}
