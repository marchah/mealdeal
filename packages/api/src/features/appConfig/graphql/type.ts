import { builder } from '../../../builder';
import type { AppConfig } from '../types';

export const AppConfigRef = builder.objectRef<AppConfig>('AppConfig');
AppConfigRef.implement({
  fields: (t) => ({
    couponIngestEnabled: t.exposeBoolean('couponIngestEnabled'),
    lastIngestAt: t.expose('lastIngestAt', { type: 'DateTime', nullable: true }),
  }),
});
