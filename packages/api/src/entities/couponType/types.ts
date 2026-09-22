import { type Maybe } from '../../common/types';

// ── Ports for the couponType slice. This is the CANONICAL entity — copy this shape for new
// entities. Services depend on these interfaces; only the repository touches the db.

/** A stored coupon type (domain shape; omits internal columns like createdAt). */
export interface CouponType {
  id: string;
  key: string;
  label: string;
  createdAt: Date;
}

export interface NewCouponType {
  key: string;
  label: string;
}

export interface CouponTypeRepository {
  listCouponTypes: () => Promise<CouponType[]>;
  findCouponTypeById: (id: string) => Promise<Maybe<CouponType>>;
  findCouponTypesByIds: (ids: readonly string[]) => Promise<CouponType[]>;
  findCouponTypeByKey: (key: string) => Promise<Maybe<CouponType>>;
  /** Insert the row, but no-op if `key` already exists (atomic). Makes seeding repairable. */
  upsertCouponTypeByKey: (newCouponType: NewCouponType) => Promise<void>;
}

export interface CouponTypeService {
  getCouponTypes: () => Promise<CouponType[]>;
  findCouponTypeById: (id: string) => Promise<Maybe<CouponType>>;
  /** Batch form for the per-request DataLoader; ids may repeat and may not all match. */
  findCouponTypesByIds: (ids: readonly string[]) => Promise<CouponType[]>;
  getCouponTypeByKey: (key: string) => Promise<Maybe<CouponType>>;
  seedCouponTypes: () => Promise<void>;
}
