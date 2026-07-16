import { builder } from '../../builder';
import type { TrackingPref } from './types';

const PrefKindEnum = builder.enumType('PrefKind', { values: ['mute', 'watchlist'] as const });
const PrefScopeEnum = builder.enumType('PrefScope', { values: ['item', 'category'] as const });

const TrackingPrefRef = builder.objectRef<TrackingPref>('TrackingPref');
TrackingPrefRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    kind: t.field({ type: PrefKindEnum, resolve: (pref) => pref.kind }),
    scope: t.field({ type: PrefScopeEnum, resolve: (pref) => pref.scope }),
    value: t.exposeString('value'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
});

builder.queryFields((t) => ({
  prefs: t.field({
    type: [TrackingPrefRef],
    resolve: (_root, _args, ctx) => ctx.services.trackingPrefService.list(),
  }),
}));

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
      ctx.services.trackingPrefService.add({
        kind: args.kind,
        scope: args.scope,
        value: args.value,
      }),
  }),
  removePref: t.field({
    type: 'Boolean',
    args: { id: t.arg.id({ required: true }) },
    // Idempotent: returns whether a row was removed.
    resolve: (_root, args, ctx) => ctx.services.trackingPrefService.remove(args.id),
  }),
}));
