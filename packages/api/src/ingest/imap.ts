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
  return {
    async fetchUnseen(limit) {
      const client = new ImapFlow({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: { user: config.user, pass: config.pass },
        logger: false,
      });
      const emails: FetchedEmail[] = [];
      await client.connect();
      try {
        const lock = await client.getMailboxLock(config.mailbox);
        try {
          const uids = await client.search({ seen: false }, { uid: true });
          const chosen = (uids === false ? [] : uids).slice(0, limit);
          if (chosen.length === 0) return [];
          const seenUids: number[] = [];
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
            seenUids.push(message.uid);
          }
          // Mark fetched messages \Seen so the next cron pass doesn't re-extract them
          // (repeated LLM cost). This is the boundary's "consume" step.
          if (seenUids.length > 0) {
            await client.messageFlagsAdd(seenUids, ['\\Seen'], { uid: true });
          }
        } finally {
          lock.release();
        }
      } finally {
        await client.logout();
      }
      return emails;
    },
  };
}
