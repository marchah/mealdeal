import { z } from 'zod';
import { ExtractionTruncatedError, ServerError, ValidationError } from '../../common/errors';
import { logWarning } from '../../common/logger';
import type { Maybe } from '../../common/types';
import { Unit } from '../../common/units';
import type { Merchant } from '../../entities/merchant/types';
import { ReceiptFlag, ReceiptLineFlag, type ParsedReceiptLine } from '../../entities/receipt/types';
import type { JsonChatCompletion } from '../../ingest/extractor';
import type { ParsedReceipt, ReceiptParserService, ReceiptTextParseInput } from './types';

const SYSTEM_PROMPT = [
  'You turn the OCR text of ONE grocery receipt into JSON.',
  'The text was rebuilt row by row from an OCR engine, so expect character confusions (0 for O, 1 for l or I, e for c, rn for m, "1b" for "lb", "Φ" for "$") and the odd stray character.',
  'Return ONLY JSON of the form:',
  '{"store": string|null, "purchasedAt": "YYYY-MM-DDTHH:MM"|"YYYY-MM-DD"|null, "itemCount": number|null,',
  ' "subtotal": number|null, "tax": number|null, "total": number|null,',
  ' "lines": [{"itemNumber": string|null, "printedText": string, "description": string|null,',
  '            "quantity": number, "weight": number|null, "weightUnit": "LB"|"OZ"|null,',
  '            "unitPrice": number|null, "lineTotal": number|null, "discount": number|null,',
  '            "taxFlag": string|null}]}',
  'Rules:',
  '- lines: one entry per printed item row, in printed order. An item bought twice prints two rows: keep both entries, never merge them.',
  "- itemNumber: the store's item number printed on the row, as a string. printedText: the item text exactly as it appears in the OCR text, mistakes included, without the item number, price or tax letters.",
  '- description: the product in plain words, as a shopper would name it. Receipts abbreviate names and cut them off at a fixed width, so expand every abbreviation, complete a cut-off last word and fix OCR confusions ("Grnd Bf 80/2O" -> "Ground Beef 80/20", "Shrd Mozz Chs" -> "Shredded Mozzarella Cheese", "Hny Wht Brd" -> "Honey Wheat Bread"). Say what kind of product it is when the name alone does not. Leave out register codes that are not part of the name, such as "LRW". An abbreviation stands for a plain word, not a brand: never add a brand or a size that is not printed in full.',
  '- Weighed items: a row like "(N) 1.63 lb x 0.58/lb" or "2.31 lb @ 0.59 /lb" belongs to the item row above it: weight 1.63, weightUnit "LB", unitPrice 0.58, quantity 1. Gross "(G)" and tare "(T)" rows are not items.',
  '- Multi-buys: "2 @ 3.99" means quantity 2 and unitPrice 3.99. Any other item has quantity 1 and its printed price as unitPrice.',
  '- lineTotal: the amount printed for the item, before any discount. null if it cannot be read; never guess it.',
  '- A discount, coupon or savings row (often with a trailing minus, as in "1.00-") is not an item: add its amount as a positive number to "discount" on the item it applies to, usually the one just above it.',
  '- A fee charged on its own row (bag fee, bottle deposit) is a line: it counts toward the subtotal.',
  '- taxFlag: the tax letters printed after the price ("FB"), if any.',
  '- Skip payment, card, approval, change, subtotal, tax and total rows. Report subtotal, tax (the sum of every tax row) and total at the top level, and itemCount when the receipt prints a number of items ("31 ITEMS").',
  `- store: when the receipt is from one of the known stores below, that name exactly as listed. Otherwise the retailer's everyday name ("Costco", not "COSTCO WHOLESALE #347"). A web address or footer can name the store when the header is missing. null if it cannot be told.`,
  '- purchasedAt: the printed date and time. US receipts print MM/DD/YY, so "11/02/26 11:30" is "2026-11-02T11:30". The date alone when no time is printed.',
  '- Use null for anything the receipt does not show. Never invent an item or a price.',
].join('\n');

const WEIGHT_UNITS = { LB: Unit.POUND, OZ: Unit.OUNCE } as const;

const PURCHASED_AT = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/;

// Absence, however the model writes it — a missing key, null or "" — reads as null.
const optionalText = z
  .string()
  .nullish()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  });

const optionalNumber = (schema: z.ZodNumber) =>
  schema.nullish().transform((value) => value ?? null);

