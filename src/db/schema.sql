-- MealDeal schema (SQLite). Applied idempotently on startup.

CREATE TABLE IF NOT EXISTS merchants (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deals (
  id            INTEGER PRIMARY KEY,
  merchant_id   INTEGER REFERENCES merchants(id),
  title         TEXT NOT NULL,
  category      TEXT,            -- e.g. produce, dairy, electronics
  item          TEXT,            -- specific item if identifiable
  discount_text TEXT,            -- human-readable, e.g. "25% off" / "BOGO"
  discount_pct  REAL,            -- numeric if parseable
  code          TEXT,            -- coupon code if any
  min_spend     REAL,
  url           TEXT,
  source_alias  TEXT,            -- the plus-address that received it (source attribution)
  starts_at     TEXT,            -- ISO date
  expires_at    TEXT,            -- ISO date; deals past this are treated as expired
  raw_excerpt   TEXT,            -- short snippet of the source email, for provenance
  dedup_hash    TEXT NOT NULL UNIQUE,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_deals_expires  ON deals(expires_at);
CREATE INDEX IF NOT EXISTS idx_deals_category ON deals(category);

-- Mute ("stop tracking this") and watchlist ("alert me on this"), per item or category.
CREATE TABLE IF NOT EXISTS tracking_prefs (
  id         INTEGER PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('mute', 'watchlist')),
  scope      TEXT NOT NULL CHECK (scope IN ('item', 'category')),
  value      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (kind, scope, value)
);

-- One row per ingest pass, for observability.
CREATE TABLE IF NOT EXISTS ingest_runs (
  id            INTEGER PRIMARY KEY,
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at   TEXT,
  messages_seen INTEGER DEFAULT 0,
  deals_added   INTEGER DEFAULT 0,
  error         TEXT
);
