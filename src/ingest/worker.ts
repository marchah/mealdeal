import { createHash } from 'node:crypto';
import { imapConfigured, type Config } from '../config.ts';
import type { Db } from '../db/db.ts';
import type { ExtractedDeal } from '../types.ts';
import { fetchUnseen } from './imap.ts';
import { extractDeals } from './extract.ts';

/** One ingest pass: fetch unseen mail → LLM extract → dedup + store. Logged to ingest_runs. */
export async function runIngest(cfg: Config, db: Db): Promise<{ messages: number; added: number }> {
  if (!imapConfigured(cfg)) throw new Error('IMAP not configured (set IMAP_USER / IMAP_PASSWORD)');
  const runId = db.startIngestRun();
  let messages = 0;
  let added = 0;
  let error: string | null = null;
  try {
    const emails = await fetchUnseen(cfg);
    messages = emails.length;
    for (const email of emails) {
      const deals = await extractDeals(cfg, email);
      for (const deal of deals) {
        if (db.upsertDeal(deal, email.toAlias, email.text.slice(0, 280), dedupHash(deal))) added++;
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  } finally {
    db.finishIngestRun(runId, messages, added, error);
  }
  if (error) throw new Error(error);
  return { messages, added };
}

function dedupHash(d: ExtractedDeal): string {
  const key = [d.merchant, d.title, d.code ?? '', d.expiresAt ?? ''].join('|').toLowerCase();
  return createHash('sha256').update(key).digest('hex');
}
