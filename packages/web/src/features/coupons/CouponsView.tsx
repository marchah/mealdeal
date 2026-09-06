import { Button } from '../../components/ui/button';
import { useHashRoute } from '../../lib/useHashRoute';
import { DealsList } from '../deals/DealsList';
import { NearMeView } from '../nearMe/NearMeView';
import { CouponIngestBanner } from './CouponIngestBanner';
import { COUPONS_NEAR_ME_PATH, COUPONS_PATH } from './routes';

const COUPON_VIEWS = [
  { label: 'Browse deals', path: COUPONS_PATH },
  { label: 'Near me', path: COUPONS_NEAR_ME_PATH },
];

export function CouponsView() {
  const { path, navigate } = useHashRoute();
  const activePath = path === COUPONS_NEAR_ME_PATH ? COUPONS_NEAR_ME_PATH : COUPONS_PATH;

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
      {activePath === COUPONS_NEAR_ME_PATH ? <NearMeView /> : <DealsList />}
    </>
  );
}
