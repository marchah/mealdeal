/** Canonical email data consumed by the ingest pipeline, independent of its source adapter. */
export interface FetchedEmail {
  uid: number;
  from: string;
  subject: string;
  date: Date;
  text: string;
  html: string | null;
}

/**
 * Source port for at-least-once ingest. Call markSeen only after the email's deals are durable so
 * a source keeps failed work available for a later retry.
 */
export interface EmailSource {
  fetchUnseen: (limit: number) => Promise<FetchedEmail[]>;
  markSeen: (uids: readonly number[]) => Promise<void>;
}
