import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMutation, useQuery } from 'urql';
import { App } from './App';
import type { Maybe } from './lib/types';

vi.mock('urql', () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));

let root: Maybe<Root> = null;

// Every child view is left mid-fetch so each one is identified by its own loading copy. That
// keeps these tests about routing rather than about the fixtures the panels happen to need.
function fetchingForever() {
  vi.mocked(useQuery).mockReturnValue([
    { data: undefined, fetching: true, error: undefined },
    vi.fn(),
  ] as never);
  vi.mocked(useMutation).mockReturnValue([{}, vi.fn()] as never);
}

function renderAppAt(path: string) {
  window.location.hash = path;
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<App />));
  return container;
}

function tabs(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
}

function tabNamed(container: HTMLElement, label: string): HTMLButtonElement {
  const tab = tabs(container).find((candidate) => candidate.textContent === label);
  if (!tab) throw new Error(`Tab "${label}" not found`);
  return tab;
}

// jsdom queues hashchange asynchronously, so the event is dispatched here to keep the assertion
// on the same tick as the interaction that caused it.
function settleNavigation(interact: () => void) {
  act(() => {
    interact();
    window.dispatchEvent(new Event('hashchange'));
  });
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  window.location.hash = '';
  vi.clearAllMocks();
});

describe('App routing', () => {
  it('lands on Pantry when there is no route in the address bar', () => {
    fetchingForever();
    const container = renderAppAt('');

    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Loading your pantry',
    );
    expect(tabNamed(container, 'Pantry').getAttribute('aria-selected')).toBe('true');
    expect(tabNamed(container, 'Coupons').getAttribute('aria-selected')).toBe('false');
  });

  it('puts Pantry first, ahead of Coupons', () => {
    fetchingForever();
    expect(tabs(renderAppAt('')).map((tab) => tab.textContent)).toEqual(['Pantry', 'Coupons']);
  });

  it('falls back to Pantry for a route it does not recognize', () => {
    fetchingForever();
    const container = renderAppAt('#/nope');

    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Loading your pantry',
    );
    expect(tabNamed(container, 'Pantry').getAttribute('aria-selected')).toBe('true');
  });

  it('deep-links into Coupons, defaulting to the deals list', () => {
    fetchingForever();
    const container = renderAppAt('#/coupons');

    expect(container.querySelector('[role="status"]')?.textContent).toContain('Loading deals');
    expect(tabNamed(container, 'Coupons').getAttribute('aria-selected')).toBe('true');
  });

  it('deep-links into the Coupons near-me sub-view', () => {
    fetchingForever();
    const container = renderAppAt('#/coupons/near-me');

    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Finding nearby deals',
    );
    expect(tabNamed(container, 'Coupons').getAttribute('aria-selected')).toBe('true');
  });

  it('keeps an unknown Coupons sub-path on the Coupons tab', () => {
    fetchingForever();
    const container = renderAppAt('#/coupons/nope');

    expect(tabNamed(container, 'Coupons').getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Loading deals');
  });

  it('moves between tabs on click and records the route in the address bar', () => {
    fetchingForever();
    const container = renderAppAt('');

    settleNavigation(() => tabNamed(container, 'Coupons').click());
    expect(window.location.hash).toBe('#/coupons');
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Loading deals');

    settleNavigation(() => tabNamed(container, 'Pantry').click());
    expect(window.location.hash).toBe('#/pantry');
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Loading your pantry',
    );
  });

  it('switches the sub-view without leaving the Coupons tab', () => {
    fetchingForever();
    const container = renderAppAt('#/coupons');
    const nearMe = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Near me',
    );

    settleNavigation(() => nearMe?.click());

    expect(window.location.hash).toBe('#/coupons/near-me');
    expect(tabNamed(container, 'Coupons').getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Finding nearby deals',
    );
  });
});

describe('App tab accessibility', () => {
  it('exposes one tablist whose selected tab labels the rendered panel', () => {
    fetchingForever();
    const container = renderAppAt('#/coupons');
    const panel = container.querySelector('[role="tabpanel"]');
    const selected = tabNamed(container, 'Coupons');

    expect(container.querySelectorAll('[role="tablist"]')).toHaveLength(1);
    expect(panel?.getAttribute('aria-labelledby')).toBe(selected.id);
    expect(selected.getAttribute('aria-controls')).toBe(panel?.id);
    // Only the mounted panel exists, so the unselected tab must not claim to control one.
    expect(tabNamed(container, 'Pantry').getAttribute('aria-controls')).toBeNull();
  });

  it('keeps a single tab stop, on the selected tab', () => {
    fetchingForever();
    const container = renderAppAt('');

    expect(tabNamed(container, 'Pantry').tabIndex).toBe(0);
    expect(tabNamed(container, 'Coupons').tabIndex).toBe(-1);
  });

  it('selects and focuses the next tab with the arrow keys, wrapping around', () => {
    fetchingForever();
    const container = renderAppAt('');

    settleNavigation(() =>
      tabNamed(container, 'Pantry').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      ),
    );
    expect(window.location.hash).toBe('#/coupons');
    expect(document.activeElement).toBe(tabNamed(container, 'Coupons'));
    expect(tabNamed(container, 'Coupons').tabIndex).toBe(0);

    // Past the last tab, focus wraps to the first rather than falling out of the tablist.
    settleNavigation(() =>
      tabNamed(container, 'Coupons').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      ),
    );
    expect(window.location.hash).toBe('#/pantry');
    expect(document.activeElement).toBe(tabNamed(container, 'Pantry'));
  });

  it('jumps to the first and last tab with Home and End', () => {
    fetchingForever();
    const container = renderAppAt('#/coupons');

    settleNavigation(() =>
      tabNamed(container, 'Coupons').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Home', bubbles: true }),
      ),
    );
    expect(window.location.hash).toBe('#/pantry');

    settleNavigation(() =>
      tabNamed(container, 'Pantry').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'End', bubbles: true }),
      ),
    );
    expect(window.location.hash).toBe('#/coupons');
  });

  it('leaves keys it does not handle to the browser', () => {
    fetchingForever();
    const container = renderAppAt('');
    const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });

    act(() => {
      tabNamed(container, 'Pantry').dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(window.location.hash).toBe('');
  });
});

describe('App coupon banner placement', () => {
  it('shows the paused-ingestion banner inside the Coupons tab only', () => {
    vi.mocked(useQuery).mockReturnValue([
      {
        data: {
          appConfig: { couponIngestEnabled: false, lastIngestAt: null },
          stats: { activeDeals: 0, totalDeals: 0, merchants: 0 },
          getCouponTypes: [],
          deals: [],
          pantryItems: [],
        },
        fetching: false,
        error: undefined,
      },
      vi.fn(),
    ] as never);
    vi.mocked(useMutation).mockReturnValue([{}, vi.fn()] as never);

    const coupons = renderAppAt('#/coupons');
    expect(coupons.textContent).toContain('Coupon newsletter ingestion is paused');
    act(() => root?.unmount());

    const pantry = renderAppAt('#/pantry');
    expect(pantry.textContent).not.toContain('Coupon newsletter ingestion is paused');
  });
});
