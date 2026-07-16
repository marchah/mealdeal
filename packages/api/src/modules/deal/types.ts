import type { Maybe } from '../../common/types';

// ── Ports for the deal module. This is the CANONICAL module — copy this shape for new
// entities. Services depend on these interfaces; only the repository touches the db.

/** A stored deal (domain shape; omits internal columns like dedup_hash). */
export interface Deal {
  id: string;
  merchantId: string;
  title: string;
  category: Maybe<string>;
  item: Maybe<string>;
  discountText: Maybe<string>;
  discountPct: Maybe<number>;
  price: Maybe<number>;
  currency: Maybe<string>;
  code: Maybe<string>;
  minSpend: Maybe<number>;
  url: Maybe<string>;
  sourceAlias: Maybe<string>;
  startsAt: Maybe<Date>;
  expiresAt: Maybe<Date>;
  createdAt: Date;
}

export interface ListDealsInput {
  activeOnly: boolean;
  category: Maybe<string>;
}

/** A deal ready to persist (produced by the ingest pipeline after dedup-hashing). */
export interface NewDeal {
  merchantId: string;
  title: string;
  category: Maybe<string>;
  item: Maybe<string>;
  discountText: Maybe<string>;
  discountPct: Maybe<number>;
  price: Maybe<number>;
  currency: Maybe<string>;
  code: Maybe<string>;
  minSpend: Maybe<number>;
  url: Maybe<string>;
  sourceAlias: Maybe<string>;
  startsAt: Maybe<Date>;
  expiresAt: Maybe<Date>;
  rawExcerpt: Maybe<string>;
  dedupHash: string;
}

export interface Stats {
  totalDeals: number;
  activeDeals: number;
  merchants: number;
  lastIngestAt: Maybe<Date>;
}

export interface DealRepository {
  listAll(input: ListDealsInput): Promise<Deal[]>;
  findByIds(ids: readonly string[]): Promise<Deal[]>;
  findById(id: string): Promise<Maybe<Deal>>;
  listByMerchant(merchantId: string): Promise<Deal[]>;
  insertIfNew(deal: NewDeal): Promise<boolean>;
  count(): Promise<number>;
}

export interface DealService {
  listDeals(input: ListDealsInput): Promise<Deal[]>;
  getById(id: string): Promise<Deal>;
  dealsByMerchant(merchantId: string): Promise<Deal[]>;
  getStats(): Promise<Stats>;
  /** Persist a deal produced by ingest; returns false if it was a dedup no-op. */
  add(deal: NewDeal): Promise<boolean>;
}
