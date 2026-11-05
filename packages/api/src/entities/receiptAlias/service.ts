import { NotFoundError, ValidationError } from '../../common/errors';
import type { Maybe } from '../../common/types';
import type {
  ReceiptAliasLine,
  ReceiptAliasRepository,
  ReceiptAliasService,
  UpsertReceiptAliasInput,
} from './types';

// OCR reads one glyph differently from receipt to receipt — `0rg` for `Org`, `1` for `l`. Each
// look-alike class folds to one character: toward letters in printed text, toward digits in an
// item number. Uppercase I belongs to the 1/l class and case-folds to `i`, so `i` folds with it.
function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

function foldText(value: string): string {
  return normalize(value).replace(/0/g, 'o').replace(/[1i|]/g, 'l');
}

function foldItemNumber(value: string): string {
  return normalize(value).replace(/o/g, '0').replace(/[li|]/g, '1');
}

/**
 * What a learned name is keyed on at a store (docs/PLAN.md decision 5): the item number when the
 * row prints one, else the folded printed text. Prefixed so the two can never collide. Stored
 * keys depend on this exact output — changing it orphans every learned name. Null when the row
 * has nothing to key on.
 */
export function receiptAliasMatchKey({ itemNumber, printedText }: ReceiptAliasLine): Maybe<string> {
  const number = itemNumber === null ? '' : foldItemNumber(itemNumber);
  if (number !== '') return `item:${number}`;
  const text = foldText(printedText);
  return text === '' ? null : `text:${text}`;
}

// Business logic. The repository is injected whole and first.
export function receiptAliasServiceFactory({
  receiptAliasRepository,
}: {
  receiptAliasRepository: ReceiptAliasRepository;
}): ReceiptAliasService {
  async function findReceiptAliasByLine(merchantId: string, line: ReceiptAliasLine) {
    const matchKey = receiptAliasMatchKey(line);
    if (matchKey === null) return null;
    return receiptAliasRepository.findReceiptAliasByMatchKey(merchantId, matchKey);
  }

  async function upsertReceiptAlias(input: UpsertReceiptAliasInput) {
    const printedText = input.printedText.trim();
    const matchKey = receiptAliasMatchKey({ itemNumber: input.itemNumber, printedText });
    if (printedText === '' || matchKey === null) {
      throw new ValidationError('printedText must not be blank');
    }
    // An alias with neither would match a row to nothing; one with both would ignore an item.
    if (input.ignored === (input.pantryItemId !== null)) {
      throw new ValidationError('A learned name maps to a pantry item or is ignored, not both');
    }
    if ((input.sizeAmount === null) !== (input.sizeUnit === null)) {
      throw new ValidationError('sizeAmount and sizeUnit must be given together');
    }
    if (input.sizeAmount !== null && input.ignored) {
      throw new ValidationError('An ignored name has no pack size');
    }
    if (input.sizeAmount !== null && input.sizeAmount <= 0) {
      throw new ValidationError('sizeAmount must be greater than 0');
    }
    return receiptAliasRepository.upsertReceiptAlias({
      merchantId: input.merchantId,
      matchKey,
      printedText,
      pantryItemId: input.pantryItemId,
      sizeAmount: input.sizeAmount,
      sizeUnit: input.sizeUnit,
      ignored: input.ignored,
    });
  }

  async function deleteReceiptAlias(id: string) {
    const alias = await receiptAliasRepository.deleteReceiptAlias(id);
    if (!alias) throw new NotFoundError(`No receipt alias with id ${id}`);
    return alias;
  }

  return { findReceiptAliasByLine, upsertReceiptAlias, deleteReceiptAlias };
}
