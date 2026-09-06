import { describe, expect, it } from 'vitest';
import { EMPTY_ITEM, todayForInput } from './formValues';
import { toPantryItemInput, toPriceEntryInput } from './toInput';

describe('toPantryItemInput', () => {
  it('sends a blank optional field as absent, not as an empty string', () => {
    const input = toPantryItemInput({ ...EMPTY_ITEM, name: '  Tide  ', brand: '   ' });

    expect(input.name).toBe('Tide');
    expect(input.brand).toBeUndefined();
    expect(input.couponTypeId).toBeUndefined();
    expect(input.sizeAmount).toBeUndefined();
    expect(input.sizeUnit).toBeUndefined();
  });

  it('parses the numeric fields it is given', () => {
    const input = toPantryItemInput({
      ...EMPTY_ITEM,
      name: 'Tide',
      sizeAmount: '150',
      sizeUnit: 'FLUID_OUNCE',
      targetPrice: '0.12',
    });

    expect(input.sizeAmount).toBe(150);
    expect(input.targetPrice).toBe(0.12);
    expect(input.sizeUnit).toBe('FLUID_OUNCE');
  });
});

describe('toPriceEntryInput', () => {
  const values = {
    price: '19.94',
    sizeAmount: '150',
    sizeUnit: 'FLUID_OUNCE' as const,
    quantity: '2',
    merchantName: '  Costco  ',
    observedAt: '2026-08-12',
    onSale: true,
    note: '',
  };

  it('maps the form onto the mutation input', () => {
    const input = toPriceEntryInput('item-1', values);

    expect(input).toMatchObject({
      pantryItemId: 'item-1',
      price: 19.94,
      sizeAmount: 150,
      quantity: 2,
      merchantName: 'Costco',
      onSale: true,
    });
    expect(input.note).toBeUndefined();
  });

  it('pins a calendar date to midday so it stays on that day in every timezone', () => {
    // Midnight local would cross into the next or previous day once converted to UTC, and a
    // "today" that lands in tomorrow is rejected by the server as a future observation.
    const input = toPriceEntryInput('item-1', { ...values, observedAt: todayForInput() });
    const observed = new Date(input.observedAt ?? '');

    expect(observed.getTime()).toBeLessThanOrEqual(Date.now());
    expect(observed.toDateString()).toBe(new Date().toDateString());
  });

  it('omits the date entirely when the field is cleared', () => {
    expect(toPriceEntryInput('item-1', { ...values, observedAt: '' }).observedAt).toBeUndefined();
  });
});
