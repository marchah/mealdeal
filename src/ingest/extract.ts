import type { Config } from '../config.ts';
import type { ExtractedDeal, FetchedEmail } from '../types.ts';

// TODO(local AI): this prompt is a starting point. Tune it for grocery focus, a consistent
// category taxonomy, robust date normalization (ISO), and precision (skip non-deals).
const SYSTEM_PROMPT = `You extract retail/grocery deals from a promotional email.
Return ONLY JSON of the form {"deals": [ ... ]} where each deal has these fields
(use null when unknown):
  merchant (string), title (short summary), category (e.g. produce/dairy/meat/pantry/electronics),
  item (specific product if any), discountText (e.g. "25% off", "BOGO"), discountPct (number or null),
  code (coupon code or null), minSpend (number or null), url (string or null),
  startsAt ("YYYY-MM-DD" or null), expiresAt ("YYYY-MM-DD" or null).
If the email contains no real deal, return {"deals": []}. Do not invent codes or dates.`;

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
}

export async function extractDeals(cfg: Config, email: FetchedEmail): Promise<ExtractedDeal[]> {
  const body = email.text.slice(0, 12000); // keep within context budget
  const res = await fetch(`${cfg.llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.llm.apiKey}` },
    body: JSON.stringify({
      model: cfg.llm.model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `From: ${email.from}\nSubject: ${email.subject}\nDate: ${email.date}\n\n${body}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`LLM request failed: ${res.status}`);
  const data = (await res.json()) as ChatResponse;
  return parseDeals(data.choices?.[0]?.message?.content ?? '');
}

function parseDeals(content: string): ExtractedDeal[] {
  const cleaned = content.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  let obj: unknown;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    return [];
  }
  const arr = Array.isArray(obj)
    ? obj
    : typeof obj === 'object' && obj !== null && Array.isArray((obj as { deals?: unknown }).deals)
      ? (obj as { deals: unknown[] }).deals
      : [];
  return arr.filter(
    (d): d is ExtractedDeal => typeof d === 'object' && d !== null && 'merchant' in d && 'title' in d,
  );
}
