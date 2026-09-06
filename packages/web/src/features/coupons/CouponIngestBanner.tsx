import { useQuery } from 'urql';
import { graphql } from '../../graphql';

const AppConfigQuery = graphql(`
  query AppConfig {
    appConfig {
      couponIngestEnabled
      lastIngestAt
    }
  }
`);

const importDateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' });

function formatLastImport(lastIngestAt: string): string {
  const date = new Date(lastIngestAt);
  return Number.isNaN(date.getTime()) ? lastIngestAt : importDateFormat.format(date);
}

/**
 * Renders nothing while ingestion is running — the paused state is the exception worth a banner,
 * and a permanent "everything is fine" strip is noise. Failures stay silent too: the deals list
 * below already reports a broken API, and two error strips for one outage helps nobody.
 */
export function CouponIngestBanner() {
  const [{ data }] = useQuery({ query: AppConfigQuery });
  const appConfig = data?.appConfig;
  if (!appConfig || appConfig.couponIngestEnabled) return null;

  return (
    <aside
      role="status"
      className="mt-4 rounded-xl border border-border bg-muted p-4 text-sm"
      aria-labelledby="coupon-ingest-paused"
    >
      <p id="coupon-ingest-paused" className="font-medium">
        Coupon newsletter ingestion is paused
      </p>
      <p className="mt-1 text-muted-foreground">
        No new coupons are being imported. The coupons below are the ones already collected
        {appConfig.lastIngestAt
          ? `, last updated ${formatLastImport(appConfig.lastIngestAt)}.`
          : '.'}
      </p>
    </aside>
  );
}
