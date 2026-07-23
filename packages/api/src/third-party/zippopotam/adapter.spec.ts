import { afterEach, describe, expect, it, vi } from 'vitest';
import { zippopotamAdapterFactory } from './adapter';
import { LocationLookupError } from '../../common/errors';

// The adapter uses the global `fetch`; stub it per test.
function stubFetch(impl: () => Promise<unknown>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('zippopotamAdapter', () => {
  it('maps the provider response to application coordinates', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ places: [{ latitude: '42.3648', longitude: '-71.1043' }] }),
      }),
    );

    await expect(zippopotamAdapterFactory().lookup('02139')).resolves.toEqual({
      lat: 42.3648,
      lng: -71.1043,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.zippopotam.us/us/02139',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('maps provider failures to a stable adapter error', async () => {
    stubFetch(() => Promise.reject(new Error('network unavailable')));

    await expect(zippopotamAdapterFactory().lookup('02139')).rejects.toBeInstanceOf(
      LocationLookupError,
    );
  });

  it.each([
    ['null', null, '-71.1043'],
    ['empty string', '42.3648', ''],
  ])('rejects %s provider coordinates', async (_description, latitude, longitude) => {
    stubFetch(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ places: [{ latitude, longitude }] }),
      }),
    );

    await expect(zippopotamAdapterFactory().lookup('02139')).rejects.toBeInstanceOf(
      LocationLookupError,
    );
  });

  it('rejects provider coordinates outside WGS84 bounds', async () => {
    stubFetch(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ places: [{ latitude: 999, longitude: -71.1043 }] }),
      }),
    );

    await expect(zippopotamAdapterFactory().lookup('02139')).rejects.toBeInstanceOf(
      LocationLookupError,
    );
  });
});
