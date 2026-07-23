import { createHash } from 'node:crypto';
import cron from 'node-cron';
import { ServerError } from '../common/errors';
import { logException, logInfo, logWarning } from '../common/logger';
import { settings } from '../common/settings';
import type { Maybe } from '../common/types';
import type { CouponTypeService } from '../entities/couponType/types';
import { getServices, type Services } from '../services';
import type { NewDeal } from '../entities/deal/types';
import { llmExtractorFactory, type DealExtractor } from './extractor';
import { archiveCanonicalMarkdown } from './archive';
import type { EmailSource } from './email';
import { mdreamHtmlToMarkdownConverterFactory, type HtmlToMarkdownConverter } from './markdown';
import { emailSourceFactory } from './source';

/** Keep a single email within the local model's context budget before extraction. */
export const MAX_CANONICAL_BODY_LENGTH = 20_000;

export interface IngestDeps {
  emailSource: EmailSource;
  extractor: DealExtractor;
  htmlToMarkdown: HtmlToMarkdownConverter;
  services: Services;
  archiveDirectory: string | null;
}

export interface IngestResult {
  messagesSeen: number;
  dealsAdded: number;
  messagesFailed: number;
}

// Stable dedup key so re-ingesting the same offer is a no-op (see deals.dedup_hash). Keyed on the
// NORMALIZED expiry (ISO), not the raw LLM string, so "2026-08-01" and "2026-08-01T00:00:00Z" hash
// identically and don't slip past the dedup as two separate rows.
function dedupHash(
  merchant: string,
  title: string,
  expiresAt: Maybe<Date>,
  code: Maybe<string>,
): string {
  const key = [merchant, title, expiresAt?.toISOString() ?? '', code ?? ''].join('|').toLowerCase();
  return createHash('sha256').update(key).digest('hex');
}

