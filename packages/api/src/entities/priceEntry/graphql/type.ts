import { builder } from '../../../builder';
import { NotFoundError } from '../../../common/errors';
import { formatUnitPrice, unitPriceIn } from '../../../common/units';
import { MerchantRef } from '../../merchant/graphql/type';
import { PantryItemRef, UnitRef } from '../../pantryItem/graphql/type';
import { PriceSource, type PriceEntry } from '../types';

export const PriceSourceRef = builder.enumType(PriceSource, { name: 'PriceSource' });

export const PriceEntryRef = builder.objectRef<PriceEntry>('PriceEntry');
PriceEntryRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    pantryItemId: t.exposeID('pantryItemId'),
    price: t.exposeFloat('price'),
    currency: t.exposeString('currency'),
    sizeAmount: t.exposeFloat('sizeAmount'),
    sizeUnit: t.expose('sizeUnit', { type: UnitRef }),
    quantity: t.exposeFloat('quantity'),
    // Per base unit (ounce / fluid ounce / count / square foot) — the comparable number. Reading
    // it in the item's own unit is presentation, and belongs with the item (see priceInsight).
    unitPrice: t.exposeFloat('unitPrice'),
    // The same price read in the item's own unit. Presentation, not business logic — but it needs
    // the conversion table, which is the server's, so the browser is not handed a second copy.
    displayUnitPrice: t.float({
      resolve: async (entry, _args, ctx) => {
        const item = await ctx.loaders.pantryItemById.load(entry.pantryItemId);
        if (!item) throw new NotFoundError(`Pantry item ${entry.pantryItemId} not found`);
        return unitPriceIn(entry.unitPrice, item.unitPriceUnit);
      },
    }),
    formattedUnitPrice: t.string({
      resolve: async (entry, _args, ctx) => {
        const item = await ctx.loaders.pantryItemById.load(entry.pantryItemId);
        if (!item) throw new NotFoundError(`Pantry item ${entry.pantryItemId} not found`);
        return formatUnitPrice({
          baseUnitPrice: entry.unitPrice,
          displayUnit: item.unitPriceUnit,
          currency: entry.currency,
        });
      },
    }),
    onSale: t.exposeBoolean('onSale'),
    source: t.expose('source', { type: PriceSourceRef }),
    url: t.exposeString('url', { nullable: true }),
    note: t.exposeString('note', { nullable: true }),
    observedAt: t.expose('observedAt', { type: 'DateTime' }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    merchant: t.field({
      type: MerchantRef,
      nullable: true,
      resolve: async (entry, _args, ctx) => {
        if (entry.merchantId === null) return null;
        const merchant = await ctx.loaders.merchantById.load(entry.merchantId);
        if (!merchant) throw new NotFoundError(`Merchant ${entry.merchantId} not found`);
        return merchant;
      },
    }),
  }),
});

// Contributed onto PantryItem from this side, so the dependency runs priceEntry -> pantryItem
// only. Declaring it in pantryItem's own type module would need PriceEntryRef there, and the two
// modules would import each other — with UnitRef read before it is initialized.
builder.objectField(PantryItemRef, 'priceEntries', (t) =>
  t.field({
    type: [PriceEntryRef],
    args: {
      limit: t.arg.int({ required: false, validate: { positive: true, max: 500 } }),
      since: t.arg({ type: 'DateTime', required: false }),
    },
    // One batched query per request loads every entry for the items on the page; `since` and
    // `limit` narrow that in memory. A personal pantry's history is small, and the whole series
    // is what the sparkline and the verdict both want anyway.
    resolve: async (item, args, ctx) => {
      const entries = await ctx.loaders.priceEntriesByPantryItemId.load(item.id);
      const since = args.since;
      const narrowed = since ? entries.filter((entry) => entry.observedAt >= since) : entries;
      return args.limit ? narrowed.slice(0, args.limit) : narrowed;
    },
  }),
);
