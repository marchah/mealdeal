import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { NotFoundError, ValidationError } from '../../common/errors';
import type { ReceiptPhotoStore } from '../../entities/receipt/types';

// A stored path is one file name directly under the root — no separator, no leading dot — so a
// corrupted or hand-edited row can never read or delete anything outside it.
const PHOTO_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/** Receipt photos as files under one directory (RECEIPTS_DIR). */
export function fileSystemAdapterFactory({ directory }: { directory: string }): ReceiptPhotoStore {
  const root = resolve(directory);

  function locate(path: string): string {
    const located = resolve(root, path);
    if (!PHOTO_NAME.test(path) || dirname(located) !== root) {
      throw new ValidationError(`Not a receipt photo path: ${JSON.stringify(path)}`);
    }
    return located;
  }

  async function readReceiptPhoto(path: string) {
    const located = locate(path);
    try {
      return await readFile(located);
    } catch (error) {
      if (isMissingFile(error)) throw new NotFoundError(`No receipt photo at ${path}`);
      throw error;
    }
  }

  async function saveReceiptPhoto(bytes: Uint8Array) {
    const path = randomUUID();
    await mkdir(root, { recursive: true });
    // `wx`: never overwrite a stored photo, however the name came about.
    await writeFile(locate(path), bytes, { flag: 'wx' });
    return path;
  }

  async function deleteReceiptPhoto(path: string) {
    await rm(locate(path), { force: true });
  }

  return { readReceiptPhoto, saveReceiptPhoto, deleteReceiptPhoto };
}
