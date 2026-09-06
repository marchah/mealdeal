import { z } from 'zod';
import { logWarning } from '../../common/logger';
import type { Maybe } from '../../common/types';
import { Unit } from '../../common/units';
import type { ProductDraft, ProductLookup } from '../../entities/pantryItem/types';
import type { JsonChatCompletion } from '../../ingest/extractor';
import type { HtmlToMarkdownConverter } from '../../ingest/markdown';
import type { ProductPageFetcher } from './adapter';

/** Keep one page inside the local model's context budget. */
const MAX_MARKDOWN_LENGTH = 12_000;

const SYSTEM_PROMPT = [
  'You read ONE retail product page and describe the product it sells.',
  'Return ONLY JSON with: name, brand, price (number), currency (3-letter code),',
  'sizeAmount (number) and sizeUnit.',
  `sizeUnit must be one of: ${Object.values(Unit).join(', ')}.`,
  'sizeAmount and sizeUnit describe ONE pack, not the whole multipack.',
  'Use null for anything the page does not state. Never invent a price or a size.',
].join(' ');

// The model's output is never trusted — the same rule as the deal extractor. An unknown unit or a
// negative price is dropped rather than carried into a draft the user might accept unread.
const ExtractedProductSchema = z.object({
  name: z.string().trim().min(1).nullish(),
  brand: z.string().trim().min(1).nullish(),
  price: z.number().positive().finite().nullish(),
  currency: z.string().trim().length(3).nullish(),
  sizeAmount: z.number().positive().finite().nullish(),
  sizeUnit: z.enum(Unit).nullish(),
});

const EMPTY: ProductDraft = {
  name: null,
  brand: null,
  imageUrl: null,
  price: null,
  currency: null,
  sizeAmount: null,
  sizeUnit: null,
};

function firstString(value: unknown): Maybe<string> {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = firstString(entry);
      if (found !== null) return found;
    }
  }
  // JSON-LD writes the same field as a string, an array, or a nested node — brand is often
  // `{ "@type": "Brand", "name": "Tide" }` and image often `{ "url": "..." }`.
  if (value && typeof value === 'object' && 'name' in value) return firstString(value.name);
  if (value && typeof value === 'object' && 'url' in value) return firstString(value.url);
  return null;
}

function toNumber(value: unknown): Maybe<number> {
  const parsed = typeof value === 'string' ? Number(value.replace(/[^0-9.]/g, '')) : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Walks a JSON-LD graph, which may be a single node, an array, or an @graph wrapper. */
function* jsonLdNodes(value: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(value)) {
    for (const entry of value) yield* jsonLdNodes(entry);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const node = value as Record<string, unknown>;
  yield node;
  if ('@graph' in node) yield* jsonLdNodes(node['@graph']);
}

function isProduct(node: Record<string, unknown>): boolean {
  const type = node['@type'];
  const types = Array.isArray(type) ? type : [type];
  return types.some((entry) => typeof entry === 'string' && entry.toLowerCase() === 'product');
}

/** schema.org/Product, the one thing most retailers publish in a machine-readable form. */
export function readJsonLd(html: string): ProductDraft {
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block[1] ?? '');
    } catch {
      continue; // A malformed block is common and is not worth failing the whole read over.
    }
    for (const node of jsonLdNodes(parsed)) {
      if (!isProduct(node)) continue;
      const offers = [...jsonLdNodes(node.offers)].find((offer) => 'price' in offer);
      return {
        ...EMPTY,
        name: firstString(node.name),
        brand: firstString(node.brand),
        imageUrl: firstString(node.image),
        price: offers ? toNumber(offers.price) : null,
        currency: offers ? firstString(offers.priceCurrency) : null,
      };
    }
  }
  return { ...EMPTY };
}

/** OpenGraph, which nearly every page has even when it publishes no structured product data. */
export function readOpenGraph(html: string): ProductDraft {
  const tags = new Map<string, string>();
  for (const tag of html.matchAll(/<meta\s+[^>]*>/gi)) {
    const raw = tag[0];
    const key = /(?:property|name)=["']([^"']+)["']/i.exec(raw)?.[1]?.toLowerCase();
    const content = /content=["']([^"']*)["']/i.exec(raw)?.[1];
    if (key !== undefined && content !== undefined && !tags.has(key)) tags.set(key, content);
  }
  return {
    ...EMPTY,
    name: firstString(tags.get('og:title')),
    brand: firstString(tags.get('product:brand') ?? tags.get('og:brand')),
    imageUrl: firstString(tags.get('og:image')),
    price: toNumber(tags.get('product:price:amount') ?? tags.get('og:price:amount')),
    currency: firstString(tags.get('product:price:currency') ?? tags.get('og:price:currency')),
  };
}

/** Earlier sources win; later ones only fill gaps. */
function merge(...drafts: ProductDraft[]): ProductDraft {
  const result = { ...EMPTY };
  for (const draft of drafts) {
    for (const key of Object.keys(EMPTY) as (keyof ProductDraft)[]) {
      if (result[key] === null && draft[key] !== null) {
        // Each key's types line up across both objects; the index signature is what TS loses here.
        Object.assign(result, { [key]: draft[key] });
      }
    }
  }
  return result;
}

/** A draft worth returning has at least a name; a price with no name is not an item. */
function isUsable(draft: ProductDraft): boolean {
  return draft.name !== null;
}

/**
 * Anti-corruption layer for a product page: turns whatever a retailer publishes into a draft.
 * Structured data first because it is free and exact; the model runs only on what is left, since
 * it costs an inference and can be wrong in ways JSON-LD cannot.
 */
export function productPageServiceFactory({
  productPageFetcher,
  htmlToMarkdown,
  jsonChatCompletion,
}: {
  productPageFetcher: ProductPageFetcher;
  htmlToMarkdown: HtmlToMarkdownConverter;
  jsonChatCompletion: JsonChatCompletion;
}): ProductLookup {
  async function askModel(html: string): Promise<ProductDraft> {
    const markdown = htmlToMarkdown.convert(html).slice(0, MAX_MARKDOWN_LENGTH);
    if (markdown.trim() === '') return { ...EMPTY };
    let content: Maybe<string>;
    try {
      ({ content } = await jsonChatCompletion.complete({ system: SYSTEM_PROMPT, user: markdown }));
    } catch (error) {
      // The structured-data answer, if any, is still worth returning — an unreachable model must
      // not turn a partly-read page into no page at all.
      logWarning('product page: model unavailable, keeping structured data only', {
        tag: 'PRODUCT_PAGE',
        extra: { reason: error instanceof Error ? error.message : String(error) },
      });
      return { ...EMPTY };
    }
    if (content === null || content.trim() === '') return { ...EMPTY };
    let json: unknown;
    try {
      json = JSON.parse(content);
    } catch {
      return { ...EMPTY };
    }
    const parsed = ExtractedProductSchema.safeParse(json);
    if (!parsed.success) return { ...EMPTY };
    return { ...EMPTY, ...parsed.data };
  }

  async function lookupProduct(url: string): Promise<Maybe<ProductDraft>> {
    const page = await productPageFetcher.fetchPage(url);
    if (page === null) return null;

    const structured = merge(readJsonLd(page.html), readOpenGraph(page.html));
    // A size is the one thing no retailer publishes as structured data, so the model earns its
    // keep even when the name and price were already found.
    const needsModel = structured.name === null || structured.sizeAmount === null;
    const draft = needsModel ? merge(structured, await askModel(page.html)) : structured;

    return isUsable(draft) ? draft : null;
  }

  return { lookupProduct };
}
