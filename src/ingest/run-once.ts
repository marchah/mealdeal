// One-shot ingest for testing: `npm run ingest:once`
import { loadConfig } from '../config.ts';
import { Db } from '../db/db.ts';
import { runIngest } from './worker.ts';

const cfg = loadConfig();
const db = new Db(cfg.databasePath);
try {
  const r = await runIngest(cfg, db);
  console.log(`ingest: ${r.messages} messages, ${r.added} new deals`);
  process.exit(0);
} catch (e) {
  console.error('ingest failed:', e instanceof Error ? e.message : e);
  process.exit(1);
}
