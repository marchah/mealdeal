import { defineConfig } from 'vitest/config';

// Integration tests live in test/integration/ (unit tests stay in src/**/*.spec.ts). They run against a
// real, migrated file-backed libsql DB (see the `test:integration` script + global-setup.ts). Single
// worker: runMigrations() and getServices() open separate libsql clients that must share ONE db file, and
// the suite writes to it, so concurrent workers would race.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/integration/**/*.spec.ts'],
    globalSetup: ['./test/integration/global-setup.ts'],
    fileParallelism: false,
    hookTimeout: 30_000,
  },
});
