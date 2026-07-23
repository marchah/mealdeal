import { describe, expect, it } from 'vitest';
import { parseSettings } from './settings';

describe('parseSettings', () => {
  it('accepts a five-digit USER_LOCATION ZIP', () => {
    expect(parseSettings({ USER_LOCATION: '02139' }).USER_LOCATION).toBe('02139');
  });

  it('leaves USER_LOCATION unset when it is missing', () => {
    expect(parseSettings({}).USER_LOCATION).toBeNull();
  });

  it('treats Docker Compose’s empty USER_LOCATION value as unset', () => {
    expect(parseSettings({ USER_LOCATION: '' }).USER_LOCATION).toBeNull();
  });

  it('rejects an invalid USER_LOCATION ZIP', () => {
    expect(() => parseSettings({ USER_LOCATION: '0213' })).toThrow(
      'USER_LOCATION must be a five-digit US ZIP code',
    );
  });

  it('requires a local directory for the folder email source', () => {
    expect(() => parseSettings({ INGEST_SOURCE: 'folder' })).toThrow(
      'INGEST_LOCAL_DIR is required when INGEST_SOURCE=folder',
    );
  });

  it('accepts the folder email source with its required directory', () => {
    const settings = parseSettings({ INGEST_SOURCE: 'folder', INGEST_LOCAL_DIR: './ingest-input' });

    expect(settings.INGEST_SOURCE).toBe('folder');
    expect(settings.INGEST_LOCAL_DIR).toBe('./ingest-input');
    expect(settings.IMAP).toBeNull();
  });

  it('allows an archive only in IMAP mode', () => {
    expect(parseSettings({ INGEST_ARCHIVE_DIR: './ingest-archive' }).INGEST_ARCHIVE_DIR).toBe(
      './ingest-archive',
    );
    expect(() =>
      parseSettings({
        INGEST_SOURCE: 'folder',
        INGEST_LOCAL_DIR: './ingest-input',
        INGEST_ARCHIVE_DIR: './ingest-archive',
      }),
    ).toThrow('INGEST_ARCHIVE_DIR is only supported when INGEST_SOURCE=imap');
  });
});
