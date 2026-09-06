import type { Maybe } from '../../common/types';
import type { Unit } from '../../common/units';

// Ports for the priceEntry slice — one observed price for a pantry item, at a store, on a date.
// Services depend on these interfaces; only the repository touches the db.

/** Where an observed price came from. */
export enum PriceSource {
  /** Typed in — at the shelf, off a receipt, from a screenshot. */
  MANUAL = 'MANUAL',
  /** Read off a product page by the URL importer. */
  IMPORT = 'IMPORT',
  /** Derived from an ingested coupon. */
  COUPON = 'COUPON',
}

export interface PriceEntry {
  id: string;
  pantryItemId: string;
  merchantId: Maybe<string>;
  price: number;
  currency: string;
  sizeAmount: number;
  sizeUnit: Unit;
  quantity: number;
  /** Price per base unit (ounce / fluid ounce / count / square foot) — derived, never supplied. */
  unitPrice: number;
  onSale: boolean;
  source: PriceSource;
  url: Maybe<string>;
  note: Maybe<string>;
  observedAt: Date;
  createdAt: Date;
}

export interface ListPriceEntriesInput {
  pantryItemId: string;
  limit: Maybe<number>;
  since: Maybe<Date>;
}

/** What a caller supplies. The store arrives by name; unitPrice is derived from the rest. */
export interface AddPriceEntryInput {
  pantryItemId: string;
  merchantName: Maybe<string>;
  price: number;
  currency: string;
  sizeAmount: number;
  sizeUnit: Unit;
  quantity: number;
  onSale: boolean;
  source: PriceSource;
  url: Maybe<string>;
  note: Maybe<string>;
  observedAt: Maybe<Date>;
}

/** A row ready to persist: store resolved, unit price computed, date defaulted. */
export interface NewPriceEntry {
  pantryItemId: string;
  merchantId: Maybe<string>;
  price: number;
  currency: string;
  sizeAmount: number;
  sizeUnit: Unit;
  quantity: number;
  unitPrice: number;
  onSale: boolean;
  source: PriceSource;
  url: Maybe<string>;
  note: Maybe<string>;
  observedAt: Date;
}

export interface PriceEntryRepository {
  listPriceEntries: (input: ListPriceEntriesInput) => Promise<PriceEntry[]>;
  /** Batch form for the per-request DataLoader, newest first, ungrouped. */
  findPriceEntriesByPantryItemIds: (ids: readonly string[]) => Promise<PriceEntry[]>;
  insertPriceEntry: (entry: NewPriceEntry) => Promise<PriceEntry>;
  deletePriceEntry: (id: string) => Promise<Maybe<PriceEntry>>;
}

export interface PriceEntryService {
  listPriceEntries: (input: ListPriceEntriesInput) => Promise<PriceEntry[]>;
  findPriceEntriesByPantryItemIds: (ids: readonly string[]) => Promise<PriceEntry[]>;
  addPriceEntry: (input: AddPriceEntryInput) => Promise<PriceEntry>;
  deletePriceEntry: (id: string) => Promise<PriceEntry>;
}
