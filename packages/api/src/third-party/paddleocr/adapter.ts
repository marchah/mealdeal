import { z } from 'zod';
import { OcrServiceError, ValidationError } from '../../common/errors';
import type { OcrSettings } from '../../common/settings';
import type { ReceiptPhotoInput } from '../../entities/receipt/types';

/** The OCR service refuses more too (deploy/ocr/server.py); a 12 MP JPEG is 3–8 MB. */
const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
/** A receipt's boxes are tens of kilobytes of JSON. */
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

const PaddleOcrPageSchema = z.object({
  engine: z.string().trim().min(1),
  seconds: z.number().nonnegative(),
  boxes: z.array(
    z.object({
      text: z.string(),
      score: z.number().min(0).max(1),
      // Axis-aligned, in the photo's pixels: [left, top, right, bottom].
      box: z
        .tuple([z.number(), z.number(), z.number(), z.number()])
        .refine(([left, top, right, bottom]) => left <= right && top <= bottom, {
          message: 'box corners out of order',
        }),
    }),
  ),
});

export type PaddleOcrPage = z.infer<typeof PaddleOcrPageSchema>;
export type PaddleOcrBox = PaddleOcrPage['boxes'][number];

export interface PaddleOcrClient {
  /** Every text box the engine found on one photo, in no particular order. */
  readPhotoTextBoxes: (photo: ReceiptPhotoInput) => Promise<PaddleOcrPage>;
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError';
}

// Node's fetch says only "fetch failed"; the reason (ECONNREFUSED, a DNS miss) is its cause.
function describeFailure(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? `${error.message} (${error.cause.message})` : error.message;
}

/** Stops reading at the cap instead of buffering whatever the far end decides to send. */
async function readCapped(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (declared > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new OcrServiceError(`OCR service response is over ${MAX_RESPONSE_BYTES} bytes`);
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new OcrServiceError(`OCR service response is over ${MAX_RESPONSE_BYTES} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function errorDetail(body: string): string {
  try {
    const parsed = z.object({ error: z.string() }).safeParse(JSON.parse(body));
    if (parsed.success) return parsed.data.error;
  } catch {
    // Not JSON: a proxy's error page, say. Its first line is still worth reporting.
  }
  return body.split('\n', 1)[0]?.slice(0, 200) ?? '';
}

/**
 * Transport for the PP-OCRv6 service in deploy/ocr/: one photo in, its text boxes out, with a
 * timeout and both directions capped. Rebuilding rows from the boxes is the service's job.
 */
export function paddleocrAdapterFactory({ config }: { config: OcrSettings }): PaddleOcrClient {
  const endpoint = new URL(
    'ocr',
    config.OCR_BASE_URL.endsWith('/') ? config.OCR_BASE_URL : `${config.OCR_BASE_URL}/`,
  );

  async function readPhotoTextBoxes(photo: ReceiptPhotoInput) {
    if (photo.bytes.byteLength > MAX_PHOTO_BYTES) {
      throw new ValidationError(`A receipt photo must be at most ${MAX_PHOTO_BYTES} bytes`);
    }

    let body: string;
    let status: number;
    try {
      // The signal covers the body as well as the headers: a service that stalls mid-answer
      // times out like one that never answers.
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': photo.contentType, accept: 'application/json' },
        // Copied: fetch takes a view over a plain ArrayBuffer, which a Node Buffer may not be.
        body: new Uint8Array(photo.bytes),
        signal: AbortSignal.timeout(config.OCR_TIMEOUT_SECONDS * 1000),
      });
      status = response.status;
      body = await readCapped(response);
    } catch (error) {
      if (error instanceof OcrServiceError) throw error;
      if (isTimeout(error)) {
        throw new OcrServiceError(
          `OCR service did not answer within ${config.OCR_TIMEOUT_SECONDS} s`,
        );
      }
      throw new OcrServiceError(`OCR service request failed: ${describeFailure(error)}`);
    }

    if (status < 200 || status >= 300) {
      throw new OcrServiceError(`OCR service answered ${status}: ${errorDetail(body)}`);
    }
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new OcrServiceError('OCR service answered with something that is not JSON');
    }
    const parsed = PaddleOcrPageSchema.safeParse(json);
    if (!parsed.success) {
      throw new OcrServiceError(
        `OCR service answered in an unexpected shape: ${z.prettifyError(parsed.error)}`,
      );
    }
    return parsed.data;
  }

  return { readPhotoTextBoxes };
}
