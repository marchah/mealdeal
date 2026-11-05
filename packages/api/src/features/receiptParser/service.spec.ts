import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ExtractionTruncatedError, ServerError, ValidationError } from '../../common/errors';
import type { Maybe } from '../../common/types';
import { Unit } from '../../common/units';
import { ReceiptFlag, ReceiptLineFlag, type ParsedReceiptLine } from '../../entities/receipt/types';
import type { JsonChatCompletion, JsonChatCompletionRequest } from '../../ingest/extractor';
import { receiptParserServiceFactory } from './service';
import type { ParsedReceipt } from './types';

// The Aldi receipt is slice 0's, redacted: card and terminal identifiers zeroed, items, prices,
// tax letters, totals and the date as printed. Its reply is the one the spike recorded from the
// model, with the descriptions corrected by hand. Every other receipt here is synthetic.
const fixture = (name: string) =>
  readFileSync(new URL(`../../../test/fixtures/receiptParser/${name}`, import.meta.url), 'utf8');
const ALDI_OCR_TEXT = fixture('aldi-2026-11-02.txt');
const ALDI_REPLY = fixture('aldi-2026-11-02.reply.json');

const KNOWN_STORES = [
  { id: 'merchant-costco', name: 'Costco' },
  { id: 'merchant-aldi', name: 'Aldi' },
];

const aldiLine = (
  itemNumber: string,
  printedText: string,
  description: string,
  price: number,
  taxFlag = 'FB',
): ParsedReceiptLine => ({
  itemNumber,
  printedText,
  description,
  quantity: 1,
  unitPrice: price,
  weight: null,
  weightUnit: null,
  lineTotal: price,
  discount: null,
  taxFlag,
  flags: [],
});

const weighedAldiLine = (
  itemNumber: string,
  printedText: string,
  description: string,
  weight: number,
  unitPrice: number,
  lineTotal: number,
): ParsedReceiptLine => ({
  ...aldiLine(itemNumber, printedText, description, lineTotal),
  unitPrice,
  weight,
  weightUnit: Unit.POUND,
});

// Verified against the paper receipt: 31 items summing to the printed $78.72 subtotal, tax $1.99
// (0.58 at 7.25% on the two "E" items + 1.41 at 2% on the "B" ones), total $80.71.
const ALDI_EXPECTED: ParsedReceipt = {
  merchantId: 'merchant-aldi',
  storeName: 'Aldi',
  purchasedAt: new Date(2026, 10, 2, 11, 30),
  subtotal: 78.72,
  tax: 1.99,
  total: 80.71,
  printedItemCount: 31,
  flags: [],
  lines: [
    aldiLine('382719', 'Mixed Vegetables', 'Mixed Vegetables', 0.96),
    aldiLine('382719', 'Mixed Vegetables', 'Mixed Vegetables', 0.96),
    aldiLine('717662', 'Org Black Beans', 'Organic Black Beans', 0.95),
    aldiLine('717662', '0rg Black Beans', 'Organic Black Beans', 0.95),
    aldiLine('383071', 'Worcst/Steak Sauce', 'Worcestershire/Steak Sauce', 1.99),
    aldiLine('602413', 'Alani Energy', 'Alani Energy Drink', 2.65, 'FE'),
    aldiLine('201336', 'Crunchy Peanut Btr', 'Crunchy Peanut Butter', 1.59),
    aldiLine('343190', 'Redcd Sodium Broth', 'Reduced Sodium Broth', 1.25),
    aldiLine('664975', 'Inst Mashed Potato', 'Instant Mashed Potatoes', 1.85),
    aldiLine('385412', 'Seaweed Snacks', 'Seaweed Snacks', 1.99),
    aldiLine('401753', 'Lentils/Sp1it Peas', 'Lentils/Split Peas', 1.39),
    aldiLine('627731', 'GrassFed Bf Sticks', 'Grass-Fed Beef Sticks', 12.99),
    aldiLine('523308', 'Kett1e Variety Pok', 'Kettle Chips Variety Pack', 6.59),
    aldiLine('458716', 'Maple Brbn Ben S1d', 'Maple Bourbon Bacon Salad', 2.95),
    aldiLine('356538', 'Classic Coleslaw', 'Classic Coleslaw', 1.89),
    aldiLine('356435', 'Org AngelSweet Tom', 'Organic AngelSweet Tomatoes', 3.29),
    aldiLine('356570', 'Org Strawberries', 'Organic Strawberries', 4.25),
    aldiLine('356490', 'Bagged Avocados', 'Bagged Avocados', 3.15),
    aldiLine('356609', 'Red Onions', 'Red Onions', 1.95),
    aldiLine('341878', 'Yellow Onions', 'Yellow Onions', 1.89),
    aldiLine('356371', 'Garlic', 'Garlic', 1.19),
    weighedAldiLine('262770', 'Banana Organic LRW', 'Organic Bananas', 1.63, 0.58, 0.95),
    aldiLine('356419', 'Mangoes', 'Mangoes', 0.89),
    weighedAldiLine('356558', 'Envy Apples LRW', 'Envy Apples', 0.79, 1.69, 1.34),
    aldiLine('356475', 'Asparagus', 'Asparagus', 2.65),
    aldiLine('356487', 'Baby Bella', 'Baby Bella Mushrooms', 1.39),
    aldiLine('383250', 'Deli Sliced PepJac', 'Deli Sliced Pepper Jack Cheese', 1.45),
    aldiLine('381695', 'Sprouted Breads', 'Sprouted Bread', 3.59),
    aldiLine('382249', 'German Breads', 'German Bread', 2.69),
    aldiLine('384977', 'French Baguette', 'French Baguette', 1.75),
    aldiLine('366047', 'Green Tea 12pk', 'Green Tea 12 Pack', 5.35, 'FE'),
  ],
};

