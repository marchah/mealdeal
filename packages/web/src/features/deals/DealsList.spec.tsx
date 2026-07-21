import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useQuery } from 'urql';
import { DealsList } from './DealsList';

vi.mock('urql', () => ({ useQuery: vi.fn() }));

let root: Root | null = null;

function renderDeals() {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<DealsList />));
  return container;
}

function queryResult(result: unknown) {
  vi.mocked(useQuery).mockReturnValue(result as never);
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe('DealsList', () => {
  it('filters active deals by their canonical coupon type and unclassified state', () => {
    queryResult([
      {
        data: {
          stats: { activeDeals: 3, totalDeals: 3, merchants: 2 },
          getCouponTypes: [
            { id: 'grocery', key: 'grocery', label: 'Grocery' },
            { id: 'household', key: 'household', label: 'Household' },
          ],
          deals: [
            {
              id: 'fruit',
              title: 'Fruit sale',
              discountText: '20% off',
              category: null,
              couponType: { id: 'grocery', key: 'grocery', label: 'Grocery' },
              merchant: { name: 'Market' },
            },
            {
              id: 'soap',
              title: 'Soap sale',
              discountText: null,
              category: null,
              couponType: { id: 'household', key: 'household', label: 'Household' },
              merchant: { name: 'Market' },
            },
            {
              id: 'mystery',
              title: 'Mystery deal',
              discountText: null,
              category: null,
              couponType: null,
              merchant: { name: 'Market' },
            },
          ],
        },
        fetching: false,
        error: undefined,
      },
      vi.fn(),
    ]);
    const container = renderDeals();
    const filter = container.querySelector('select');

    expect(filter?.labels?.[0]?.textContent).toBe('Coupon type');
    expect(container.textContent).toContain('Fruit sale');
    expect(container.textContent).toContain('Soap sale');
    expect(container.textContent).toContain('Mystery deal');

    act(() => {
      if (!filter) throw new Error('Coupon type filter not found');
      filter.value = 'grocery';
      filter.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.textContent).toContain('Fruit sale');
    expect(container.textContent).not.toContain('Soap sale');
    expect(container.textContent).not.toContain('Mystery deal');

    act(() => {
      if (!filter) throw new Error('Coupon type filter not found');
      filter.value = 'unclassified';
      filter.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.textContent).toContain('Mystery deal');
    expect(container.textContent).not.toContain('Fruit sale');
  });

  it('communicates loading, empty, and network-error states', () => {
    queryResult([{ data: undefined, fetching: true, error: undefined }, vi.fn()]);
    const loading = renderDeals();
    expect(loading.querySelector('[role="status"]')?.textContent).toContain('Loading deals');
    act(() => root?.unmount());

    queryResult([
      {
        data: {
          stats: { activeDeals: 0, totalDeals: 0, merchants: 0 },
          getCouponTypes: [],
          deals: [],
        },
        fetching: false,
        error: undefined,
      },
      vi.fn(),
    ]);
    const empty = renderDeals();
    expect(empty.textContent).toContain('No active deals yet.');
    act(() => root?.unmount());

    queryResult([{ data: undefined, fetching: false, error: new Error('Network down') }, vi.fn()]);
    const failed = renderDeals();
    expect(failed.querySelector('[role="alert"]')?.textContent).toContain('Network down');
  });
});
