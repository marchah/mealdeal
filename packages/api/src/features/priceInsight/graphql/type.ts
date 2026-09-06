import { builder } from '../../../builder';
import { MerchantRef } from '../../../entities/merchant/graphql/type';
import { PantryItemRef, UnitRef } from '../../../entities/pantryItem/graphql/type';
import { PriceEntryRef } from '../../../entities/priceEntry/graphql/type';
import { DEFAULT_WINDOW_DAYS, PriceVerdict, type PriceInsight } from '../types';

export const PriceVerdictRef = builder.enumType(PriceVerdict, { name: 'PriceVerdict' });

export const PriceInsightRef = builder.objectRef<PriceInsight>('PriceInsight');
PriceInsightRef.implement({
  fields: (t) => ({
    pantryItemId: t.exposeID('pantryItemId'),
    windowDays: t.exposeInt('windowDays'),
    observationCount: t.exposeInt('observationCount'),
    verdict: t.expose('verdict', { type: PriceVerdictRef }),
    latest: t.expose('latest', { type: PriceEntryRef, nullable: true }),
    // Every unit price below is in `displayUnit`, the item's own unit — not the canonical base.
    displayUnit: t.expose('displayUnit', { type: UnitRef }),
    currency: t.exposeString('currency', { nullable: true }),
    latestUnitPrice: t.exposeFloat('latestUnitPrice', { nullable: true }),
    lowestUnitPrice: t.exposeFloat('lowestUnitPrice', { nullable: true }),
    highestUnitPrice: t.exposeFloat('highestUnitPrice', { nullable: true }),
    medianUnitPrice: t.exposeFloat('medianUnitPrice', { nullable: true }),
    percentile: t.exposeFloat('percentile', { nullable: true }),
    savingsVsMedianPct: t.exposeFloat('savingsVsMedianPct', { nullable: true }),
    meetsTargetPrice: t.exposeBoolean('meetsTargetPrice', { nullable: true }),
    formattedLatestUnitPrice: t.exposeString('formattedLatestUnitPrice', { nullable: true }),
    cheapestMerchant: t.field({
      type: MerchantRef,
      nullable: true,
      resolve: (insight, _args, ctx) =>
        insight.cheapestMerchantId === null
          ? null
          : ctx.loaders.merchantById.load(insight.cheapestMerchantId),
    }),
  }),
});

// Contributed onto PantryItem from this side, so the dependency runs priceInsight -> entities
// only (same reason as PantryItem.priceEntries). The history comes from the per-request loader,
// so a page of items costs one query for all of them; the verdict itself is pure computation.
builder.objectField(PantryItemRef, 'insight', (t) =>
  t.field({
    type: PriceInsightRef,
    args: {
      windowDays: t.arg.int({
        defaultValue: DEFAULT_WINDOW_DAYS,
        validate: { positive: true, max: 3_650 },
      }),
    },
    resolve: async (item, args, ctx) => {
      const entries = await ctx.loaders.priceEntriesByPantryItemId.load(item.id);
      return ctx.services.priceInsightService.buildPriceInsight({
        item,
        entries,
        windowDays: args.windowDays ?? DEFAULT_WINDOW_DAYS,
      });
    },
  }),
);
