import OpenAI from 'openai';
import type { LlmSettings } from '../../common/settings';
import type { JsonChatCompletion, JsonChatCompletionRequest } from '../../ingest/extractor';

// Qwen3 on llama-server prefixes even json_object content with a <think> block, often empty.
const LEADING_THINK_BLOCK = /^\s*<think>[\s\S]*?<\/think>\s*/;

/**
 * OpenAI-compatible adapter for the `JsonChatCompletion` port. It owns the SDK, the model, and the
 * knobs that make a completion reproducible — temperature 0 and JSON-only output — so callers
 * supply only the two prompts. Swapping to another provider is a change to this file alone.
 */
export function openaiAdapterFactory({ config }: { config: LlmSettings }): JsonChatCompletion {
  const client = new OpenAI({ baseURL: config.OPENAI_BASE_URL, apiKey: config.OPENAI_API_KEY });

  async function complete(request: JsonChatCompletionRequest) {
    const completion = await client.chat.completions.create({
      model: config.OPENAI_MODEL,
      // Temperature 0 is load-bearing, not a preference: a truncated response is only safe to
      // drop instead of retry because the same input produces the same output (see run.ts).
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
    });
    const choice = completion.choices[0];
    return {
      content: choice?.message.content?.replace(LEADING_THINK_BLOCK, '') ?? null,
      finishReason: choice?.finish_reason ?? null,
    };
  }

  return { complete };
}
