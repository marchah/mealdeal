import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export interface FetchedEmail {
  uid: number;
  from: string;
  subject: string;
  date: Date;
  text: string;
}

export interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  mailbox: string;
}

export interface ImapClient {
  fetchUnseen(limit: number): Promise<FetchedEmail[]>;
  /** Acknowledge messages (\Seen). Call ONLY after their deals are durably stored, so a
   *  failed pass leaves them unseen for the next retry (at-least-once ingest). */
  markSeen(uids: readonly number[]): Promise<void>;
}

/** Build IMAP config from env, or null if the required vars are absent. */
export function imapConfigFromEnv(): ImapConfig | null {
  const { IMAP_HOST, IMAP_PORT, IMAP_USER, IMAP_PASSWORD, IMAP_MAILBOX, IMAP_SECURE } = process.env;
  if (!IMAP_HOST || !IMAP_USER || !IMAP_PASSWORD) return null;
  return {
    host: IMAP_HOST,
    port: Number(IMAP_PORT ?? 993),
    secure: IMAP_SECURE !== 'false',
    user: IMAP_USER,
    pass: IMAP_PASSWORD,
    mailbox: IMAP_MAILBOX ?? 'INBOX',
  };
}

export function imapClientFactory({ config }: { config: ImapConfig }): ImapClient {
  // Connect, lock the mailbox, run fn, then always release + logout.
  async function withMailbox<T>(fn: (client: ImapFlow) => Promise<T>): Promise<T> {
    const client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
      logger: false,
    });
    await client.connect();
    try {
      const lock = await client.getMailboxLock(config.mailbox);
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
