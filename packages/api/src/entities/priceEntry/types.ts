// Ports for the priceEntry slice arrive with the slice itself; this file exists ahead of them
// because the Drizzle column needs the enum, and a fixed value set belongs to its own slice.

/** Where an observed price came from. */
export enum PriceSource {
  /** Typed in — at the shelf, off a receipt, from a screenshot. */
  MANUAL = 'MANUAL',
  /** Read off a product page by the URL importer. */
  IMPORT = 'IMPORT',
  /** Derived from an ingested coupon. */
  COUPON = 'COUPON',
}
