import { randomUUID } from 'node:crypto';
import { count as sqlCount, eq, inArray } from 'drizzle-orm';
import { merchants } from '../../db/schema';
import type { Db } from '../../db/client';
import type { Merchant, MerchantRepository } from './types';

type LocationUpdate = { address?: string; lat?: number; lng?: number };

// The ONLY layer that imports the db. Composes Drizzle queries into the MerchantRepository port.
export function merchantRepositoryFactory({ db }: { db: Db }): MerchantRepository {
  async function findByIds(ids: readonly string[]) {
    if (ids.length === 0) return [];
    return db
      .select()
      .from(merchants)
      .where(inArray(merchants.id, [...ids]));
  }

  async function findByName(name: string) {
    const rows = await db.select().from(merchants).where(eq(merchants.name, name)).limit(1);
    return rows[0] ?? null;
  }

  async function count() {
    const rows = await db.select({ value: sqlCount() }).from(merchants);
    return rows[0]?.value ?? 0;
  }

  async function create(name: string) {
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
  }

  async function updateLocation(id: string, args: LocationUpdate) {
    if (args.address === undefined && args.lat === undefined && args.lng === undefined) return;
    await db
      .update(merchants)
      .set({
        address: args.address,
        lat: args.lat,
        lng: args.lng,
      })
      .where(eq(merchants.id, id));
  }

  return { findByIds, findByName, count, create, updateLocation };
}
