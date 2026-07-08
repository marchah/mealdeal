import cron from 'node-cron';
import { loadConfig, imapConfigured } from './config.ts';
import { Db } from './db/db.ts';
import { createServer } from './server.ts';
import { runIngest } from './ingest/worker.ts';

const cfg = loadConfig();
const db = new Db(cfg.databasePath);
const app = createServer(cfg, db);

app.listen(cfg.port, '0.0.0.0', () => console.log(`MealDeal on :${cfg.port} (db ${cfg.databasePath})`));

function ingestNow(label: string): void {
  runIngest(cfg, db)
    .then((r) => console.log(`${label}: ${r.messages} messages, ${r.added} new deals`))
    .catch((e: unknown) => console.error(`${label} failed:`, e instanceof Error ? e.message : e));
}

if (imapConfigured(cfg)) {
  cron.schedule(cfg.ingestCron, () => ingestNow('ingest'));
  console.log(`ingest scheduled: ${cfg.ingestCron}`);
  if (cfg.ingestOnStart) ingestNow('startup ingest');
} else {
  console.log('IMAP not configured — ingestion disabled (web only). Set IMAP_* to enable.');
}
