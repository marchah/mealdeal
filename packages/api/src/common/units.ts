// Units of sale, and the arithmetic that makes differently-sized packs comparable.
//
// The Unit enums and the conversion table live here rather than in a slice's types.ts: Unit is
// consumed by two entity slices, the Drizzle schema, the Pothos enum and the price-insight
// feature, and a conversion table is not a type. Same standing as common/errors.ts — a pure,
// side-effect-free reference module any layer may import.
//
// US customary only: this is a US household, so metric units would never be picked. That choice
// pays for itself — every factor below is an exact integer, which puts no floating-point error
// anywhere in the comparison path. Adding a metric unit later is one enum member and one factor.
//
// Every amount reduces to a canonical base per dimension (ounce, fluid ounce, count, square foot),
// so a stored unit price compares directly across pack sizes. Which unit a price is *shown* in is
// a separate, presentation-time choice — see unitPriceIn.

export enum UnitDimension {
  COUNT = 'COUNT',
  WEIGHT = 'WEIGHT',
  VOLUME = 'VOLUME',
  AREA = 'AREA',
}

export enum Unit {
  COUNT = 'COUNT',
  OUNCE = 'OUNCE',
  POUND = 'POUND',
  FLUID_OUNCE = 'FLUID_OUNCE',
  PINT = 'PINT',
  QUART = 'QUART',
  GALLON = 'GALLON',
  SQUARE_FOOT = 'SQUARE_FOOT',
}

interface UnitSpec {
  dimension: UnitDimension;
  /** How many base units one of this unit is; 1 for the dimension's own base unit. */
  baseUnits: number;
  /** Display suffix, as in `$0.13/fl oz`. */
  abbreviation: string;
}

const UNITS: Record<Unit, UnitSpec> = {
  [Unit.COUNT]: { dimension: UnitDimension.COUNT, baseUnits: 1, abbreviation: 'ct' },
  [Unit.OUNCE]: { dimension: UnitDimension.WEIGHT, baseUnits: 1, abbreviation: 'oz' },
  [Unit.POUND]: { dimension: UnitDimension.WEIGHT, baseUnits: 16, abbreviation: 'lb' },
  [Unit.FLUID_OUNCE]: { dimension: UnitDimension.VOLUME, baseUnits: 1, abbreviation: 'fl oz' },
  [Unit.PINT]: { dimension: UnitDimension.VOLUME, baseUnits: 16, abbreviation: 'pt' },
  [Unit.QUART]: { dimension: UnitDimension.VOLUME, baseUnits: 32, abbreviation: 'qt' },
  [Unit.GALLON]: { dimension: UnitDimension.VOLUME, baseUnits: 128, abbreviation: 'gal' },
  [Unit.SQUARE_FOOT]: { dimension: UnitDimension.AREA, baseUnits: 1, abbreviation: 'sq ft' },
};

/** What a unit measures. Two units are interchangeable only when this matches. */
export function dimensionOf(unit: Unit): UnitDimension {
  return UNITS[unit].dimension;
}

/** Convert an amount to its dimension's base unit: 2 lb → 32 oz, 1 gal → 128 fl oz. */
export function toBaseAmount(amount: number, unit: Unit): number {
  return amount * UNITS[unit].baseUnits;
}

/**
 * Re-express a price-per-base-unit in a human-sized unit — $/oz → $/lb, $/fl oz → $/gal.
 * Comparison and storage always happen in base units; this exists only so a reader sees $17.02/gal.
 */
export function unitPriceIn(baseUnitPrice: number, displayUnit: Unit): number {
  return baseUnitPrice * UNITS[displayUnit].baseUnits;
}

/**
 * `$0.13/fl oz`. Takes the stored price-per-base-unit and converts on the way, so a caller cannot
 * format an unconverted figure by mistake. `currency` must be a well-formed ISO 4217 code —
 * validated where price entries are written. The locale is fixed so output does not vary with
 * the host's environment.
 */
export function formatUnitPrice({
  baseUnitPrice,
  displayUnit,
  currency,
}: {
  baseUnitPrice: number;
  displayUnit: Unit;
  currency: string;
}): string {
  const value = unitPriceIn(baseUnitPrice, displayUnit);
  // Bulk counts go sub-cent (2 500 coffee filters for $11), and two decimals renders those as
  // $0.00 — which reads as free rather than as cheap.
  const fractionDigits = value !== 0 && Math.abs(value) < 0.005 ? 4 : 2;
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
  return `${formatted}/${UNITS[displayUnit].abbreviation}`;
}
