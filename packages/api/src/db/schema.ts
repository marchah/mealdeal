import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { Unit } from '../common/units';
import type { PriceSource } from '../entities/priceEntry/types';
import type {
  ReceiptFlag,
  ReceiptLineDecision,
  ReceiptLineFlag,
  ReceiptMatchSource,
  ReceiptStage,
  ReceiptStatus,
} from '../entities/receipt/types';
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
    // set null, not cascade: deleting a receipt keeps the prices it produced — the history is the
    // precious part, the same reasoning as `archived`. drizzle-kit drops ON DELETE when it ADDs a
    // referencing column to an existing table, so a column like this one is generated in two
    // steps: the plain column, then the reference, which rebuilds the table with the clause.
    receiptId: text('receipt_id').references(() => receipts.id, { onDelete: 'set null' }),
    // When the price was SEEN, which is not when the row was written — a receipt gets logged late.
    observedAt: timestamp('observed_at').notNull().default(now),
    createdAt: timestamp('created_at').notNull().default(now),
  },
  (t) => [index('price_entries_item_observed').on(t.pantryItemId, t.observedAt)],
);

export const receipts = sqliteTable(
  'receipts',
  {
    id: text('id').primaryKey(),
    // Null until the parse names the store.
    merchantId: text('merchant_id').references(() => merchants.id),
    purchasedAt: timestamp('purchased_at'),
    status: text('status').$type<ReceiptStatus>().notNull(),
    // Set only while status is FAILED: the stage a retry restarts at, and why it stopped.
    failedStage: text('failed_stage').$type<ReceiptStage>(),
    error: text('error'),
    // Kept so a better prompt can re-parse without re-reading the photo (docs/PLAN.md decision 4).
    ocrText: text('ocr_text'),
    ocrEngine: text('ocr_engine'),
    subtotal: real('subtotal'),
    tax: real('tax'),
    total: real('total'),
    imageHash: text('image_hash'),
    // Stored rather than derived: the item-count check compares against a count the receipt
    // prints and no column holds.
    flags: text('flags', { mode: 'json' }).$type<ReceiptFlag[]>().notNull().default([]),
    createdAt: timestamp('created_at').notNull().default(now),
  },
  // The upload's duplicate check answers with a message; this keeps two uploads of the same
  // photos racing past it from both landing. NULLs (a receipt with no photos) never collide.
  (t) => [uniqueIndex('receipts_image_hash').on(t.imageHash)],
);

export const receiptImages = sqliteTable(
  'receipt_images',
  {
    id: text('id').primaryKey(),
    receiptId: text('receipt_id')
      .notNull()
      .references(() => receipts.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    // Relative to RECEIPTS_DIR, so the data volume can move without rewriting rows.
    path: text('path').notNull(),
    contentType: text('content_type').notNull(),
    bytes: integer('bytes').notNull(),
  },
  (t) => [uniqueIndex('receipt_images_receipt_position').on(t.receiptId, t.position)],
);

export const receiptLines = sqliteTable(
  'receipt_lines',
  {
    id: text('id').primaryKey(),
    receiptId: text('receipt_id')
      .notNull()
      .references(() => receipts.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    itemNumber: text('item_number'),
    printedText: text('printed_text').notNull(),
    description: text('description'),
    quantity: real('quantity').notNull().default(1),
    unitPrice: real('unit_price'),
    weight: real('weight'),
    weightUnit: text('weight_unit').$type<Unit>(),
    lineTotal: real('line_total').notNull(),
    discount: real('discount'),
    taxFlag: text('tax_flag'),
    flags: text('flags', { mode: 'json' }).$type<ReceiptLineFlag[]>().notNull().default([]),
    // set null on both links: losing an item or an entry un-matches the line rather than erasing
    // what the receipt printed.
    pantryItemId: text('pantry_item_id').references(() => pantryItems.id, {
      onDelete: 'set null',
    }),
    sizeAmount: real('size_amount'),
    sizeUnit: text('size_unit').$type<Unit>(),
    matchSource: text('match_source').$type<ReceiptMatchSource>(),
    decision: text('decision').$type<ReceiptLineDecision>().notNull(),
    priceEntryId: text('price_entry_id').references(() => priceEntries.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [uniqueIndex('receipt_lines_receipt_position').on(t.receiptId, t.position)],
);

export const receiptAliases = sqliteTable(
  'receipt_aliases',
  {
    id: text('id').primaryKey(),
    merchantId: text('merchant_id')
      .notNull()
      .references(() => merchants.id),
    matchKey: text('match_key').notNull(),
    printedText: text('printed_text').notNull(),
    // cascade, not set null: an alias left pointing at nothing would be neither a match nor an
    // ignore. Null here means `ignored`.
    pantryItemId: text('pantry_item_id').references(() => pantryItems.id, { onDelete: 'cascade' }),
    sizeAmount: real('size_amount'),
    sizeUnit: text('size_unit').$type<Unit>(),
    ignored: integer('ignored', { mode: 'boolean' }).notNull().default(false),
    createdAt: timestamp('created_at').notNull().default(now),
    updatedAt: timestamp('updated_at').notNull().default(now),
  },
  // One learned name per (store, match key) — docs/PLAN.md decision 5.
  (t) => [uniqueIndex('receipt_aliases_merchant_match_key').on(t.merchantId, t.matchKey)],
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
