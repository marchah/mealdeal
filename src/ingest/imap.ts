import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { Config } from '../config.ts';
import type { FetchedEmail } from '../types.ts';

/** Fetch unseen messages from the mailbox; mark them seen so the next run skips them. */
export async function fetchUnseen(cfg: Config, markSeen = true): Promise<FetchedEmail[]> {
  const client = new ImapFlow({
    host: cfg.imap.host,
    port: cfg.imap.port,
    secure: true,
    auth: { user: cfg.imap.user, pass: cfg.imap.password },
    logger: false,
  });
  const out: FetchedEmail[] = [];
  await client.connect();
  try {
    const lock = await client.getMailboxLock(cfg.imap.mailbox);
    try {
      const uids = await client.search({ seen: false }, { uid: true });
      if (!uids || uids.length === 0) return out;
      for await (const msg of client.fetch(uids, { source: true, uid: true }, { uid: true })) {
        if (!msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const to = parsed.to;
        const toText = Array.isArray(to) ? to.map((a) => a.text).join(', ') : (to?.text ?? '');
        out.push({
          uid: msg.uid,
          from: parsed.from?.text ?? '',
          toAlias: extractPlusAlias(toText),
          subject: parsed.subject ?? '',
          date: (parsed.date ?? new Date()).toISOString(),
          text: parsed.text ?? (typeof parsed.html === 'string' ? htmlToText(parsed.html) : ''),
        });
      }
      if (markSeen) await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true });
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
  return out;
}

/** From "you+safeway@gmail.com" → "safeway" (source attribution). */
function extractPlusAlias(toText: string): string | null {
  const m = toText.match(/[^\s<]+\+([^@\s>]+)@/);
  return m ? m[1] : null;
}

/** Dependency-free HTML→text. LLMs handle raw HTML too, but this trims noise/tokens. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
