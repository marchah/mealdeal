import { Button } from '../../components/ui/button';
import { useHashRoute } from '../../lib/useHashRoute';
import { DealsList } from '../deals/DealsList';
import { NearMeView } from '../nearMe/NearMeView';
import { CouponIngestBanner } from './CouponIngestBanner';

export const COUPONS_PATH = '/coupons';
const NEAR_ME_PATH = '/coupons/near-me';

const COUPON_VIEWS = [
  { label: 'Browse deals', path: COUPONS_PATH },
  { label: 'Near me', path: NEAR_ME_PATH },
];

/** True for `/coupons` and anything beneath it, so an unknown sub-path still lands on coupons. */
export function isCouponsPath(path: string): boolean {
  return path === COUPONS_PATH || path.startsWith(`${COUPONS_PATH}/`);
}

export function CouponsView() {
  const { path, navigate } = useHashRoute();
  const activePath = path === NEAR_ME_PATH ? NEAR_ME_PATH : COUPONS_PATH;

  return (
    <>
      <CouponIngestBanner />
      <nav className="mt-4 flex gap-2" aria-label="Coupon views">
        {COUPON_VIEWS.map((view) => (
          <Button
            key={view.path}
            variant={activePath === view.path ? 'default' : 'outline'}
            aria-pressed={activePath === view.path}
            onClick={() => {
              navigate(view.path);
            }}
          >
            {view.label}
          </Button>
        ))}
      </nav>
      {activePath === NEAR_ME_PATH ? <NearMeView /> : <DealsList />}
    </>
  );
}
