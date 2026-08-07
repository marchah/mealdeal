import { describe, expect, it, vi } from 'vitest';

const createCompletion = vi.hoisted(() => vi.fn());

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: createCompletion } };
  },
}));

import { ExtractionTruncatedError } from '../common/errors';
import { llmExtractorFactory, parseExtractionResponse } from './extractor';

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

  // Truncated output is JSON that simply stops, so without finish_reason it is indistinguishable
  // from a malformed response — and the generic error sends the operator looking in the wrong place.
  it('reports a length-capped response as truncation, not as malformed JSON', () => {
    expect(() =>
      parseExtractionResponse('{"deals":[{"merchant":"Shop","title":"Che', 'length'),
    ).toThrow(ExtractionTruncatedError);
  });

  it('reports truncation even when the cut-off output happens to still parse', () => {
    expect(() => parseExtractionResponse('{"deals":[]}', 'length')).toThrow(
      ExtractionTruncatedError,
    );
  });

  it('does not treat a normally-finished response as truncated', () => {
    expect(parseExtractionResponse('{"deals":[]}', 'stop')).toEqual([]);
  });

  it('throws on a malformed shape (missing required fields)', () => {
    expect(() => parseExtractionResponse('{"deals":[{"title":"no merchant"}]}')).toThrow();
  });

  it('rejects malformed couponTypeKey values', () => {
    expect(() =>
      parseExtractionResponse('{"deals":[{"merchant":"Shop","title":"Cheese","couponTypeKey":3}]}'),
    ).toThrow();
  });

  it('accepts a nullable merchant address but rejects an empty address', () => {
    expect(
      parseExtractionResponse(
        '{"deals":[{"merchant":"Shop","merchantAddress":null,"title":"Cheese"}]}',
      ),
    ).toEqual([{ merchant: 'Shop', merchantAddress: null, title: 'Cheese' }]);
    expect(() =>
      parseExtractionResponse(
        '{"deals":[{"merchant":"Shop","merchantAddress":"","title":"Cheese"}]}',
      ),
    ).toThrow();
  });

  it('puts the live coupon-type keys and labels in the model prompt', async () => {
    createCompletion.mockResolvedValueOnce({ choices: [{ message: { content: '{"deals":[]}' } }] });
    const extractor = llmExtractorFactory({
      config: {
        OPENAI_BASE_URL: 'http://localhost:1234/v1',
        OPENAI_API_KEY: 'not-needed',
        OPENAI_MODEL: 'test-model',
      },
    });

    await extractor.extract({
      subject: 'Weekly deals',
      from: 'shop@example.com',
      body: 'Cheese on sale',
      couponTypes: [{ key: 'fresh-food', label: 'Fresh Food' }],
    });

    expect(createCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('Never guess or synthesize merchantAddress'),
          }),
        ]),
      }),
    );
  });
  // The parser can only report truncation if the caller actually forwards finish_reason.
  it('forwards the choice finish_reason so a capped response surfaces as truncation', async () => {
    createCompletion.mockResolvedValueOnce({
      choices: [{ message: { content: '{"deals":[{"merchant":"Shop"' }, finish_reason: 'length' }],
    });
    const extractor = llmExtractorFactory({
      config: {
        OPENAI_BASE_URL: 'http://localhost:1234/v1',
        OPENAI_API_KEY: 'not-needed',
        OPENAI_MODEL: 'test-model',
      },
    });

    await expect(
      extractor.extract({
        subject: 'Weekly deals',
        from: 'shop@example.com',
        body: 'Cheese on sale',
        couponTypes: [{ key: 'fresh-food', label: 'Fresh Food' }],
      }),
    ).rejects.toThrow(ExtractionTruncatedError);
  });
});
