import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { archiveCanonicalMarkdown, archiveFilename } from './archive';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('archiveCanonicalMarkdown', () => {
  it('writes canonical Markdown under a deterministic path-safe filename', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mealdeal-archive-'));
    directories.push(directory);
    const email = {
      uid: 42,
      subject: '../../Weekly Deals: 50% off!',
      date: new Date('2026-01-02T12:00:00Z'),
    };

    await archiveCanonicalMarkdown({ directory, email, body: '# Weekly deals' });

    const filename = archiveFilename(email);
    expect(filename).toMatch(/^2026-01-02-42-weekly-deals-50-off-[a-f0-9]{10}\.md$/);
    expect(filename).not.toContain('/');
    expect(await readdir(directory)).toEqual([filename]);
  });
});
