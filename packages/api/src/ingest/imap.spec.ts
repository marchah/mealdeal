import { describe, expect, it } from 'vitest';
import { normalizeHtmlPart } from './imap';

describe('normalizeHtmlPart', () => {
  it.each<[string | false | undefined]>([[undefined], [false], [''], ['   ']])(
    'normalizes absent, false, and empty HTML (%j)',
    (html) => {
      expect(normalizeHtmlPart(html)).toBeNull();
    },
  );

  it('preserves a non-empty HTML part', () => {
    expect(normalizeHtmlPart('<h1>Offers</h1>')).toBe('<h1>Offers</h1>');
  });
});
