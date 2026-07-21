import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useQuery } from 'urql';
import { NearMeView } from './NearMeView';

vi.mock('urql', () => ({ useQuery: vi.fn() }));

let root: Root | null = null;

function renderNearMe() {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<NearMeView />));
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

describe('NearMeView', () => {
  it('communicates loading and network-error states', () => {
    queryResult([{ data: undefined, fetching: true, error: undefined }, vi.fn()]);
    const loading = renderNearMe();
    expect(loading.querySelector('[role="status"]')?.textContent).toContain('Finding nearby deals');
    act(() => root?.unmount());

    queryResult([{ data: undefined, fetching: false, error: new Error('Network down') }, vi.fn()]);
    const failed = renderNearMe();
    expect(failed.querySelector('[role="alert"]')?.textContent).toContain('Network down');
  });

  it('explains when the configured location cannot be used', () => {
    queryResult([
      {
        data: {
          storesNearMe: { __typename: 'LocationNotConfiguredError' },
          dealsNearMe: { __typename: 'LocationNotConfiguredError' },
          recommendedNewsletters: { __typename: 'LocationNotConfiguredError' },
        },
        fetching: false,
        error: undefined,
      },
      vi.fn(),
    ]);

    const container = renderNearMe();

    expect(container.textContent).toContain('Near me is unavailable');
    expect(container.textContent).toContain('USER_LOCATION');
  });

  it('shows useful empty states for a configured location with no nearby data', () => {
    queryResult([
      {
        data: {
          storesNearMe: { __typename: 'QueryStoresNearMeSuccess', data: [] },
          dealsNearMe: { __typename: 'QueryDealsNearMeSuccess', data: [] },
          recommendedNewsletters: { __typename: 'QueryRecommendedNewslettersSuccess', data: [] },
        },
        fetching: false,
        error: undefined,
      },
      vi.fn(),
    ]);

    const container = renderNearMe();

    expect(container.textContent).toContain('No stores found within 25 miles.');
    expect(container.textContent).toContain('No active deals found at nearby stores.');
    expect(container.textContent).toContain('No newsletter recommendations for nearby stores.');
  });
});
