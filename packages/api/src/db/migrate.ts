import { migrate } from 'drizzle-orm/libsql/migrator';
import { settings } from '../common/settings';
import { createDb } from './client';

// Applies committed drizzle-kit migrations using the libsql driver. Run standalone
// (`pnpm db:migrate`) or from server startup.
//
// The folder (settings.migrationsDir) is resolved relative to the process working directory,
// not import.meta.url: after bundling this code lives in a shared chunk whose path is not the
// source path, so a URL-relative lookup would break. cwd is `packages/api` in dev and `/app`
// in the container, and `drizzle/` sits at the root of both.
export async function runMigrations(): Promise<void> {
  const db = createDb();
  await migrate(db, { migrationsFolder: settings.migrationsDir });
}

// Executed directly as a script (pnpm db:migrate / node dist/db/migrate.js).
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => {
      console.log('[migrate] migrations applied');
    })
    .catch((err: unknown) => {
      console.error('[migrate] failed', err);
      process.exit(1);
    });
}
