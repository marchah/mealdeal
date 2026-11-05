import type { Maybe } from '../../lib/types';

// Words for the pipeline's states. The list says every one of them in text: a colour or an icon
// alone tells a screen reader, or a colour-blind reader, nothing.

const STATUS_LABELS: Record<string, string> = {
  // Queued or under way: receipts are read one at a time, and the list says so.
  UPLOADED: 'Reading the photos',
  OCR_DONE: 'Reading the lines',
  PARSED: 'Read',
  READY: 'Matched, ready for review',
  CONFIRMED: 'Confirmed',
  FAILED: 'Failed',
};

const STAGE_LABELS: Record<string, string> = {
  OCR: 'reading the photos',
  PARSE: 'reading the lines',
  MATCH: 'matching the lines',
};

const FLAG_LABELS: Record<string, string> = {
  SUBTOTAL_MISMATCH: 'The lines do not add up to the printed subtotal.',
  TOTAL_MISMATCH: 'The subtotal and tax do not add up to the printed total.',
  ITEM_COUNT_MISMATCH: 'The number of lines does not match the item count the receipt prints.',
  POSSIBLE_DUPLICATE:
    'Possibly a duplicate: another receipt has the same store, purchase day and total.',
};

/** Still moving through the background pipeline, so worth polling for. */
export function isProcessing(status: string): boolean {
  return status === 'UPLOADED' || status === 'OCR_DONE';
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function failureLabel(stage: Maybe<string>): string {
  const during = stage === null ? undefined : STAGE_LABELS[stage];
  return during ? `Failed while ${during}` : 'Failed';
}

export function flagLabel(flag: string): string {
  return FLAG_LABELS[flag] ?? flag;
}
