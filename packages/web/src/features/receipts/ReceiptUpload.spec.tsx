import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMutation } from 'urql';
import type { Maybe } from '../../lib/types';
import { ReceiptUpload } from './ReceiptUpload';

vi.mock('urql', () => ({ useMutation: vi.fn() }));

let root: Maybe<Root> = null;

const photo = (name: string, type = 'image/jpeg', bytes = 'synthetic') =>
  new File([bytes], name, { type });

function mockUpload(
  payload: unknown = {
    __typename: 'MutationUploadReceiptSuccess',
    data: { id: 'receipt-1', status: 'UPLOADED' },
  },
) {
  const run = vi.fn(() => Promise.resolve({ data: { uploadReceipt: payload } }));
  vi.mocked(useMutation).mockReturnValue([{ fetching: false }, run] as never);
  return run;
}

function renderUpload() {
  const onUploaded = vi.fn();
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<ReceiptUpload onUploaded={onUploaded} />));
  return { container, onUploaded };
}

// What a file picker or a camera shot does: the input's files change.
function choose(container: HTMLElement, files: File[]) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('no file input');
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  act(() => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function submit(container: HTMLElement) {
  await act(async () => {
    container
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

const listed = (container: HTMLElement) =>
  [...container.querySelectorAll('ol li span')].map((item) => item.textContent);

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe('ReceiptUpload', () => {
  it('collects photos across picks, in order, and uploads them together', async () => {
    const run = mockUpload();
    const { container, onUploaded } = renderUpload();
    const top = photo('top.jpg');
    const bottom = photo('bottom.jpg');

    expect(container.querySelector('button[type="submit"]')?.hasAttribute('disabled')).toBe(true);
    choose(container, [top]);
    choose(container, [bottom]);
    expect(listed(container)).toEqual([
      expect.stringContaining('1. top.jpg'),
      expect.stringContaining('2. bottom.jpg'),
    ]);

    await submit(container);

    expect(run).toHaveBeenCalledWith({ images: [top, bottom] });
    expect(onUploaded).toHaveBeenCalled();
    expect(listed(container)).toEqual([]);
  });

  it('removes a photo before upload', async () => {
    const run = mockUpload();
    const { container } = renderUpload();
    const keep = photo('keep.jpg');
    choose(container, [photo('blurry.jpg'), keep]);

    act(() => {
      container.querySelector<HTMLButtonElement>('button[aria-label^="Remove photo 1"]')?.click();
    });
    await submit(container);

    expect(run).toHaveBeenCalledWith({ images: [keep] });
  });

  it('refuses a file that is not an image without sending anything', async () => {
    const run = mockUpload();
    const { container, onUploaded } = renderUpload();
    choose(container, [photo('notes.txt', 'text/plain')]);

    await submit(container);

    expect(run).not.toHaveBeenCalled();
    expect(onUploaded).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'notes.txt is not an image.',
    );
  });

  it('refuses more photos than a receipt can have', async () => {
    const run = mockUpload();
    const { container } = renderUpload();
    choose(
      container,
      Array.from({ length: 11 }, (_, page) => photo(`page-${String(page)}.jpg`)),
    );

    await submit(container);

    expect(run).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('at most 10 photos');
  });

  it('shows the server’s refusal and keeps the photos for another try', async () => {
    mockUpload({
      __typename: 'ConflictError',
      message: 'These photos are already uploaded as a receipt: retry or delete that one instead',
    });
    const { container, onUploaded } = renderUpload();
    choose(container, [photo('again.jpg')]);

    await submit(container);

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('already uploaded');
    expect(onUploaded).not.toHaveBeenCalled();
    expect(listed(container)).toHaveLength(1);
  });
});
