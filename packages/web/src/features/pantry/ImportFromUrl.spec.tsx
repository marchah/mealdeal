import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMutation } from 'urql';
import type { Maybe } from '../../lib/types';
import { ImportFromUrl, type ImportResult } from './ImportFromUrl';

vi.mock('urql', () => ({ useMutation: vi.fn(), useQuery: vi.fn() }));

let root: Maybe<Root> = null;

const FOUND = {
  url: 'https://example.test/tide',
  found: true,
  name: 'Tide Free & Gentle',
  brand: 'Tide',
  imageUrl: 'https://example.test/tide.jpg',
  price: 19.94,
  currency: 'USD',
  sizeAmount: 150,
  sizeUnit: 'FLUID_OUNCE',
};

function mockDraft(payload: unknown, error?: Error) {
  const run = vi.fn(() => Promise.resolve({ data: { draftPantryItemFromUrl: payload }, error }));
  vi.mocked(useMutation).mockReturnValue([{ fetching: false }, run] as never);
  return run;
}

function renderImport() {
  const onImported = vi.fn();
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<ImportFromUrl onImported={onImported} />));
  return { container, onImported };
}

async function submit(container: HTMLElement, url: string) {
  const input = container.querySelector('input');
  await act(async () => {
    if (input) {
      input.value = url;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await Promise.resolve();
  });
  await act(async () => {
    container
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe('ImportFromUrl', () => {
  it('fills the form from what the page stated', async () => {
    mockDraft({ __typename: 'MutationDraftPantryItemFromUrlSuccess', data: FOUND });
    const { container, onImported } = renderImport();

    await submit(container, 'https://example.test/tide');

    const result = onImported.mock.calls[0]?.[0] as ImportResult;
    expect(result.found).toBe(true);
    expect(result.values).toMatchObject({
      name: 'Tide Free & Gentle',
      brand: 'Tide',
      sizeAmount: '150',
      sizeUnit: 'FLUID_OUNCE',
      // The size unit also becomes the unit prices are compared in, which is right far more often
      // than the default is.
      unitPriceUnit: 'FLUID_OUNCE',
    });
    expect(result.price).toEqual({ price: 19.94, sizeAmount: 150, sizeUnit: 'FLUID_OUNCE' });
  });

  it('opens an empty form when the page could not be read', async () => {
    // The common path: retailers block server-side reads. It must not become a dead end.
    mockDraft({
      __typename: 'MutationDraftPantryItemFromUrlSuccess',
      data: { ...FOUND, found: false, name: null, price: null, sizeAmount: null, sizeUnit: null },
    });
    const { container, onImported } = renderImport();

    await submit(container, 'https://example.test/blocked');

    expect(onImported).toHaveBeenCalled();
    expect((onImported.mock.calls[0]?.[0] as ImportResult).found).toBe(false);
    expect(container.querySelector('[role="status"]')?.textContent).toContain('could not read');
    // Not an error: nothing went wrong, the page just would not be read.
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('offers no price to log when the page stated one without a size', async () => {
    // A price with no pack size cannot become a comparable unit price, so it is not logged.
    mockDraft({
      __typename: 'MutationDraftPantryItemFromUrlSuccess',
      data: { ...FOUND, sizeAmount: null, sizeUnit: null },
    });
    const { container, onImported } = renderImport();

    await submit(container, 'https://example.test/tide');

    expect((onImported.mock.calls[0]?.[0] as ImportResult).price).toBeNull();
  });

  it('reports a refused link as an error and imports nothing', async () => {
    mockDraft({
      __typename: 'ValidationError',
      message: 'That link points inside a private network',
    });
    const { container, onImported } = renderImport();

    await submit(container, 'http://192.168.1.1/x');

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('private network');
    expect(onImported).not.toHaveBeenCalled();
  });

  it('reports a transport failure without importing anything', async () => {
    mockDraft(null, new Error('Network down'));
    const { container, onImported } = renderImport();

    await submit(container, 'https://example.test/tide');

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Network down');
    expect(onImported).not.toHaveBeenCalled();
  });

  it('labels its field and says plainly that this often fails', () => {
    mockDraft({ __typename: 'MutationDraftPantryItemFromUrlSuccess', data: FOUND });
    const { container } = renderImport();

    expect(container.querySelector('input')?.labels?.[0]?.textContent).toBe('Paste a product link');
    expect(container.textContent).toContain('Many retailers block this');
  });
});
