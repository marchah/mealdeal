import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMutation, useQuery } from 'urql';
import type { Maybe } from '../../lib/types';
import { PantryList } from './PantryList';
import { savingsLabel } from './insight';

vi.mock('urql', () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));

let root: Maybe<Root> = null;

const CATEGORIES = [
  { id: 'ct-house', key: 'household', label: 'Household' },
  { id: 'ct-food', key: 'food', label: 'Food' },
];

function makeItem(over: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    name: 'Tide Free & Gentle',
    brand: 'Tide',
    imageUrl: null,
    sizeAmount: 150,
    sizeUnit: 'FLUID_OUNCE',
    unitPriceUnit: 'FLUID_OUNCE',
    targetPrice: null,
    archived: false,
    category: CATEGORIES[0],
    insight: {
      verdict: 'GREAT',
      observationCount: 5,
      formattedLatestUnitPrice: '$0.11/fl oz',
      latestUnitPrice: 0.11,
      lowestUnitPrice: 0.11,
      medianUnitPrice: 0.15,
      highestUnitPrice: 0.17,
      savingsVsMedianPct: 29,
      meetsTargetPrice: null,
      displayUnit: 'FLUID_OUNCE',
      currency: 'USD',
      cheapestMerchant: { id: 'm1', name: 'Costco' },
      latest: { id: 'pe1', price: 16.49, currency: 'USD', observedAt: '2026-08-12T00:00:00.000Z' },
    },
    priceEntries: [
      { id: 'a', unitPrice: 0.11, observedAt: '2026-08-12T00:00:00.000Z' },
      { id: 'b', unitPrice: 0.15, observedAt: '2026-07-12T00:00:00.000Z' },
      { id: 'c', unitPrice: 0.17, observedAt: '2026-06-12T00:00:00.000Z' },
    ],
    ...over,
  };
}

function queryResult(result: unknown) {
  vi.mocked(useQuery).mockReturnValue(result as never);
  vi.mocked(useMutation).mockReturnValue([{}, vi.fn()] as never);
}

function withItems(items: unknown[]) {
  queryResult([
    { data: { pantryItems: items, getCouponTypes: CATEGORIES }, fetching: false, error: undefined },
    vi.fn(),
  ]);
}

function renderList() {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<PantryList onOpen={vi.fn()} />));
  return container;
}

function selectNamed(container: HTMLElement, label: string): HTMLSelectElement {
  const select = [...container.querySelectorAll('select')].find(
    (candidate) => candidate.labels?.[0]?.textContent === label,
  );
  if (!select) throw new Error(`Select "${label}" not found`);
  return select;
}

function choose(select: HTMLSelectElement, value: string) {
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe('PantryList', () => {
  it('shows the price, the verdict and the magnitude behind it', () => {
    withItems([makeItem()]);
    const container = renderList();

    expect(container.textContent).toContain('Tide Free & Gentle');
    expect(container.textContent).toContain('$0.11/fl oz');
    // Colour alone would be invisible to a colour-blind reader and to a screen reader.
    expect(container.textContent).toContain('Great price');
    // The coarse verdict does not distinguish a 6% best-ever from a real sale; this does.
    expect(container.textContent).toContain('29% below usual');
    expect(container.textContent).toContain('cheapest at Costco');
  });

  it('invites a first item rather than showing an empty grid', () => {
    withItems([]);
    const container = renderList();

    expect(container.textContent).toContain('Nothing tracked yet');
    // Filters over nothing are noise.
    expect(container.querySelectorAll('select')).toHaveLength(0);
  });

  it('prompts for a price on an item that has none', () => {
    withItems([
      makeItem({
        insight: {
          ...makeItem().insight,
          verdict: 'UNKNOWN',
          observationCount: 0,
          formattedLatestUnitPrice: null,
          savingsVsMedianPct: null,
          cheapestMerchant: null,
        },
        priceEntries: [],
      }),
    ]);
    const container = renderList();

    expect(container.textContent).toContain('No price logged');
    expect(container.textContent).toContain('Log a price to start tracking');
    expect(container.textContent).toContain('Not enough history');
  });

  it('filters by category and by verdict', () => {
    withItems([
      makeItem({
        id: 'a',
        name: 'Detergent',
        category: CATEGORIES[0],
        insight: { ...makeItem().insight, verdict: 'GREAT' },
      }),
      makeItem({
        id: 'b',
        name: 'Coffee',
        category: CATEGORIES[1],
        insight: { ...makeItem().insight, verdict: 'HIGH' },
      }),
    ]);
    const container = renderList();

    choose(selectNamed(container, 'Category'), 'ct-food');
    expect(container.textContent).toContain('Coffee');
    expect(container.textContent).not.toContain('Detergent');

    choose(selectNamed(container, 'Category'), 'all');
    choose(selectNamed(container, 'Verdict'), 'GREAT');
    expect(container.textContent).toContain('Detergent');
    expect(container.textContent).not.toContain('Coffee');
  });

  it('says so when the filters exclude everything', () => {
    withItems([makeItem()]);
    const container = renderList();

    choose(selectNamed(container, 'Verdict'), 'HIGH');

    expect(container.textContent).toContain('No items match those filters');
  });

  it('puts the best deals first by default and sorts by name on request', () => {
    withItems([
      makeItem({ id: 'a', name: 'Zucchini', insight: { ...makeItem().insight, verdict: 'HIGH' } }),
      makeItem({ id: 'b', name: 'Apples', insight: { ...makeItem().insight, verdict: 'GREAT' } }),
    ]);
    const container = renderList();
    const names = () =>
      [...container.querySelectorAll('li button')].map((button) => button.textContent);

    expect(names()).toEqual(['Apples', 'Zucchini']);

    choose(selectNamed(container, 'Sort by'), 'name');
    expect(names()).toEqual(['Apples', 'Zucchini']);

    choose(selectNamed(container, 'Verdict'), 'all');
    choose(selectNamed(container, 'Sort by'), 'best');
    expect(names()).toEqual(['Apples', 'Zucchini']);
  });

  it('communicates loading and network-error states', () => {
    queryResult([{ data: undefined, fetching: true, error: undefined }, vi.fn()]);
    const loading = renderList();
    expect(loading.querySelector('[role="status"]')?.textContent).toContain('Loading your pantry');
    act(() => root?.unmount());

    queryResult([{ data: undefined, fetching: false, error: new Error('Network down') }, vi.fn()]);
    expect(renderList().querySelector('[role="alert"]')?.textContent).toContain('Network down');
  });
});

describe('savingsLabel', () => {
  it('reads the sign of the saving in words', () => {
    expect(savingsLabel(29)).toBe('29% below usual');
    expect(savingsLabel(-12)).toBe('12% above usual');
  });

  it('does not claim a saving that rounds away', () => {
    expect(savingsLabel(0.2)).toBe('about the usual price');
  });

  it('says nothing when there is no median to compare against', () => {
    expect(savingsLabel(null)).toBeNull();
  });
});
