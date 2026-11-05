import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OcrServiceError, ValidationError } from '../../common/errors';
import type { ReceiptPhotoInput } from '../../entities/receipt/types';
import { paddleocrAdapterFactory, type PaddleOcrBox, type PaddleOcrClient } from './adapter';
import { paddleocrServiceFactory, rebuildPrintedRows } from './service';

const ENGINE = 'PP-OCRv6_medium (paddleocr 3.7.0)';

function cell(text: string, [left, top, right, bottom]: number[], score = 0.99): PaddleOcrBox {
  return { text, score, box: [left ?? 0, top ?? 0, right ?? 0, bottom ?? 0] };
}

// A receipt's two columns, laid out flat: names on the left, prices on the right, one row every
// 70 px. The price box sits a few pixels lower than its name, as it did on slice 0's receipt.
function receiptRow(index: number, name: string, price: string): PaddleOcrBox[] {
  const top = 100 + index * 70;
  return [cell(name, [100, top, 700, top + 60]), cell(price, [1000, top + 6, 1250, top + 64])];
}

// The same layout photographed at an angle: each box is rotated about the origin and read back as
// the axis-aligned box an engine reports, which grows taller with the tilt.
function tilted(boxes: PaddleOcrBox[], degrees: number): PaddleOcrBox[] {
  const angle = (degrees * Math.PI) / 180;
  const rotate = (x: number, y: number) => [
    x * Math.cos(angle) - y * Math.sin(angle),
    x * Math.sin(angle) + y * Math.cos(angle),
  ];
  return boxes.map(({ text, score, box: [left, top, right, bottom] }) => {
    const corners = [
      rotate(left, top),
      rotate(right, top),
      rotate(left, bottom),
      rotate(right, bottom),
    ];
    const xs = corners.map(([x = 0]) => x);
    const ys = corners.map(([, y = 0]) => y);
    return cell(
      text,
      [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(Math.round),
      score,
    );
  });
}

const ITEMS: [string, string][] = [
  ['382719 Mixed Vegetables', '0.96 FB'],
  ['717662 Org Black Beans', '0.95 FB'],
  ['383071 Worcst/Steak Sauce', '1.99 FB'],
  ['602413 Alani Energy', '2.65 FE'],
  ['201336 Crunchy Peanut Btr', '1.59 FB'],
];
const ITEM_ROWS = ITEMS.map(([name, price]) => `${name}   ${price}`);

describe('rebuildPrintedRows', () => {
  it('rejoins a name with its price when the engine reads the page a column at a time', () => {
    const rows = ITEMS.map(([name, price], index) => receiptRow(index, name, price));
    const names = rows.map(([name]) => name).filter((box) => box !== undefined);
    const prices = rows.map(([, price]) => price).filter((box) => box !== undefined);

    expect(rebuildPrintedRows([...names, ...prices])).toEqual(ITEM_ROWS);
    // Order in, order out: the engine's box order is not the printed order.
    expect(rebuildPrintedRows([...prices.reverse(), ...names])).toEqual(ITEM_ROWS);
  });

  it('levels a tilted photo before grouping', () => {
    // At 5° a price sits ~60 px below its own name: nearer the next row's name than its own.
    for (const degrees of [5, -5]) {
      const boxes = tilted(
        ITEMS.flatMap(([name, price], index) => receiptRow(index, name, price)),
        degrees,
      );
      expect(rebuildPrintedRows(boxes), `${degrees}°`).toEqual(ITEM_ROWS);
    }
  });

  it('keeps an item name that wraps onto a second line as its own row, under the item', () => {
    const boxes = [
      ...receiptRow(0, '1234567 KS ORGANIC PEANUT', '12.99 N'),
      cell('BUTTER 2PK', [100, 170, 400, 230]),
      ...receiptRow(2, '7654321 KS PAPER TOWELS', '19.99 A'),
    ];
    expect(rebuildPrintedRows(boxes)).toEqual([
      '1234567 KS ORGANIC PEANUT   12.99 N',
      'BUTTER 2PK',
      '7654321 KS PAPER TOWELS   19.99 A',
    ]);
  });

  it('drops a low-confidence stray box beside a row', () => {
    // Slice 0's case: a "2" on the table beside a row, read at 0.32. Kept, it prints as the row's
    // first cell and the LLM read the row as quantity 2.
    const boxes = [
      ...receiptRow(0, '356419 Mangoes', '0.89 FB'),
      cell('2', [10, 175, 60, 225], 0.32),
      ...receiptRow(1, '356558 Envy Apples LRW', '1.34 FB'),
    ];
    expect(rebuildPrintedRows(boxes)).toEqual([
      '356419 Mangoes   0.89 FB',
      '356558 Envy Apples LRW   1.34 FB',
    ]);
  });

  it('keeps a box at the cutoff and drops one just under it', () => {
    const [name, price] = receiptRow(0, '356419 Mangoes', '0.89 FB');
    if (!name || !price) throw new Error('fixture row');
    expect(rebuildPrintedRows([name, { ...price, score: 0.5 }])).toEqual([
      '356419 Mangoes   0.89 FB',
    ]);
    expect(rebuildPrintedRows([name, { ...price, score: 0.4999 }])).toEqual(['356419 Mangoes']);
  });

  it('reads nothing from a photo with no text', () => {
    expect(rebuildPrintedRows([])).toEqual([]);
    expect(
      rebuildPrintedRows([cell('2', [10, 10, 60, 60], 0.32), cell('  ', [100, 100, 400, 160])]),
    ).toEqual([]);
  });
});

function makeService(pages: Record<string, PaddleOcrBox[]>, engine = () => ENGINE) {
  const readPhotoTextBoxes = vi.fn((photo: ReceiptPhotoInput) => {
    const boxes = pages[new TextDecoder().decode(photo.bytes)];
    if (!boxes) return Promise.reject(new OcrServiceError('OCR service answered 500: boom'));
    return Promise.resolve({ engine: engine(), seconds: 1, boxes });
  });
  const paddleocrClient: PaddleOcrClient = { readPhotoTextBoxes };
  return { service: paddleocrServiceFactory({ paddleocrClient }), readPhotoTextBoxes };
}

const photo = (name: string): ReceiptPhotoInput => ({
  bytes: new TextEncoder().encode(name),
  contentType: 'image/jpeg',
});

describe('paddleocrService', () => {
  it('reads one photo into its printed rows and names the engine', async () => {
    const { service } = makeService({
      page: ITEMS.flatMap(([name, price], index) => receiptRow(index, name, price)),
    });
    await expect(service.readReceiptText([photo('page')])).resolves.toEqual({
      ocrText: ITEM_ROWS.join('\n'),
      ocrEngine: ENGINE,
    });
  });

  it("concatenates a long receipt's photos in the order given, one at a time", async () => {
    const { service, readPhotoTextBoxes } = makeService({
      top: [cell('COSTCO WHOLESALE', [300, 50, 900, 110])],
      blank: [],
      bottom: receiptRow(0, '1234567 KS PAPER TOWELS', '19.99 A'),
    });

    const text = await service.readReceiptText([photo('top'), photo('blank'), photo('bottom')]);

    expect(text.ocrText).toBe('COSTCO WHOLESALE\n1234567 KS PAPER TOWELS   19.99 A');
    expect(
      readPhotoTextBoxes.mock.calls.map(([sent]) => new TextDecoder().decode(sent.bytes)),
    ).toEqual(['top', 'blank', 'bottom']);
  });

  it('returns empty text when no photo has any', async () => {
    const { service } = makeService({ blank: [] });
    await expect(service.readReceiptText([photo('blank')])).resolves.toEqual({
      ocrText: '',
      ocrEngine: ENGINE,
    });
  });

  it('names every engine when the photos were read by different ones', async () => {
    const engines = ['PP-OCRv6_medium (paddleocr 3.7.0)', 'PP-OCRv6_medium (paddleocr 3.8.0)'];
    const { service } = makeService({ one: [], two: [] }, () => engines.shift() ?? '');
    const text = await service.readReceiptText([photo('one'), photo('two')]);
    expect(text.ocrEngine).toBe(
      'PP-OCRv6_medium (paddleocr 3.7.0), PP-OCRv6_medium (paddleocr 3.8.0)',
    );
  });

  it('refuses a receipt with no photos without calling the service', async () => {
    const { service, readPhotoTextBoxes } = makeService({});
    await expect(service.readReceiptText([])).rejects.toBeInstanceOf(ValidationError);
    expect(readPhotoTextBoxes).not.toHaveBeenCalled();
  });

  it('lets an OCR failure through, so the pipeline can record it', async () => {
    const { service } = makeService({ first: [] });
    await expect(service.readReceiptText([photo('first'), photo('missing')])).rejects.toThrow(
      OcrServiceError,
    );
  });
});

// Slice 0's real receipt, end to end through the adapter: the boxes PP-OCRv6 medium returned for
// it, with card and terminal identifiers redacted exactly as slice 2's text fixture redacts them,
// must rebuild into that text fixture — the one the receipt parser is tested against.
describe('slice 0 receipt', () => {
  const fixture = (path: string) =>
    readFileSync(new URL(`../../../test/fixtures/${path}`, import.meta.url), 'utf8');

  afterEach(() => vi.unstubAllGlobals());

  it('rebuilds the text the receipt parser is tested against', async () => {
    const boxes = fixture('paddleocr/aldi-2026-11-02.json');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(boxes, { status: 200 }))),
    );
    const service = paddleocrServiceFactory({
      paddleocrClient: paddleocrAdapterFactory({
        config: { OCR_BASE_URL: 'http://ocr.example.test:8866', OCR_TIMEOUT_SECONDS: 300 },
      }),
    });

    const text = await service.readReceiptText([photo('aldi')]);

    expect(text.ocrText).toBe(fixture('receiptParser/aldi-2026-11-02.txt').trimEnd());
    expect(text.ocrEngine).toBe(ENGINE);
  });
});
