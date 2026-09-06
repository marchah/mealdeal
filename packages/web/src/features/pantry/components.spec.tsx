import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { Maybe } from '../../lib/types';
import { ItemImage } from './ItemImage';
import { bestPerMerchant } from './insight';
import { Sparkline } from './Sparkline';
import { VerdictBadge } from './VerdictBadge';

let root: Maybe<Root> = null;

function render(node: React.ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(node));
  return container;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

describe('VerdictBadge', () => {
  it('names every verdict in words as well as colour', () => {
    // A badge that signals only in colour is invisible to a colour-blind reader and silent to a
    // screen reader; every one of these must carry text.
    const expected = {
      GREAT: 'Great price',
      GOOD: 'Good price',
      TYPICAL: 'Typical price',
      HIGH: 'High price',
      UNKNOWN: 'Not enough history',
    };

    for (const [verdict, label] of Object.entries(expected)) {
      const container = render(<VerdictBadge verdict={verdict} />);
      expect(container.textContent).toBe(label);
      act(() => root?.unmount());
    }
  });

  it('distinguishes the verdicts by more than one class', () => {
    const great = render(<VerdictBadge verdict="GREAT" />).firstElementChild?.className;
    act(() => root?.unmount());
    const high = render(<VerdictBadge verdict="HIGH" />).firstElementChild?.className;

    expect(great).not.toBe(high);
  });

  it('falls back rather than rendering an empty badge for an unknown verdict', () => {
    // The server owns the enum; a value added there must not blank out the card.
    expect(render(<VerdictBadge verdict="SOMETHING_NEW" />).textContent).toBe('Not enough history');
  });
});

describe('Sparkline', () => {
  it('draws one point per price and labels itself for a screen reader', () => {
    const container = render(<Sparkline values={[0.17, 0.15, 0.11]} label="Price history" />);
    const svg = container.querySelector('svg');

    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Price history');
    expect(svg?.querySelector('polyline')?.getAttribute('points')?.split(' ')).toHaveLength(3);
  });

  it('draws nothing from a single price, which has no trend', () => {
    expect(render(<Sparkline values={[0.11]} label="x" />).querySelector('svg')).toBeNull();
    expect(render(<Sparkline values={[]} label="x" />).querySelector('svg')).toBeNull();
  });

  it('survives an unchanging history instead of dividing by zero', () => {
    const points = render(<Sparkline values={[0.13, 0.13, 0.13]} label="x" />)
      .querySelector('polyline')
      ?.getAttribute('points');

    expect(points).toBeTruthy();
    expect(points).not.toContain('NaN');
  });
});

describe('ItemImage', () => {
  it('shows the product image when there is one', () => {
    const container = render(<ItemImage src="https://example.test/tide.jpg" name="Tide" />);
    const image = container.querySelector('img');

    expect(image?.getAttribute('alt')).toBe('Tide');
    // Keeps the pantry's contents out of the retailer's referrer logs.
    expect(image?.getAttribute('referrerPolicy')).toBe('no-referrer');
  });

  it('falls back to an initial when there is no image', () => {
    const container = render(<ItemImage src={null} name="tide" />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('T');
  });

  it('falls back when the image URL turns out to be dead', () => {
    // Product image URLs rot, and a broken one must not disfigure the card.
    const container = render(<ItemImage src="https://example.test/gone.jpg" name="Tide" />);
    const image = container.querySelector('img');
    act(() => {
      image?.dispatchEvent(new Event('error'));
    });

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('T');
  });
});

describe('bestPerMerchant', () => {
  const at = (name: string, unitPrice: number) => ({
    unitPrice,
    merchant: { id: name, name },
  });

  it('keeps the cheapest price seen at each store, cheapest store first', () => {
    expect(
      bestPerMerchant([
        at('Target', 0.17),
        at('Costco', 0.13),
        at('Target', 0.15),
        at('Costco', 0.11),
      ]),
    ).toEqual([
      { name: 'Costco', unitPrice: 0.11 },
      { name: 'Target', unitPrice: 0.15 },
    ]);
  });

  it('skips prices seen without a store', () => {
    expect(bestPerMerchant([{ unitPrice: 0.1, merchant: null }, at('Costco', 0.2)])).toEqual([
      { name: 'Costco', unitPrice: 0.2 },
    ]);
  });

  it('reports nothing for a history with no stores at all', () => {
    expect(bestPerMerchant([{ unitPrice: 0.1, merchant: null }])).toEqual([]);
  });
});
