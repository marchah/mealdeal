import { randomUUID } from 'node:crypto';
import { count, desc, eq, isNotNull } from 'drizzle-orm';
import { ingestRuns } from '../../db/schema';
import type { Db } from '../../db/client';
import type { IngestRun, IngestRunRepository } from './types';

export function ingestRunRepositoryFactory({ db }: { db: Db }): IngestRunRepository {
  return {
    async create() {
      const row: IngestRun = {
        id: randomUUID(),
        startedAt: new Date(),
        finishedAt: null,
        messagesSeen: 0,
        dealsAdded: 0,
        messagesFailed: 0,
        error: null,
      };
      await db.insert(ingestRuns).values(row);
      return row;
    },
    async finish(id, input) {
      await db
        .update(ingestRuns)
        .set({
          finishedAt: new Date(),
          messagesSeen: input.messagesSeen,
          dealsAdded: input.dealsAdded,
          messagesFailed: input.messagesFailed,
          error: input.error ?? null,
        })
        .where(eq(ingestRuns.id, id));
    },
    async lastCompletedAt() {
      const rows = await db
        .select({ finishedAt: ingestRuns.finishedAt })
        .from(ingestRuns)
        .where(isNotNull(ingestRuns.finishedAt))
        .orderBy(desc(ingestRuns.finishedAt))
        .limit(1);
      return rows[0]?.finishedAt ?? null;
    },
    async count() {
      const rows = await db.select({ value: count() }).from(ingestRuns);
      return rows[0]?.value ?? 0;
    },
  };
}
