import { describe, expect, it } from 'vitest';
import { Unit } from '../../common/units';
import type { PantryItem, PantryItemService } from '../../entities/pantryItem/types';
import {
  PriceSource,
  type PriceEntry,
  type PriceEntryService,
} from '../../entities/priceEntry/types';
import { priceInsightServiceFactory } from './service';
import { DEFAULT_WINDOW_DAYS, PriceVerdict } from './types';

const DAY_MS = 24 * 60 * 60 * 1_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

const makeItem = (over: Partial<PantryItem> = {}): PantryItem => ({
  id: 'item-1',
  name: 'Laundry detergent',
  brand: null,
  couponTypeId: null,
  imageUrl: null,
  sizeAmount: 150,
  sizeUnit: Unit.FLUID_OUNCE,
  unitPriceUnit: Unit.FLUID_OUNCE,
  targetPrice: null,
  notes: null,
  archived: false,
  createdAt: daysAgo(400),
  ...over,
});

/** An observation, described by the only two things these tests care about. */
const entry = (unitPrice: number, days: number, over: Partial<PriceEntry> = {}): PriceEntry => ({
  id: `pe-${String(unitPrice)}-${String(days)}`,
  pantryItemId: 'item-1',
  merchantId: null,
  price: unitPrice * 150,
  currency: 'USD',
  sizeAmount: 150,
  sizeUnit: Unit.FLUID_OUNCE,
  quantity: 1,
  unitPrice,
  onSale: false,
  source: PriceSource.MANUAL,
  url: null,
  note: null,
  observedAt: daysAgo(days),
  createdAt: daysAgo(days),
  ...over,
});

function makeService(over: { items?: PantryItem[]; entries?: PriceEntry[] } = {}) {
  // @ts-expect-error partial mock: only listPantryItems is used
  const pantryItemService: PantryItemService = {
    listPantryItems: () => Promise.resolve(over.items ?? []),
  };
  // @ts-expect-error partial mock: only findPriceEntriesByPantryItemIds is used
  const priceEntryService: PriceEntryService = {
    findPriceEntriesByPantryItemIds: () => Promise.resolve(over.entries ?? []),
  };
  return priceInsightServiceFactory({ pantryItemService, priceEntryService });
}

function insightFor(entries: PriceEntry[], item = makeItem(), windowDays = DEFAULT_WINDOW_DAYS) {
  return makeService().buildPriceInsight({ item, entries, windowDays });
}

describe('priceInsight with too little history', () => {
  it('says nothing at all about an item with no prices', () => {
    const insight = insightFor([]);

    expect(insight.verdict).toBe(PriceVerdict.UNKNOWN);
    expect(insight.observationCount).toBe(0);
    expect(insight.latest).toBeNull();
    expect(insight.medianUnitPrice).toBeNull();
    expect(insight.percentile).toBeNull();
    expect(insight.formattedLatestUnitPrice).toBeNull();
  });

  it('withholds a verdict on one observation', () => {
    const insight = insightFor([entry(0.13, 1)]);

    expect(insight.verdict).toBe(PriceVerdict.UNKNOWN);
    expect(insight.observationCount).toBe(1);
    // The price is still reported — "unknown" is about the judgement, not the data.
    expect(insight.latestUnitPrice).toBeCloseTo(0.13, 10);
    expect(insight.formattedLatestUnitPrice).toBe('$0.13/fl oz');
  });

  it('withholds a verdict on two observations', () => {
    expect(insightFor([entry(0.11, 1), entry(0.2, 5)]).verdict).toBe(PriceVerdict.UNKNOWN);
  });

  it('starts judging at the third observation', () => {
    expect(insightFor([entry(0.11, 1), entry(0.2, 5), entry(0.19, 9)]).verdict).not.toBe(
      PriceVerdict.UNKNOWN,
    );
  });
});

