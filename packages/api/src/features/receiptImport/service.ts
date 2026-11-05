import {
  ConflictError,
  NotFoundError,
  ReceiptImportDisabledError,
  ValidationError,
} from '../../common/errors';
import { logException, logInfo, logWarning } from '../../common/logger';
import type { Maybe } from '../../common/types';
import type { MerchantService } from '../../entities/merchant/types';
import {
  ReceiptFlag,
  ReceiptStage,
  ReceiptStatus,
  type AddReceiptInput,
  type Receipt,
  type ReceiptPhotoInput,
  type ReceiptService,
} from '../../entities/receipt/types';
import type { ReceiptParserService } from '../receiptParser/types';
import type { ReceiptImportService, ReceiptTextReader } from './types';

/** Where each stage starts from — and so the status a retry of that stage puts back. */
const STATUS_BEFORE: Record<ReceiptStage, ReceiptStatus> = {
  [ReceiptStage.OCR]: ReceiptStatus.UPLOADED,
  [ReceiptStage.PARSE]: ReceiptStatus.OCR_DONE,
  [ReceiptStage.MATCH]: ReceiptStatus.PARSED,
};

/** A restart can leave a receipt at either; PARSED is the last stage until matching lands. */
const UNFINISHED: readonly ReceiptStatus[] = [ReceiptStatus.UPLOADED, ReceiptStatus.OCR_DONE];

// Retrying cannot help here — the engine reads the same photo the same way — so the message
// points at the photo, not at the retry button.
const NO_TEXT_READ =
  'No text could be read from the photos. Delete this receipt and upload a sharper, closer photo.';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

// The parser reads a receipt's printed time in the server's zone, so its calendar day is too.
function purchaseDay(purchasedAt: Date): { purchasedFrom: Date; purchasedBefore: Date } {
  const year = purchasedAt.getFullYear();
  const month = purchasedAt.getMonth();
  const day = purchasedAt.getDate();
  return {
    purchasedFrom: new Date(year, month, day),
    purchasedBefore: new Date(year, month, day + 1),
  };
}

