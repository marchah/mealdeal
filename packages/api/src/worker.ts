import { logException, logInfo, logWarning } from './common/logger';
import { settings } from './common/settings';
import { runMigrations } from './db/migrate';
import { scheduleIngest } from './ingest/run';
import { getServices } from './services';

// Standalone worker entrypoint — run the ingest scheduler in its own process for anyone
// who wants process isolation instead of the server's inline cron (INGEST_INLINE=0).
async function main(): Promise<void> {
  await runMigrations();
  await getServices().couponTypeService.seedCouponTypes();
  scheduleIngest();
  if (!settings.COUPON_INGEST_ENABLED) {
    // Nothing was scheduled, so the event loop drains and this process exits immediately. Warn
    // rather than inform: starting a worker that has no work is an operator misconfiguration.
    logWarning(
      'nothing to schedule — coupon newsletter ingestion is paused (COUPON_INGEST_ENABLED=false); exiting',
      { tag: 'WORKER' },
    );
    return;
  }
  logInfo('ingest scheduler running', { tag: 'WORKER' });
}

void main().catch((error: unknown) => {
  logException(error, { tag: 'WORKER' });
  process.exit(1);
});
