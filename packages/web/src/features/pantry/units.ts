import type { Maybe } from '../../lib/types';

/**
 * Display labels for the unit enum. Only the labels live here — which units exist, and which may
 * be used together, are the server's to decide and to enforce; a wrong pick comes back as a
 * validation error naming both units.
 */
export const UNIT_OPTIONS = [
  { value: 'COUNT', label: 'count (ct)' },
  { value: 'OUNCE', label: 'ounces (oz)' },
  { value: 'POUND', label: 'pounds (lb)' },
  { value: 'FLUID_OUNCE', label: 'fluid ounces (fl oz)' },
  { value: 'PINT', label: 'pints (pt)' },
  { value: 'QUART', label: 'quarts (qt)' },
  { value: 'GALLON', label: 'gallons (gal)' },
  { value: 'SQUARE_FOOT', label: 'square feet (sq ft)' },
] as const;

export type UnitValue = (typeof UNIT_OPTIONS)[number]['value'];

const ABBREVIATIONS: Record<UnitValue, string> = {
  COUNT: 'ct',
  OUNCE: 'oz',
  POUND: 'lb',
  FLUID_OUNCE: 'fl oz',
  PINT: 'pt',
  QUART: 'qt',
  GALLON: 'gal',
  SQUARE_FOOT: 'sq ft',
};

export function unitAbbreviation(unit: string): string {
  return ABBREVIATIONS[unit as UnitValue] ?? unit;
}

/** "150 fl oz", or null when the item has no fixed pack size. */
export function formatSize(
  amount: number | null | undefined,
  unit: string | null | undefined,
): Maybe<string> {
  if (amount === null || amount === undefined || !unit) return null;
  return `${String(amount)} ${unitAbbreviation(unit)}`;
}

const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });

/** A pack price — "$19.94". Unit prices arrive already formatted from the server. */
export function formatMoney(amount: number, currency: string | null | undefined): string {
  if (!currency || currency === 'USD') return money.format(amount);
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
}

export const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : dateFormat.format(date);
}
