import { describe, expect, it } from 'vitest';
import { normalizeHashPath } from './useHashRoute';

describe('normalizeHashPath', () => {
  it('treats an absent, bare or slash-only hash as the root route', () => {
    expect(normalizeHashPath('')).toBe('/');
    expect(normalizeHashPath('#')).toBe('/');
    expect(normalizeHashPath('#/')).toBe('/');
    expect(normalizeHashPath('#//')).toBe('/');
  });

  it('strips the leading # and any trailing slashes', () => {
    expect(normalizeHashPath('#/pantry')).toBe('/pantry');
    expect(normalizeHashPath('#/pantry/')).toBe('/pantry');
    expect(normalizeHashPath('#/coupons/near-me//')).toBe('/coupons/near-me');
  });

  it('adds the leading slash a hand-typed hash omits', () => {
    // Someone typing `#pantry` into the address bar means the pantry route.
    expect(normalizeHashPath('#pantry')).toBe('/pantry');
    expect(normalizeHashPath('pantry')).toBe('/pantry');
  });

  it('leaves an unknown route intact for the caller to resolve', () => {
    // Normalizing is not routing: App decides that an unrecognized path means Pantry.
    expect(normalizeHashPath('#/nope')).toBe('/nope');
  });
});
