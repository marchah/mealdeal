import OpenAI from 'openai';
import { z } from 'zod';
import { ServerError } from '../common/errors';
import type { LlmSettings } from '../common/settings';
import type { Maybe } from '../common/types';

// The LLM returns free-form JSON; we NEVER trust its shape — every field is validated by
// this Zod schema before it reaches the domain. Extra/malformed fields are dropped.
export const ExtractedDealSchema = z.object({
  merchant: z.string().min(1),
  title: z.string().min(1),
  category: z.string().nullish(),
  item: z.string().nullish(),
  discountText: z.string().nullish(),
  discountPct: z.number().nullish(),
  price: z.number().nullish(),
  currency: z.string().nullish(),
  code: z.string().nullish(),
  minSpend: z.number().nullish(),
  url: z.string().nullish(),
  startsAt: z.string().nullish(),
  expiresAt: z.string().nullish(),
});
export type ExtractedDeal = z.infer<typeof ExtractedDealSchema>;

const ResponseSchema = z.object({ deals: z.array(ExtractedDealSchema) });

export interface DealExtractor {
  extract(email: { subject: string; from: string; body: string }): Promise<ExtractedDeal[]>;
}

const SYSTEM_PROMPT = [
  'You extract grocery/retail deals from one marketing email.',
  'Return ONLY JSON of the form {"deals":[...]} where each deal has:',
  'merchant, title, category, item, discountText, discountPct (number), price (number),',
  'currency, code, minSpend (number), url, startsAt (ISO date), expiresAt (ISO date).',
  'Include only real, current offers. Use null for unknown fields. Empty array if none.',
].join(' ');

/**
 * Parse + validate a model response. THROWS on unusable output (empty, non-JSON, or a shape
 * that fails validation) so the caller leaves the email unacknowledged and retries it — a
 * truncated/garbled response for an email that had deals must not be silently dropped.
 * A valid `{"deals":[]}` is a legitimate "no deals" result and returns `[]` (success).
 */
export function parseExtractionResponse(content: Maybe<string> | undefined): ExtractedDeal[] {
  if (!content || content.trim() === '') {
    throw new ServerError('LLM returned an empty response');
  }
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    throw new ServerError('LLM returned non-JSON output');
  }
  const parsed = ResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new ServerError(`LLM output failed validation: ${parsed.error.message}`);
  }
  return parsed.data.deals;
}

export function llmExtractorFactory({ config }: { config: LlmSettings }): DealExtractor {
  const client = new OpenAI({ baseURL: config.OPENAI_BASE_URL, apiKey: config.OPENAI_API_KEY });
  return {
    async extract(email) {
      const completion = await client.chat.completions.create({
        model: config.OPENAI_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Subject: ${email.subject}\nFrom: ${email.from}\n\n${email.body}`,
          },
        ],
      });
      return parseExtractionResponse(completion.choices[0]?.message.content);
    },
  };
}
