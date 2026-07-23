import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { createDb } from '../../src/db/client';
import { deals, merchants } from '../../src/db/schema';
import type { DealExtractor } from '../../src/ingest/extractor';
import { folderEmailSourceFactory } from '../../src/ingest/folder';
import { ingestOnce } from '../../src/ingest/run';
import { getServices } from '../../src/services';

const fixtureDirectory = new URL('../fixtures/ingest/', import.meta.url);

beforeEach(async () => {
  const db = createDb();
  await db.delete(deals);
  await db.delete(merchants);
});

test('folder-backed ingest uses the real database composition and remains idempotent on replay', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mealdeal-ingest-fixture-'));
  try {
    await cp(fixtureDirectory, directory, { recursive: true });
    const source = folderEmailSourceFactory({ directory });
    const extractor: DealExtractor = {
      extract: () =>
        Promise.resolve([{ merchant: 'Fixture Market', title: 'Sweet corn special', price: 2 }]),
    };

    const first = await ingestOnce({ emailSource: source, extractor, services: getServices() });
    await cp(join(directory, 'processed', 'market-week.md'), join(directory, 'market-week.md'));
    const replay = await ingestOnce({ emailSource: source, extractor, services: getServices() });

    expect(first).toMatchObject({ messagesSeen: 1, dealsAdded: 1, messagesFailed: 0 });
    expect(replay).toMatchObject({ messagesSeen: 1, dealsAdded: 0, messagesFailed: 0 });
    expect(await createDb().select().from(deals)).toHaveLength(1);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
