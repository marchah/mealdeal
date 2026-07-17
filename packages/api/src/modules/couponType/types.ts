import { type Maybe } from '../../common/types';

// ── Ports for the couponType module. This is the CANONICAL module — copy this shape for new
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
  listAll(): Promise<CouponType[]>;
  findByKey(key: string): Promise<Maybe<CouponType>>;
  insert(newCouponType: NewCouponType): Promise<CouponType>;
  count(): Promise<number>;
}

export interface CouponTypeService {
  getCouponTypes(): Promise<CouponType[]>;
  getCouponTypeByKey(key: string): Promise<Maybe<CouponType>>;
  seed(): Promise<void>;
}
