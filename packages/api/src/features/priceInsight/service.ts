import type { Maybe } from '../../common/types';
import { formatUnitPrice, unitPriceIn } from '../../common/units';
import type { PantryItemService } from '../../entities/pantryItem/types';
import type { PriceEntry, PriceEntryService } from '../../entities/priceEntry/types';
import {
  MINIMUM_OBSERVATIONS,
  PriceVerdict,
  type BuildPriceInsightInput,
  type PriceInsight,
  type PriceInsightService,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1_000;

/**
 * Percentile thresholds for the verdict. Deliberately coarse and explainable: the point is to say
 * "cheap for this item" out loud, not to imply precision the sample size cannot support.
 */
const GREAT_BELOW = 0.15;
const GOOD_BELOW = 0.35;
const TYPICAL_BELOW = 0.75;

/**
 * Median, not mean. One warehouse-club bulk buy at half the usual unit price would drag a mean
 * down far enough to make every ordinary price look expensive.
 */
function median(sortedAscending: readonly number[]): Maybe<number> {
  const count = sortedAscending.length;
  if (count === 0) return null;
  const middle = Math.floor(count / 2);
  if (count % 2 === 1) return sortedAscending[middle] ?? null;
  const lower = sortedAscending[middle - 1];
  const upper = sortedAscending[middle];
  return lower === undefined || upper === undefined ? null : (lower + upper) / 2;
}

/**
 * Percentile RANK, counting ties as half. A plain "fraction strictly below" would score a history
 * of identical prices as 0 — the cheapest ever seen — and call an utterly ordinary price GREAT.
 */
function percentileRank(sortedAscending: readonly number[], value: number): Maybe<number> {
  const count = sortedAscending.length;
  if (count === 0) return null;
  let below = 0;
  let equal = 0;
  for (const price of sortedAscending) {
    if (price < value) below += 1;
    else if (price === value) equal += 1;
  }
  return (below + equal / 2) / count;
}

function verdictFor({
  observationCount,
  percentile,
  meetsTargetPrice,
}: {
  observationCount: number;
  percentile: Maybe<number>;
  meetsTargetPrice: Maybe<boolean>;
}): PriceVerdict {
  // A target price is the user's own statement of what counts as good, so it does not wait for a
  // sample size — that is the point of setting one.
  if (meetsTargetPrice === true) return PriceVerdict.GREAT;
  if (observationCount < MINIMUM_OBSERVATIONS || percentile === null) return PriceVerdict.UNKNOWN;
  if (percentile <= GREAT_BELOW) return PriceVerdict.GREAT;
  if (percentile <= GOOD_BELOW) return PriceVerdict.GOOD;
  if (percentile <= TYPICAL_BELOW) return PriceVerdict.TYPICAL;
  return PriceVerdict.HIGH;
}

// Composes the two entity services into the app's answer to "is this a good price?". A feature may
// depend on entities; it uses their PORTS, never a repository.
export function priceInsightServiceFactory({
  pantryItemService: { listPantryItems },
  priceEntryService: { findPriceEntriesByPantryItemIds },
}: {
  pantryItemService: PantryItemService;
  priceEntryService: PriceEntryService;
}): PriceInsightService {
  function buildPriceInsight({ item, entries, windowDays }: BuildPriceInsightInput): PriceInsight {
    const displayUnit = item.unitPriceUnit;
    const inDisplayUnit = (baseUnitPrice: number) => unitPriceIn(baseUnitPrice, displayUnit);

    // Sorted here rather than trusted from the caller, so a loader that changes its ordering
    // cannot quietly turn the newest price into the oldest.
    const newestFirst = [...entries].sort(
      (left, right) => right.observedAt.getTime() - left.observedAt.getTime(),
    );
    const latest: Maybe<PriceEntry> = newestFirst[0] ?? null;

    const cutoff = new Date(Date.now() - windowDays * DAY_MS);
    const windowed = newestFirst.filter((entry) => entry.observedAt >= cutoff);
    const observationCount = windowed.length;

    if (observationCount === 0 || !latest) {
      // Any entry inside the window would also be the newest overall, so an empty window means
      // there is nothing recent to judge — but `latest` still reports what was last paid.
      return {
        pantryItemId: item.id,
        windowDays,
        observationCount,
        latest,
        displayUnit,
        currency: latest?.currency ?? null,
        latestUnitPrice: latest === null ? null : inDisplayUnit(latest.unitPrice),
        lowestUnitPrice: null,
        highestUnitPrice: null,
        medianUnitPrice: null,
        percentile: null,
        savingsVsMedianPct: null,
        meetsTargetPrice: null,
        cheapestMerchantId: null,
        verdict: PriceVerdict.UNKNOWN,
        formattedLatestUnitPrice:
          latest === null
            ? null
            : formatUnitPrice({
                baseUnitPrice: latest.unitPrice,
                displayUnit,
                currency: latest.currency,
              }),
      };
    }

    const cheapest = windowed.reduce((best, entry) =>
      entry.unitPrice < best.unitPrice ? entry : best,
    );
    const sorted = windowed.map((entry) => entry.unitPrice).sort((a, b) => a - b);
    const medianBase = median(sorted);
    const latestUnitPrice = inDisplayUnit(latest.unitPrice);

    // The target is a unit price in the item's own unit — "buy at or below $0.12 a fluid ounce" —
    // so it stays meaningful when the pack size changes, which a sticker-price target would not.
    const meetsTargetPrice = item.targetPrice === null ? null : latestUnitPrice <= item.targetPrice;
    const percentile = percentileRank(sorted, latest.unitPrice);

    return {
      pantryItemId: item.id,
      windowDays,
      observationCount,
      latest,
      displayUnit,
      currency: latest.currency,
      latestUnitPrice,
      lowestUnitPrice: inDisplayUnit(sorted[0] ?? latest.unitPrice),
      highestUnitPrice: inDisplayUnit(sorted[sorted.length - 1] ?? latest.unitPrice),
      medianUnitPrice: medianBase === null ? null : inDisplayUnit(medianBase),
      percentile,
      savingsVsMedianPct:
        medianBase === null || medianBase === 0
          ? null
          : ((medianBase - latest.unitPrice) / medianBase) * 100,
      meetsTargetPrice,
      cheapestMerchantId: cheapest.merchantId,
      verdict: verdictFor({ observationCount, percentile, meetsTargetPrice }),
      formattedLatestUnitPrice: formatUnitPrice({
        baseUnitPrice: latest.unitPrice,
        displayUnit,
        currency: latest.currency,
      }),
    };
  }

  async function listPriceInsights({ windowDays }: { windowDays: number }) {
    const items = await listPantryItems({ includeArchived: false, couponTypeId: null });
    const entries = await findPriceEntriesByPantryItemIds(items.map((item) => item.id));
    const byItemId = new Map<string, PriceEntry[]>(items.map((item) => [item.id, []]));
    for (const entry of entries) byItemId.get(entry.pantryItemId)?.push(entry);
    return items.map((item) =>
      buildPriceInsight({ item, entries: byItemId.get(item.id) ?? [], windowDays }),
    );
  }

  return { buildPriceInsight, listPriceInsights };
}