// The model's reply is never trusted: a wrong type or an impossible value fails the whole parse,
// since a receipt read on top of it would be wrong in ways the arithmetic checks cannot see.
const LineSchema = z
  .object({
    itemNumber: optionalText,
    printedText: z.string().trim().min(1),
    description: optionalText,
    quantity: optionalNumber(z.number().positive()),
    unitPrice: optionalNumber(z.number().nonnegative()),
    weight: optionalNumber(z.number().positive()),
    weightUnit: z
      .enum(['LB', 'OZ'])
      .nullish()
      .transform((value) => (value ? WEIGHT_UNITS[value] : null)),
    lineTotal: optionalNumber(z.number()),
    discount: optionalNumber(z.number().nonnegative()),
    taxFlag: optionalText,
  })
  .refine((line) => (line.weight === null) === (line.weightUnit === null), {
    message: 'weight and weightUnit must be given together',
  });

const ReplySchema = z.object({
  store: optionalText,
  purchasedAt: z
    .string()
    .nullish()
    .transform((value, ctx) => {
      if (!value) return null;
      const date = toPurchaseDate(value);
      if (date === null) {
        ctx.addIssue({ code: 'custom', message: `"${value}" is not a YYYY-MM-DD[THH:MM] date` });
        return z.NEVER;
      }
      return date;
    }),
  itemCount: optionalNumber(z.number().int().nonnegative()),
  subtotal: optionalNumber(z.number()),
  tax: optionalNumber(z.number()),
  total: optionalNumber(z.number()),
  lines: z.array(LineSchema),
});
type Reply = z.infer<typeof ReplySchema>;
type ReplyLine = Reply['lines'][number];

// A receipt prints wall-clock time with no zone, so it is read in the server's own zone: for a
// self-hosted app, the household's. A bare date takes noon, which keeps it on that day anywhere.
function toPurchaseDate(value: string): Maybe<Date> {
  const match = PURCHASED_AT.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const hour = match[4] === undefined ? 12 : Number(match[4]);
  const minute = match[5] === undefined ? 0 : Number(match[5]);
  if (hour > 23 || minute > 59) return null;
  const date = new Date(year, month, day, hour, minute);
  // Date rolls 2026-02-30 over into March; a date that does not read back was never a date.
  const readsBack =
    date.getFullYear() === year && date.getMonth() === month && date.getDate() === day;
  return readsBack ? date : null;
}

