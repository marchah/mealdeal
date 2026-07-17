import { builder } from '../../builder';
import type { CouponType } from './types';

const CouponTypeRef = builder.objectRef<CouponType>('CouponType');
CouponTypeRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    key: t.exposeString('key'),
    label: t.exposeString('label'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
});

builder.queryFields((t) => ({
  couponTypes: t.field({
    type: [CouponTypeRef],
    resolve: (_root, _args, ctx) => ctx.services.couponTypeService.getCouponTypes(),
  }),
}));
