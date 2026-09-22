export const COUPONS_PATH = '/coupons';
export const COUPONS_NEAR_ME_PATH = '/coupons/near-me';

/** True for `/coupons` and anything beneath it, so an unknown sub-path still lands on coupons. */
export function isCouponsPath(path: string): boolean {
  return path === COUPONS_PATH || path.startsWith(`${COUPONS_PATH}/`);
}
