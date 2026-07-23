import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { folderEmailSourceFactory, stableUid } from './folder';

const directories: string[] = [];

async function makeDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'mealdeal-folder-source-'));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('folderEmailSourceFactory', () => {
  it('reads only Markdown in deterministic order and honors the batch limit', async () => {
    const directory = await makeDirectory();
    await writeFile(join(directory, 'z-last.md'), 'last');
    await writeFile(join(directory, 'a-first.md'), 'first');
    await writeFile(join(directory, 'ignored.txt'), 'ignore');
    await mkdir(join(directory, 'nested.md'));
    const source = folderEmailSourceFactory({ directory });

    const firstBatch = await source.fetchUnseen(1);
    const all = await source.fetchUnseen(10);

    expect(firstBatch.map((email) => email.subject)).toEqual(['a-first']);
    expect(all.map((email) => email.subject)).toEqual(['a-first', 'z-last']);
    expect(all[0]?.uid).toBe(stableUid('a-first.md'));
    expect(await readFile(join(directory, 'a-first.md'), 'utf8')).toBe('first');
  });

  it('moves only acknowledged files to processed and leaves failed work available for retry', async () => {
    const directory = await makeDirectory();
    await writeFile(join(directory, 'good.md'), 'good');
    await writeFile(join(directory, 'retry.md'), 'retry');
    const source = folderEmailSourceFactory({ directory });
    const emails = await source.fetchUnseen(10);
    const good = emails.find((email) => email.subject === 'good');

    await source.markSeen([good!.uid]);

    expect(await readFile(join(directory, 'processed', 'good.md'), 'utf8')).toBe('good');
    expect((await source.fetchUnseen(10)).map((email) => email.subject)).toEqual(['retry']);
  });

  it('returns an empty batch for an empty directory', async () => {
    const source = folderEmailSourceFactory({ directory: await makeDirectory() });

    await expect(source.fetchUnseen(25)).resolves.toEqual([]);
  });
});
