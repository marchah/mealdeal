import { runMigrations } from './db/migrate';
import { scheduleIngest } from './ingest/run';

// Standalone worker entrypoint — run the ingest scheduler in its own process for anyone
// who wants process isolation instead of the server's inline cron (INGEST_INLINE=0).
async function main(): Promise<void> {
  await runMigrations();
  scheduleIngest();
  console.log('[worker] ingest scheduler running');
}

void main().catch((error: unknown) => {
  console.error('[worker] fatal', error);
  process.exit(1);
});
