import type { Maybe } from '../../common/types';
import type { CouponType } from '../couponType/types';

// ── Ports for the deal slice. This is the CANONICAL entity — copy this shape for new
// entities. Services depend on these interfaces; only the repository touches the db.

/** A stored deal (domain shape; omits internal columns like dedup_hash). */
export interface Deal {
  id: string;
  merchantId: string;
  couponTypeId: Maybe<string>;
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
  couponTypeId: Maybe<string>;
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

export interface DealRepository {
  listAll(input: ListDealsInput): Promise<Deal[]>;
  findByIds(ids: readonly string[]): Promise<Deal[]>;
  findById(id: string): Promise<Maybe<Deal>>;
  insertIfNew(deal: NewDeal): Promise<boolean>;
  count(): Promise<number>;
}

export interface DealService {
  listDeals(input: ListDealsInput): Promise<Deal[]>;
  getById(id: string): Promise<Deal>;
  getCouponType(deal: Deal): Promise<Maybe<CouponType>>;
  count(): Promise<number>;
  /** Persist a deal produced by ingest; returns false if it was a dedup no-op. */
  add(deal: NewDeal): Promise<boolean>;
}
