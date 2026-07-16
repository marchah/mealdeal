import { builder } from '../../builder';
import { NotFoundError } from '../../common/errors';
import { MerchantRef } from '../merchant/schema.pothos';
import type { Deal, Stats } from './types';

const DealRef = builder.objectRef<Deal>('Deal');
DealRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    title: t.exposeString('title'),
    category: t.exposeString('category', { nullable: true }),
    item: t.exposeString('item', { nullable: true }),
    discountText: t.exposeString('discountText', { nullable: true }),
    discountPct: t.exposeFloat('discountPct', { nullable: true }),
    price: t.exposeFloat('price', { nullable: true }),
    currency: t.exposeString('currency', { nullable: true }),
    code: t.exposeString('code', { nullable: true }),
    url: t.exposeString('url', { nullable: true }),
    startsAt: t.expose('startsAt', { type: 'DateTime', nullable: true }),
    expiresAt: t.expose('expiresAt', { type: 'DateTime', nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    // Nested relation resolved through a per-request DataLoader (never a direct db read).
    merchant: t.field({
      type: MerchantRef,
      resolve: async (deal, _args, ctx) => {
        const merchant = await ctx.loaders.merchantById.load(deal.merchantId);
        if (!merchant) throw new NotFoundError(`Merchant ${deal.merchantId} not found`);
        return merchant;
      },
    }),
  }),
});

const StatsRef = builder.objectRef<Stats>('Stats');
StatsRef.implement({
  fields: (t) => ({
    totalDeals: t.exposeInt('totalDeals'),
    activeDeals: t.exposeInt('activeDeals'),
    merchants: t.exposeInt('merchants'),
    lastIngestAt: t.expose('lastIngestAt', { type: 'DateTime', nullable: true }),
  }),
});

builder.queryFields((t) => ({
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
  deal: t.field({
    type: DealRef,
    // Result union: `Deal | NotFoundError` (the good-practice typed-error pattern).
    errors: { types: [NotFoundError] },
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, ctx) => ctx.services.dealService.getById(args.id),
  }),
  dealsByMerchant: t.field({
    type: [DealRef],
    args: { merchantId: t.arg.id({ required: true }) },
    resolve: (_root, args, ctx) => ctx.services.dealService.dealsByMerchant(args.merchantId),
  }),
  stats: t.field({
    type: StatsRef,
    resolve: (_root, _args, ctx) => ctx.services.dealService.getStats(),
  }),
}));
