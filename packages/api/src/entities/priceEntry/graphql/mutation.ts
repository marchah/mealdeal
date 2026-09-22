import { builder } from '../../../builder';
import { ConflictError, NotFoundError, ValidationError } from '../../../common/errors';
import { UnitRef } from '../../pantryItem/graphql/type';
import { PriceSource } from '../types';
import { PriceEntryRef, PriceSourceRef } from './type';

const PriceEntryInputRef = builder.inputType('PriceEntryInput', {
  fields: (t) => ({
    pantryItemId: t.id({ required: true }),
    price: t.float({ required: true, validate: { positive: true } }),
    currency: t.string({ required: false, validate: { length: 3 } }),
    sizeAmount: t.float({ required: true, validate: { positive: true } }),
    sizeUnit: t.field({ type: UnitRef, required: true }),
    // Identical packs bought together: a 2-pack of 46 oz bottles is quantity 2, size 46.
    quantity: t.float({ required: false, validate: { positive: true } }),
    onSale: t.boolean({ required: false }),
    source: t.field({ type: PriceSourceRef, required: false }),
    // The store, by name — resolved to a merchant, creating one the first time it is seen.
    merchantName: t.string({ required: false, validate: { maxLength: 200 } }),
    url: t.string({
      required: false,
      validate: {
        maxLength: 2_000,
        url: true,
        refine: [(value) => /^https?:\/\//i.test(value), { message: 'url must be an http(s) URL' }],
      },
    }),
    note: t.string({ required: false, validate: { maxLength: 2_000 } }),
    // When the price was SEEN. Defaults to now, because most prices are logged as they are found.
    observedAt: t.field({ type: 'DateTime', required: false }),
  }),
});

builder.mutationFields((t) => ({
  addPriceEntry: t.field({
    type: PriceEntryRef,
    errors: { types: [ConflictError, NotFoundError, ValidationError] },
    args: { input: t.arg({ type: PriceEntryInputRef, required: true }) },
    resolve: (_root, args, ctx) =>
      ctx.services.priceEntryService.addPriceEntry({
        pantryItemId: args.input.pantryItemId,
        merchantName: args.input.merchantName ?? null,
        price: args.input.price,
        currency: args.input.currency ?? 'USD',
        sizeAmount: args.input.sizeAmount,
        sizeUnit: args.input.sizeUnit,
        quantity: args.input.quantity ?? 1,
        onSale: args.input.onSale ?? false,
        source: args.input.source ?? PriceSource.MANUAL,
        url: args.input.url ?? null,
        note: args.input.note ?? null,
        observedAt: args.input.observedAt ?? null,
      }),
  }),
  deletePriceEntry: t.field({
    type: PriceEntryRef,
    errors: { types: [NotFoundError] },
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, ctx) => ctx.services.priceEntryService.deletePriceEntry(args.id),
  }),
}));