type WireLine = Record<string, unknown>;
type WireReply = Record<string, unknown> & { lines: WireLine[] };

/** The Aldi reply, edited the way a model might have got it wrong. */
function aldiReplyWith(edit: (reply: WireReply) => void): string {
  const reply = JSON.parse(ALDI_REPLY) as WireReply;
  edit(reply);
  return JSON.stringify(reply);
}

const wireLine = (over: WireLine = {}): WireLine => ({
  itemNumber: '100001',
  printedText: 'Test Item',
  description: 'Test item',
  quantity: 1,
  weight: null,
  weightUnit: null,
  unitPrice: 1.99,
  lineTotal: 1.99,
  discount: null,
  taxFlag: 'FB',
  ...over,
});

const wireReply = (over: Partial<WireReply> = {}): string =>
  JSON.stringify({
    store: 'Aldi',
    purchasedAt: '2026-11-02T11:30',
    itemCount: null,
    subtotal: null,
    tax: null,
    total: null,
    lines: [wireLine()],
    ...over,
  });

function makeService(content: Maybe<string>, finishReason: Maybe<string> = 'stop') {
  const complete = vi.fn((_request: JsonChatCompletionRequest) =>
    Promise.resolve({ content, finishReason }),
  );
  const jsonChatCompletion: JsonChatCompletion = { complete };
  return { service: receiptParserServiceFactory({ jsonChatCompletion }), complete };
}

function parse(content: Maybe<string>, finishReason: Maybe<string> = 'stop') {
  return makeService(content, finishReason).service.parseReceiptText({
    ocrText: ALDI_OCR_TEXT,
    knownStores: KNOWN_STORES,
  });
}

/** One synthetic line through the parser, for the per-line checks. */
async function parseLine(over: WireLine) {
  const receipt = await parse(wireReply({ lines: [wireLine(over)] }));
  return receipt.lines[0];
}

