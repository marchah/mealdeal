import { builder } from '../../../builder';
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
