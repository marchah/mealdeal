import { access, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError, ValidationError } from '../../common/errors';
import { fileSystemAdapterFactory } from './adapter';

let parent: string;
let root: string;

beforeEach(async () => {
  parent = await mkdtemp(join(tmpdir(), 'mealdeal-receipts-'));
  // A root that does not exist yet: the first save has to create it.
  root = join(parent, 'receipts');
});

afterEach(async () => {
  await rm(parent, { recursive: true, force: true });
});

const photo = (text: string) => new TextEncoder().encode(text);

describe('fileSystemAdapter', () => {
  it('saves a photo under a fresh file name and reads the same bytes back', async () => {
    const store = fileSystemAdapterFactory({ directory: root });

    const path = await store.saveReceiptPhoto(photo('synthetic receipt photo'));

    expect(path).toMatch(/^[0-9a-f-]{36}$/);
    expect(await readdir(root)).toEqual([path]);
    expect(Buffer.from(await store.readReceiptPhoto(path)).toString()).toBe(
      'synthetic receipt photo',
    );
  });

  it('gives every photo its own file, even identical ones', async () => {
    const store = fileSystemAdapterFactory({ directory: root });

    const first = await store.saveReceiptPhoto(photo('same bytes'));
    const second = await store.saveReceiptPhoto(photo('same bytes'));

    expect(first).not.toBe(second);
    expect((await readdir(root)).sort()).toEqual([first, second].sort());
  });

  it('stores an empty photo as an empty file', async () => {
    const store = fileSystemAdapterFactory({ directory: root });

    const path = await store.saveReceiptPhoto(new Uint8Array());

    expect((await store.readReceiptPhoto(path)).byteLength).toBe(0);
  });

  it('reports a photo that is not there as not found', async () => {
    const store = fileSystemAdapterFactory({ directory: root });

    await expect(
      store.readReceiptPhoto('00000000-0000-0000-0000-000000000000'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('deletes a photo, and deleting it again is not an error', async () => {
    const store = fileSystemAdapterFactory({ directory: root });
    const path = await store.saveReceiptPhoto(photo('to delete'));

    await store.deleteReceiptPhoto(path);
    await expect(store.deleteReceiptPhoto(path)).resolves.toBeUndefined();

    expect(await readdir(root)).toEqual([]);
    await expect(store.readReceiptPhoto(path)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('resolves a relative root against the working directory, as RECEIPTS_DIR does', async () => {
    const store = fileSystemAdapterFactory({ directory: join(parent, 'a', '..', 'receipts') });
    const path = await store.saveReceiptPhoto(photo('relative'));

    expect(await readFile(join(root, path), 'utf8')).toBe('relative');
  });

  describe('refuses any path that is not a file directly under the root', () => {
    const escapes = [
      '../outside',
      '../../etc/passwd',
      '/etc/passwd',
      'nested/photo',
      'nested\\photo',
      '..',
      '.',
      '',
      '.hidden',
      'photo\0.jpg',
    ];

    it.each(escapes)('read %j', async (path) => {
      const store = fileSystemAdapterFactory({ directory: root });
      await expect(store.readReceiptPhoto(path)).rejects.toBeInstanceOf(ValidationError);
    });

    it.each(escapes)('delete %j', async (path) => {
      const store = fileSystemAdapterFactory({ directory: root });
      await expect(store.deleteReceiptPhoto(path)).rejects.toBeInstanceOf(ValidationError);
    });

    it('leaves a file outside the root untouched', async () => {
      const outside = join(parent, 'outside');
      await writeFile(outside, 'not a receipt');
      const store = fileSystemAdapterFactory({ directory: root });

      await expect(store.deleteReceiptPhoto('../outside')).rejects.toBeInstanceOf(ValidationError);
      await expect(store.readReceiptPhoto('../outside')).rejects.toBeInstanceOf(ValidationError);

      await expect(access(outside)).resolves.toBeUndefined();
    });

    it('refuses an absolute path even when it points inside the root', async () => {
      const store = fileSystemAdapterFactory({ directory: root });
      const path = await store.saveReceiptPhoto(photo('inside'));

      await expect(store.readReceiptPhoto(join(root, path))).rejects.toBeInstanceOf(
        ValidationError,
      );
    });
  });
});
