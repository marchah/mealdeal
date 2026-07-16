import 'dotenv/config';
import { z } from 'zod';

// The SINGLE place environment variables are read. Everything else imports `settings`;
// nothing else touches process.env (enforced by ESLint). Values are validated once at
// startup so a misconfigured deploy fails fast with a clear message.

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_DIR: z.string().optional(),
  DATABASE_URL: z.string().default('file:./data/mealdeal.db'),
  MIGRATIONS_DIR: z.string().default('drizzle'),

  INGEST_INLINE: z.string().default('1'),
  INGEST_CRON: z.string().default('*/30 * * * *'),
  INGEST_BATCH: z.coerce.number().int().positive().default(25),
  INGEST_TOKEN: z.string().optional(),

  IMAP_HOST: z.string().optional(),
  IMAP_PORT: z.coerce.number().int().positive().default(993),
  IMAP_SECURE: z.string().default('true'),
  IMAP_USER: z.string().optional(),
  IMAP_PASSWORD: z.string().optional(),
  IMAP_MAILBOX: z.string().default('INBOX'),

  OPENAI_BASE_URL: z.string().default('http://localhost:1234/v1'),
  OPENAI_API_KEY: z.string().default('not-needed'),
  OPENAI_MODEL: z.string().default('qwen3.6-35b-a3b'),
});

// eslint-disable-next-line no-restricted-properties -- the one allowed read of process.env
const env = EnvSchema.parse(process.env);

export interface ImapSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  mailbox: string;
}

export interface LlmSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface Settings {
  port: number;
  webDir: string | undefined;
  databaseUrl: string;
  migrationsDir: string;
  ingest: { inline: boolean; cron: string; batch: number; token: string | undefined };
  /** null when IMAP is not configured (host/user/password absent) — ingest is then disabled. */
  imap: ImapSettings | null;
  llm: LlmSettings;
}

const imap: ImapSettings | null =
  env.IMAP_HOST && env.IMAP_USER && env.IMAP_PASSWORD
    ? {
        host: env.IMAP_HOST,
        port: env.IMAP_PORT,
        secure: env.IMAP_SECURE !== 'false',
        user: env.IMAP_USER,
        pass: env.IMAP_PASSWORD,
        mailbox: env.IMAP_MAILBOX,
      }
    : null;

export const settings: Settings = {
  port: env.PORT,
  webDir: env.WEB_DIR,
  databaseUrl: env.DATABASE_URL,
  migrationsDir: env.MIGRATIONS_DIR,
  ingest: {
    inline: env.INGEST_INLINE !== '0',
    cron: env.INGEST_CRON,
    batch: env.INGEST_BATCH,
    token: env.INGEST_TOKEN,
  },
  imap,
  llm: {
    baseUrl: env.OPENAI_BASE_URL,
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
  },
};
