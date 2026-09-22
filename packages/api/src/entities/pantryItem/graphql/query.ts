import { builder } from '../../../builder';
import { NotFoundError } from '../../../common/errors';
import { PantryItemRef } from './type';

builder.queryFields((t) => ({
  pantryItem: t.field({
    type: PantryItemRef,
    errors: { types: [NotFoundError] },
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, ctx) => ctx.services.pantryItemService.getPantryItemById(args.id),
  }),
  pantryItems: t.field({
    type: [PantryItemRef],
    args: {
      // Archived items stay out of the way by default; the history behind them is still there.
      includeArchived: t.arg.boolean({ defaultValue: false }),
      couponTypeId: t.arg.id({ required: false }),
    },
    resolve: (_root, args, ctx) =>
      ctx.services.pantryItemService.listPantryItems({
        includeArchived: args.includeArchived ?? false,
        couponTypeId: args.couponTypeId ?? null,
      }),
  }),
}));
