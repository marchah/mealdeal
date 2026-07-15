import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Deal, TrackingPref, PrefKind, PrefScope, ExtractedDeal, IngestRunSummary } from '../types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

export class Db {
  private db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec(readFileSync(`${HERE}/schema.sql`, 'utf8'));
  }

  /** Active = not expired and not muted (by item or category). Newest first. */
  listActiveDeals(): Deal[] {
    const rows = this.db
      .prepare(
        `SELECT d.id, m.name AS merchant, d.title, d.category, d.item,
                d.discount_text AS discountText, d.discount_pct AS discountPct,
                d.code, d.min_spend AS minSpend, d.url, d.source_alias AS sourceAlias,
                d.starts_at AS startsAt, d.expires_at AS expiresAt,
                d.raw_excerpt AS rawExcerpt, d.created_at AS createdAt
           FROM deals d
           LEFT JOIN merchants m ON m.id = d.merchant_id
          WHERE (d.expires_at IS NULL OR d.expires_at >= date('now'))
            AND NOT EXISTS (
              SELECT 1 FROM tracking_prefs t
               WHERE t.kind = 'mute'
                 AND ((t.scope = 'item' AND t.value = d.item)
                   OR (t.scope = 'category' AND t.value = d.category)))
          ORDER BY d.created_at DESC`,
      )
      .all();
    return rows as unknown as Deal[];
  }

  /** Insert a deal (get-or-create its merchant). Returns true if newly added, false if a dup. */
  upsertDeal(d: ExtractedDeal, sourceAlias: string | null, rawExcerpt: string, dedupHash: string): boolean {
    this.db.prepare(`INSERT OR IGNORE INTO merchants (name) VALUES (?)`).run(d.merchant);
    const merchant = this.db.prepare(`SELECT id FROM merchants WHERE name = ?`).get(d.merchant) as
      | { id: number }
      | undefined;
    const res = this.db
      .prepare(
        `INSERT OR IGNORE INTO deals
           (merchant_id, title, category, item, discount_text, discount_pct, code, min_spend,
            url, source_alias, starts_at, expires_at, raw_excerpt, dedup_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        merchant?.id ?? null,
        d.title,
        d.category ?? null,
        d.item ?? null,
        d.discountText ?? null,
        d.discountPct ?? null,
        d.code ?? null,
        d.minSpend ?? null,
        d.url ?? null,
        sourceAlias,
        d.startsAt ?? null,
        d.expiresAt ?? null,
        rawExcerpt,
        dedupHash,
      );
    return res.changes > 0;
  }

  listPrefs(): TrackingPref[] {
    const rows = this.db
      .prepare(`SELECT id, kind, scope, value, created_at AS createdAt FROM tracking_prefs ORDER BY created_at DESC`)
      .all();
    return rows as unknown as TrackingPref[];
  }

  addPref(kind: PrefKind, scope: PrefScope, value: string): void {
    this.db
      .prepare(`INSERT OR IGNORE INTO tracking_prefs (kind, scope, value) VALUES (?, ?, ?)`)
      .run(kind, scope, value);
  }

  removePref(id: number): void {
    this.db.prepare(`DELETE FROM tracking_prefs WHERE id = ?`).run(id);
  }

  startIngestRun(): number {
    const res = this.db.prepare(`INSERT INTO ingest_runs DEFAULT VALUES`).run();
    return Number(res.lastInsertRowid);
  }

  finishIngestRun(id: number, messagesSeen: number, dealsAdded: number, error: string | null): void {
    this.db
      .prepare(
        `UPDATE ingest_runs SET finished_at = datetime('now'), messages_seen = ?, deals_added = ?, error = ? WHERE id = ?`,
      )
      .run(messagesSeen, dealsAdded, error, id);
  }

  /** Snapshot of ingest health + deal counts for observability. */
  getStats(): { totalDeals: number; activeDeals: number; lastIngest: IngestRunSummary | null } {
    const totalDeals = this.db.prepare('SELECT COUNT(*) AS count FROM deals').get() as { count: number };

    // Reuse the existing active-deal filter via listActiveDeals — same not-expired / not-muted logic.
    const activeDeals = this.listActiveDeals().length;

    const last = this.db
      .prepare(
        `SELECT id, started_at AS startedAt, finished_at AS finishedAt, messages_seen AS messagesSeen,
                deals_added AS dealsAdded, error
           FROM ingest_runs ORDER BY id DESC LIMIT 1`,
      )
      .get() as IngestRunSummary | undefined;

    return { totalDeals: totalDeals.count, activeDeals, lastIngest: last ?? null };
  }
}
