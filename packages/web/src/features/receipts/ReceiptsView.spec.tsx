import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMutation, useQuery } from 'urql';
import type { Maybe } from '../../lib/types';
import { DeleteReceiptMutation, RetryReceiptMutation } from './queries';
import { RECEIPTS_POLL_MS, ReceiptsView } from './ReceiptsView';

vi.mock('urql', () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));

let root: Maybe<Root> = null;

function makeReceipt(over: Record<string, unknown> = {}) {
  return {
    id: 'receipt-1',
    status: 'PARSED',
    failedStage: null,
    error: null,
    purchasedAt: '2026-11-02T16:30:00.000Z',
    total: 80.71,
    flags: [],
    photoCount: 1,
    createdAt: '2026-11-03T09:00:00.000Z',
    merchant: { id: 'merchant-1', name: 'Aldi' },
    ...over,
  };
}

function mockApi({
  receipts = [makeReceipt()],
  enabled = true,
  retry = {
    __typename: 'MutationRetryReceiptSuccess',
    data: { id: 'receipt-1', status: 'UPLOADED' },
  },
  remove = { __typename: 'MutationDeleteReceiptSuccess', data: { id: 'receipt-1' } },
}: {
  receipts?: unknown[];
  enabled?: boolean;
  retry?: unknown;
  remove?: unknown;
} = {}) {
  const refetch = vi.fn();
  vi.mocked(useQuery).mockReturnValue([
    {
      data: { appConfig: { receiptImportEnabled: enabled }, receipts },
      fetching: false,
      error: undefined,
    },
    refetch,
  ] as never);
  const runRetry = vi.fn(() => Promise.resolve({ data: { retryReceipt: retry } }));
  const runDelete = vi.fn(() => Promise.resolve({ data: { deleteReceipt: remove } }));
  const runUpload = vi.fn();
  vi.mocked(useMutation).mockImplementation(((document: unknown) => {
    if (document === RetryReceiptMutation) return [{ fetching: false }, runRetry];
    if (document === DeleteReceiptMutation) return [{ fetching: false }, runDelete];
    return [{ fetching: false }, runUpload];
  }) as never);
  return { refetch, runRetry, runDelete, runUpload };
}

function renderView() {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<ReceiptsView />));
  return container;
}

function button(container: HTMLElement, name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === name,
  );
  if (!found) throw new Error(`Button "${name}" not found`);
  return found;
}

