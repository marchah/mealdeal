import type {
  AddReceiptInput,
  Receipt,
  ReceiptOcrInput,
  ReceiptPhotoInput,
} from '../../entities/receipt/types';

// Ports for the receipt import pipeline (docs/PLAN.md slice 4), which reads a receipt's photos,
// parses the text and matches the lines. The OCR engine sits behind ReceiptTextReader.

/** Adapter port: the OCR stage (docs/PLAN.md decision 4). */
export interface ReceiptTextReader {
  /**
   * Photos of ONE receipt, in page order, read into its printed rows — one row per line, each
   * photo's rows after the previous photo's — and the engine that read them. A photo with no
   * readable text adds no rows. Throws OcrServiceError when the OCR service fails or times out.
   */
  readReceiptText: (photos: readonly ReceiptPhotoInput[]) => Promise<ReceiptOcrInput>;
}

/**
 * The background pipeline (docs/PLAN.md decision 7): OCR, then parse, one receipt at a time, each
 * stage writing its output and the receipt's status before the next starts. While no OCR service
 * is configured, upload and retry throw ReceiptImportDisabledError and resume queues nothing.
 */
export interface ReceiptImportService {
  /** Stores the photos as an UPLOADED receipt and answers with it; the reading happens later. */
  uploadReceipt: (input: AddReceiptInput) => Promise<Receipt>;
  /** Restarts a FAILED receipt at the stage that failed; ConflictError for any other status. */
  retryReceipt: (id: string) => Promise<Receipt>;
  /** Queues the receipts a restart left mid-pipeline, oldest first, and answers how many. */
  resumeReceiptImports: () => Promise<number>;
}