function toDate(iso: Maybe<string> | undefined): Maybe<Date> {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function merchantAddressLookupKey(merchant: string, address: string): string {
  return [merchant, address]
    .map((value) => value.trim().replaceAll(/\s+/g, ' ').toLocaleLowerCase())
    .join('|');
}

function hasCompleteCoordinates(merchant: { lat: Maybe<number>; lng: Maybe<number> }): boolean {
  return merchant.lat !== null && merchant.lng !== null;
}

async function resolveCouponTypeId({
  couponTypeKey,
  hasOtherCouponType,
  getCouponTypeByKey,
  uid,
}: {
  couponTypeKey: Maybe<string> | undefined;
  hasOtherCouponType: boolean;
  getCouponTypeByKey: CouponTypeService['getCouponTypeByKey'];
  uid: number;
}): Promise<string> {
  if (!hasOtherCouponType) {
    throw new ServerError('Coupon type taxonomy is unavailable: missing required "other" type');
  }

  const key = couponTypeKey?.trim();
  if (key) {
    const couponType = await getCouponTypeByKey(key);
    if (couponType) return couponType.id;
    logWarning(`unknown couponTypeKey "${key}"; falling back to "other"`, {
      tag: 'INGEST',
      extra: { uid, couponTypeKey: key },
    });
  }

  const otherCouponType = await getCouponTypeByKey('other');
  if (!otherCouponType) {
    throw new ServerError('Coupon type taxonomy is unavailable: missing required "other" type');
  }
  return otherCouponType.id;
}

/** Prefer structured HTML converted to Markdown; otherwise retain the source plain-text part. */
export function canonicalEmailBody(
  email: { html: string | null; text: string },
  htmlToMarkdown: HtmlToMarkdownConverter,
): string {
  const body = email.html === null ? email.text : htmlToMarkdown.convert(email.html);
  return body.slice(0, MAX_CANONICAL_BODY_LENGTH);
}

/**
 * One ingest pass: fetch unseen mail → LLM-extract → dedup + store, recording an ingest_run.
 * Dependencies are injectable for tests / the /internal/ingest trigger.
 */
export async function ingestOnce(deps: Partial<IngestDeps> = {}): Promise<IngestResult> {
  const services = deps.services ?? getServices();
  const { getCouponTypes, getCouponTypeByKey } = services.couponTypeService;
  const emailSource = deps.emailSource ?? emailSourceFactory({ config: settings });
  const extractor = deps.extractor ?? llmExtractorFactory({ config: settings });
  const htmlToMarkdown = deps.htmlToMarkdown ?? mdreamHtmlToMarkdownConverterFactory();
  const archiveDirectory =
    deps.archiveDirectory ??
    (settings.INGEST_SOURCE === 'imap' ? settings.INGEST_ARCHIVE_DIR : null);

  const runId = await services.ingestRunService.startIngestRun();
  let messagesSeen = 0;
  let dealsAdded = 0;
  let messagesFailed = 0;
  const locationLookups = new Map<
    string,
    Promise<Awaited<ReturnType<Services['merchantService']['resolveMerchantLocation']>>>
  >();
  try {
    if (!emailSource) {
      throw new ServerError('IMAP is not configured (set IMAP_HOST / IMAP_USER / IMAP_PASSWORD)');
    }
    const emails = await emailSource.fetchUnseen(settings.INGEST_BATCH);
    messagesSeen = emails.length;
    const couponTypes = await getCouponTypes();
    const hasOtherCouponType = couponTypes.some((couponType) => couponType.key === 'other');

    // Process each message independently; collect only those whose deals were durably
    // stored so we can acknowledge exactly those. A failed message stays unseen and is
    // retried next pass (at-least-once) — no permanent loss on a transient LLM/DB error.
    const processedUids: number[] = [];
    for (const email of emails) {
      try {
        const body = canonicalEmailBody(email, htmlToMarkdown);
        if (archiveDirectory) {
          await archiveCanonicalMarkdown({ directory: archiveDirectory, email, body });
        }
        const extracted = await extractor.extract({
          subject: email.subject,
          from: email.from,
          body,
          couponTypes,
        });
        for (const deal of extracted) {
          const couponTypeId = await resolveCouponTypeId({
            couponTypeKey: deal.couponTypeKey,
            hasOtherCouponType,
            getCouponTypeByKey,
            uid: email.uid,
          });
          let merchant = await services.merchantService.getOrCreateMerchant(deal.merchant);
          const address = deal.merchantAddress?.trim();
          if (!address) {
            logWarning('merchant address missing; skipping location enrichment', {
              tag: 'INGEST',
              extra: { uid: email.uid, merchant: deal.merchant },
            });
          } else {
            const key = merchantAddressLookupKey(deal.merchant, address);
            let locationLookup = locationLookups.get(key);
            if (!locationLookup) {
              locationLookup = services.merchantService
                .resolveMerchantLocation(merchant, address)
                .then((locatedMerchant) => {
                  if (
                    !hasCompleteCoordinates(merchant) &&
                    !hasCompleteCoordinates(locatedMerchant)
                  ) {
                    logWarning('merchant address did not resolve; continuing deal storage', {
                      tag: 'INGEST',
                      extra: { uid: email.uid, merchant: deal.merchant },
                    });
                  }
                  return locatedMerchant;
                })
                .catch((error: unknown) => {
                  logWarning('merchant location enrichment failed; continuing deal storage', {
                    tag: 'INGEST',
                    extra: {
                      uid: email.uid,
                      merchant: deal.merchant,
                      error: error instanceof Error ? error.name : 'UnknownError',
                    },
                  });
                  return merchant;
                });
              locationLookups.set(key, locationLookup);
            }
            merchant = await locationLookup;
          }
          const expiresAt = toDate(deal.expiresAt);
          if (deal.expiresAt && !expiresAt) {
            logWarning(
              `unparseable expiresAt "${deal.expiresAt}" for "${deal.title}"; treating as no expiry`,
              { tag: 'INGEST', extra: { uid: email.uid } },
            );
          }
          const newDeal: NewDeal = {
            merchantId: merchant.id,
            couponTypeId,
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
            expiresAt,
            rawExcerpt: body.slice(0, 500),
            dedupHash: dedupHash(deal.merchant, deal.title, expiresAt, deal.code ?? null),
          };
          if (await services.dealService.addDeal(newDeal)) dealsAdded += 1;
        }
        processedUids.push(email.uid);
      } catch (messageError) {
        messagesFailed += 1;
        logException(messageError, { tag: 'INGEST', extra: { uid: email.uid } });
      }
    }
    // Acknowledge ONLY the messages we durably processed.
    await emailSource.markSeen(processedUids);

    // Partial failures are recorded (not fatal) so operators can see a pass needs attention.
    await services.ingestRunService.finishIngestRun(runId, {
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
    await services.ingestRunService.finishIngestRun(runId, {
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
  const expr = settings.INGEST_CRON;
  if (!cron.validate(expr)) {
    logWarning(`invalid INGEST_CRON "${expr}"; not scheduling`, { tag: 'INGEST' });
    return;
  }
  cron.schedule(expr, () => {
    void ingestOnce()
      .then((result) => {
        logInfo(
          `pass complete: ${String(result.messagesSeen)} seen, ${String(result.dealsAdded)} added`,
          { tag: 'INGEST' },
        );
      })
      .catch((error: unknown) => {
        logException(error, { tag: 'INGEST' });
      });
  });
  logInfo(`scheduled (${expr})`, { tag: 'INGEST' });
}
