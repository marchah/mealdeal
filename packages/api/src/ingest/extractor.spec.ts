import { describe, expect, it, vi } from 'vitest';

const createCompletion = vi.hoisted(() => vi.fn());

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: createCompletion } };
  },
}));

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

  it('throws on a malformed shape (missing required fields)', () => {
    expect(() => parseExtractionResponse('{"deals":[{"title":"no merchant"}]}')).toThrow();
  });

  it('rejects malformed couponTypeKey values', () => {
    expect(() =>
      parseExtractionResponse('{"deals":[{"merchant":"Shop","title":"Cheese","couponTypeKey":3}]}'),
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
            content: expect.stringContaining('"key":"fresh-food","label":"Fresh Food"'),
          }),
        ]),
      }),
    );
  });
});
