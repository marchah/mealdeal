import { builder } from '../../../builder';
import type { Merchant } from '../types';

// The GraphQL Merchant type. Exported so the deal slice can reference it for Deal.merchant.
export const MerchantRef = builder.objectRef<Merchant>('Merchant');

MerchantRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    address: t.exposeString('address', { nullable: true }),
    lat: t.exposeFloat('lat', { nullable: true }),
    lng: t.exposeFloat('lng', { nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
});