describe('receiptParserService on the slice-0 Aldi receipt', () => {
  it('turns the recorded reply into the verified receipt', async () => {
    await expect(parse(ALDI_REPLY)).resolves.toEqual(ALDI_EXPECTED);
  });

  it('sends the OCR text as it is, and the known store names with the rules', async () => {
    const { service, complete } = makeService(ALDI_REPLY);

    await service.parseReceiptText({ ocrText: ALDI_OCR_TEXT, knownStores: KNOWN_STORES });

    const [request] = complete.mock.calls[0] ?? [];
    expect(request?.user).toBe(ALDI_OCR_TEXT);
    expect(request?.system).toContain('Known stores: ["Costco","Aldi"]');
    expect(request?.system).toContain('never merge them');
  });

  // Slice 0: a stray "2" beside the Mangoes row, read as a quantity. Its own arithmetic holds
  // (2 × 0.89 = 1.78), so only the subtotal can catch it.
  it('catches a doubled line with the subtotal check alone', async () => {
    const receipt = await parse(
      aldiReplyWith((reply) => {
        Object.assign(reply.lines[22] ?? {}, { quantity: 2, lineTotal: 1.78 });
      }),
    );

    expect(receipt.lines[22]).toMatchObject({ printedText: 'Mangoes', quantity: 2, flags: [] });
    expect(receipt.flags).toEqual([ReceiptFlag.SUBTOTAL_MISMATCH]);
  });

  // Slice 0's small OCR model read 0.96 as 0.95: one cent, and nothing else disagrees with it.
  it('catches a one-cent misread line total with the subtotal check', async () => {
    const receipt = await parse(
      aldiReplyWith((reply) => {
        Object.assign(reply.lines[0] ?? {}, { unitPrice: 0.95, lineTotal: 0.95 });
      }),
    );

    expect(receipt.flags).toEqual([ReceiptFlag.SUBTOTAL_MISMATCH]);
  });
});

describe('the store', () => {
  it('lands on a known store whatever its case or spacing', async () => {
    for (const store of ['Aldi', 'ALDI', '  aldi ']) {
      const receipt = await parse(wireReply({ store }));
      expect(receipt).toMatchObject({ merchantId: 'merchant-aldi', storeName: 'Aldi' });
    }
    const spaced = await makeService(
      wireReply({ store: 'Harris  Teeter' }),
    ).service.parseReceiptText({
      ocrText: 'x',
      knownStores: [{ id: 'merchant-ht', name: 'Harris Teeter' }],
    });
    expect(spaced).toMatchObject({ merchantId: 'merchant-ht', storeName: 'Harris Teeter' });
  });

  it('names a store it does not know without inventing a merchant for it', async () => {
    const receipt = await parse(wireReply({ store: 'Food Lion' }));
    expect(receipt).toMatchObject({ merchantId: null, storeName: 'Food Lion' });
  });

  it('leaves the store empty when the receipt does not say', async () => {
    for (const store of [null, '', '   ']) {
      const receipt = await parse(wireReply({ store }));
      expect(receipt).toMatchObject({ merchantId: null, storeName: null });
    }
  });

  it('works with no known stores at all', async () => {
    const { service, complete } = makeService(wireReply({ store: 'Aldi' }));
    const receipt = await service.parseReceiptText({ ocrText: 'x', knownStores: [] });

    expect(receipt).toMatchObject({ merchantId: null, storeName: 'Aldi' });
    expect(complete.mock.calls[0]?.[0].system).toContain('Known stores: []');
  });
});

describe('the purchase date', () => {
  it('reads a printed date and time as local wall-clock time', async () => {
    const receipt = await parse(wireReply({ purchasedAt: '2026-11-02T23:59' }));
    expect(receipt.purchasedAt).toEqual(new Date(2026, 10, 2, 23, 59));
  });

  it('puts a date with no time at noon, so it stays on that day', async () => {
    const receipt = await parse(wireReply({ purchasedAt: '2026-11-02' }));
    expect(receipt.purchasedAt).toEqual(new Date(2026, 10, 2, 12, 0));
  });

  it('accepts a receipt with no date', async () => {
    await expect(parse(wireReply({ purchasedAt: null }))).resolves.toMatchObject({
      purchasedAt: null,
    });
  });

  it('rejects a date that is not on the calendar, or not in the asked-for form', async () => {
    for (const purchasedAt of ['2026-02-30', '2026-13-01', '2026-11-02T24:00', '11/02/26']) {
      await expect(parse(wireReply({ purchasedAt }))).rejects.toThrow(
        'LLM output failed validation',
      );
    }
  });
});

