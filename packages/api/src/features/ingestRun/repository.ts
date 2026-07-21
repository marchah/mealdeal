import { randomUUID } from 'node:crypto';
import { count as sqlCount, desc, eq, isNotNull } from 'drizzle-orm';
import { ingestRuns } from '../../db/schema';
import type { Db } from '../../db/client';
import type { FinishIngestInput, IngestRun, IngestRunRepository } from './types';

export function ingestRunRepositoryFactory({ db }: { db: Db }): IngestRunRepository {
  async function lastIngestCompletedAt() {
    const rows = await db
      .select({ finishedAt: ingestRuns.finishedAt })
      .from(ingestRuns)
      .where(isNotNull(ingestRuns.finishedAt))
      .orderBy(desc(ingestRuns.finishedAt))
      .limit(1);
    return rows[0]?.finishedAt ?? null;
  }

  async function countIngestRuns() {
    const rows = await db.select({ value: sqlCount() }).from(ingestRuns);
    return rows[0]?.value ?? 0;
  }

  async function createIngestRun() {
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
  }

  async function finishIngestRun(id: string, input: FinishIngestInput) {
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
  }

  return { lastIngestCompletedAt, countIngestRuns, createIngestRun, finishIngestRun };
}
