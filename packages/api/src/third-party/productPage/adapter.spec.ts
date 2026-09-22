import { beforeEach, describe, expect, it, vi } from 'vitest';

const dnsLookupMock = vi.hoisted(() => vi.fn());
vi.mock('node:dns/promises', () => ({ lookup: dnsLookupMock }));

import { ValidationError } from '../../common/errors';
import { assertPublicHttpUrl, isPrivateAddress, productPageAdapterFactory } from './adapter';

function resolvesTo(address: string) {
  dnsLookupMock.mockResolvedValue([{ address, family: address.includes(':') ? 6 : 4 }]);
}

describe('isPrivateAddress', () => {
  it('rejects every range a pasted link must not reach', () => {
    for (const address of [
      '127.0.0.1',
      '0.0.0.0',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '100.64.0.1',
      // The cloud metadata endpoint, which is the reason this check exists at all.
      '169.254.169.254',
      '::1',
      '::',
      'fd00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
    ]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it('allows public addresses', () => {
    for (const address of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '99.86.0.1', '2606:4700::1111']) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });
});

describe('assertPublicHttpUrl', () => {
  it('accepts a public https URL', async () => {
    resolvesTo('93.184.216.34');
    await expect(assertPublicHttpUrl('https://example.test/p')).resolves.toBeInstanceOf(URL);
  });

  it('refuses a scheme that is not http(s)', async () => {
    for (const url of ['file:///etc/passwd', 'ftp://example.test/x', 'javascript:alert(1)']) {
      await expect(assertPublicHttpUrl(url)).rejects.toBeInstanceOf(ValidationError);
    }
  });

  it('refuses something that is not a URL at all', async () => {
    await expect(assertPublicHttpUrl('not a url')).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses a public hostname that resolves onto a private address', async () => {
    // The attack this closes: a name anyone can register, pointed at 127.0.0.1.
    resolvesTo('127.0.0.1');
    await expect(assertPublicHttpUrl('https://totally-public.test/x')).rejects.toThrow(
      'private network',
    );
  });

  it('refuses a hostname that does not resolve', async () => {
    dnsLookupMock.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(assertPublicHttpUrl('https://nope.test/x')).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe('productPageAdapter', () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);

  // Reset per test: these assertions count calls, and a shared mock would carry the previous
  // test's fetches into the next one's total.
  beforeEach(() => {
    fetchMock.mockReset();
    dnsLookupMock.mockReset();
  });

  function htmlResponse(html: string, status = 200) {
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: new Headers(),
      body: new Blob([html]).stream(),
    };
  }

  it('returns the page body and the URL it actually read', async () => {
    resolvesTo('93.184.216.34');
    fetchMock.mockResolvedValueOnce(htmlResponse('<html>hi</html>'));

    const page = await productPageAdapterFactory().fetchPage('https://example.test/p');

    expect(page?.html).toBe('<html>hi</html>');
    expect(page?.url).toBe('https://example.test/p');
  });

  it('identifies itself rather than impersonating a browser', async () => {
    resolvesTo('93.184.216.34');
    fetchMock.mockResolvedValueOnce(htmlResponse('<html>hi</html>'));

    await productPageAdapterFactory().fetchPage('https://example.test/p');

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(init?.headers['user-agent'])).toContain('MealDeal');
    expect(init?.redirect).toBe('manual');
  });

  it('reports a block as an unread page, not an error', async () => {
    // Amazon answering 503 is the expected path, not an exceptional one.
    resolvesTo('93.184.216.34');
    fetchMock.mockResolvedValueOnce(htmlResponse('denied', 503));

    await expect(
      productPageAdapterFactory().fetchPage('https://example.test/p'),
    ).resolves.toBeNull();
  });

  it('reports a network failure as an unread page', async () => {
    resolvesTo('93.184.216.34');
    fetchMock.mockRejectedValueOnce(new Error('socket hang up'));

    await expect(
      productPageAdapterFactory().fetchPage('https://example.test/p'),
    ).resolves.toBeNull();
  });

  it('validates every redirect hop, not just the first URL', async () => {
    // Following automatically would let a public URL walk the server onto a private address.
    dnsLookupMock
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
      .mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }]);
    fetchMock.mockResolvedValueOnce({
      status: 302,
      ok: false,
      headers: new Headers({ location: 'http://169.254.169.254/latest/meta-data/' }),
      body: null,
    });

    await expect(productPageAdapterFactory().fetchPage('https://example.test/p')).rejects.toThrow(
      'private network',
    );
  });

  it('gives up rather than following a redirect chain forever', async () => {
    resolvesTo('93.184.216.34');
    fetchMock.mockResolvedValue({
      status: 302,
      ok: false,
      headers: new Headers({ location: 'https://example.test/next' }),
      body: null,
    });

    await expect(
      productPageAdapterFactory().fetchPage('https://example.test/p'),
    ).resolves.toBeNull();
    // One initial request plus at most MAX_REDIRECTS hops.
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('stops reading a body that never ends', async () => {
    resolvesTo('93.184.216.34');
    const chunk = new Uint8Array(256 * 1024);
    let sent = 0;
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      headers: new Headers(),
      body: new ReadableStream({
        pull(controller) {
          sent += 1;
          // Far more than the cap; the read must stop on its own.
          if (sent > 200) controller.close();
          else controller.enqueue(chunk);
        },
      }),
    });

    const page = await productPageAdapterFactory().fetchPage('https://example.test/p');

    expect(page?.html.length).toBeLessThanOrEqual(2_200_000);
  });
});
