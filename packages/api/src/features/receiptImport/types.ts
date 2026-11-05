import type { ReceiptOcrInput, ReceiptPhotoInput } from '../../entities/receipt/types';

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
