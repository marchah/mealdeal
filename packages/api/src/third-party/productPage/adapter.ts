import { lookup as dnsLookup } from 'node:dns/promises';
import { ValidationError } from '../../common/errors';
import type { Maybe } from '../../common/types';

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
/** Enough for any product page worth reading; a 50 MB download is not one. */
const MAX_RESPONSE_BYTES = 2_000_000;

// Identifies this installation rather than impersonating a browser. Retailers block server-side
// fetches routinely, and that is designed for (see service.ts) — the flow degrades to an empty
// form rather than pretending to be Chrome to get around it.
const USER_AGENT = 'MealDeal/0.1 (+https://github.com/marchah/mealdeal)';

export interface FetchedPage {
  html: string;
  /** The URL actually read, after redirects. */
  url: string;
}

export interface ProductPageFetcher {
  fetchPage: (url: string) => Promise<Maybe<FetchedPage>>;
}

/** Ranges that must never be reachable from a URL someone pasted into the app. */
export function isPrivateAddress(address: string): boolean {
  const ip = address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;
  const parts = ip.split('.').map(Number);
  const isIpv4 =
    parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255);
  if (isIpv4) {
    const [a = 0, b = 0] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local, and the cloud metadata endpoint
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    return false;
  }
  const v6 = ip.toLowerCase();
  if (v6 === '::' || v6 === '::1') return true;
  return /^f[cd]/.test(v6) || v6.startsWith('fe80');
}

/**
 * Rejects anything that is not a public http(s) address, BEFORE connecting. Without this the
 * server would happily fetch http://169.254.169.254/ or a machine on the home network for whoever
 * pasted the link. DNS is resolved here so a public hostname pointing at a private address is
 * caught too.
 */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ValidationError('That does not look like a URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ValidationError('Only http and https links can be read');
  }
  let addresses: { address: string }[];
  try {
    addresses = await dnsLookup(url.hostname, { all: true });
  } catch {
    throw new ValidationError(`Could not resolve ${url.hostname}`);
  }
  if (addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new ValidationError('That link points inside a private network');
  }
  return url;
}

/** Stops reading at the cap instead of buffering whatever the far end decides to send. */
async function readCapped(response: Response): Promise<string> {
  const body = response.body;
  if (!body) return '';
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}

/**
 * Transport for the product-page lookup: validate, fetch, cap. It knows nothing about products —
 * reading meaning out of the HTML is the service's job (AGENTS.md §3's anti-corruption layer).
 */
export function productPageAdapterFactory(): ProductPageFetcher {
  async function fetchPage(rawUrl: string): Promise<Maybe<FetchedPage>> {
    let current = await assertPublicHttpUrl(rawUrl);

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      let response: Response;
      try {
        response = await fetch(current, {
          // Manual, so each hop is validated too: following automatically would let a public URL
          // redirect the server onto a private address, which is the hole the check above closes.
          redirect: 'manual',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
        });
      } catch {
        return null;
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location === null) return null;
        current = await assertPublicHttpUrl(new URL(location, current).toString());
        continue;
      }
      // A block or a missing page is not an error to report — it is a page we could not read.
      if (!response.ok) return null;
      return { html: await readCapped(response), url: current.toString() };
    }
    return null;
  }

  return { fetchPage };
}
