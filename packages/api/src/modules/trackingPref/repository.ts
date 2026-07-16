import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { trackingPrefs } from '../../db/schema';
import type { Db } from '../../db/client';
import type { PrefKind, TrackingPref, TrackingPrefRepository } from './types';

export function trackingPrefRepositoryFactory({ db }: { db: Db }): TrackingPrefRepository {
  return {
    async list() {
      return db.select().from(trackingPrefs);
    },
    async listByKind(kind: PrefKind) {
      return db.select().from(trackingPrefs).where(eq(trackingPrefs.kind, kind));
    },
    async add(input) {
      // Idempotent: a repeat (kind, scope, value) is a no-op insert; return the stored row.
      const row: TrackingPref = { id: randomUUID(), createdAt: new Date(), ...input };
      await db
        .insert(trackingPrefs)
        .values(row)
        .onConflictDoNothing({
          target: [trackingPrefs.kind, trackingPrefs.scope, trackingPrefs.value],
        });
      const stored = await db
        .select()
        .from(trackingPrefs)
        .where(
          and(
            eq(trackingPrefs.kind, input.kind),
            eq(trackingPrefs.scope, input.scope),
            eq(trackingPrefs.value, input.value),
          ),
        )
        .limit(1);
      return stored[0] ?? row;
    },
    async remove(id) {
      const result = await db.delete(trackingPrefs).where(eq(trackingPrefs.id, id));
      return (result.rowsAffected ?? 0) > 0;
    },
  };
}
