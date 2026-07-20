import { describe, expect, it, vi } from 'vitest';
import { zippopotamAdapterFactory } from './adapter';
import { LocationLookupError } from '../../common/errors';

describe('zippopotamAdapter', () => {
  it('maps the provider response to application coordinates', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ places: [{ latitude: '42.3648', longitude: '-71.1043' }] }),
    });
    const lookup = zippopotamAdapterFactory({ fetcher });

    await expect(lookup.lookup('02139')).resolves.toEqual({ lat: 42.3648, lng: -71.1043 });
    expect(fetcher).toHaveBeenCalledWith('https://api.zippopotam.us/us/02139');
  });

  it('maps provider failures to a stable adapter error', async () => {
    const lookup = zippopotamAdapterFactory({
      fetcher: () => Promise.reject(new Error('network unavailable')),
    });

    await expect(lookup.lookup('02139')).rejects.toBeInstanceOf(LocationLookupError);
  });

  it.each([
    ['null', null, '-71.1043'],
    ['empty string', '42.3648', ''],
  ])('rejects %s provider coordinates', async (_description, latitude, longitude) => {
    const lookup = zippopotamAdapterFactory({
      fetcher: () =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ places: [{ latitude, longitude }] }),
        }),
    });

    await expect(lookup.lookup('02139')).rejects.toBeInstanceOf(LocationLookupError);
  });

  it('rejects provider coordinates outside WGS84 bounds', async () => {
    const lookup = zippopotamAdapterFactory({
      fetcher: () =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ places: [{ latitude: 999, longitude: -71.1043 }] }),
        }),
    });

    await expect(lookup.lookup('02139')).rejects.toBeInstanceOf(LocationLookupError);
  });
});
