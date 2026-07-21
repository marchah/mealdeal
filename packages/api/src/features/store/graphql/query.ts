import { builder } from '../../../builder';
import {
  LocationLookupError,
  LocationNotConfiguredError,
  LocationNotFoundError,
  ValidationError,
} from '../../../common/errors';
import { NewsletterRef } from '../../../entities/newsletter/graphql/type';
import { NearbyDealGroupRef, StoreRef } from './type';

export const DEFAULT_NEAR_ME_RADIUS_MILES = 25;

const nearMeErrors = {
  types: [LocationNotConfiguredError, LocationNotFoundError, LocationLookupError, ValidationError],
};

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
  storesNearMe: t.field({
    type: [StoreRef],
    errors: nearMeErrors,
    args: {
      radiusMiles: t.arg.float({
        defaultValue: DEFAULT_NEAR_ME_RADIUS_MILES,
        validate: { min: 0, max: 500 },
      }),
    },
    resolve: (_root, args, ctx) =>
      ctx.services.nearMeService.storesNearMe({
        radiusMiles: args.radiusMiles ?? DEFAULT_NEAR_ME_RADIUS_MILES,
      }),
  }),
  dealsNearMe: t.field({
    type: [NearbyDealGroupRef],
    errors: nearMeErrors,
    args: {
      radiusMiles: t.arg.float({
        defaultValue: DEFAULT_NEAR_ME_RADIUS_MILES,
        validate: { min: 0, max: 500 },
      }),
    },
    resolve: (_root, args, ctx) =>
      ctx.services.nearMeService.dealsNearMe({
        radiusMiles: args.radiusMiles ?? DEFAULT_NEAR_ME_RADIUS_MILES,
      }),
  }),
  recommendedNewsletters: t.field({
    type: [NewsletterRef],
    errors: nearMeErrors,
    args: {
      radiusMiles: t.arg.float({
        defaultValue: DEFAULT_NEAR_ME_RADIUS_MILES,
        validate: { min: 0, max: 500 },
      }),
    },
    resolve: (_root, args, ctx) =>
      ctx.services.nearMeService.recommendedNewsletters({
        radiusMiles: args.radiusMiles ?? DEFAULT_NEAR_ME_RADIUS_MILES,
      }),
  }),
}));
