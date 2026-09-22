import { describe, expect, it } from 'vitest';
import { formatDate, formatMoney, formatSize, unitAbbreviation, UNIT_OPTIONS } from './units';

describe('unit labels', () => {
  it('abbreviates every unit it offers', () => {
    for (const unit of UNIT_OPTIONS) {
      const abbreviation = unitAbbreviation(unit.value);
      expect(abbreviation).toBeTruthy();
      expect(abbreviation).not.toBe(unit.value);
    }
  });

  it('passes an unknown unit through rather than rendering nothing', () => {
    // The server owns the enum; a unit added there must not blank out the UI before the web
    // catches up.
    expect(unitAbbreviation('FURLONG')).toBe('FURLONG');
  });
});

describe('formatSize', () => {
  it('joins the amount and the abbreviation', () => {
    expect(formatSize(150, 'FLUID_OUNCE')).toBe('150 fl oz');
  });

  it('reports nothing for an item with no fixed pack size', () => {
    expect(formatSize(null, 'OUNCE')).toBeNull();
    expect(formatSize(12, null)).toBeNull();
    expect(formatSize(undefined, undefined)).toBeNull();
  });

  it('keeps a size of zero rather than treating it as absent', () => {
    expect(formatSize(0, 'COUNT')).toBe('0 ct');
  });
});

describe('formatMoney', () => {
  it('formats a pack price', () => {
    expect(formatMoney(19.94, 'USD')).toContain('19.94');
  });

  it('falls back to dollars when the currency is unknown', () => {
    expect(formatMoney(5, null)).toContain('5.00');
  });
});

describe('formatDate', () => {
  it('renders a readable date', () => {
    expect(formatDate('2026-08-12T09:30:00.000Z')).toContain('2026');
  });

  it('passes an unparseable value through instead of showing "Invalid Date"', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });
});