describe('quantity × unit price', () => {
  it('reads "2 @ 3.99" as a quantity of two', async () => {
    const line = await parseLine({ quantity: 2, unitPrice: 3.99, lineTotal: 7.98 });
    expect(line).toMatchObject({ quantity: 2, unitPrice: 3.99, lineTotal: 7.98, flags: [] });
  });

  it('defaults a missing quantity to one', async () => {
    const line = await parseLine({ quantity: null });
    expect(line).toMatchObject({ quantity: 1, flags: [] });
  });

  // 3 for $10 prints a unit price of 3.33: one cent short of the total, which is legitimate.
  it('allows exactly one cent either way', async () => {
    for (const lineTotal of [10.0, 9.98]) {
      const line = await parseLine({ quantity: 3, unitPrice: 3.33, lineTotal });
      expect(line?.flags).toEqual([]);
    }
  });

  it('flags two cents', async () => {
    for (const lineTotal of [10.01, 9.97]) {
      const line = await parseLine({ quantity: 3, unitPrice: 3.33, lineTotal });
      expect(line?.flags).toEqual([ReceiptLineFlag.LINE_TOTAL_MISMATCH]);
    }
  });

  // In floats, 3 × 0.29 = 0.8699999999999999 — a hair past one cent from 0.88.
  it('is not tipped over the boundary by float noise', async () => {
    const line = await parseLine({ quantity: 3, unitPrice: 0.29, lineTotal: 0.88 });
    expect(line?.flags).toEqual([]);
  });

  it('flags a single item whose unit price is not its total', async () => {
    const line = await parseLine({ unitPrice: 1.99, lineTotal: 2.99 });
    expect(line?.flags).toEqual([ReceiptLineFlag.LINE_TOTAL_MISMATCH]);
  });

  it('checks nothing when no unit price was read', async () => {
    const line = await parseLine({ quantity: 2, unitPrice: null, lineTotal: 5 });
    expect(line?.flags).toEqual([]);
  });
});

describe('weight × unit price', () => {
  const weighed = (weight: number, lineTotal: number, over: WireLine = {}) =>
    parseLine({ weight, weightUnit: 'LB', unitPrice: 1, lineTotal, ...over });

  it('attaches the weight in the unit printed', async () => {
    const line = await parseLine({ weight: 12, weightUnit: 'OZ', unitPrice: 0.25, lineTotal: 3 });
    expect(line).toMatchObject({ weight: 12, weightUnit: Unit.OUNCE, flags: [] });
  });

  it('allows a product up to one cent from the total', async () => {
    for (const weight of [1.009, 1.01, 0.99]) {
      expect((await weighed(weight, 1.0))?.flags).toEqual([]);
    }
  });

  it('flags a product just past one cent from the total', async () => {
    for (const weight of [1.0101, 1.011, 0.9899]) {
      expect((await weighed(weight, 1.0))?.flags).toEqual([ReceiptLineFlag.WEIGHT_TOTAL_MISMATCH]);
    }
  });

  it('flags a weight row attached to the wrong item', async () => {
    // The Envy Apples weight row (0.79 lb × 1.69/lb = 1.34) under the bananas' 0.95.
    const line = await parseLine({
      weight: 0.79,
      weightUnit: 'LB',
      unitPrice: 1.69,
      lineTotal: 0.95,
    });
    expect(line?.flags).toEqual([ReceiptLineFlag.WEIGHT_TOTAL_MISMATCH]);
  });

  it('checks the weight, not the quantity, on a weighed line', async () => {
    const line = await weighed(2.5, 2.5, { quantity: 3 });
    expect(line?.flags).toEqual([]);
  });

  // The live model does this on the Aldi receipt: quantity 1.63 beside weight 1.63.
  it('counts a weighed line as one, even when the model copies the weight into quantity', async () => {
    const line = await weighed(1.63, 1.63, { quantity: 1.63 });
    expect(line).toMatchObject({ quantity: 1, weight: 1.63, flags: [] });
  });
});

describe('discounts', () => {
  // A loyalty-savings row folded into its item: the line keeps its printed price, and the
  // subtotal is after the saving.
  it('keeps a folded discount beside the line total it came off', async () => {
    const receipt = await parse(
      wireReply({
        lines: [
          wireLine({ unitPrice: 4.99, lineTotal: 4.99, discount: 1.0 }),
          wireLine({ unitPrice: 2.5, lineTotal: 2.5 }),
        ],
        subtotal: 6.49,
        tax: 0.13,
        total: 6.62,
      }),
    );

    expect(receipt.lines[0]).toMatchObject({ lineTotal: 4.99, discount: 1, flags: [] });
    expect(receipt.flags).toEqual([]);
  });

  it('flags a subtotal that only adds up if the discount is ignored', async () => {
    const receipt = await parse(
      wireReply({
        lines: [wireLine({ unitPrice: 4.99, lineTotal: 4.99, discount: 1.0 })],
        subtotal: 4.99,
      }),
    );
    expect(receipt.flags).toEqual([ReceiptFlag.SUBTOTAL_MISMATCH]);
  });

  it('reads a zero discount as none', async () => {
    const line = await parseLine({ discount: 0 });
    expect(line?.discount).toBeNull();
  });

  it('rejects a negative discount', async () => {
    await expect(parse(wireReply({ lines: [wireLine({ discount: -1 })] }))).rejects.toThrow(
      'LLM output failed validation',
    );
  });
});

