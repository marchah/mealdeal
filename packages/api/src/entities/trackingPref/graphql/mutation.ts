import { builder } from '../../../builder';
import { PrefKindEnum, PrefScopeEnum, TrackingPrefRef } from './type';

builder.mutationFields((t) => ({
  addPref: t.field({
    type: TrackingPrefRef,
    args: {
      kind: t.arg({ type: PrefKindEnum, required: true }),
      scope: t.arg({ type: PrefScopeEnum, required: true }),
      // Zod-validated input (good practice: validate at the boundary).
      value: t.arg.string({ required: true, validate: { minLength: 1, maxLength: 200 } }),
    },
    resolve: (_root, args, ctx) =>
      ctx.services.trackingPrefService.addPref({
        kind: args.kind,
        scope: args.scope,
        value: args.value,
      }),
  }),
  removePref: t.field({
    type: 'Boolean',
    args: { id: t.arg.id({ required: true }) },
    // Idempotent: returns whether a row was removed.
    resolve: (_root, args, ctx) => ctx.services.trackingPrefService.removePref(args.id),
  }),
}));
