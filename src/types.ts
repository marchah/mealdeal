// Shared contract between the ingest worker (writes) and the web/API (reads).

/** A deal as extracted by the LLM from one email, before it is stored. */
export interface ExtractedDeal {
  merchant: string;
  title: string;
  category?: string | null;
  item?: string | null;
  discountText?: string | null;
  discountPct?: number | null;
  code?: string | null;
  minSpend?: number | null;
  url?: string | null;
  startsAt?: string | null; // ISO date, e.g. "2026-07-08"
  expiresAt?: string | null; // ISO date
}

/** A stored deal row (merchant joined in by name). */
export interface Deal {
  id: number;
  merchant: string;
  title: string;
  category: string | null;
  item: string | null;
  discountText: string | null;
  discountPct: number | null;
  code: string | null;
  minSpend: number | null;
  url: string | null;
  sourceAlias: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  rawExcerpt: string | null;
  createdAt: string;
}

export type PrefKind = 'mute' | 'watchlist';
export type PrefScope = 'item' | 'category';

export interface TrackingPref {
  id: number;
  kind: PrefKind;
  scope: PrefScope;
  value: string;
  createdAt: string;
}

/** A fetched email handed to the extractor. */
export interface FetchedEmail {
  uid: number;
  from: string;
  toAlias: string | null; // the plus-address it was sent to, if detectable
  subject: string;
  date: string; // ISO
  text: string; // best-effort plain text body (HTML stripped/converted)
}
