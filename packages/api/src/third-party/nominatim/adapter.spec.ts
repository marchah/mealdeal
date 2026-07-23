import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocationLookupError } from '../../common/errors';
import { nominatimAdapterFactory } from './adapter';

const config = {
  GEOCODER_BASE_URL: 'https://geocoder.example.test/nominatim',
  GEOCODER_USER_AGENT: 'MealDeal test operator',
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function urlString(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('nominatimAdapter', () => {
  it('encodes a free-form address and identifies the application', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(response([{ lat: '40.7', lon: '-74' }])));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      nominatimAdapterFactory({ config }).lookupAddress('12 Main St #4, New York'),
    ).resolves.toEqual({
      lat: 40.7,
      lng: -74,
    });

    const [url, options] =
      (fetchMock.mock.calls as unknown as [RequestInfo | URL, RequestInit?][])[0] ?? [];
    expect(url ? urlString(url) : '').toBe(
      'https://geocoder.example.test/nominatim/search?q=12+Main+St+%234%2C+New+York&format=jsonv2&limit=1',
    );
    expect(options?.headers).toEqual({ 'User-Agent': 'MealDeal test operator' });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it('serializes requests and enforces the four-per-minute interval', async () => {
    let resolveFirst: ((value: Response) => void) | undefined;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValueOnce(response([{ lat: 40, lon: -73 }]));
    const wait = vi.fn(() => Promise.resolve());
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const adapter = nominatimAdapterFactory({ config, wait });

    const first = adapter.lookupAddress('first');
    const second = adapter.lookupAddress('second');
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFirst?.(response([{ lat: 40, lon: -73 }]));
    await Promise.all([first, second]);

    expect(wait).toHaveBeenCalledWith(15_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns null for an empty provider result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(response([]))),
    );

    await expect(nominatimAdapterFactory({ config }).lookupAddress('no match')).resolves.toBeNull();
  });

  it('rejects a response that violates the requested single-result limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          response([
            { lat: 40, lon: -73 },
            { lat: 41, lon: -74 },
          ]),
        ),
      ),
    );

    await expect(
      nominatimAdapterFactory({ config }).lookupAddress('too many'),
    ).rejects.toBeInstanceOf(LocationLookupError);
  });

  it.each([
    ['null latitude', null, '-74'],
    ['empty longitude', '40.7', ''],
    ['latitude beyond WGS84', '91', '-74'],
    ['longitude beyond WGS84', '40.7', '-181'],
  ])('rejects %s coordinates', async (_description, lat, lon) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(response([{ lat, lon }]))),
    );

    await expect(
      nominatimAdapterFactory({ config }).lookupAddress('bad coordinates'),
    ).rejects.toBeInstanceOf(LocationLookupError);
  });

  it.each(['network', 'non-2xx'] as const)(
    'maps %s failures to a stable adapter error',
    async (kind) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          kind === 'network'
            ? Promise.reject(new Error('offline'))
            : Promise.resolve(response({}, 503)),
        ),
      );

      await expect(
        nominatimAdapterFactory({ config }).lookupAddress('failing address'),
      ).rejects.toBeInstanceOf(LocationLookupError);
    },
  );
});
