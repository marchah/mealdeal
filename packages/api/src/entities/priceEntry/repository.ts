import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { ServerError } from '../../common/errors';
import { priceEntries } from '../../db/schema';
import type { Db } from '../../db/client';
import type {
  ListPriceEntriesInput,
  NewPriceEntry,
  PriceEntry,
  PriceEntryRepository,
} from './types';

// Newest first, with createdAt breaking ties so two prices observed on the same day come back in
// a stable order rather than whatever the page happens to yield.
const newestFirst = [desc(priceEntries.observedAt), desc(priceEntries.createdAt)];

// The ONLY layer that imports the db. Composes Drizzle queries into the PriceEntryRepository port.
export function priceEntryRepositoryFactory({ db }: { db: Db }): PriceEntryRepository {
  async function listPriceEntries(input: ListPriceEntriesInput) {
    const query = db
      .select()
      .from(priceEntries)
      .where(
        and(
          eq(priceEntries.pantryItemId, input.pantryItemId),
          input.since ? gte(priceEntries.observedAt, input.since) : undefined,
        ),
      )
      .orderBy(...newestFirst);
    return input.limit === null ? query : query.limit(input.limit);
  }

  async function findPriceEntriesByPantryItemIds(ids: readonly string[]) {
    if (ids.length === 0) return [];
    return db
      .select()
      .from(priceEntries)
      .where(inArray(priceEntries.pantryItemId, [...ids]))
      .orderBy(...newestFirst);
  }

  async function insertPriceEntry(entry: NewPriceEntry): Promise<PriceEntry> {
    const rows = await db
      .insert(priceEntries)
      .values({ id: randomUUID(), ...entry })
      .returning();
    const inserted = rows[0];
    if (!inserted) throw new ServerError('insertPriceEntry returned no row');
    return inserted;
  }

  async function deletePriceEntry(id: string) {
    const rows = await db.delete(priceEntries).where(eq(priceEntries.id, id)).returning();
    return rows[0] ?? null;
  }

  return {
    listPriceEntries,
    findPriceEntriesByPantryItemIds,
    insertPriceEntry,
    deletePriceEntry,
  };
}
