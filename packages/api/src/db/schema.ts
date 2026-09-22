import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { Unit } from '../common/units';
import type { PriceSource } from '../entities/priceEntry/types';
import type { PrefKind, PrefScope } from '../entities/trackingPref/types';

// The persistence schema. This file + client.ts are the ONLY dialect-aware files:
// swapping to Postgres means re-expressing these tables with drizzle-orm/pg-core and
// changing the driver in client.ts — repositories (which import this) are the only
// other code that touches the db, so the blast radius is contained.

const timestamp = (name: string) => integer(name, { mode: 'timestamp' });
const now = sql`(unixepoch())`;

export const couponTypes = sqliteTable('coupon_types', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  createdAt: timestamp('created_at').notNull().default(now),
});

export const merchants = sqliteTable('merchants', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  address: text('address'),
  lat: real('lat'),
  lng: real('lng'),
  createdAt: timestamp('created_at').notNull().default(now),
});

export const newsletters = sqliteTable('newsletters', {
  id: text('id').primaryKey(),
  merchantId: text('merchant_id')
    .notNull()
    .references(() => merchants.id),
  name: text('name').notNull(),
  signupUrl: text('signup_url').notNull(),
  // Recommendations are opt-in; an omitted addNewsletter argument therefore stores false.
  recommended: integer('recommended', { mode: 'boolean' }).notNull().default(false),
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
  // links deal to a CouponType category (nullable FK)
  couponTypeId: text('coupon_type_id').references(() => couponTypes.id, {
    onDelete: 'set null',
  }),
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
    kind: text('kind', { enum: ['MUTE', 'WATCHLIST'] })
      .$type<PrefKind>()
      .notNull(),
    scope: text('scope', { enum: ['ITEM', 'CATEGORY'] })
      .$type<PrefScope>()
      .notNull(),
    value: text('value').notNull(),
    createdAt: timestamp('created_at').notNull().default(now),
  },
  (t) => [uniqueIndex('tracking_prefs_kind_scope_value').on(t.kind, t.scope, t.value)],
);

export const pantryItems = sqliteTable(
  'pantry_items',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    brand: text('brand'),
    // The pantry category reuses the seeded coupon-type taxonomy rather than a parallel table, so
    // a coupon and a pantry item speak one vocabulary (docs/PLAN.md decision 1).
    couponTypeId: text('coupon_type_id').references(() => couponTypes.id, {
      onDelete: 'set null',
    }),
    imageUrl: text('image_url'),
    // The pack this item usually comes in — a default for the log-a-price form. Nullable because
    // an item bought loose (bananas, deli meat) has no pack size, only a unit price.
    sizeAmount: real('size_amount'),
    sizeUnit: text('size_unit').$type<Unit>(),
    // Which unit the unit price READS in ($/oz vs $/gal); storage stays canonical. Required, and
    // load-bearing beyond display: it fixes the item's dimension, which is what lets a price entry
    // measured in the wrong dimension be rejected.
    unitPriceUnit: text('unit_price_unit').$type<Unit>().notNull(),
    // "Buy at or below", as a UNIT price in unit_price_unit — $0.12 a fluid ounce, not $18 a jug,
    // so it survives a change of pack size. Overrides the history-based verdict (see priceInsight).
    targetPrice: real('target_price'),
    notes: text('notes'),
    // Soft delete: hiding an item must never destroy the price history that took months to build.
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
    createdAt: timestamp('created_at').notNull().default(now),
  },
  // No uniqueness constraint here on purpose. The rule wanted is case- and null-folded
  // (lower(name) + coalesce(lower(brand),'')), because a plain UNIQUE(name, brand) lets both
  // "Tide"/"tide" and two unbranded "paper towels" through — but drizzle-kit splits an expression
  // index on the comma inside coalesce() and emits SQL that fails at migration time. The rule
  // lives in pantryItemService instead, where it also yields a better message than a constraint
  // violation would.
);

export const priceEntries = sqliteTable(
  'price_entries',
  {
    id: text('id').primaryKey(),
    pantryItemId: text('pantry_item_id')
      .notNull()
      .references(() => pantryItems.id, { onDelete: 'cascade' }),
    // Nullable: a price seen online belongs to no store. Reuses merchants, so the history can
    // answer "cheapest at Costco" without a second notion of where things are bought.
    merchantId: text('merchant_id').references(() => merchants.id),
    price: real('price').notNull(),
    currency: text('currency').notNull().default('USD'),
    // The pack actually seen, which may differ from the item's usual size — that difference is
    // the entire point of recording it.
    sizeAmount: real('size_amount').notNull(),
    sizeUnit: text('size_unit').$type<Unit>().notNull(),
    // Identical packs bought together: a 2-pack of 46 oz bottles is quantity 2, size 46.
    quantity: real('quantity').notNull().default(1),
    // price / (size in base units x quantity), normalized on write. Denormalized deliberately:
    // it makes differently-sized packs comparable and reduces "is this a good deal" to an
    // aggregate over one indexed column (docs/PLAN.md decision 2).
    unitPrice: real('unit_price').notNull(),
    onSale: integer('on_sale', { mode: 'boolean' }).notNull().default(false),
    source: text('source').$type<PriceSource>().notNull(),
    url: text('url'),
    note: text('note'),
    // When the price was SEEN, which is not when the row was written — a receipt gets logged late.
    observedAt: timestamp('observed_at').notNull().default(now),
    createdAt: timestamp('created_at').notNull().default(now),
  },
  (t) => [index('price_entries_item_observed').on(t.pantryItemId, t.observedAt)],
);

export const ingestRuns = sqliteTable('ingest_runs', {
  id: text('id').primaryKey(),
  startedAt: timestamp('started_at').notNull().default(now),
  finishedAt: timestamp('finished_at'),
  messagesSeen: integer('messages_seen').notNull().default(0),
  dealsAdded: integer('deals_added').notNull().default(0),
  // Per-message processing failures in the pass (left unseen for retry). >0 = needs attention.
  messagesFailed: integer('messages_failed').notNull().default(0),
  error: text('error'),
});
