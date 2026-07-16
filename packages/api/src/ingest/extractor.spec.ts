import { describe, expect, it } from 'vitest';
import { parseExtractionResponse } from './extractor';

describe('parseExtractionResponse', () => {
  it('returns deals for valid output', () => {
    const deals = parseExtractionResponse(
      '{"deals":[{"merchant":"Shop","title":"Cheese 2-for-1"}]}',
    );
    expect(deals).toHaveLength(1);
    expect(deals[0]?.merchant).toBe('Shop');
  });

  it('treats a valid empty deals array as success (no retry)', () => {
    expect(parseExtractionResponse('{"deals":[]}')).toEqual([]);
  });

  it('throws on empty content (so the email is retried, not lost)', () => {
    expect(() => parseExtractionResponse('')).toThrow();
    expect(() => parseExtractionResponse(null)).toThrow();
  });

  it('throws on non-JSON output', () => {
    expect(() => parseExtractionResponse('sorry, here are your deals: ...')).toThrow();
  });

  it('throws on a malformed shape (missing required fields)', () => {
    expect(() => parseExtractionResponse('{"deals":[{"title":"no merchant"}]}')).toThrow();
  });
});
