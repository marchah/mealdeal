import { builder } from '../../../builder';
import { ValidationError } from '../../../common/errors';
import { StoreRef } from './type';

builder.queryFields((t) => ({
  storesNearLocation: t.field({
    type: [StoreRef],
    errors: { types: [ValidationError] },
    args: {
      lat: t.arg.float({ required: true, validate: { min: -90, max: 90 } }),
      lng: t.arg.float({ required: true, validate: { min: -180, max: 180 } }),
      radiusMiles: t.arg.float({ required: true, validate: { min: 0, max: 500 } }),
    },
    resolve: (_root, args, ctx) =>
      ctx.services.storeService.storesNearLocation({
        lat: args.lat,
        lng: args.lng,
        radiusMiles: args.radiusMiles,
      }),
  }),
}));
