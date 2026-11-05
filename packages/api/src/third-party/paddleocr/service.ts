import { ValidationError } from '../../common/errors';
import type { Maybe } from '../../common/types';
import type { ReceiptPhotoInput } from '../../entities/receipt/types';
import type { ReceiptTextReader } from '../../features/receiptImport/types';
import type { PaddleOcrBox, PaddleOcrClient } from './adapter';

// Slice 0: every real box scored at least 0.84, and the one stray — a "2" on the table beside a
// row, at 0.32 — made the LLM read that row as quantity 2.
const MIN_SCORE = 0.5;
const CELL_SEPARATOR = '   ';

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function centre({ box: [left, top, right, bottom] }: PaddleOcrBox): [number, number] {
  return [(left + right) / 2, (top + bottom) / 2];
}

// Pairs each box with its nearest box to the right on roughly the same row — a name with its
// price — and takes the median slope between them, so a few mismatched pairs do not tip it.
function fitPageTilt(boxes: readonly PaddleOcrBox[], rowHeight: number): number {
  const slopes: number[] = [];
  for (const box of boxes) {
    const [x, y] = centre(box);
    let nearest: Maybe<[number, number]> = null;
    for (const other of boxes) {
      const [otherX, otherY] = centre(other);
      const isRightOfIt = otherX - x > rowHeight * 3 && Math.abs(otherY - y) < rowHeight * 0.9;
      if (isRightOfIt && (nearest === null || otherX < nearest[0])) nearest = [otherX, otherY];
    }
    if (nearest) slopes.push((nearest[1] - y) / (nearest[0] - x));
  }
  return slopes.length > 0 ? median(slopes) : 0;
}

/**
 * The engine reads a receipt as loose boxes — the name and the price of one row are two boxes,
 * often emitted a column apart — so the rows are rebuilt from where the boxes sit: drop the
 * low-confidence ones, level the page's tilt, group boxes whose centres lie within half a box
 * height of each other, and read each group left to right.
 */
export function rebuildPrintedRows(boxes: readonly PaddleOcrBox[]): string[] {
  const kept = boxes.filter((box) => box.score >= MIN_SCORE && box.text.trim() !== '');
  if (kept.length === 0) return [];
  const rowHeight = median(kept.map(({ box: [, top, , bottom] }) => bottom - top));
  const slope = fitPageTilt(kept, rowHeight);

  const levelled = kept
    .map((box) => {
      const [x, y] = centre(box);
      return { y: y - slope * x, left: box.box[0], text: box.text };
    })
    .sort((a, b) => a.y - b.y);

  const rows: (typeof levelled)[] = [];
  let row: typeof levelled = [];
  let rowY = 0;
  for (const cell of levelled) {
    if (row.length > 0 && Math.abs(cell.y - rowY) > rowHeight * 0.5) {
      rows.push(row);
      row = [];
    }
    row.push(cell);
    rowY = row.length === 1 ? cell.y : (rowY * (row.length - 1) + cell.y) / row.length;
  }
  rows.push(row);

  return rows.map((cells) =>
    [...cells]
      .sort((a, b) => a.left - b.left)
      .map((cell) => cell.text)
      .join(CELL_SEPARATOR),
  );
}

/** The anti-corruption layer over the PP-OCRv6 service: photos in, printed rows out. */
export function paddleocrServiceFactory({
  paddleocrClient,
}: {
  paddleocrClient: PaddleOcrClient;
}): ReceiptTextReader {
  async function readReceiptText(photos: readonly ReceiptPhotoInput[]) {
    if (photos.length === 0) throw new ValidationError('A receipt needs at least one photo');
    const rows: string[] = [];
    const engines = new Set<string>();
    // One photo at a time, in order: the service reads one at a time anyway, and a long
    // receipt's photos are its pages.
    for (const photo of photos) {
      const page = await paddleocrClient.readPhotoTextBoxes(photo);
      engines.add(page.engine);
      rows.push(...rebuildPrintedRows(page.boxes));
    }
    return { ocrText: rows.join('\n'), ocrEngine: [...engines].join(', ') };
  }

  return { readReceiptText };
}
