import type { Maybe } from '../../common/types';
import type { Unit } from '../../common/units';

// Ports for the receipt slice — a photographed receipt, its photos and the lines read off it.
// Services depend on these interfaces; only the repository touches the db, and only the photo
// store touches the files.

/** Where a receipt is in the import pipeline (docs/PLAN.md decision 7). */
export enum ReceiptStatus {
  UPLOADED = 'UPLOADED',
  OCR_DONE = 'OCR_DONE',
  PARSED = 'PARSED',
  READY = 'READY',
  CONFIRMED = 'CONFIRMED',
  /** Stopped at `failedStage`; a retry restarts there. */
  FAILED = 'FAILED',
}

/** A background stage that can fail. Confirm is not one: it is a request that answers its caller. */
export enum ReceiptStage {
  OCR = 'OCR',
  PARSE = 'PARSE',
  MATCH = 'MATCH',
}

export enum ReceiptLineDecision {
  PENDING = 'PENDING',
  INCLUDE = 'INCLUDE',
  /** Not saved from this receipt only. */
  EXCLUDE = 'EXCLUDE',
  /** Not saved, and learned as an ignore for this store. */
  IGNORE_ALWAYS = 'IGNORE_ALWAYS',
}

/** Why a line points at the item it does. */
export enum ReceiptMatchSource {
  /** A learned receipt name at this store. */
  ALIAS = 'ALIAS',
  /** The LLM's guess — never confirmed without review (docs/PLAN.md decision 6). */
  SUGGESTED = 'SUGGESTED',
  MANUAL = 'MANUAL',
}

/** A check the parser computes in code rather than trusting the model. */
export enum ReceiptLineFlag {
  /** quantity × unit price ≠ line total: usually a misread digit or a missed line. */
  LINE_TOTAL_MISMATCH = 'LINE_TOTAL_MISMATCH',
  /** weight × unit price ≠ line total: a misread weight row, or one attached to the wrong item. */
  WEIGHT_TOTAL_MISMATCH = 'WEIGHT_TOTAL_MISMATCH',
}

/** A receipt-level check the parser computes in code — the net for a misread or missed line. */
export enum ReceiptFlag {
  /** Line totals less discounts ≠ the printed subtotal. */
  SUBTOTAL_MISMATCH = 'SUBTOTAL_MISMATCH',
  /** Subtotal (or, with none printed, the lines) + tax ≠ the printed total. */
  TOTAL_MISMATCH = 'TOTAL_MISMATCH',
  /** The receipt prints an item count that matches neither the lines nor their quantities. */
  ITEM_COUNT_MISMATCH = 'ITEM_COUNT_MISMATCH',
  /** Another receipt has the same store, purchase day and total: perhaps the same trip twice. */
  POSSIBLE_DUPLICATE = 'POSSIBLE_DUPLICATE',
}

export interface Receipt {
  id: string;
  merchantId: Maybe<string>;
  purchasedAt: Maybe<Date>;
  status: ReceiptStatus;
  failedStage: Maybe<ReceiptStage>;
  error: Maybe<string>;
  ocrText: Maybe<string>;
  ocrEngine: Maybe<string>;
  subtotal: Maybe<number>;
  tax: Maybe<number>;
  total: Maybe<number>;
  /** Over the photos' bytes, in order — catches the same photo uploaded twice. */
  imageHash: Maybe<string>;
  flags: ReceiptFlag[];
  createdAt: Date;
}

export interface ReceiptImage {
  id: string;
  receiptId: string;
  position: number;
  /** Relative to the photo store's root; only the store resolves it. */
  path: string;
  contentType: string;
  bytes: number;
}

