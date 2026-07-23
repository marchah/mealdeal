import type { Settings } from '../common/settings';
import { folderEmailSourceFactory } from './folder';
import { imapClientFactory, type EmailSource } from './imap';

/** Select the configured email adapter exactly once at the ingest composition boundary. */
export function emailSourceFactory({ config }: { config: Settings }): EmailSource | null {
  if (config.INGEST_SOURCE === 'folder') {
    // Settings validation guarantees this is present for the folder mode.
    return folderEmailSourceFactory({ directory: config.INGEST_LOCAL_DIR! });
  }
  return config.IMAP ? imapClientFactory({ config: config.IMAP }) : null;
}
