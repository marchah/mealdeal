import { describe, expect, it } from 'vitest';
import { isPantryPath, pantryItemIdFromPath } from './routes';

describe('pantry routing', () => {
  it('claims the tab for the list and for any item beneath it', () => {
    expect(isPantryPath('/pantry')).toBe(true);
    expect(isPantryPath('/pantry/abc')).toBe(true);
    expect(isPantryPath('/coupons')).toBe(false);
    // Not a prefix match: a different route that merely starts with the same letters.
    expect(isPantryPath('/pantryish')).toBe(false);
  });

  it('reads the item id out of the route', () => {
    expect(pantryItemIdFromPath('/pantry/abc-123')).toBe('abc-123');
    expect(pantryItemIdFromPath('/pantry')).toBeNull();
    expect(pantryItemIdFromPath('/pantry/')).toBeNull();
    expect(pantryItemIdFromPath('/coupons/abc')).toBeNull();
  });

  it('decodes an id that had to be escaped in the hash', () => {
    expect(pantryItemIdFromPath('/pantry/a%2Fb')).toBe('a/b');
  });

  it('survives a hand-mangled hash instead of taking the page down', () => {
    // decodeURIComponent throws on a stray percent; an unopenable item beats a blank screen.
    expect(() => pantryItemIdFromPath('/pantry/%')).not.toThrow();
    expect(pantryItemIdFromPath('/pantry/%')).toBe('%');
  });
});
