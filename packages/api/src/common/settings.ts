import 'dotenv/config';
import { z } from 'zod';
import type { Maybe } from './types';

// The SINGLE place environment variables are read. Everything else imports `settings`;
// nothing else touches process.env (enforced by ESLint). Field names are SCREAMING_SNAKE_CASE
// so they visibly mirror the environment variables they come from. Validated once at startup
// so a misconfigured deploy fails fast with a clear message.

const EnvSchema = z
  .object({
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
    INGEST_SOURCE: z.enum(['imap', 'folder']).default('imap'),
    INGEST_LOCAL_DIR: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().optional(),
    ),
    INGEST_ARCHIVE_DIR: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().optional(),
    ),

    IMAP_HOST: z.string().optional(),
    IMAP_PORT: z.coerce.number().int().positive().default(993),
    IMAP_SECURE: z.string().default('true'),
    IMAP_USER: z.string().optional(),
    IMAP_PASSWORD: z.string().optional(),
    IMAP_MAILBOX: z.string().default('INBOX'),

    OPENAI_BASE_URL: z.string().default('http://localhost:1234/v1'),
    OPENAI_API_KEY: z.string().default('not-needed'),
    OPENAI_MODEL: z.string().default('qwen3.6-35b-a3b'),

    // A five-digit US ZIP code. It is optional until a near-me feature needs it.
    USER_LOCATION: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .string()
        .regex(/^\d{5}$/, 'USER_LOCATION must be a five-digit US ZIP code')
        .optional(),
    ),
  })
  .superRefine((env, ctx) => {
    if (env.INGEST_SOURCE === 'folder' && !env.INGEST_LOCAL_DIR) {
      ctx.addIssue({
        code: 'custom',
        path: ['INGEST_LOCAL_DIR'],
        message: 'INGEST_LOCAL_DIR is required when INGEST_SOURCE=folder',
      });
    }
    if (env.INGEST_SOURCE === 'folder' && env.INGEST_ARCHIVE_DIR) {
      ctx.addIssue({
        code: 'custom',
        path: ['INGEST_ARCHIVE_DIR'],
        message: 'INGEST_ARCHIVE_DIR is only supported when INGEST_SOURCE=imap',
      });
    }
  });

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

/** Parse environment variables for startup and unit tests without another process.env reader. */
export function parseSettings(env: NodeJS.ProcessEnv) {
  const ENV = EnvSchema.parse(env);
  // null when IMAP is not configured (host/user/password absent) — ingest is then disabled.
  const IMAP: Maybe<ImapSettings> =
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

  return {
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
    INGEST_SOURCE: ENV.INGEST_SOURCE,
    INGEST_LOCAL_DIR: ENV.INGEST_LOCAL_DIR ?? null,
    INGEST_ARCHIVE_DIR: ENV.INGEST_ARCHIVE_DIR ?? null,

    IMAP,

    OPENAI_BASE_URL: ENV.OPENAI_BASE_URL,
    OPENAI_API_KEY: ENV.OPENAI_API_KEY,
    OPENAI_MODEL: ENV.OPENAI_MODEL,
    USER_LOCATION: ENV.USER_LOCATION ?? null,
  };
}

// eslint-disable-next-line no-restricted-properties -- the one allowed read of process.env
export const settings = parseSettings(process.env);

export type Settings = typeof settings;
