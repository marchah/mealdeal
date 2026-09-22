import { describe, expect, it } from 'vitest';
import {
  Unit,
  UnitDimension,
  dimensionOf,
  formatUnitPrice,
  toBaseAmount,
  unitPriceIn,
} from './units';

// Declared independently of the module's own table so this is a real check, and typed
// Record<Unit, …> so adding a unit without classifying it here fails to compile.
const EXPECTED_DIMENSIONS: Record<Unit, UnitDimension> = {
  [Unit.COUNT]: UnitDimension.COUNT,
  [Unit.OUNCE]: UnitDimension.WEIGHT,
  [Unit.POUND]: UnitDimension.WEIGHT,
  [Unit.FLUID_OUNCE]: UnitDimension.VOLUME,
  [Unit.PINT]: UnitDimension.VOLUME,
  [Unit.QUART]: UnitDimension.VOLUME,
  [Unit.GALLON]: UnitDimension.VOLUME,
  [Unit.SQUARE_FOOT]: UnitDimension.AREA,
};

const ALL_UNITS = Object.values(Unit);

describe('dimensionOf', () => {
  it('classifies every unit in the enum', () => {
    expect(ALL_UNITS).toHaveLength(Object.keys(EXPECTED_DIMENSIONS).length);
    for (const unit of ALL_UNITS) {
      expect(dimensionOf(unit)).toBe(EXPECTED_DIMENSIONS[unit]);
    }
  });

  it('separates units that must never be compared', () => {
    // This partition is what lets a caller reject "$/gallon logged against an item sold by weight".
    expect(dimensionOf(Unit.POUND)).not.toBe(dimensionOf(Unit.GALLON));
    expect(dimensionOf(Unit.COUNT)).not.toBe(dimensionOf(Unit.OUNCE));
    expect(dimensionOf(Unit.SQUARE_FOOT)).not.toBe(dimensionOf(Unit.COUNT));
  });

  it('keeps weight and volume ounces apart', () => {
    // The mix-up this module exists to prevent: a fluid ounce measures volume, an ounce weight,
    // and a 16 fl oz bottle is not a 1 lb bottle.
    expect(dimensionOf(Unit.OUNCE)).not.toBe(dimensionOf(Unit.FLUID_OUNCE));
  });

  it('treats every unit of one quantity as interchangeable', () => {
    expect(dimensionOf(Unit.POUND)).toBe(dimensionOf(Unit.OUNCE));
    expect(dimensionOf(Unit.GALLON)).toBe(dimensionOf(Unit.FLUID_OUNCE));
    expect(dimensionOf(Unit.PINT)).toBe(dimensionOf(Unit.QUART));
  });
});

describe('toBaseAmount', () => {
  it('leaves each dimension’s own base unit untouched', () => {
    expect(toBaseAmount(7, Unit.OUNCE)).toBe(7);
    expect(toBaseAmount(7, Unit.FLUID_OUNCE)).toBe(7);
    expect(toBaseAmount(7, Unit.COUNT)).toBe(7);
    expect(toBaseAmount(7, Unit.SQUARE_FOOT)).toBe(7);
  });

  it('uses the US customary definitions exactly', () => {
    // Every factor is an integer, so these are exact equalities — not tolerances. A rounded or
    // transposed constant cannot hide inside a floating-point margin here.
    expect(toBaseAmount(1, Unit.POUND)).toBe(16);
    expect(toBaseAmount(1, Unit.PINT)).toBe(16);
    expect(toBaseAmount(1, Unit.QUART)).toBe(32);
    expect(toBaseAmount(1, Unit.GALLON)).toBe(128);
    expect(toBaseAmount(2, Unit.PINT)).toBe(toBaseAmount(1, Unit.QUART));
    expect(toBaseAmount(4, Unit.QUART)).toBe(toBaseAmount(1, Unit.GALLON));
    expect(toBaseAmount(8, Unit.PINT)).toBe(toBaseAmount(1, Unit.GALLON));
  });

  it('converts zero, fractional and negative amounts faithfully', () => {
    // Conversion is total: it is arithmetic, not validation. Rejecting a non-positive size is the
    // job of the layer that writes price entries, which is the only layer that knows it is a size.
    expect(toBaseAmount(0, Unit.GALLON)).toBe(0);
    expect(toBaseAmount(0.5, Unit.POUND)).toBe(8);
    expect(toBaseAmount(-2, Unit.GALLON)).toBe(-256);
  });
});

