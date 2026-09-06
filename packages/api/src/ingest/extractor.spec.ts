import { describe, expect, it, vi } from 'vitest';
import { ExtractionTruncatedError } from '../common/errors';
import type { Maybe } from '../common/types';
import {
  llmExtractorFactory,
  parseExtractionResponse,
  type JsonChatCompletion,
  type JsonChatCompletionRequest,
} from './extractor';

/** A stand-in for the model, so this suite is about the prompt and the parsing, nothing else. */
function makeExtractor(reply: { content: Maybe<string>; finishReason?: Maybe<string> }) {
  const complete = vi.fn((_request: JsonChatCompletionRequest) =>
    Promise.resolve({ content: reply.content, finishReason: reply.finishReason ?? null }),
  );
  const jsonChatCompletion: JsonChatCompletion = { complete };
  return { extractor: llmExtractorFactory({ jsonChatCompletion }), complete };
}

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
    const { extractor, complete } = makeExtractor({ content: '{"deals":[]}' });

    await extractor.extract({
      subject: 'Weekly deals',
      from: 'shop@example.com',
      body: 'Cheese on sale',
      couponTypes: [{ key: 'fresh-food', label: 'Fresh Food' }],
    });

    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('Never guess or synthesize merchantAddress'),
      }),
    );
    // The taxonomy is passed live, not hard-coded in the prompt — which is the whole point of
    // the field this test is named for.
    const [request] = complete.mock.calls[0] ?? [];
    expect(request?.system).toContain('fresh-food');
    expect(request?.system).toContain('Fresh Food');
    expect(request?.user).toContain('Cheese on sale');
  });
  // The parser can only report truncation if the caller actually forwards finish_reason.
  it('forwards the choice finish_reason so a capped response surfaces as truncation', async () => {
    const { extractor } = makeExtractor({
      content: '{"deals":[{"merchant":"Shop"',
      finishReason: 'length',
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