export interface ReceiptLine {
  id: string;
  receiptId: string;
  position: number;
  itemNumber: Maybe<string>;
  printedText: string;
  description: Maybe<string>;
  quantity: number;
  unitPrice: Maybe<number>;
  weight: Maybe<number>;
  weightUnit: Maybe<Unit>;
  lineTotal: number;
  discount: Maybe<number>;
  taxFlag: Maybe<string>;
  flags: ReceiptLineFlag[];
  pantryItemId: Maybe<string>;
  sizeAmount: Maybe<number>;
  sizeUnit: Maybe<Unit>;
  matchSource: Maybe<ReceiptMatchSource>;
  decision: ReceiptLineDecision;
  /** The entry confirm created from this line — what makes a re-run of confirm idempotent. */
  priceEntryId: Maybe<string>;
}

export interface ListReceiptsInput {
  /** Null lists every receipt. */
  statuses: Maybe<readonly ReceiptStatus[]>;
}

/** One store's receipts bought in [purchasedFrom, purchasedBefore). */
export interface ListReceiptsByPurchaseInput {
  merchantId: string;
  purchasedFrom: Date;
  purchasedBefore: Date;
}

export interface ReceiptPhotoInput {
  bytes: Uint8Array;
  contentType: string;
}

export interface AddReceiptInput {
  /** In page order: a long receipt is several photos. */
  photos: readonly ReceiptPhotoInput[];
}

export interface ReceiptOcrInput {
  ocrText: string;
  ocrEngine: string;
}

/** A line as the parser read it. Matching and review fill in the rest later. */
export interface ParsedReceiptLine {
  itemNumber: Maybe<string>;
  printedText: string;
  description: Maybe<string>;
  quantity: number;
  unitPrice: Maybe<number>;
  weight: Maybe<number>;
  weightUnit: Maybe<Unit>;
  lineTotal: number;
  discount: Maybe<number>;
  taxFlag: Maybe<string>;
  flags: ReceiptLineFlag[];
}

export interface ReceiptParseInput {
  merchantId: Maybe<string>;
  purchasedAt: Maybe<Date>;
  subtotal: Maybe<number>;
  tax: Maybe<number>;
  total: Maybe<number>;
  /** In printed order; replaces whatever an earlier parse stored. */
  lines: readonly ParsedReceiptLine[];
  /** The receipt-level checks; replaces the earlier parse's. */
  flags: ReceiptFlag[];
}

/** What matching suggests, or review settles. Replaces the line's previous match. */
export interface ReceiptLineMatchInput {
  pantryItemId: Maybe<string>;
  sizeAmount: Maybe<number>;
  sizeUnit: Maybe<Unit>;
  matchSource: Maybe<ReceiptMatchSource>;
  decision: ReceiptLineDecision;
}

export interface NewReceiptImage {
  path: string;
  contentType: string;
  bytes: number;
}

export interface NewReceipt {
  status: ReceiptStatus;
  imageHash: string;
  images: readonly NewReceiptImage[];
}

/** The receipt columns a stage writes; an omitted key is left as it is. */
export type ReceiptUpdate = Partial<
  Pick<
    Receipt,
    | 'merchantId'
    | 'purchasedAt'
    | 'status'
    | 'failedStage'
    | 'error'
    | 'ocrText'
    | 'ocrEngine'
    | 'subtotal'
    | 'tax'
    | 'total'
    | 'flags'
  >
>;

/** Adapter port: where receipt photos' bytes live (docs/PLAN.md decision 8). */
export interface ReceiptPhotoStore {
  /** Throws NotFoundError when no photo is stored at `path`. */
  readReceiptPhoto: (path: string) => Promise<Uint8Array>;
  /** Stores the bytes under a fresh path, which it returns. */
  saveReceiptPhoto: (bytes: Uint8Array) => Promise<string>;
  /** A photo that is already gone is not an error. */
  deleteReceiptPhoto: (path: string) => Promise<void>;
}

