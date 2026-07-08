export interface Config {
  port: number;
  databasePath: string;
  imap: { host: string; port: number; user: string; password: string; mailbox: string };
  llm: { baseUrl: string; apiKey: string; model: string };
  ingestCron: string;
  ingestOnStart: boolean;
  ingestToken: string | null;
}

export function loadConfig(): Config {
  return {
    port: Number(process.env.PORT ?? 3000),
    databasePath: process.env.DATABASE_PATH ?? './data/mealdeal.db',
    imap: {
      host: process.env.IMAP_HOST ?? 'imap.gmail.com',
      port: Number(process.env.IMAP_PORT ?? 993),
      user: process.env.IMAP_USER ?? '',
      password: process.env.IMAP_PASSWORD ?? '',
      mailbox: process.env.IMAP_MAILBOX ?? 'INBOX',
    },
    llm: {
      baseUrl: process.env.OPENAI_BASE_URL ?? 'http://localhost:1234/v1',
      apiKey: process.env.OPENAI_API_KEY ?? '',
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    },
    ingestCron: process.env.INGEST_CRON ?? '0 7 * * *',
    ingestOnStart: (process.env.INGEST_ON_START ?? 'false') === 'true',
    ingestToken: process.env.INGEST_TOKEN || null,
  };
}

/** IMAP is only required to run ingestion — the web UI boots without it. */
export function imapConfigured(cfg: Config): boolean {
  return Boolean(cfg.imap.host && cfg.imap.user && cfg.imap.password);
}
