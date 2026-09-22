import { describe, expect, it, vi } from 'vitest';

const createCompletion = vi.hoisted(() => vi.fn());

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: createCompletion } };
  },
}));

import { openaiAdapterFactory } from './adapter';

const CONFIG = {
  OPENAI_BASE_URL: 'http://localhost:1234/v1',
  OPENAI_API_KEY: 'not-needed',
  OPENAI_MODEL: 'test-model',
};

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
});
