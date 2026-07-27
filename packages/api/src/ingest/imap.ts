import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { EmailSourceError } from '../common/errors';
import { logWarning } from '../common/logger';
import type { ImapSettings } from '../common/settings';
import type { EmailSource, FetchedEmail } from './email';

/** Mailparser represents a missing HTML part as `undefined` or `false`. Keep that detail at
 * the IMAP boundary so the rest of ingest only has to distinguish HTML from no HTML. */
export function normalizeHtmlPart(html: string | false | undefined): string | null {
  if (typeof html !== 'string' || html.trim() === '') return null;
  return html;
}

function readProperty(source: unknown, key: string): unknown {
  if (typeof source !== 'object' || source === null) return undefined;
  return (source as Record<string, unknown>)[key];
}

function readStringProperty(source: unknown, key: string): string | undefined {
  const value = readProperty(source, key);
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** Translate an ImapFlow failure into an actionable typed error — the same "keep the provider's
 * detail at the boundary" idea as normalizeHtmlPart above.
 *
 * ImapFlow throws `Error('Command failed')` for everything from rejected credentials to a dropped
 * socket, and puts what actually happened on non-standard properties (`authenticationFailed`,
 * `serverResponseCode`, `responseText`). Reading only `error.message` discards all of it, which left
 * the token-gated `POST /internal/ingest` answering `{"error":"Command failed"}` with no way to tell
 * a wrong password from an unreachable host. */
export function toEmailSourceError(error: unknown, host: string): EmailSourceError {
  if (error instanceof EmailSourceError) return error;

  const authenticationFailed = readProperty(error, 'authenticationFailed') === true;
  const serverResponseCode = readStringProperty(error, 'serverResponseCode');
  const responseText = readStringProperty(error, 'responseText');
  const fallback = error instanceof Error ? error.message : 'unknown error';
  const detail = responseText ?? fallback;

  // Credentials are the common cause and the remedy is provider-specific, so name it rather than
  // leaving the operator to reach for a packet capture.
  const message = authenticationFailed
    ? `IMAP authentication failed for ${host}: ${detail}. Check IMAP_USER (most providers, Gmail and Zoho included, require the full email address) and IMAP_PASSWORD (an app-specific password is required when 2FA is enabled).`
    : `IMAP request to ${host} failed: ${detail}`;

  return new EmailSourceError(message, {
    host,
    authenticationFailed,
    serverResponseCode,
    responseText,
  });
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
    // Connect is its own step: on failure there is no session to log out of, and the original
    // code deliberately kept it outside the finally for that reason.
    try {
      await client.connect();
    } catch (error) {
      throw toEmailSourceError(error, config.IMAP_HOST);
    }
    try {
      const lock = await client.getMailboxLock(config.IMAP_MAILBOX);
      try {
        return await fn(client);
      } finally {
        lock.release();
      }
    } catch (error) {
      throw toEmailSourceError(error, config.IMAP_HOST);
    } finally {
      // Best-effort: a logout that throws while unwinding would REPLACE the real failure with a
      // misleading one, which is the same detail-loss bug this function exists to fix.
      try {
        await client.logout();
      } catch (logoutError) {
        logWarning('IMAP logout failed; the session will time out server-side', {
          tag: 'INGEST',
          extra: { host: config.IMAP_HOST, error: logoutError },
        });
      }
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
