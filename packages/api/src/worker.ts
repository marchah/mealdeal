import { logException, logInfo } from './common/logger';
import { runMigrations } from './db/migrate';
import { scheduleIngest } from './ingest/run';
import { getServices } from './services';

// Standalone worker entrypoint — run the ingest scheduler in its own process for anyone
// who wants process isolation instead of the server's inline cron (INGEST_INLINE=0).
async function main(): Promise<void> {
  await runMigrations();
  await getServices().couponTypeService.seedCouponTypes();
  scheduleIngest();
  logInfo('ingest scheduler running', { tag: 'WORKER' });
}

void main().catch((error: unknown) => {
  logException(error, { tag: 'WORKER' });
  process.exit(1);
});
