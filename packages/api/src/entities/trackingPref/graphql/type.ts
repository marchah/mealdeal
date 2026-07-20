import { builder } from '../../../builder';
import type { TrackingPref } from '../types';

export const PrefKindEnum = builder.enumType('PrefKind', {
  values: ['mute', 'watchlist'] as const,
});
export const PrefScopeEnum = builder.enumType('PrefScope', {
  values: ['item', 'category'] as const,
});

export const TrackingPrefRef = builder.objectRef<TrackingPref>('TrackingPref');
TrackingPrefRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    kind: t.field({ type: PrefKindEnum, resolve: (pref) => pref.kind }),
    scope: t.field({ type: PrefScopeEnum, resolve: (pref) => pref.scope }),
    value: t.exposeString('value'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
});
