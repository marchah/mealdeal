import { builder } from '../../../builder';
import { NotFoundError } from '../../../common/errors';
import { DealRef } from './type';

builder.queryFields((t) => ({
  deal: t.field({
    type: DealRef,
    // Result union: `Deal | NotFoundError` (the good-practice typed-error pattern).
    errors: { types: [NotFoundError] },
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, ctx) => ctx.services.dealService.getDealById(args.id),
  }),
  deals: t.field({
    type: [DealRef],
    args: {
      activeOnly: t.arg.boolean({ defaultValue: true }),
      category: t.arg.string({ required: false }),
    },
    resolve: (_root, args, ctx) =>
      ctx.services.dealService.listDeals({
        activeOnly: args.activeOnly ?? true,
        category: args.category ?? null,
      }),
  }),
}));
