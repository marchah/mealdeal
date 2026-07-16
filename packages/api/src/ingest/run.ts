import { createHash } from 'node:crypto';
import cron from 'node-cron';
import { getServices, type Services } from '../services';
import type { NewDeal } from '../modules/deal/types';
import {
  extractorConfigFromEnv,
  llmExtractorFactory,
  type DealExtractor,
  type ExtractedDeal,
} from './extractor';
import { imapClientFactory, imapConfigFromEnv, type ImapClient } from './imap';

export interface IngestDeps {
  imap: ImapClient;
  extractor: DealExtractor;
  services: Services;
}

export interface IngestResult {
  messagesSeen: number;
  dealsAdded: number;
  messagesFailed: number;
}

// Stable dedup key so re-ingesting the same offer is a no-op (see deals.dedup_hash).
function dedupHash(merchant: string, deal: ExtractedDeal): string {
  const key = [merchant, deal.title, deal.expiresAt ?? '', deal.code ?? ''].join('|').toLowerCase();
  return createHash('sha256').update(key).digest('hex');
}

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * One ingest pass: fetch unseen mail → LLM-extract → dedup + store, recording an ingest_run.
 * Dependencies are injectable for tests / the /internal/ingest trigger.
 */
export async function ingestOnce(deps: Partial<IngestDeps> = {}): Promise<IngestResult> {
  const services = deps.services ?? getServices();
  const imapConfig = imapConfigFromEnv();
  const imap = deps.imap ?? (imapConfig ? imapClientFactory({ config: imapConfig }) : null);
  const extractor = deps.extractor ?? llmExtractorFactory({ config: extractorConfigFromEnv() });

  const runId = await services.ingestRunService.start();
  let messagesSeen = 0;
  let dealsAdded = 0;
  let messagesFailed = 0;
  try {
    if (!imap) {
      throw new Error('IMAP is not configured (set IMAP_HOST / IMAP_USER / IMAP_PASSWORD)');
    }
    const limit = Number(process.env.INGEST_BATCH ?? 25);
    const emails = await imap.fetchUnseen(limit);
    messagesSeen = emails.length;

    // Process each message independently; collect only those whose deals were durably
    // stored so we can acknowledge exactly those. A failed message stays unseen and is
    // retried next pass (at-least-once) — no permanent loss on a transient LLM/DB error.
    const processedUids: number[] = [];
    for (const email of emails) {
      try {
        const extracted = await extractor.extract(email);
        for (const deal of extracted) {
          const merchant = await services.merchantService.getOrCreate(deal.merchant);
          const newDeal: NewDeal = {
            merchantId: merchant.id,
            title: deal.title,
            category: deal.category ?? null,
            item: deal.item ?? null,
            discountText: deal.discountText ?? null,
            discountPct: deal.discountPct ?? null,
            price: deal.price ?? null,
            currency: deal.currency ?? null,
            code: deal.code ?? null,
            minSpend: deal.minSpend ?? null,
            url: deal.url ?? null,
            sourceAlias: email.from,
            startsAt: toDate(deal.startsAt),
            expiresAt: toDate(deal.expiresAt),
            rawExcerpt: email.text.slice(0, 500),
            dedupHash: dedupHash(deal.merchant, deal),
          };
          if (await services.dealService.add(newDeal)) dealsAdded += 1;
        }
        processedUids.push(email.uid);
      } catch (messageError) {
        messagesFailed += 1;
        console.error(
          `[ingest] message ${String(email.uid)} failed; leaving unseen for retry`,
          messageError,
        );
      }
    }
    // Acknowledge ONLY the messages we durably processed.
    await imap.markSeen(processedUids);

    // Partial failures are recorded (not fatal) so operators can see a pass needs attention.
    await services.ingestRunService.finish(runId, {
      messagesSeen,
      dealsAdded,
      messagesFailed,
      error:
        messagesFailed > 0
          ? `${String(messagesFailed)} of ${String(messagesSeen)} messages failed`
          : null,
    });
    return { messagesSeen, dealsAdded, messagesFailed };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await services.ingestRunService.finish(runId, {
      messagesSeen,
      dealsAdded,
      messagesFailed,
      error: message,
    });
    throw error;
  }
}

/** Schedule recurring passes (node-cron). No-ops on an invalid cron expression. */
export function scheduleIngest(): void {
  const expr = process.env.INGEST_CRON ?? '*/30 * * * *';
  if (!cron.validate(expr)) {
    console.warn(`[ingest] invalid INGEST_CRON "${expr}"; not scheduling`);
    return;
  }
  cron.schedule(expr, () => {
    void ingestOnce()
      .then((result) => {
        console.log(
          `[ingest] pass complete: ${String(result.messagesSeen)} seen, ${String(result.dealsAdded)} added`,
        );
      })
      .catch((error: unknown) => {
        console.error('[ingest] pass failed', error);
      });
  });
  console.log(`[ingest] scheduled (${expr})`);
}
