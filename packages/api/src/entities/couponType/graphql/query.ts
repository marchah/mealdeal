import { builder } from '../../../builder';
import { CouponTypeRef } from './type';

builder.queryFields((t) => ({
  getCouponTypes: t.field({
    type: [CouponTypeRef],
    resolve: (_root, _args, ctx) => ctx.services.couponTypeService.getCouponTypes(),
  }),
}));
