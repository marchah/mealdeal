import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { ImapSettings } from '../common/settings';

export interface FetchedEmail {
  uid: number;
  from: string;
  subject: string;
  date: Date;
  text: string;
  html: string | null;
}

/** Acknowledged only after the email's deals have been durably processed. */
export interface EmailSource {
  fetchUnseen(limit: number): Promise<FetchedEmail[]>;
  /** Acknowledge messages (\Seen). Call ONLY after their deals are durably stored, so a
   *  failed pass leaves them unseen for the next retry (at-least-once ingest). */
  markSeen(uids: readonly number[]): Promise<void>;
}

/** Mailparser represents a missing HTML part as `undefined` or `false`. Keep that detail at
 * the IMAP boundary so the rest of ingest only has to distinguish HTML from no HTML. */
export function normalizeHtmlPart(html: string | false | undefined): string | null {
  if (typeof html !== 'string' || html.trim() === '') return null;
  return html;
}

export function imapClientFactory({ config }: { config: ImapSettings }): EmailSource {
  // Connect, lock the mailbox, run fn, then always release + logout.
  async function withMailbox<T>(fn: (client: ImapFlow) => Promise<T>): Promise<T> {
    const client = new ImapFlow({
      host: config.IMAP_HOST,
      port: config.IMAP_PORT,
      secure: config.IMAP_SECURE,
      auth: { user: config.IMAP_USER, pass: config.IMAP_PASSWORD },
      logger: false,
    });
    await client.connect();
    try {
      const lock = await client.getMailboxLock(config.IMAP_MAILBOX);
      try {
        return await fn(client);
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  }

  return {
    fetchUnseen(limit) {
      return withMailbox(async (client) => {
        const emails: FetchedEmail[] = [];
        const uids = await client.search({ seen: false }, { uid: true });
        const chosen = (uids === false ? [] : uids).slice(0, limit);
        if (chosen.length === 0) return emails;
        for await (const message of client.fetch(
          chosen,
          { uid: true, source: true },
          { uid: true },
        )) {
          if (!message.source) continue;
          const parsed = await simpleParser(message.source);
          emails.push({
            uid: message.uid,
            from: parsed.from?.text ?? '',
            subject: parsed.subject ?? '',
            date: parsed.date ?? new Date(),
            text: parsed.text ?? '',
            html: normalizeHtmlPart(parsed.html),
          });
        }
        return emails;
      });
    },
    markSeen(uids) {
      if (uids.length === 0) return Promise.resolve();
      return withMailbox(async (client) => {
        await client.messageFlagsAdd([...uids], ['\\Seen'], { uid: true });
      });
    },
  };
}
