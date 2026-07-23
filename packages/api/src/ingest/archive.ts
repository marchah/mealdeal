import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Save a canonical IMAP email body without allowing mailbox metadata into the path. */
export async function archiveCanonicalMarkdown({
  directory,
  email,
  body,
}: {
  directory: string;
  email: { uid: number; subject: string; date: Date };
  body: string;
}): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, archiveFilename(email)), body, 'utf8');
}

/** Deterministic ASCII filename, including a hash to avoid collisions between similar subjects. */
export function archiveFilename(email: { uid: number; subject: string; date: Date }): string {
  const day = Number.isNaN(email.date.getTime())
    ? 'unknown-date'
    : email.date.toISOString().slice(0, 10);
  const slug = email.subject
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60);
  const suffix = createHash('sha256')
    .update(`${String(email.uid)}:${email.subject}`)
    .digest('hex')
    .slice(0, 10);
  return `${day}-${String(email.uid)}-${slug || 'email'}-${suffix}.md`;
}
