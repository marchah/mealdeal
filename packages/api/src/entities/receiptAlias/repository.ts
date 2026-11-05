import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { ServerError } from '../../common/errors';
import { receiptAliases } from '../../db/schema';
import type { Db } from '../../db/client';
import type { NewReceiptAlias, ReceiptAlias, ReceiptAliasRepository } from './types';

// The ONLY layer that imports the db. Composes Drizzle queries into the ReceiptAliasRepository port.
export function receiptAliasRepositoryFactory({ db }: { db: Db }): ReceiptAliasRepository {
  async function findReceiptAliasByMatchKey(merchantId: string, matchKey: string) {
    const rows = await db
      .select()
      .from(receiptAliases)
      .where(and(eq(receiptAliases.merchantId, merchantId), eq(receiptAliases.matchKey, matchKey)))
      .limit(1);
    return rows[0] ?? null;
  }

  // One statement on the (merchant_id, match_key) unique index, so two confirms learning the same
  // name cannot race each other into a constraint error.
  async function upsertReceiptAlias(alias: NewReceiptAlias): Promise<ReceiptAlias> {
    const rows = await db
      .insert(receiptAliases)
      .values({ id: randomUUID(), ...alias })
      .onConflictDoUpdate({
        target: [receiptAliases.merchantId, receiptAliases.matchKey],
        set: {
          printedText: alias.printedText,
          pantryItemId: alias.pantryItemId,
          sizeAmount: alias.sizeAmount,
          sizeUnit: alias.sizeUnit,
          ignored: alias.ignored,
          updatedAt: sql`(unixepoch())`,
        },
      })
      .returning();
    const upserted = rows[0];
    if (!upserted) throw new ServerError('upsertReceiptAlias returned no row');
    return upserted;
  }

  async function deleteReceiptAlias(id: string) {
    const rows = await db.delete(receiptAliases).where(eq(receiptAliases.id, id)).returning();
    return rows[0] ?? null;
  }

  return { findReceiptAliasByMatchKey, upsertReceiptAlias, deleteReceiptAlias };
}
