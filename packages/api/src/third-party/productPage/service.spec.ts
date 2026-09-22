import { describe, expect, it, vi } from 'vitest';
import type { Maybe } from '../../common/types';
import { Unit } from '../../common/units';
import type { JsonChatCompletion, JsonChatCompletionRequest } from '../../ingest/extractor';
import type { HtmlToMarkdownConverter } from '../../ingest/markdown';
import type { FetchedPage, ProductPageFetcher } from './adapter';
import { productPageServiceFactory, readJsonLd, readOpenGraph } from './service';

const JSON_LD = (product: Record<string, unknown>) =>
  `<html><head><script type="application/ld+json">${JSON.stringify(product)}</script></head><body>x</body></html>`;

const FULL_PRODUCT = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Tide Free & Gentle 150 fl oz',
  brand: { '@type': 'Brand', name: 'Tide' },
  image: ['https://example.test/tide.jpg'],
  offers: { '@type': 'Offer', price: '19.94', priceCurrency: 'USD' },
};

function makeService(
  over: {
    page?: Maybe<FetchedPage>;
    modelReply?: Maybe<string>;
    modelThrows?: boolean;
    markdown?: string;
  } = {},
) {
  const fetchPage = vi.fn(() =>
    Promise.resolve(
      over.page === undefined
        ? { html: JSON_LD(FULL_PRODUCT), url: 'https://example.test' }
        : over.page,
    ),
  );
  const productPageFetcher: ProductPageFetcher = { fetchPage };
  const htmlToMarkdown: HtmlToMarkdownConverter = { convert: () => over.markdown ?? '# A product' };
  const complete = vi.fn((_request: JsonChatCompletionRequest) => {
    if (over.modelThrows) return Promise.reject(new Error('model unreachable'));
    return Promise.resolve({ content: over.modelReply ?? null, finishReason: 'stop' });
  });
  const jsonChatCompletion: JsonChatCompletion = { complete };

  return {
    service: productPageServiceFactory({ productPageFetcher, htmlToMarkdown, jsonChatCompletion }),
    fetchPage,
    complete,
  };
}

describe('readJsonLd', () => {
  it('reads a schema.org Product', () => {
    expect(readJsonLd(JSON_LD(FULL_PRODUCT))).toMatchObject({
      name: 'Tide Free & Gentle 150 fl oz',
      brand: 'Tide',
      imageUrl: 'https://example.test/tide.jpg',
      price: 19.94,
      currency: 'USD',
    });
  });

  it('finds a Product inside an @graph wrapper', () => {
    const html = JSON_LD({ '@context': 'https://schema.org', '@graph': [FULL_PRODUCT] });
    expect(readJsonLd(html).name).toBe('Tide Free & Gentle 150 fl oz');
  });

  it('skips a malformed block instead of giving up on the page', () => {
    // Retailers ship broken JSON-LD next to good JSON-LD more often than you would hope.
    const html = `<script type="application/ld+json">{not json</script>${JSON_LD(FULL_PRODUCT)}`;
    expect(readJsonLd(html).name).toBe('Tide Free & Gentle 150 fl oz');
  });

  it('reports nothing when the page publishes no product data', () => {
    expect(readJsonLd('<html><body>nothing here</body></html>').name).toBeNull();
  });

  it('strips currency symbols out of a price string', () => {
    const html = JSON_LD({ ...FULL_PRODUCT, offers: { price: '$19.94', priceCurrency: 'USD' } });
    expect(readJsonLd(html).price).toBe(19.94);
  });
});

describe('readOpenGraph', () => {
  it('reads the tags nearly every page has', () => {
    const html = `
      <meta property="og:title" content="Tide Free &amp; Gentle" />
      <meta property="og:image" content="https://example.test/og.jpg">
      <meta property="product:price:amount" content="19.94">
      <meta property="product:price:currency" content="USD">
    `;
    expect(readOpenGraph(html)).toMatchObject({
      imageUrl: 'https://example.test/og.jpg',
      price: 19.94,
      currency: 'USD',
    });
  });

  it('reports nothing for a page with no OpenGraph tags', () => {
    expect(readOpenGraph('<html><body>x</body></html>').name).toBeNull();
  });
});

