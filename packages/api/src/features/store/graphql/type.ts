import { builder } from '../../../builder';
import { CouponTypeRef } from '../../../entities/couponType/graphql/type';
import { DealRef } from '../../../entities/deal/graphql/type';
import type { NearbyDealGroup } from '../../nearMe/types';
import type { Store } from '../types';

export const StoreRef = builder.objectRef<Store>('Store');
StoreRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    address: t.exposeString('address', { nullable: true }),
    lat: t.exposeFloat('lat'),
    lng: t.exposeFloat('lng'),
    distanceMiles: t.exposeFloat('distanceMiles'),
  }),
});

export const NearbyDealGroupRef = builder.objectRef<NearbyDealGroup>('NearbyDealGroup');
NearbyDealGroupRef.implement({
  fields: (t) => ({
    couponType: t.field({
      type: CouponTypeRef,
      nullable: true,
      resolve: (group) => group.couponType,
    }),
    deals: t.field({ type: [DealRef], resolve: (group) => group.deals }),
  }),
});