async function click(target: HTMLElement) {
  await act(async () => {
    target.click();
    await Promise.resolve();
  });
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('ReceiptsView', () => {
  it('offers an upload that opens a phone’s camera', () => {
    mockApi();
    const input = renderView().querySelector<HTMLInputElement>('input[type="file"]');

    expect(input?.accept).toBe('image/*');
    expect(input?.getAttribute('capture')).toBe('environment');
    expect(input?.multiple).toBe(true);
    expect(input?.labels?.[0]?.textContent).toBe('Receipt photos');
  });

  it('says receipt import is off, and why, instead of offering an upload that would fail', () => {
    mockApi({
      enabled: false,
      receipts: [makeReceipt({ status: 'FAILED', failedStage: 'OCR', error: 'timed out' })],
    });
    const container = renderView();

    const notice = container.querySelector('aside[role="status"]');
    expect(notice?.textContent).toContain('Receipt import is off');
    expect(notice?.textContent).toContain('No OCR service is configured');
    expect(notice?.textContent).toContain('OCR_BASE_URL');
    expect(container.querySelector('input[type="file"]')).toBeNull();
    // The server would refuse a retry too; the receipts already there stay listed.
    expect(container.textContent).toContain('timed out');
    expect(() => button(container, 'Retry')).toThrow();
  });

  it('shows each receipt’s status in words', () => {
    mockApi({
      receipts: [
        makeReceipt({
          id: 'a',
          status: 'UPLOADED',
          merchant: null,
          purchasedAt: null,
          total: null,
        }),
        makeReceipt({
          id: 'b',
          status: 'OCR_DONE',
          merchant: null,
          purchasedAt: null,
          total: null,
        }),
        makeReceipt({ id: 'c', status: 'PARSED', photoCount: 2 }),
      ],
    });
    const items = [...renderView().querySelectorAll('li')].map((item) => item.textContent);

    expect(items[0]).toContain('Store not read yet');
    expect(items[0]).toContain('Reading the photos');
    expect(items[1]).toContain('Reading the lines');
    expect(items[2]).toContain('Aldi');
    expect(items[2]).toContain('Read');
    expect(items[2]).toContain('$80.71');
    expect(items[2]).toContain('2 photos');
    expect(items[2]).toContain('Bought');
  });

  it('shows the stage a failed receipt stopped at, its error, and a Retry', async () => {
    const api = mockApi({
      receipts: [
        makeReceipt({
          status: 'FAILED',
          failedStage: 'OCR',
          error: 'OCR service did not answer within 300 s',
        }),
      ],
    });
    const container = renderView();

    expect(container.textContent).toContain('Failed while reading the photos');
    expect(container.textContent).toContain('OCR service did not answer within 300 s');

    await click(button(container, 'Retry'));

    expect(api.runRetry).toHaveBeenCalledWith({ id: 'receipt-1' });
    expect(api.refetch).toHaveBeenCalledWith({ requestPolicy: 'network-only' });
  });

  it('reports a refused retry instead of refreshing', async () => {
    const api = mockApi({
      receipts: [makeReceipt({ status: 'FAILED', failedStage: 'PARSE', error: 'boom' })],
      retry: { __typename: 'ConflictError', message: 'Only a failed receipt can be retried' },
    });
    const container = renderView();

    expect(container.textContent).toContain('Failed while reading the lines');
    await click(button(container, 'Retry'));

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Only a failed receipt can be retried',
    );
    expect(api.refetch).not.toHaveBeenCalled();
  });

  it('says what each check flagged', () => {
    mockApi({ receipts: [makeReceipt({ flags: ['SUBTOTAL_MISMATCH', 'POSSIBLE_DUPLICATE'] })] });
    const text = renderView().textContent;

    expect(text).toContain('The lines do not add up to the printed subtotal.');
    expect(text).toContain('Possibly a duplicate');
  });

  it('deletes a receipt only once the deletion is confirmed', async () => {
    const api = mockApi();
    const container = renderView();

    await click(button(container, 'Delete'));
    expect(api.runDelete).not.toHaveBeenCalled();
    await click(button(container, 'Keep it'));
    expect(api.runDelete).not.toHaveBeenCalled();

    await click(button(container, 'Delete'));
    await click(button(container, 'Delete receipt'));
    expect(api.runDelete).toHaveBeenCalledWith({ id: 'receipt-1' });
    expect(api.refetch).toHaveBeenCalled();
  });

  it('offers neither Retry nor Delete while a receipt is being read', () => {
    mockApi({ receipts: [makeReceipt({ status: 'OCR_DONE' })] });
    const container = renderView();

    expect(container.querySelectorAll('li button')).toHaveLength(0);
  });

  it('polls while a receipt is being read, and says so', () => {
    vi.useFakeTimers();
    const api = mockApi({
      receipts: [makeReceipt({ status: 'UPLOADED' }), makeReceipt({ id: 'b' })],
    });
    const container = renderView();

    expect(container.textContent).toContain('1 receipt is being read');
    act(() => {
      vi.advanceTimersByTime(RECEIPTS_POLL_MS * 2);
    });
    expect(api.refetch).toHaveBeenCalledTimes(2);
    expect(api.refetch).toHaveBeenCalledWith({ requestPolicy: 'network-only' });
  });

  it('stops polling once nothing is being read', () => {
    vi.useFakeTimers();
    const api = mockApi({ receipts: [makeReceipt({ status: 'PARSED' })] });
    renderView();

    act(() => {
      vi.advanceTimersByTime(RECEIPTS_POLL_MS * 3);
    });
    expect(api.refetch).not.toHaveBeenCalled();
  });

  it('says so when there are no receipts yet', () => {
    mockApi({ receipts: [] });
    expect(renderView().textContent).toContain('No receipts yet.');
  });

  it('reports a failed load', () => {
    vi.mocked(useQuery).mockReturnValue([
      { data: undefined, fetching: false, error: new Error('Network down') },
      vi.fn(),
    ] as never);
    vi.mocked(useMutation).mockReturnValue([{ fetching: false }, vi.fn()] as never);

    expect(renderView().querySelector('[role="alert"]')?.textContent).toContain('Network down');
  });
});