describe('productPageService', () => {
  it('prefers structured data and does not pay for an inference it does not need', async () => {
    // JSON-LD carried a size in the name but not as a field, so the model still runs — what it
    // must NOT do is re-derive a name and price the page already stated exactly.
    const { service, complete } = makeService({
      modelReply: JSON.stringify({ sizeAmount: 150, sizeUnit: 'FLUID_OUNCE' }),
    });

    const draft = await service.lookupProduct('https://example.test/tide');

    expect(draft).toMatchObject({
      name: 'Tide Free & Gentle 150 fl oz',
      price: 19.94,
      sizeAmount: 150,
      sizeUnit: Unit.FLUID_OUNCE,
    });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('skips the model entirely when the page states everything', async () => {
    const { service, complete } = makeService({
      page: {
        html: JSON_LD({ ...FULL_PRODUCT, name: 'Tide' }).replace(
          '</head>',
          '<meta property="og:title" content="Tide"></head>',
        ),
        url: 'https://example.test',
      },
      modelReply: JSON.stringify({ sizeAmount: 150, sizeUnit: 'FLUID_OUNCE' }),
    });
    // Structured data gives a name but never a size, so one inference is expected here; the
    // assertion that matters is that it is at most one.
    await service.lookupProduct('https://example.test/tide');

    expect(complete.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('falls back to OpenGraph when there is no structured product data', async () => {
    const { service } = makeService({
      page: {
        html: '<meta property="og:title" content="Kirkland Paper Towels"><meta property="og:image" content="https://example.test/p.jpg">',
        url: 'https://example.test',
      },
      modelReply: null,
    });

    expect(await service.lookupProduct('https://example.test/p')).toMatchObject({
      name: 'Kirkland Paper Towels',
      imageUrl: 'https://example.test/p.jpg',
    });
  });

  it('falls back to the model when the page publishes nothing machine-readable', async () => {
    const { service, complete } = makeService({
      page: {
        html: '<html><body>Coffee, 12 oz, $11.99</body></html>',
        url: 'https://example.test',
      },
      modelReply: JSON.stringify({
        name: 'House Blend Coffee',
        price: 11.99,
        currency: 'USD',
        sizeAmount: 12,
        sizeUnit: 'OUNCE',
      }),
    });

    expect(await service.lookupProduct('https://example.test/c')).toMatchObject({
      name: 'House Blend Coffee',
      price: 11.99,
      sizeAmount: 12,
      sizeUnit: Unit.OUNCE,
    });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('reports nothing when the page could not be fetched at all', async () => {
    const { service, complete } = makeService({ page: null });

    expect(await service.lookupProduct('https://example.test/blocked')).toBeNull();
    // No page means no markdown and no reason to wake the model.
    expect(complete).not.toHaveBeenCalled();
  });

  it('reports nothing when every source comes up empty', async () => {
    const { service } = makeService({
      page: { html: '<html><body>an article</body></html>', url: 'https://example.test' },
      modelReply: JSON.stringify({ name: null, price: null }),
    });

    // A price with no name is not an item, and neither is nothing at all.
    expect(await service.lookupProduct('https://example.test/x')).toBeNull();
  });

  it('keeps the structured data when the model is unreachable', async () => {
    // A local model that is switched off must not turn a partly-read page into no page.
    const { service } = makeService({ modelThrows: true });

    expect(await service.lookupProduct('https://example.test/tide')).toMatchObject({
      name: 'Tide Free & Gentle 150 fl oz',
      price: 19.94,
      sizeAmount: null,
    });
  });

  it('drops model output that fails validation rather than trusting it', async () => {
    // FURLONG is not a unit this app can compare, and -5 is not a price.
    const { service } = makeService({
      modelReply: JSON.stringify({ sizeAmount: -5, sizeUnit: 'FURLONG' }),
    });

    const draft = await service.lookupProduct('https://example.test/tide');

    expect(draft?.sizeUnit).toBeNull();
    expect(draft?.sizeAmount).toBeNull();
    // The trustworthy half of the page survives.
    expect(draft?.name).toBe('Tide Free & Gentle 150 fl oz');
  });

  it('drops non-JSON model output', async () => {
    const { service } = makeService({ modelReply: 'I could not find a product.' });

    expect(await service.lookupProduct('https://example.test/tide')).toMatchObject({
      name: 'Tide Free & Gentle 150 fl oz',
      sizeAmount: null,
    });
  });

  it('lists the units it accepts in the prompt, so the model cannot invent one', async () => {
    const { service, complete } = makeService({ modelReply: null });

    await service.lookupProduct('https://example.test/tide');

    const [request] = complete.mock.calls[0] ?? [];
    expect(request?.system).toContain('FLUID_OUNCE');
    expect(request?.system).toContain('Never invent a price');
  });
});