describe('unitPriceIn', () => {
  it('is the identity for a base unit', () => {
    expect(unitPriceIn(0.25, Unit.OUNCE)).toBe(0.25);
    expect(unitPriceIn(0.25, Unit.FLUID_OUNCE)).toBe(0.25);
  });

  it('re-expresses a per-base-unit price in a human-sized unit', () => {
    // $11.99 for a 12 oz bag of coffee is a shade under $16 a pound.
    const perOunce = 11.99 / toBaseAmount(12, Unit.OUNCE);
    expect(unitPriceIn(perOunce, Unit.POUND)).toBeCloseTo(15.99, 2);
    expect(unitPriceIn(perOunce, Unit.OUNCE)).toBeCloseTo(0.999, 3);
  });

  it('round-trips against toBaseAmount for every unit', () => {
    // The property the whole module rests on: converting a pack price down to base units and back
    // up to the pack's own unit returns the price paid.
    const price = 19.94;
    const amount = 3;
    for (const unit of ALL_UNITS) {
      const perBaseUnit = price / toBaseAmount(amount, unit);
      expect(unitPriceIn(perBaseUnit, unit) * amount).toBeCloseTo(price, 10);
    }
  });
});

describe('comparing differently-sized packs', () => {
  it('finds the cheaper pack even when it is the more expensive one', () => {
    // The reason unit_price is stored in base units: a 150 fl oz jug at $19.94 beats a 2-pack of
    // 46 fl oz bottles at $12.98, and no comparison of the sticker prices would tell you that.
    const jug = 19.94 / toBaseAmount(150, Unit.FLUID_OUNCE);
    const twoPack = 12.98 / toBaseAmount(2 * 46, Unit.FLUID_OUNCE);

    expect(jug).toBeLessThan(twoPack);
    expect(unitPriceIn(jug, Unit.GALLON)).toBeCloseTo(17.02, 2);
    expect(unitPriceIn(twoPack, Unit.GALLON)).toBeCloseTo(18.06, 2);
  });

  it('compares a bulk pack against a small one stated in a different unit', () => {
    // A 2 lb bag at $8.00 against a 12 oz bag at $3.50: the small bag looks cheaper and is not.
    const bulk = 8 / toBaseAmount(2, Unit.POUND);
    const small = 3.5 / toBaseAmount(12, Unit.OUNCE);

    expect(bulk).toBeLessThan(small);
    expect(unitPriceIn(bulk, Unit.POUND)).toBeCloseTo(4, 10);
    expect(unitPriceIn(small, Unit.POUND)).toBeCloseTo(4.67, 2);
  });
});

describe('formatUnitPrice', () => {
  it('renders a currency amount with the unit suffix', () => {
    expect(
      formatUnitPrice({
        baseUnitPrice: 19.94 / toBaseAmount(150, Unit.FLUID_OUNCE),
        displayUnit: Unit.FLUID_OUNCE,
        currency: 'USD',
      }),
    ).toBe('$0.13/fl oz');
    expect(
      formatUnitPrice({
        baseUnitPrice: 11.99 / toBaseAmount(12, Unit.OUNCE),
        displayUnit: Unit.POUND,
        currency: 'USD',
      }),
    ).toBe('$15.99/lb');
  });

  it('keeps four decimals rather than rounding a sub-cent price to nothing', () => {
    // 2 500 coffee filters for $10.99 is $0.0044 each; $0.00 each would read as free.
    expect(
      formatUnitPrice({
        baseUnitPrice: 10.99 / toBaseAmount(2_500, Unit.COUNT),
        displayUnit: Unit.COUNT,
        currency: 'USD',
      }),
    ).toBe('$0.0044/ct');
  });

  it('shows an exact zero at the ordinary two decimals', () => {
    expect(formatUnitPrice({ baseUnitPrice: 0, displayUnit: Unit.OUNCE, currency: 'USD' })).toBe(
      '$0.00/oz',
    );
  });

  it('honours the entry’s currency rather than assuming dollars', () => {
    expect(formatUnitPrice({ baseUnitPrice: 1.5, displayUnit: Unit.COUNT, currency: 'EUR' })).toBe(
      '€1.50/ct',
    );
  });

  it('abbreviates every unit in the enum', () => {
    // No unit may fall through to a blank or a raw enum name like FLUID_OUNCE.
    for (const unit of ALL_UNITS) {
      const formatted = formatUnitPrice({ baseUnitPrice: 1, displayUnit: unit, currency: 'USD' });
      const [, suffix] = formatted.split('/');
      expect(suffix).toBeTruthy();
      expect(suffix).not.toBe(String(unit));
    }
  });
});
