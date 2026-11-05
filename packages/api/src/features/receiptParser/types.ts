import type { Maybe } from '../../common/types';
import type { Merchant } from '../../entities/merchant/types';
import type { ParsedReceiptLine, ReceiptParseInput } from '../../entities/receipt/types';

export interface ReceiptTextParseInput {
  /** The OCR engine's text, rebuilt into printed rows. */
  ocrText: string;
  /** Stores the model may name, so "COSTCO WHOLESALE #347" lands on the existing "Costco". */
  knownStores: readonly Pick<Merchant, 'id' | 'name'>[];
}

/** What `updateReceiptParse` takes, plus what the pipeline needs to finish the job. */
export interface ParsedReceipt extends ReceiptParseInput {
  /** The known store's name when one was picked, otherwise the model's; null if none was read. */
  storeName: Maybe<string>;
  /** The item count the receipt prints ("31 ITEMS"), when it prints one. */
  printedItemCount: Maybe<number>;
  lines: ParsedReceiptLine[];
}

export interface ReceiptParserService {
  /** Throws on an unusable model reply; a receipt that does not add up comes back flagged. */
  parseReceiptText: (input: ReceiptTextParseInput) => Promise<ParsedReceipt>;
}
