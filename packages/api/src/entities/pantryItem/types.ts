import type { Maybe } from '../../common/types';
import type { Unit } from '../../common/units';

// Ports for the pantryItem slice — the product you buy regularly, as opposed to any single
// price you paid for it. Services depend on these interfaces; only the repository touches the db.

export interface PantryItem {
  id: string;
  name: string;
  brand: Maybe<string>;
  /** The seeded coupon-type taxonomy doubles as the pantry category (docs/PLAN.md decision 1). */
  couponTypeId: Maybe<string>;
  imageUrl: Maybe<string>;
  sizeAmount: Maybe<number>;
  sizeUnit: Maybe<Unit>;
  /** Which unit the unit price reads in, and the item's dimension. Not optional. */
  unitPriceUnit: Unit;
  targetPrice: Maybe<number>;
  notes: Maybe<string>;
  archived: boolean;
  createdAt: Date;
}

export interface ListPantryItemsInput {
  includeArchived: boolean;
  couponTypeId: Maybe<string>;
}

/**
 * The editable surface of an item. `addPantryItem` creates from it and `updatePantryItem`
 * REPLACES with it — an omitted optional field is cleared, not preserved, because the only
 * caller is a form that holds every field. A partial-patch shape would have to distinguish
 * "absent" from "explicitly null" on ten fields to say the same thing.
 */
export interface PantryItemInput {
  name: string;
  brand: Maybe<string>;
  couponTypeId: Maybe<string>;
  imageUrl: Maybe<string>;
  sizeAmount: Maybe<number>;
  sizeUnit: Maybe<Unit>;
  unitPriceUnit: Unit;
  targetPrice: Maybe<number>;
  notes: Maybe<string>;
}

/**
 * What a product page yielded. Every field is optional: pages differ, retailers block, and a
 * half-read page still saves typing. The caller confirms it before anything is stored.
 */
export interface ProductDraft {
  name: Maybe<string>;
  brand: Maybe<string>;
  imageUrl: Maybe<string>;
  price: Maybe<number>;
  currency: Maybe<string>;
  sizeAmount: Maybe<number>;
  sizeUnit: Maybe<Unit>;
}

export interface PantryItemDraft extends ProductDraft {
  url: string;
  /** False when the page could not be read at all — the form opens blank rather than erroring. */
  found: boolean;
}

/** Adapter port: implementations read a product page, or report that they could not. */
export interface ProductLookup {
  lookupProduct: (url: string) => Promise<Maybe<ProductDraft>>;
}

export interface PantryItemRepository {
  findPantryItemById: (id: string) => Promise<Maybe<PantryItem>>;
  findPantryItemsByIds: (ids: readonly string[]) => Promise<PantryItem[]>;
  /** Case- and null-folded lookup backing the duplicate check; `name`/`brand` arrive normalized. */
  findPantryItemByNameAndBrand: (name: string, brand: Maybe<string>) => Promise<Maybe<PantryItem>>;
  listPantryItems: (input: ListPantryItemsInput) => Promise<PantryItem[]>;
  countPantryItems: () => Promise<number>;
  insertPantryItem: (input: PantryItemInput) => Promise<PantryItem>;
  // Writes return the affected row (RETURNING) so the service answers with what the db now holds
  // rather than reconstructing it, and reads null as "no such row" without a second query.
  updatePantryItem: (id: string, input: PantryItemInput) => Promise<Maybe<PantryItem>>;
  setPantryItemArchived: (id: string, archived: boolean) => Promise<Maybe<PantryItem>>;
  deletePantryItem: (id: string) => Promise<Maybe<PantryItem>>;
}

export interface PantryItemService {
  getPantryItemById: (id: string) => Promise<PantryItem>;
  /** Batch form for the per-request DataLoader; ids may repeat and may not all match. */
  findPantryItemsByIds: (ids: readonly string[]) => Promise<PantryItem[]>;
  listPantryItems: (input: ListPantryItemsInput) => Promise<PantryItem[]>;
  countPantryItems: () => Promise<number>;
  addPantryItem: (input: PantryItemInput) => Promise<PantryItem>;
  updatePantryItem: (id: string, input: PantryItemInput) => Promise<PantryItem>;
  /** Soft delete both ways: `archived: false` restores an item without losing its history. */
  archivePantryItem: (id: string, archived: boolean) => Promise<PantryItem>;
  /** Hard delete. The price history goes with it (ON DELETE cascade) — archiving is the gentler option. */
  deletePantryItem: (id: string) => Promise<PantryItem>;
  /** Read a product page into a draft. Never stores anything; the caller confirms first. */
  draftPantryItemFromUrl: (url: string) => Promise<PantryItemDraft>;
}
