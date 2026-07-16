import OpenAI from 'openai';
import { z } from 'zod';

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
  extract(email: { subject: string; from: string; text: string }): Promise<ExtractedDeal[]>;
}

export interface ExtractorConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

export function extractorConfigFromEnv(): ExtractorConfig {
  return {
    baseURL: process.env.OPENAI_BASE_URL ?? 'http://localhost:1234/v1',
    apiKey: process.env.OPENAI_API_KEY ?? 'not-needed',
    model: process.env.OPENAI_MODEL ?? 'qwen3.6-35b-a3b',
  };
}

const SYSTEM_PROMPT = [
  'You extract grocery/retail deals from one marketing email.',
  'Return ONLY JSON of the form {"deals":[...]} where each deal has:',
  'merchant, title, category, item, discountText, discountPct (number), price (number),',
  'currency, code, minSpend (number), url, startsAt (ISO date), expiresAt (ISO date).',
  'Include only real, current offers. Use null for unknown fields. Empty array if none.',
].join(' ');

export function llmExtractorFactory({ config }: { config: ExtractorConfig }): DealExtractor {
  const client = new OpenAI({ baseURL: config.baseURL, apiKey: config.apiKey });
  return {
    async extract(email) {
      const completion = await client.chat.completions.create({
        model: config.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Subject: ${email.subject}\nFrom: ${email.from}\n\n${email.text}`,
          },
        ],
      });
      const content = completion.choices[0]?.message.content ?? '{"deals":[]}';
      let json: unknown;
      try {
        json = JSON.parse(content);
      } catch {
        return [];
      }
      const parsed = ResponseSchema.safeParse(json);
      return parsed.success ? parsed.data.deals : [];
    },
  };
}