// The pipeline. The OCR port is injected whole and first — null when OCR_BASE_URL is unset,
// which turns receipt import off — and the collaborator services destructured to what is used.
export function receiptImportServiceFactory({
  receiptTextReader,
  receiptService: {
    getReceiptById,
    listReceipts,
    listReceiptsByPurchase,
    listReceiptImages,
    readReceiptImage,
    addReceipt,
    updateReceiptStatus,
    updateReceiptOcrText,
    updateReceiptParse,
    recordReceiptFailure,
  },
  merchantService: { listMerchants, getOrCreateMerchant },
  receiptParserService: { parseReceiptText },
}: {
  receiptTextReader: Maybe<ReceiptTextReader>;
  receiptService: ReceiptService;
  merchantService: MerchantService;
  receiptParserService: ReceiptParserService;
}): ReceiptImportService {
  // One receipt at a time, in the order queued: OCR takes the OCR host's whole CPU and the parse
  // the LLM's, so running two at once would only make both slower. Per factory, not per module,
  // so every service graph — and every test — has a queue of its own.
  const queue: string[] = [];
  let draining = false;

  function queueReceipt(id: string) {
    if (queue.includes(id)) return;
    queue.push(id);
    if (draining) return;
    draining = true;
    void drainQueue();
  }

  async function drainQueue() {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      await processReceipt(id);
    }
    // Cleared in the same synchronous step as the empty check, so a receipt queued just after
    // it still finds the queue idle and starts it.
    draining = false;
  }

  async function processReceipt(id: string) {
    let receipt: Receipt;
    try {
      receipt = await getReceiptById(id);
    } catch (error) {
      if (error instanceof NotFoundError) {
        logInfo('a queued receipt was deleted before it was read', {
          tag: 'RECEIPT',
          extra: { receiptId: id },
        });
        return;
      }
      logException(error, { tag: 'RECEIPT', extra: { receiptId: id } });
      return;
    }
    // Each stage runs only from the status that precedes it, so a retried parse never re-reads
    // the photos and a receipt queued twice does its work once.
    if (receipt.status === ReceiptStatus.UPLOADED) {
      const read = await runStage(receipt, ReceiptStage.OCR, readReceiptPhotos);
      if (!read) return;
      receipt = read;
    }
    if (receipt.status === ReceiptStatus.OCR_DONE) {
      await runStage(receipt, ReceiptStage.PARSE, parseReceipt);
    }
  }

  async function runStage(
    receipt: Receipt,
    stage: ReceiptStage,
    work: (receipt: Receipt) => Promise<Receipt>,
  ): Promise<Maybe<Receipt>> {
    const startedAt = performance.now();
    try {
      const next = await work(receipt);
      const seconds = Math.round((performance.now() - startedAt) / 100) / 10;
      logInfo(`receipt ${stage} stage done in ${String(seconds)} s`, {
        tag: 'RECEIPT',
        extra: { receiptId: receipt.id, stage, seconds },
      });
      return next;
    } catch (error) {
      logException(error, { tag: 'RECEIPT', extra: { receiptId: receipt.id, stage } });
      try {
        await recordReceiptFailure(receipt.id, stage, errorMessage(error));
      } catch (recordError) {
        // Deleted while it was being read: there is no row left to record the failure on.
        logException(recordError, { tag: 'RECEIPT', extra: { receiptId: receipt.id, stage } });
      }
      return null;
    }
  }

  async function readReceiptPhotos(receipt: Receipt) {
    if (!receiptTextReader) throw new ReceiptImportDisabledError();
    const photos: ReceiptPhotoInput[] = [];
    // One at a time: a 12 MP photo is several megabytes, and the reader sends them in order anyway.
    for (const image of await listReceiptImages(receipt.id)) {
      photos.push({ bytes: await readReceiptImage(image), contentType: image.contentType });
    }
    const ocr = await receiptTextReader.readReceiptText(photos);
    // The parser can do nothing with no text, and OCR_DONE should mean there is text to parse.
    if (ocr.ocrText.trim() === '') throw new ValidationError(NO_TEXT_READ);
    return updateReceiptOcrText(receipt.id, ocr);
  }

  async function parseReceipt(receipt: Receipt) {
    const parsed = await parseReceiptText({
      ocrText: receipt.ocrText ?? '',
      knownStores: await listMerchants(),
    });
    // The parser names a store it does not know rather than inventing an id; it is created here.
    const merchantId =
      parsed.merchantId ??
      (parsed.storeName === null ? null : (await getOrCreateMerchant(parsed.storeName)).id);
    const isDuplicate = await hasPurchaseTwin(receipt.id, merchantId, parsed);
    return updateReceiptParse(receipt.id, {
      merchantId,
      purchasedAt: parsed.purchasedAt,
      subtotal: parsed.subtotal,
      tax: parsed.tax,
      total: parsed.total,
      lines: parsed.lines,
      flags: isDuplicate ? [...parsed.flags, ReceiptFlag.POSSIBLE_DUPLICATE] : parsed.flags,
    });
  }

  // Flagged, not refused: two trips to one store on one day for the same total are rare but real,
  // and a different photo of the same receipt is exactly what this cannot tell from one.
  async function hasPurchaseTwin(
    id: string,
    merchantId: Maybe<string>,
    { purchasedAt, total }: { purchasedAt: Maybe<Date>; total: Maybe<number> },
  ) {
    if (merchantId === null || purchasedAt === null || total === null) return false;
    const sameDay = await listReceiptsByPurchase({ merchantId, ...purchaseDay(purchasedAt) });
    return sameDay.some(
      (other) => other.id !== id && other.total !== null && toCents(other.total) === toCents(total),
    );
  }

  async function uploadReceipt(input: AddReceiptInput) {
    if (!receiptTextReader) throw new ReceiptImportDisabledError();
    const receipt = await addReceipt(input);
    queueReceipt(receipt.id);
    return receipt;
  }

  async function retryReceipt(id: string) {
    if (!receiptTextReader) throw new ReceiptImportDisabledError();
    const receipt = await getReceiptById(id);
    if (receipt.status !== ReceiptStatus.FAILED) {
      throw new ConflictError(
        `Only a failed receipt can be retried; this one is ${receipt.status}`,
      );
    }
    // A failure with no stage recorded starts over from the photos.
    const restarted = await updateReceiptStatus(
      id,
      STATUS_BEFORE[receipt.failedStage ?? ReceiptStage.OCR],
    );
    queueReceipt(id);
    return restarted;
  }

  async function resumeReceiptImports() {
    const unfinished = await listReceipts({ statuses: UNFINISHED });
    if (!receiptTextReader) {
      if (unfinished.length > 0) {
        logWarning(
          `${String(unfinished.length)} receipt(s) wait to be read, but receipt import is off (OCR_BASE_URL is unset)`,
          { tag: 'RECEIPT' },
        );
      }
      return 0;
    }
    // listReceipts answers newest first; the oldest upload was waiting longest.
    for (const receipt of unfinished.toReversed()) queueReceipt(receipt.id);
    if (unfinished.length > 0) {
      logInfo(`resuming ${String(unfinished.length)} receipt(s) left mid-pipeline`, {
        tag: 'RECEIPT',
      });
    }
    return unfinished.length;
  }

  return { uploadReceipt, retryReceipt, resumeReceiptImports };
}
