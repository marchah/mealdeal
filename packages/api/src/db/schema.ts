import { sql } from 'drizzle-orm';
import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// The persistence schema. This file + client.ts are the ONLY dialect-aware files:
// swapping to Postgres means re-expressing these tables with drizzle-orm/pg-core and
// changing the driver in client.ts — repositories (which import this) are the only
// other code that touches the db, so the blast radius is contained.

const timestamp = (name: string) => integer(name, { mode: 'timestamp' });
const now = sql`(unixepoch())`;

export const merchants = sqliteTable('merchants', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  createdAt: timestamp('created_at').notNull().default(now),
});

export const deals = sqliteTable('deals', {
  id: text('id').primaryKey(),
  merchantId: text('merchant_id')
    .notNull()
    .references(() => merchants.id),
  title: text('title').notNull(),
  category: text('category'),
  item: text('item'),
  discountText: text('discount_text'),
  discountPct: real('discount_pct'),
  price: real('price'),
  currency: text('currency'),
  code: text('code'),
  minSpend: real('min_spend'),
  url: text('url'),
  sourceAlias: text('source_alias'),
  // deals dedup on this hash (stable across re-ingests of the same offer)
  dedupHash: text('dedup_hash').notNull().unique(),
  startsAt: timestamp('starts_at'),
  expiresAt: timestamp('expires_at'),
  rawExcerpt: text('raw_excerpt'),
  createdAt: timestamp('created_at').notNull().default(now),
});

export const trackingPrefs = sqliteTable(
  'tracking_prefs',
  {
    id: text('id').primaryKey(),
    kind: text('kind', { enum: ['mute', 'watchlist'] }).notNull(),
    scope: text('scope', { enum: ['item', 'category'] }).notNull(),
    value: text('value').notNull(),
    createdAt: timestamp('created_at').notNull().default(now),
  },
  (t) => [uniqueIndex('tracking_prefs_kind_scope_value').on(t.kind, t.scope, t.value)],
);

export const ingestRuns = sqliteTable('ingest_runs', {
  id: text('id').primaryKey(),
  startedAt: timestamp('started_at').notNull().default(now),
  finishedAt: timestamp('finished_at'),
  messagesSeen: integer('messages_seen').notNull().default(0),
  dealsAdded: integer('deals_added').notNull().default(0),
  error: text('error'),
});
