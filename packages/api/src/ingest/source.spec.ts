import { describe, expect, it } from 'vitest';
import type { Settings } from '../common/settings';
import { emailSourceFactory } from './source';

const imapConfig = {
  IMAP_HOST: 'imap.example.test',
  IMAP_PORT: 993,
  IMAP_SECURE: true,
  IMAP_USER: 'user',
  IMAP_PASSWORD: 'pass',
  IMAP_MAILBOX: 'INBOX',
};

function makeConfig(over: Record<string, unknown>): Settings {
  return {
    INGEST_SOURCE: 'imap',
    INGEST_LOCAL_DIR: null,
    IMAP: null,
    ...over,
  } as unknown as Settings;
}

describe('emailSourceFactory', () => {
  it('selects the folder-backed source in folder mode', () => {
    const source = emailSourceFactory({
      config: makeConfig({ INGEST_SOURCE: 'folder', INGEST_LOCAL_DIR: '/tmp/mealdeal-ingest' }),
    });
    expect(source).not.toBeNull();
    expect(typeof source?.fetchUnseen).toBe('function');
  });

  it('selects the IMAP client when IMAP is configured', () => {
    const source = emailSourceFactory({
      config: makeConfig({ INGEST_SOURCE: 'imap', IMAP: imapConfig }),
    });
    expect(source).not.toBeNull();
    expect(typeof source?.fetchUnseen).toBe('function');
  });

  it('returns null in IMAP mode without an IMAP configuration', () => {
    const source = emailSourceFactory({
      config: makeConfig({ INGEST_SOURCE: 'imap', IMAP: null }),
    });
    expect(source).toBeNull();
  });
});
