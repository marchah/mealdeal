import type { Maybe } from '../../common/types';
import type { Unit } from '../../common/units';

// Ports for the receiptAlias slice — a learned receipt name: what a store's printed row means, so
// the next receipt from that store matches itself. Services depend on these interfaces; only the
// repository touches the db.

export interface ReceiptAlias {
  id: string;
  merchantId: string;
  /** See receiptAliasMatchKey — unique per store. */
  matchKey: string;
  /** As last printed, for display; the key is what matches. */
  printedText: string;
  pantryItemId: Maybe<string>;
  /** The pack bought at this store, which receipts rarely print (docs/PLAN.md decision 5). */
  sizeAmount: Maybe<number>;
  sizeUnit: Maybe<Unit>;
  /** Always ignore this row at this store; there is then no item. */
  ignored: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** The printed row a learned name is keyed on. */
export interface ReceiptAliasLine {
  itemNumber: Maybe<string>;
  printedText: string;
}

/** Either an item (with an optional pack size) or an ignore — never both, never neither. */
export interface UpsertReceiptAliasInput extends ReceiptAliasLine {
  merchantId: string;
  pantryItemId: Maybe<string>;
  sizeAmount: Maybe<number>;
  sizeUnit: Maybe<Unit>;
  ignored: boolean;
}

export interface NewReceiptAlias {
  merchantId: string;
  matchKey: string;
  printedText: string;
  pantryItemId: Maybe<string>;
  sizeAmount: Maybe<number>;
  sizeUnit: Maybe<Unit>;
  ignored: boolean;
}

export interface ReceiptAliasRepository {
  findReceiptAliasByMatchKey: (
    merchantId: string,
    matchKey: string,
  ) => Promise<Maybe<ReceiptAlias>>;
  /** Inserts, or overwrites the store's existing alias for the same match key. */
  upsertReceiptAlias: (alias: NewReceiptAlias) => Promise<ReceiptAlias>;
  deleteReceiptAlias: (id: string) => Promise<Maybe<ReceiptAlias>>;
}

export interface ReceiptAliasService {
  /** The learned name for this printed row at this store, if any. */
  findReceiptAliasByLine: (
    merchantId: string,
    line: ReceiptAliasLine,
  ) => Promise<Maybe<ReceiptAlias>>;
  /** Learns a name, or relearns it: the latest confirm wins. */
  upsertReceiptAlias: (input: UpsertReceiptAliasInput) => Promise<ReceiptAlias>;
  deleteReceiptAlias: (id: string) => Promise<ReceiptAlias>;
}
