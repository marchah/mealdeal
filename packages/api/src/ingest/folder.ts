import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { EmailSource, FetchedEmail } from './imap';

/** A deterministic, offline email source. Only top-level Markdown files are eligible. */
export function folderEmailSourceFactory({ directory }: { directory: string }): EmailSource {
  const fetchedFiles = new Map<number, string>();

  async function fetchUnseen(limit: number): Promise<FetchedEmail[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const names = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => entry.name)
      .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
      .slice(0, limit);

    const emails: FetchedEmail[] = [];
    for (const name of names) {
      const path = join(directory, name);
      const file = await stat(path);
      if (!file.isFile()) continue;
      const uid = stableUid(name);
      fetchedFiles.set(uid, path);
      emails.push({
        uid,
        from: 'offline-folder',
        subject: basename(name, '.md'),
        date: new Date(0),
        text: await readFile(path, 'utf8'),
        html: null,
      });
    }
    return emails;
  }

  async function markSeen(uids: readonly number[]): Promise<void> {
    const processedDirectory = join(directory, 'processed');
    for (const uid of uids) {
      const source = fetchedFiles.get(uid);
      if (!source) continue;
      await mkdir(processedDirectory, { recursive: true });
      await rename(source, join(processedDirectory, basename(source)));
      fetchedFiles.delete(uid);
    }
  }

  return { fetchUnseen, markSeen };
}

/** File-name hash is stable across passes and safely representable as a JS integer. */
export function stableUid(name: string): number {
  return Number.parseInt(createHash('sha256').update(name).digest('hex').slice(0, 12), 16);
}