// finishReason first, as in the deal extractor: a reply cut off at the output cap is unterminated
// JSON, and calling it malformed would hide that the cap is what to raise.
function parseReply(content: Maybe<string>, finishReason: Maybe<string>): Reply {
  if (finishReason === 'length') {
    throw new ExtractionTruncatedError();
  }
  if (content === null || content.trim() === '') {
    throw new ServerError('LLM returned an empty response');
  }
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    throw new ServerError('LLM returned non-JSON output');
  }
  const parsed = ReplySchema.safeParse(json);
  if (!parsed.success) {
    throw new ServerError(`LLM output failed validation: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

function storeKey(name: string): string {
  return name.trim().replaceAll(/\s+/g, ' ').toLocaleLowerCase();
}

function findKnownStore(
  name: Maybe<string>,
  knownStores: readonly Pick<Merchant, 'id' | 'name'>[],
): Maybe<Pick<Merchant, 'id' | 'name'>> {
  if (name === null) return null;
  return knownStores.find((store) => storeKey(store.name) === storeKey(name)) ?? null;
}

// Every amount is compared as an integer number of hundredths of a cent, so float noise
// (3 × 0.29 = 0.86999…) can never tip a comparison either way.
function toHundredthsOfACent(amount: number): number {
  return Math.round(amount * 10_000);
}

const ONE_CENT = 100;

// The register rounded this product to the cent, in whichever direction it rounds, and a
// 3-for-$10 price prints as 3.33 — so a product may sit up to one cent either side of its total.
function productMatchesTotal(factor: number, unitPrice: number, lineTotal: number): boolean {
  const difference = toHundredthsOfACent(factor * unitPrice) - toHundredthsOfACent(lineTotal);
  return Math.abs(difference) <= ONE_CENT;
}

function checkLine(line: Omit<ParsedReceiptLine, 'flags'>): ReceiptLineFlag[] {
  if (line.unitPrice === null) return [];
  if (line.weight !== null) {
    return productMatchesTotal(line.weight, line.unitPrice, line.lineTotal)
      ? []
      : [ReceiptLineFlag.WEIGHT_TOTAL_MISMATCH];
  }
  return productMatchesTotal(line.quantity, line.unitPrice, line.lineTotal)
    ? []
    : [ReceiptLineFlag.LINE_TOTAL_MISMATCH];
}

// Sums of printed amounts have no rounding in them, so they must match to the cent: a one-cent
// slack here would let a lone misread last digit (0.96 read as 0.95) through.
function checkReceipt(
  receipt: Pick<ParsedReceipt, 'lines' | 'subtotal' | 'tax' | 'total' | 'printedItemCount'>,
): ReceiptFlag[] {
  const { lines, subtotal, tax, total, printedItemCount } = receipt;
  const flags: ReceiptFlag[] = [];
  const linesNet = lines.reduce(
    (sum, line) =>
      sum + toHundredthsOfACent(line.lineTotal) - toHundredthsOfACent(line.discount ?? 0),
    0,
  );
  if (subtotal !== null && linesNet !== toHundredthsOfACent(subtotal)) {
    flags.push(ReceiptFlag.SUBTOTAL_MISMATCH);
  }
  if (total !== null) {
    const beforeTax = subtotal === null ? linesNet : toHundredthsOfACent(subtotal);
    if (beforeTax + toHundredthsOfACent(tax ?? 0) !== toHundredthsOfACent(total)) {
      flags.push(ReceiptFlag.TOTAL_MISMATCH);
    }
  }
  // Stores differ on whether "2 @ 3.99" is one item or two, so either count is accepted.
  const units = lines.reduce((sum, line) => sum + line.quantity, 0);
  if (
    printedItemCount !== null &&
    printedItemCount !== lines.length &&
    printedItemCount !== units
  ) {
    flags.push(ReceiptFlag.ITEM_COUNT_MISMATCH);
  }
  return flags;
}

function toParsedLine(line: ReplyLine): Maybe<ParsedReceiptLine> {
  // line_total is what every check and every price is built on. A row whose amount the model
  // could not read is left out, and the subtotal check reports the gap it leaves.
  if (line.lineTotal === null) {
    logWarning('receipt parse: dropped a line with no readable total', {
      tag: 'RECEIPT',
      extra: { printedText: line.printedText },
    });
    return null;
  }
  const parsed = {
    itemNumber: line.itemNumber,
    printedText: line.printedText,
    description: line.description,
    // A weighed line's amount is its weight; the model sometimes copies the weight here too.
    quantity: line.weight === null ? (line.quantity ?? 1) : 1,
    unitPrice: line.unitPrice,
    weight: line.weight,
    weightUnit: line.weightUnit,
    lineTotal: line.lineTotal,
    discount: line.discount !== null && line.discount > 0 ? line.discount : null,
    taxFlag: line.taxFlag,
  };
  return { ...parsed, flags: checkLine(parsed) };
}

// OCR text in, a structured receipt out. The model reads; the arithmetic is checked here.
export function receiptParserServiceFactory({
  jsonChatCompletion,
}: {
  jsonChatCompletion: JsonChatCompletion;
}): ReceiptParserService {
  async function parseReceiptText(input: ReceiptTextParseInput) {
    if (input.ocrText.trim() === '') {
      throw new ValidationError('A receipt with no OCR text cannot be parsed');
    }
    const { content, finishReason } = await jsonChatCompletion.complete({
      system: `${SYSTEM_PROMPT}\nKnown stores: ${JSON.stringify(
        input.knownStores.map((store) => store.name),
      )}`,
      user: input.ocrText,
    });
    const reply = parseReply(content, finishReason);
    const knownStore = findKnownStore(reply.store, input.knownStores);
    const lines = reply.lines.flatMap((line) => toParsedLine(line) ?? []);
    const receipt: Omit<ParsedReceipt, 'flags'> = {
      merchantId: knownStore?.id ?? null,
      storeName: knownStore?.name ?? reply.store,
      purchasedAt: reply.purchasedAt,
      subtotal: reply.subtotal,
      tax: reply.tax,
      total: reply.total,
      printedItemCount: reply.itemCount,
      lines,
    };
    return { ...receipt, flags: checkReceipt(receipt) };
  }

  return { parseReceiptText };
}
