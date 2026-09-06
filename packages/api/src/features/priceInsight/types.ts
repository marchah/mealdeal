import type { Maybe } from '../../common/types';
import type { Unit } from '../../common/units';
import type { PantryItem } from '../../entities/pantryItem/types';
import type { PriceEntry } from '../../entities/priceEntry/types';

/** Whether today's price is worth acting on. UNKNOWN means "not enough history to say". */
export enum PriceVerdict {
  GREAT = 'GREAT',
  GOOD = 'GOOD',
  TYPICAL = 'TYPICAL',
  HIGH = 'HIGH',
  UNKNOWN = 'UNKNOWN',
}

/** Rolling window, so a three-year-old price stops anchoring the answer. */
export const DEFAULT_WINDOW_DAYS = 365;

/** Fewer than this many observations in the window and the verdict is UNKNOWN, not a guess. */
export const MINIMUM_OBSERVATIONS = 3;

/**
 * The answer to "is this a good price?", derived from an item and its history. No table of its
 * own. Every unit price here is expressed in the item's OWN unit (`displayUnit`), not the
 * canonical base — these are numbers meant to be read.
 */
export interface PriceInsight {
  pantryItemId: string;
  windowDays: number;
  /** Observations inside the window. The statistics below are all over that set. */
  observationCount: number;
  /** The most recent entry overall, even if it predates the window — "what I last paid". */
  latest: Maybe<PriceEntry>;
  displayUnit: Unit;
  currency: Maybe<string>;
  latestUnitPrice: Maybe<number>;
  lowestUnitPrice: Maybe<number>;
  highestUnitPrice: Maybe<number>;
  medianUnitPrice: Maybe<number>;
  /** Percentile rank of the latest within the window: 0 = cheapest seen, 1 = dearest. */
  percentile: Maybe<number>;
  /** How far below the median the latest sits, as a percentage. Negative when it is above. */
  savingsVsMedianPct: Maybe<number>;
  /** Null when the item has no target price set. */
  meetsTargetPrice: Maybe<boolean>;
  /** The store behind the cheapest observation in the window. */
  cheapestMerchantId: Maybe<string>;
  verdict: PriceVerdict;
  formattedLatestUnitPrice: Maybe<string>;
}

export interface BuildPriceInsightInput {
  item: PantryItem;
  entries: readonly PriceEntry[];
  windowDays: number;
}

export interface PriceInsightService {
  /** Pure: the caller supplies the history, so a page of items costs one batched query. */
  buildPriceInsight: (input: BuildPriceInsightInput) => PriceInsight;
  listPriceInsights: (input: { windowDays: number }) => Promise<PriceInsight[]>;
}