describe('lines − discounts against the subtotal', () => {
  const twoLines = [
    wireLine({ unitPrice: 1.25, lineTotal: 1.25 }),
    wireLine({ unitPrice: 0.3, lineTotal: 0.3 }),
  ];

  it('passes when they match to the cent', async () => {
    const receipt = await parse(wireReply({ lines: twoLines, subtotal: 1.55 }));
    expect(receipt.flags).toEqual([]);
  });

  // No slack: the lines and the subtotal are both printed amounts, so no rounding sits between
  // them, and a one-cent gap is a misread.
  it('flags a one-cent gap either way', async () => {
    for (const subtotal of [1.54, 1.56]) {
      const receipt = await parse(wireReply({ lines: twoLines, subtotal }));
      expect(receipt.flags).toEqual([ReceiptFlag.SUBTOTAL_MISMATCH]);
    }
  });

  it('is not checked when no subtotal was read', async () => {
    const receipt = await parse(wireReply({ lines: twoLines, subtotal: null }));
    expect(receipt.flags).toEqual([]);
  });

  // 0.1 + 0.2 is 0.30000000000000004 in floats.
  it('adds without float noise', async () => {
    const receipt = await parse(
      wireReply({
        lines: [
          wireLine({ unitPrice: 0.1, lineTotal: 0.1 }),
          wireLine({ unitPrice: 0.2, lineTotal: 0.2 }),
        ],
        subtotal: 0.3,
      }),
    );
    expect(receipt.flags).toEqual([]);
  });
});

describe('subtotal + tax against the total', () => {
  const line = [wireLine({ unitPrice: 10, lineTotal: 10 })];

  it('passes when they match to the cent', async () => {
    const receipt = await parse(wireReply({ lines: line, subtotal: 10, tax: 0.73, total: 10.73 }));
    expect(receipt.flags).toEqual([]);
  });

  it('flags a one-cent gap either way', async () => {
    for (const total of [10.72, 10.74]) {
      const receipt = await parse(wireReply({ lines: line, subtotal: 10, tax: 0.73, total }));
      expect(receipt.flags).toEqual([ReceiptFlag.TOTAL_MISMATCH]);
    }
  });

  it('reads a missing tax as none', async () => {
    const untaxed = await parse(wireReply({ lines: line, subtotal: 10, tax: null, total: 10 }));
    expect(untaxed.flags).toEqual([]);
    const unread = await parse(wireReply({ lines: line, subtotal: 10, tax: null, total: 10.73 }));
    expect(unread.flags).toEqual([ReceiptFlag.TOTAL_MISMATCH]);
  });

  it('checks the lines against the total when no subtotal was read', async () => {
    const adds = await parse(wireReply({ lines: line, subtotal: null, tax: 0.73, total: 10.73 }));
    expect(adds.flags).toEqual([]);
    const short = await parse(wireReply({ lines: line, subtotal: null, tax: 0.73, total: 10.74 }));
    expect(short.flags).toEqual([ReceiptFlag.TOTAL_MISMATCH]);
  });

  it('is not checked when no total was read', async () => {
    const receipt = await parse(wireReply({ lines: line, subtotal: 10, tax: 5, total: null }));
    expect(receipt.flags).toEqual([]);
  });
});