describe('priceInsight statistics', () => {
  it('reports the lowest, highest and median of the window', () => {
    const insight = insightFor([entry(0.13, 1), entry(0.1, 5), entry(0.2, 9), entry(0.12, 20)]);

    expect(insight.lowestUnitPrice).toBeCloseTo(0.1, 10);
    expect(insight.highestUnitPrice).toBeCloseTo(0.2, 10);
    // Four values: the median is the midpoint of the middle two, (0.12 + 0.13) / 2.
    expect(insight.medianUnitPrice).toBeCloseTo(0.125, 10);
  });

  it('takes the middle value when the count is odd', () => {
    const insight = insightFor([entry(0.13, 1), entry(0.1, 5), entry(0.2, 9)]);
    expect(insight.medianUnitPrice).toBeCloseTo(0.13, 10);
  });

  it('resists a single outlier, which a mean would not', () => {
    // One clearance buy at a fifth of the usual price. The mean of these is ~0.166; the median
    // stays at the ordinary price, so ordinary prices keep reading as ordinary.
    const insight = insightFor([
      entry(0.2, 1),
      entry(0.2, 5),
      entry(0.2, 9),
      entry(0.2, 13),
      entry(0.04, 17),
    ]);

    expect(insight.medianUnitPrice).toBeCloseTo(0.2, 10);
    expect(insight.verdict).toBe(PriceVerdict.TYPICAL);
  });

  it('measures savings against the median, signed', () => {
    const cheaper = insightFor([entry(0.1, 1), entry(0.2, 5), entry(0.2, 9)]);
    expect(cheaper.savingsVsMedianPct).toBeCloseTo(50, 6);

    const dearer = insightFor([entry(0.3, 1), entry(0.2, 5), entry(0.2, 9)]);
    expect(dearer.savingsVsMedianPct).toBeCloseTo(-50, 6);
  });

  it('names the store behind the cheapest observation', () => {
    const insight = insightFor([
      entry(0.2, 1, { merchantId: 'target' }),
      entry(0.1, 5, { merchantId: 'costco' }),
      entry(0.15, 9, { merchantId: 'sams' }),
    ]);

    expect(insight.cheapestMerchantId).toBe('costco');
  });
});

describe('priceInsight verdict', () => {
  const spread = (latest: number) => [
    entry(latest, 1),
    ...[0.1, 0.11, 0.12, 0.13, 0.14, 0.15, 0.16, 0.17, 0.18].map((price, index) =>
      entry(price, index + 2),
    ),
  ];

  it('calls the cheapest price in a long history GREAT', () => {
    expect(insightFor(spread(0.09)).verdict).toBe(PriceVerdict.GREAT);
  });

  it('grades a price by where it sits, not by how it feels', () => {
    expect(insightFor(spread(0.115)).verdict).toBe(PriceVerdict.GOOD);
    expect(insightFor(spread(0.14)).verdict).toBe(PriceVerdict.TYPICAL);
    expect(insightFor(spread(0.25)).verdict).toBe(PriceVerdict.HIGH);
  });

  it('calls an unchanging price TYPICAL, never GREAT', () => {
    // Counting only prices strictly below would score every one of these as the cheapest ever.
    const insight = insightFor([entry(0.13, 1), entry(0.13, 5), entry(0.13, 9), entry(0.13, 13)]);

    expect(insight.percentile).toBeCloseTo(0.5, 10);
    expect(insight.verdict).toBe(PriceVerdict.TYPICAL);
  });

  it('is cautious with the cheapest of only three prices', () => {
    // Three points cannot support "the best you will see"; that needs a longer history.
    expect(insightFor([entry(0.1, 1), entry(0.2, 5), entry(0.3, 9)]).verdict).toBe(
      PriceVerdict.GOOD,
    );
  });
});