export interface ReceiptRepository {
  findReceiptById: (id: string) => Promise<Maybe<Receipt>>;
  findReceiptByImageHash: (imageHash: string) => Promise<Maybe<Receipt>>;
  /** Every image of every receipt asked for, in page order within each receipt. */
  findReceiptImagesByReceiptIds: (receiptIds: readonly string[]) => Promise<ReceiptImage[]>;
  /** Every line of every receipt asked for, in printed order within each receipt. */
  findReceiptLinesByReceiptIds: (receiptIds: readonly string[]) => Promise<ReceiptLine[]>;
  /** Newest first. */
  listReceipts: (input: ListReceiptsInput) => Promise<Receipt[]>;
  listReceiptsByPurchase: (input: ListReceiptsByPurchaseInput) => Promise<Receipt[]>;
  /** In page order. */
  listReceiptImages: (receiptId: string) => Promise<ReceiptImage[]>;
  /** In printed order. */
  listReceiptLines: (receiptId: string) => Promise<ReceiptLine[]>;
  /** The receipt and its images, in one transaction. */
  insertReceipt: (receipt: NewReceipt) => Promise<Receipt>;
  // Writes return the affected row (RETURNING) and read null as "no such row".
  updateReceipt: (id: string, update: ReceiptUpdate) => Promise<Maybe<Receipt>>;
  /** Writes `update` and swaps the receipt's lines for `lines`, in one transaction. */
  replaceReceiptLines: (
    id: string,
    update: ReceiptUpdate,
    lines: readonly ParsedReceiptLine[],
  ) => Promise<Maybe<Receipt>>;
  updateReceiptLineMatch: (
    lineId: string,
    match: ReceiptLineMatchInput,
  ) => Promise<Maybe<ReceiptLine>>;
  updateReceiptLinePriceEntry: (
    lineId: string,
    priceEntryId: string,
  ) => Promise<Maybe<ReceiptLine>>;
  /** Its images and lines go with it; the price entries it produced stay, unlinked. */
  deleteReceipt: (id: string) => Promise<Maybe<Receipt>>;
}

export interface ReceiptService {
  getReceiptById: (id: string) => Promise<Receipt>;
  findReceiptImagesByReceiptIds: (receiptIds: readonly string[]) => Promise<ReceiptImage[]>;
  findReceiptLinesByReceiptIds: (receiptIds: readonly string[]) => Promise<ReceiptLine[]>;
  listReceipts: (input: ListReceiptsInput) => Promise<Receipt[]>;
  listReceiptsByPurchase: (input: ListReceiptsByPurchaseInput) => Promise<Receipt[]>;
  listReceiptImages: (receiptId: string) => Promise<ReceiptImage[]>;
  listReceiptLines: (receiptId: string) => Promise<ReceiptLine[]>;
  readReceiptImage: (image: ReceiptImage) => Promise<Uint8Array>;
  /**
   * Stores the photos, then creates the receipt as UPLOADED. Throws ConflictError when the same
   * photos, in the same order, are already a receipt.
   */
  addReceipt: (input: AddReceiptInput) => Promise<Receipt>;
  /** Moves the receipt on and clears any recorded failure. FAILED goes through recordReceiptFailure. */
  updateReceiptStatus: (id: string, status: ReceiptStatus) => Promise<Receipt>;
  /** The OCR stage's output, and OCR_DONE with it. */
  updateReceiptOcrText: (id: string, input: ReceiptOcrInput) => Promise<Receipt>;
  /** The parse stage's output — header and lines — and PARSED with it. Re-running replaces. */
  updateReceiptParse: (id: string, input: ReceiptParseInput) => Promise<Receipt>;
  updateReceiptLineMatch: (lineId: string, input: ReceiptLineMatchInput) => Promise<ReceiptLine>;
  updateReceiptLinePriceEntry: (lineId: string, priceEntryId: string) => Promise<ReceiptLine>;
  /** Deletes the rows, then the photos. */
  deleteReceipt: (id: string) => Promise<Receipt>;
  /** FAILED, with the stage a retry restarts at. */
  recordReceiptFailure: (id: string, stage: ReceiptStage, error: string) => Promise<Receipt>;
}
