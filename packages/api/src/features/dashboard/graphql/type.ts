import { builder } from '../../../builder';
import type { Stats } from '../types';

export const StatsRef = builder.objectRef<Stats>('Stats');
StatsRef.implement({
  fields: (t) => ({
    totalDeals: t.exposeInt('totalDeals'),
    activeDeals: t.exposeInt('activeDeals'),
    merchants: t.exposeInt('merchants'),
    lastIngestAt: t.expose('lastIngestAt', { type: 'DateTime', nullable: true }),
  }),
});