describe('priceInsight target price', () => {
  const item = makeItem({ targetPrice: 0.12 });

  it('calls a price at or below the target GREAT', () => {
    expect(insightFor([entry(0.1, 1), entry(0.2, 5), entry(0.2, 9)], item).verdict).toBe(
      PriceVerdict.GREAT,
    );
  });

  it('treats exactly the target as met', () => {
    const insight = insightFor([entry(0.12, 1), entry(0.2, 5), entry(0.2, 9)], item);
    expect(insight.meetsTargetPrice).toBe(true);
    expect(insight.verdict).toBe(PriceVerdict.GREAT);
  });

  it('honours the target before there is enough history to judge', () => {
    // A target is the user's own statement of what counts as good, so it does not wait for a
    // sample size — that is the point of setting one.
    const insight = insightFor([entry(0.1, 1)], item);

    expect(insight.meetsTargetPrice).toBe(true);
    expect(insight.verdict).toBe(PriceVerdict.GREAT);
  });

  it('falls back to the history when the target is not met', () => {
    const insight = insightFor([entry(0.19, 1), entry(0.2, 5), entry(0.2, 9)], item);

    expect(insight.meetsTargetPrice).toBe(false);
    expect(insight.verdict).not.toBe(PriceVerdict.GREAT);
  });

  it('compares the target in the item’s own unit, not the canonical base', () => {
    // Tracked per gallon with a $16 target: 0.125/fl oz is $16/gal, so it just qualifies.
    const perGallon = makeItem({ unitPriceUnit: Unit.GALLON, targetPrice: 16 });
    const insight = insightFor([entry(0.125, 1)], perGallon);

    expect(insight.latestUnitPrice).toBeCloseTo(16, 6);
    expect(insight.meetsTargetPrice).toBe(true);
  });

  it('reports no opinion on the target when none is set', () => {
    expect(insightFor([entry(0.1, 1)]).meetsTargetPrice).toBeNull();
  });
});

describe('priceInsight window', () => {
  it('ignores prices older than the window', () => {
    const insight = insightFor([entry(0.2, 1), entry(0.2, 5), entry(0.01, 400)]);

    expect(insight.observationCount).toBe(2);
    expect(insight.lowestUnitPrice).toBeCloseTo(0.2, 10);
  });

  it('includes a price sitting on the window boundary', () => {
    const insight = insightFor([entry(0.2, 1), entry(0.2, 5), entry(0.05, 364)]);

    expect(insight.observationCount).toBe(3);
    expect(insight.lowestUnitPrice).toBeCloseTo(0.05, 10);
  });

  it('narrows to a shorter window on request', () => {
    const insight = insightFor([entry(0.2, 1), entry(0.2, 5), entry(0.05, 100)], makeItem(), 30);

    expect(insight.observationCount).toBe(2);
    expect(insight.windowDays).toBe(30);
  });

  it('still reports the last price paid when the whole history predates the window', () => {
    // Otherwise an item you stopped tracking a year ago shows nothing at all, which is worse
    // than showing a stale price and saying the verdict is unknown.
    const insight = insightFor([entry(0.13, 500), entry(0.2, 600)]);

    expect(insight.observationCount).toBe(0);
    expect(insight.verdict).toBe(PriceVerdict.UNKNOWN);
    expect(insight.latest?.unitPrice).toBeCloseTo(0.13, 10);
    expect(insight.formattedLatestUnitPrice).toBe('$0.13/fl oz');
    expect(insight.medianUnitPrice).toBeNull();
  });

  it('reads the newest entry regardless of the order it arrives in', () => {
    const insight = insightFor([entry(0.2, 9), entry(0.11, 1), entry(0.2, 5)]);
    expect(insight.latest?.unitPrice).toBeCloseTo(0.11, 10);
  });
});

describe('listPriceInsights', () => {
  it('keeps each item’s history to itself', async () => {
    const tide = makeItem({ id: 'tide', name: 'Tide' });
    const coffee = makeItem({ id: 'coffee', name: 'Coffee', unitPriceUnit: Unit.OUNCE });
    const service = makeService({
      items: [tide, coffee],
      entries: [
        entry(0.2, 1, { pantryItemId: 'tide' }),
        entry(0.1, 5, { pantryItemId: 'tide' }),
        entry(1, 1, { pantryItemId: 'coffee' }),
      ],
    });

    const insights = await service.listPriceInsights({ windowDays: DEFAULT_WINDOW_DAYS });

    expect(insights.map((insight) => insight.observationCount)).toEqual([2, 1]);
    expect(insights[0]?.pantryItemId).toBe('tide');
  });

  it('returns an insight for an item with no history at all', async () => {
    const service = makeService({ items: [makeItem()], entries: [] });

    const [insight] = await service.listPriceInsights({ windowDays: DEFAULT_WINDOW_DAYS });

    expect(insight?.verdict).toBe(PriceVerdict.UNKNOWN);
  });
});
