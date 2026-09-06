import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useQuery } from 'urql';
import { CouponIngestBanner } from './CouponIngestBanner';
import type { Maybe } from '../../lib/types';

vi.mock('urql', () => ({ useQuery: vi.fn() }));

let root: Maybe<Root> = null;

function renderBanner() {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<CouponIngestBanner />));
  return container;
}

function queryResult(result: unknown) {
  vi.mocked(useQuery).mockReturnValue(result as never);
}

function appConfig(over: { couponIngestEnabled: boolean; lastIngestAt: Maybe<string> }) {
  return [{ data: { appConfig: over }, fetching: false, error: undefined }, vi.fn()];
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe('CouponIngestBanner', () => {
  it('announces the pause and when coupons were last imported', () => {
    queryResult(
      appConfig({ couponIngestEnabled: false, lastIngestAt: '2026-08-12T09:30:00.000Z' }),
    );
    const container = renderBanner();
    const banner = container.querySelector('[role="status"]');

    expect(banner?.textContent).toContain('Coupon newsletter ingestion is paused');
    expect(banner?.textContent).toContain('No new coupons are being imported');
    expect(banner?.textContent).toContain('2026');
  });

  it('omits the import date when nothing has ever been imported', () => {
    queryResult(appConfig({ couponIngestEnabled: false, lastIngestAt: null }));
    const banner = renderBanner().querySelector('[role="status"]');

    expect(banner?.textContent).toContain('Coupon newsletter ingestion is paused');
    expect(banner?.textContent).toContain('already collected.');
    expect(banner?.textContent).not.toContain('last updated');
  });

  it('renders nothing while ingestion is running', () => {
    queryResult(appConfig({ couponIngestEnabled: true, lastIngestAt: '2026-08-12T09:30:00.000Z' }));
    expect(renderBanner().querySelector('[role="status"]')).toBeNull();
  });

  it('stays out of the way while loading and when the query fails', () => {
    // The deals list below already reports a broken API; a second error strip helps nobody.
    queryResult([{ data: undefined, fetching: true, error: undefined }, vi.fn()]);
    expect(renderBanner().textContent).toBe('');
    act(() => root?.unmount());

    queryResult([{ data: undefined, fetching: false, error: new Error('Network down') }, vi.fn()]);
    expect(renderBanner().textContent).toBe('');
  });

  it('falls back to the raw value when the server sends an unparseable date', () => {
    queryResult(appConfig({ couponIngestEnabled: false, lastIngestAt: 'not-a-date' }));
    expect(renderBanner().querySelector('[role="status"]')?.textContent).toContain('not-a-date');
  });
});
