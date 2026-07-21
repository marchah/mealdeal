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

// Method names are entity-qualified (never a bare find/list/count/insert) so a factory can
// destructure them from an injected service without collisions.
export interface DealRepository {
  findDealById: (id: string) => Promise<Maybe<Deal>>;
  findDealsByIds: (ids: readonly string[]) => Promise<Deal[]>;
  listDeals: (input: ListDealsInput) => Promise<Deal[]>;
  countDeals: () => Promise<number>;
  insertDealIfNew: (deal: NewDeal) => Promise<boolean>;
}

export interface DealService {
  getDealById: (id: string) => Promise<Deal>;
  listDeals: (input: ListDealsInput) => Promise<Deal[]>;
  countDeals: () => Promise<number>;
  /** Persist a deal produced by ingest; returns false if it was a dedup no-op. */
  addDeal: (deal: NewDeal) => Promise<boolean>;
  getDealCouponType: (deal: Deal) => Promise<Maybe<CouponType>>;
}
