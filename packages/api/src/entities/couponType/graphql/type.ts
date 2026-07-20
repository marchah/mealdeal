import { builder } from '../../../builder';
import type { CouponType } from '../types';

export const CouponTypeRef = builder.objectRef<CouponType>('CouponType');
CouponTypeRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    key: t.exposeString('key'),
    label: t.exposeString('label'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
});
