import { randomUUID } from 'node:crypto';
import { and, count as sqlCount, eq, inArray, isNull, sql } from 'drizzle-orm';
import { ServerError } from '../../common/errors';
import { pantryItems } from '../../db/schema';
import type { Db } from '../../db/client';
import type { Maybe } from '../../common/types';
import type {
  ListPantryItemsInput,
  PantryItem,
  PantryItemInput,
  PantryItemRepository,
} from './types';

// The ONLY layer that imports the db. Composes Drizzle queries into the PantryItemRepository port.
export function pantryItemRepositoryFactory({ db }: { db: Db }): PantryItemRepository {
  async function findPantryItemById(id: string) {
    const rows = await db.select().from(pantryItems).where(eq(pantryItems.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async function findPantryItemsByIds(ids: readonly string[]) {
    if (ids.length === 0) return [];
    return db
      .select()
      .from(pantryItems)
      .where(inArray(pantryItems.id, [...ids]));
  }

  // Folding happens in SQL so the duplicate check stays one indexed-ish lookup rather than
  // loading the table to compare in JS. The service normalizes an empty brand to null first,
  // which is what makes `is null` the correct match for "no brand".
  async function findPantryItemByNameAndBrand(name: string, brand: Maybe<string>) {
    const rows = await db
      .select()
      .from(pantryItems)
      .where(
        and(
          eq(sql`lower(${pantryItems.name})`, name.toLowerCase()),
          brand === null
            ? isNull(pantryItems.brand)
            : eq(sql`lower(${pantryItems.brand})`, brand.toLowerCase()),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async function listPantryItems(input: ListPantryItemsInput) {
    return db
      .select()
      .from(pantryItems)
      .where(
        and(
          input.includeArchived ? undefined : eq(pantryItems.archived, false),
          input.couponTypeId ? eq(pantryItems.couponTypeId, input.couponTypeId) : undefined,
        ),
      );
  }

  async function countPantryItems() {
    const rows = await db.select({ value: sqlCount() }).from(pantryItems);
    return rows[0]?.value ?? 0;
  }

  async function insertPantryItem(input: PantryItemInput): Promise<PantryItem> {
    const rows = await db
      .insert(pantryItems)
      .values({ id: randomUUID(), ...input })
      .returning();
    const inserted = rows[0];
    if (!inserted) throw new ServerError('insertPantryItem returned no row');
    return inserted;
  }

  async function updatePantryItem(id: string, input: PantryItemInput) {
    const rows = await db.update(pantryItems).set(input).where(eq(pantryItems.id, id)).returning();
    return rows[0] ?? null;
  }

  async function setPantryItemArchived(id: string, archived: boolean) {
    const rows = await db
      .update(pantryItems)
      .set({ archived })
      .where(eq(pantryItems.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async function deletePantryItem(id: string) {
    const rows = await db.delete(pantryItems).where(eq(pantryItems.id, id)).returning();
    return rows[0] ?? null;
  }

  return {
    findPantryItemById,
    findPantryItemsByIds,
    findPantryItemByNameAndBrand,
    listPantryItems,
    countPantryItems,
    insertPantryItem,
    updatePantryItem,
    setPantryItemArchived,
    deletePantryItem,
  };
}
