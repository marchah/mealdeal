import { builder } from '../../../builder';
import { NotFoundError } from '../../../common/errors';
import { MerchantRef } from '../../merchant/graphql/type';
import { CouponTypeRef } from '../../couponType/graphql/type';
import type { Deal, Stats } from '../types';

export const DealRef = builder.objectRef<Deal>('Deal');
DealRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    title: t.exposeString('title'),
    couponTypeId: t.exposeID('couponTypeId', { nullable: true }),
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
    couponType: t.field({
      type: CouponTypeRef,
      nullable: true,
      resolve: (deal, _args, ctx) => ctx.services.dealService.getCouponType(deal),
    }),
  }),
});

export const StatsRef = builder.objectRef<Stats>('Stats');
StatsRef.implement({
  fields: (t) => ({
    totalDeals: t.exposeInt('totalDeals'),
    activeDeals: t.exposeInt('activeDeals'),
    merchants: t.exposeInt('merchants'),
    lastIngestAt: t.expose('lastIngestAt', { type: 'DateTime', nullable: true }),
  }),
});
