import type { Settings } from '../common/settings';
import type { EmailSource } from './email';
import { folderEmailSourceFactory } from './folder';
import { imapClientFactory } from './imap';
import type { Maybe } from '../common/types';

/** Select the configured email adapter exactly once at the ingest composition boundary. */
export function emailSourceFactory({ config }: { config: Settings }): Maybe<EmailSource> {
  if (config.INGEST_SOURCE === 'folder') {
    // Settings validation guarantees this is present for the folder mode.
    return folderEmailSourceFactory({ directory: config.INGEST_LOCAL_DIR! });
  }
  return config.IMAP ? imapClientFactory({ config: config.IMAP }) : null;
}
