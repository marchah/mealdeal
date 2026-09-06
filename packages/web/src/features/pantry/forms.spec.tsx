import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Maybe } from '../../lib/types';
import { EMPTY_ITEM, initialLogPriceValues } from './formValues';
import { LogPriceForm } from './LogPriceForm';
import { PantryItemForm } from './PantryItemForm';

let root: Maybe<Root> = null;

function render(node: React.ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(node));
  return container;
}

/** Every control a user can type into or choose from, in DOM order. */
function controls(container: HTMLElement) {
  return [
    ...container.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input, select, textarea',
    ),
  ];
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

describe('pantry form labelling', () => {
  // Static analysis cannot follow the useId-based `id('name')` helper these forms share, so the
  // label association is asserted here against the real DOM instead: `.labels` is computed by the
  // browser from htmlFor/id, so a mismatch shows up as an unlabelled control.
  it('gives every control in the item form a real label', () => {
    const container = render(
      <PantryItemForm
        initial={EMPTY_ITEM}
        categories={[{ id: 'c1', label: 'Household' }]}
        submitLabel="Add item"
        error={null}
        busy={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const fields = controls(container);
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      expect(
        field.labels?.[0]?.textContent,
        `${field.tagName}#${field.id} has no label`,
      ).toBeTruthy();
    }
  });

  it('gives every control in the log-price form a real label', () => {
    const container = render(
      <LogPriceForm
        initial={initialLogPriceValues({
          sizeAmount: 150,
          sizeUnit: 'FLUID_OUNCE',
          unitPriceUnit: 'FLUID_OUNCE',
        })}
        error={null}
        busy={false}
        onSubmit={vi.fn()}
      />,
    );

    const fields = controls(container);
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      expect(
        field.labels?.[0]?.textContent,
        `${field.tagName}#${field.id} has no label`,
      ).toBeTruthy();
    }
  });

  it('keeps ids unique when two forms are on the page at once', () => {
    // useId is what makes that true; a hand-written id would collide and steal the other's label.
    const container = render(
      <>
        <PantryItemForm
          initial={EMPTY_ITEM}
          categories={[]}
          submitLabel="One"
          error={null}
          busy={false}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />
        <PantryItemForm
          initial={EMPTY_ITEM}
          categories={[]}
          submitLabel="Two"
          error={null}
          busy={false}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />
      </>,
    );

    const ids = controls(container).map((field) => field.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('prefills the price form from the item’s usual pack', () => {
    const container = render(
      <LogPriceForm
        initial={initialLogPriceValues({
          sizeAmount: 150,
          sizeUnit: 'FLUID_OUNCE',
          unitPriceUnit: 'OUNCE',
        })}
        error={null}
        busy={false}
        onSubmit={vi.fn()}
      />,
    );
    const byLabel = (label: string) =>
      controls(container).find((field) => field.labels?.[0]?.textContent === label);

    expect(byLabel('Pack size')?.value).toBe('150');
    expect(byLabel('Pack unit')?.value).toBe('FLUID_OUNCE');
    expect(byLabel('How many packs')?.value).toBe('1');
  });

  it('falls back to the tracking unit when the item has no usual pack', () => {
    const values = initialLogPriceValues({
      sizeAmount: null,
      sizeUnit: null,
      unitPriceUnit: 'OUNCE',
    });

    expect(values.sizeAmount).toBe('');
    expect(values.sizeUnit).toBe('OUNCE');
  });
});
