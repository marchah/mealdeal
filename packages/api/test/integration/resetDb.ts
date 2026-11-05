import { getTableName, is } from 'drizzle-orm';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { createDb } from '../../src/db/client';
import * as schema from '../../src/db/schema';

// Children before parents: SQLite refuses to delete a row that another table still references.
const TABLES: SQLiteTable[] = [
  schema.receiptLines,
  schema.receiptImages,
  schema.receiptAliases,
  schema.priceEntries,
  schema.receipts,
  schema.pantryItems,
  schema.deals,
  schema.newsletters,
  schema.merchants,
  schema.couponTypes,
  schema.trackingPrefs,
  schema.ingestRuns,
];

const missing = Object.values(schema).filter(
  (table) => is(table, SQLiteTable) && !TABLES.includes(table),
);
if (missing.length > 0) {
  throw new Error(`resetDb does not clear ${missing.map(getTableName).join(', ')}`);
}

const db = createDb();

// The suite shares one db file and its files run in any order, so each test starts from an empty
// db rather than clearing only the tables it seeds.
export async function resetDb(): Promise<void> {
  for (const table of TABLES) await db.delete(table);
}