describe('the printed item count', () => {
  const lines = [wireLine(), wireLine({ quantity: 2, unitPrice: 1.99, lineTotal: 3.98 })];

  it('passes when it matches the lines, or their quantities', async () => {
    for (const itemCount of [2, 3]) {
      const receipt = await parse(wireReply({ lines, itemCount }));
      expect(receipt).toMatchObject({ printedItemCount: itemCount, flags: [] });
    }
  });

  it('flags a count that matches neither', async () => {
    for (const itemCount of [1, 4, 0]) {
      const receipt = await parse(wireReply({ lines, itemCount }));
      expect(receipt.flags).toEqual([ReceiptFlag.ITEM_COUNT_MISMATCH]);
    }
  });

  it('is not checked when the receipt prints no count', async () => {
    const receipt = await parse(wireReply({ lines, itemCount: null }));
    expect(receipt).toMatchObject({ printedItemCount: null, flags: [] });
  });

  it('rejects a count that is not a whole number', async () => {
    await expect(parse(wireReply({ itemCount: 2.5 }))).rejects.toThrow(
      'LLM output failed validation',
    );
  });
});

describe('a line with no readable total', () => {
  it('is left out, and the subtotal reports the gap', async () => {
    const receipt = await parse(
      wireReply({
        lines: [wireLine({ printedText: 'Faded', lineTotal: null }), wireLine()],
        subtotal: 3.98,
        itemCount: 2,
      }),
    );

    expect(receipt.lines.map((line) => line.printedText)).toEqual(['Test Item']);
    expect(receipt.flags).toEqual([ReceiptFlag.SUBTOTAL_MISMATCH, ReceiptFlag.ITEM_COUNT_MISMATCH]);
  });
});

describe('absent fields', () => {
  it('reads a missing or blank optional field as null', async () => {
    const line = await parseLine({ itemNumber: '', description: '  ', taxFlag: undefined });
    expect(line).toMatchObject({ itemNumber: null, description: null, taxFlag: null });
  });

  it('keeps the printed text exactly, OCR mistakes included', async () => {
    const line = await parseLine({ printedText: ' 0rg B1ack Beans ' });
    expect(line?.printedText).toBe('0rg B1ack Beans');
  });

  it('accepts a receipt with no lines', async () => {
    const receipt = await parse(wireReply({ lines: [] }));
    expect(receipt).toMatchObject({ lines: [], flags: [] });
  });
});

describe('an unusable reply', () => {
  it('refuses empty OCR text without asking the model', async () => {
    const { service, complete } = makeService(ALDI_REPLY);
    await expect(
      service.parseReceiptText({ ocrText: ' \n ', knownStores: KNOWN_STORES }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(complete).not.toHaveBeenCalled();
  });

  it('throws on an empty reply', async () => {
    for (const content of [null, '', '  ']) {
      await expect(parse(content)).rejects.toThrow('LLM returned an empty response');
    }
  });

  it('throws on a reply that is not JSON', async () => {
    await expect(parse('Here is the receipt: Aldi, 31 items')).rejects.toThrow(
      'LLM returned non-JSON output',
    );
  });

  it.each([
    ['no lines array', { lines: undefined }],
    ['lines that are not an array', { lines: 'none' }],
    ['an item number as a number', { lines: [wireLine({ itemNumber: 382719 })] }],
    ['a line with no printed text', { lines: [wireLine({ printedText: ' ' })] }],
    ['a total as a string', { total: '80.71' }],
    ['a weight unit it was not offered', { lines: [wireLine({ weight: 1, weightUnit: 'KG' })] }],
    ['a weight with no unit', { lines: [wireLine({ weight: 1.63, weightUnit: null })] }],
    ['a unit with no weight', { lines: [wireLine({ weight: null, weightUnit: 'LB' })] }],
    ['a zero quantity', { lines: [wireLine({ quantity: 0 })] }],
    ['a negative unit price', { lines: [wireLine({ unitPrice: -1 })] }],
  ])('throws on %s', async (_case, over) => {
    const content = wireReply(over as Partial<WireReply>);
    await expect(parse(content)).rejects.toThrow('LLM output failed validation');
    await expect(parse(content)).rejects.toBeInstanceOf(ServerError);
  });

  it('reports a reply cut off at the output cap as truncation, not as bad JSON', async () => {
    await expect(parse(ALDI_REPLY.slice(0, 500), 'length')).rejects.toBeInstanceOf(
      ExtractionTruncatedError,
    );
  });

  it('reports truncation even when the cut-off reply happens to parse', async () => {
    await expect(parse(ALDI_REPLY, 'length')).rejects.toBeInstanceOf(ExtractionTruncatedError);
  });
});
