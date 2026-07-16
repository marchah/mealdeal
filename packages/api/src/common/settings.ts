import 'dotenv/config';
import { z } from 'zod';

// The SINGLE place environment variables are read. Everything else imports `settings`;
// nothing else touches process.env (enforced by ESLint). Field names are SCREAMING_SNAKE_CASE
// so they visibly mirror the environment variables they come from. Validated once at startup
// so a misconfigured deploy fails fast with a clear message.

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
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
const ENV = EnvSchema.parse(process.env);

/** IMAP connection settings (grouped so it can be null when unconfigured). */
export interface ImapSettings {
  IMAP_HOST: string;
  IMAP_PORT: number;
  IMAP_SECURE: boolean;
  IMAP_USER: string;
  IMAP_PASSWORD: string;
  IMAP_MAILBOX: string;
}

/** OpenAI-compatible LLM settings. */
export interface LlmSettings {
  OPENAI_BASE_URL: string;
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
}

// null when IMAP is not configured (host/user/password absent) — ingest is then disabled.
const IMAP: ImapSettings | null =
  ENV.IMAP_HOST && ENV.IMAP_USER && ENV.IMAP_PASSWORD
    ? {
        IMAP_HOST: ENV.IMAP_HOST,
        IMAP_PORT: ENV.IMAP_PORT,
        IMAP_SECURE: ENV.IMAP_SECURE !== 'false',
        IMAP_USER: ENV.IMAP_USER,
        IMAP_PASSWORD: ENV.IMAP_PASSWORD,
        IMAP_MAILBOX: ENV.IMAP_MAILBOX,
      }
    : null;

export const settings = {
  NODE_ENV: ENV.NODE_ENV,
  LOG_LEVEL: ENV.LOG_LEVEL,
  PORT: ENV.PORT,
  WEB_DIR: ENV.WEB_DIR,
  DATABASE_URL: ENV.DATABASE_URL,
  MIGRATIONS_DIR: ENV.MIGRATIONS_DIR,

  INGEST_INLINE: ENV.INGEST_INLINE !== '0',
  INGEST_CRON: ENV.INGEST_CRON,
  INGEST_BATCH: ENV.INGEST_BATCH,
  INGEST_TOKEN: ENV.INGEST_TOKEN,

  IMAP,

  OPENAI_BASE_URL: ENV.OPENAI_BASE_URL,
  OPENAI_API_KEY: ENV.OPENAI_API_KEY,
  OPENAI_MODEL: ENV.OPENAI_MODEL,
};

export type Settings = typeof settings;
