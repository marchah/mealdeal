import { builder } from '../../../builder';
import { PrefKind, PrefScope, type TrackingPref } from '../types';

// Reuse the domain enums as the GraphQL enums (one source of truth). Pothos uses the enum keys as
// the GraphQL value names (SCREAMING_SNAKE_CASE, per the enum members in types.ts).
export const PrefKindEnum = builder.enumType(PrefKind, { name: 'PrefKind' });
export const PrefScopeEnum = builder.enumType(PrefScope, { name: 'PrefScope' });

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
