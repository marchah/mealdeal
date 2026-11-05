import { rmSync } from 'node:fs';

// Vitest globalSetup for the integration suite. DATABASE_URL is set by the `test:integration` script to a
// file: DB (NOT :memory: — runMigrations() and getServices() open separate libsql clients that must share
// the same file). Reset the file and apply the committed drizzle migrations before the suite; delete it after.
function dbFiles(): string[] {
  // eslint-disable-next-line no-restricted-properties -- test harness locating the configured test DB
  const url = process.env.DATABASE_URL ?? '';
  if (!url.startsWith('file:') || url.includes(':memory:')) {
    throw new Error(`integration tests need a file: DATABASE_URL (got "${url}")`);
  }
  const path = url.slice('file:'.length);
  return [path, `${path}-shm`, `${path}-wal`];
}

// Receipt photos the suite writes. Wiped before and after, so it must never be a real photo
// directory: the `test:integration` script points it at one of its own.
function receiptsDir(): string {
  // eslint-disable-next-line no-restricted-properties -- test harness locating the configured photo dir
  const dir = process.env.RECEIPTS_DIR ?? '';
  if (!dir.includes('integration')) {
    throw new Error(`integration tests need their own RECEIPTS_DIR (got "${dir}")`);
  }
  return dir;
}

export default async function globalSetup(): Promise<() => void> {
  for (const f of dbFiles()) rmSync(f, { force: true });
  rmSync(receiptsDir(), { recursive: true, force: true });
  const { runMigrations } = await import('../../src/db/migrate');
  await runMigrations();
  return () => {
    for (const f of dbFiles()) rmSync(f, { force: true });
    rmSync(receiptsDir(), { recursive: true, force: true });
  };
}
