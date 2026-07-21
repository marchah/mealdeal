import { builder } from '../../../builder';
import { TrackingPrefRef } from './type';

builder.queryFields((t) => ({
  prefs: t.field({
    type: [TrackingPrefRef],
    resolve: (_root, _args, ctx) => ctx.services.trackingPrefService.listPrefs(),
  }),
}));
