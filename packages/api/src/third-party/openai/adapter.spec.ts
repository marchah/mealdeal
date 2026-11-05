import { describe, expect, it, vi } from 'vitest';

const createCompletion = vi.hoisted(() => vi.fn());

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: createCompletion } };
  },
}));

import type { Maybe } from '../../common/types';
import { parseExtractionResponse } from '../../ingest/extractor';
import { openaiAdapterFactory } from './adapter';

const CONFIG = {
  OPENAI_BASE_URL: 'http://localhost:1234/v1',
  OPENAI_API_KEY: 'not-needed',
  OPENAI_MODEL: 'test-model',
};

function replyWith(content: Maybe<string>, finishReason = 'stop') {
  createCompletion.mockResolvedValueOnce({
    choices: [{ message: { content }, finish_reason: finishReason }],
  });
  return openaiAdapterFactory({ config: CONFIG }).complete({ system: 's', user: 'u' });
}

describe('openaiAdapter', () => {
  it('sends the two prompts as system and user messages to the configured model', async () => {
    createCompletion.mockResolvedValueOnce({ choices: [{ message: { content: '{}' } }] });

    await openaiAdapterFactory({ config: CONFIG }).complete({ system: 'be brief', user: 'hello' });

    expect(createCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'test-model',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'be brief' },
          { role: 'user', content: 'hello' },
        ],
      }),
    );
  });

  it('asks for deterministic output', async () => {
    // Temperature 0 is load-bearing: a truncated response is only safe to drop rather than retry
    // because the same email produces the same output every time.
    createCompletion.mockResolvedValueOnce({ choices: [{ message: { content: '{}' } }] });

    await openaiAdapterFactory({ config: CONFIG }).complete({ system: 's', user: 'u' });

    expect(createCompletion.mock.calls[0]?.[0]).toMatchObject({ temperature: 0 });
  });

  it('reports the content and the finish reason of the first choice', async () => {
    createCompletion.mockResolvedValueOnce({
      choices: [{ message: { content: '{"deals":[]}' }, finish_reason: 'stop' }],
    });

    await expect(
      openaiAdapterFactory({ config: CONFIG }).complete({ system: 's', user: 'u' }),
    ).resolves.toEqual({ content: '{"deals":[]}', finishReason: 'stop' });
  });

  it('passes a capped response through as `length` rather than hiding it', async () => {
    // The caller distinguishes a truncated response from a malformed one by this field alone.
    createCompletion.mockResolvedValueOnce({
      choices: [{ message: { content: '{"deals":[{' }, finish_reason: 'length' }],
    });

    const result = await openaiAdapterFactory({ config: CONFIG }).complete({
      system: 's',
      user: 'u',
    });

    expect(result.finishReason).toBe('length');
  });

  it('reports an answer with no choices as absent content, not a crash', async () => {
    createCompletion.mockResolvedValueOnce({ choices: [] });

    await expect(
      openaiAdapterFactory({ config: CONFIG }).complete({ system: 's', user: 'u' }),
    ).resolves.toEqual({ content: null, finishReason: null });
  });

  it.each([
    ['an empty', '<think>\n\n</think>\n\n{"store":"Aldi"}'],
    ['a non-empty', '<think>\nThe header says Aldi.\n</think>\n\n{"store":"Aldi"}'],
    ['a whitespace-led', '\n  <think></think>{"store":"Aldi"}'],
  ])('strips %s leading think block so the caller gets bare JSON', async (_kind, content) => {
    await expect(replyWith(content)).resolves.toEqual({
      content: '{"store":"Aldi"}',
      finishReason: 'stop',
    });
  });

  it('leaves content without a think block exactly as the server sent it', async () => {
    await expect(replyWith('\n{"deals":[]}\n')).resolves.toEqual({
      content: '\n{"deals":[]}\n',
      finishReason: 'stop',
    });
  });

  it('leaves a think tag that is not at the start alone', async () => {
    const content = '{"title":"<think>Big</think> savings"}';

    await expect(replyWith(content)).resolves.toEqual({ content, finishReason: 'stop' });
  });

  it('strips only the leading block, not up to a later closing tag', async () => {
    await expect(
      replyWith('<think></think>{"title":"<think>Big</think> savings"}'),
    ).resolves.toEqual({ content: '{"title":"<think>Big</think> savings"}', finishReason: 'stop' });
  });

  it('reports a reply that was only a think block as empty, not as non-JSON', async () => {
    const result = await replyWith('<think>\nNothing to extract.\n</think>\n\n');

    expect(result).toEqual({ content: '', finishReason: 'stop' });
    expect(() => parseExtractionResponse(result.content, result.finishReason)).toThrow(
      'LLM returned an empty response',
    );
  });

  it('keeps null content as null', async () => {
    await expect(replyWith(null)).resolves.toEqual({ content: null, finishReason: 'stop' });
  });

  it('passes the finish reason through unchanged when it strips a think block', async () => {
    await expect(replyWith('<think>\n\n</think>\n\n{"deals":[{', 'length')).resolves.toEqual({
      content: '{"deals":[{',
      finishReason: 'length',
    });
  });

  it('leaves a think block cut off by the output cap untouched', async () => {
    const content = '<think>\nThe header says';

    await expect(replyWith(content, 'length')).resolves.toEqual({
      content,
      finishReason: 'length',
    });
  });
});
