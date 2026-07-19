import { describe, expect, it, vi } from 'vitest';
import { LocationLookupError, LocationNotConfiguredError, LocationNotFoundError } from './errors';
import { userLocationResolverFactory } from './userLocationResolver';
import { zippopotamZipCoordinateLookupFactory } from './zippopotam';

describe('userLocationResolver', () => {
  it('resolves a valid ZIP through the lookup port', async () => {
    const lookup = vi.fn().mockResolvedValue({ lat: 42.3648, lng: -71.1043 });
    const resolver = userLocationResolverFactory({ zip: '02139', zipCoordinateLookup: { lookup } });

    await expect(resolver.resolve()).resolves.toEqual({ lat: 42.3648, lng: -71.1043 });
    expect(lookup).toHaveBeenCalledWith('02139');
  });

  it('fails clearly when USER_LOCATION is not configured', async () => {
    const lookup = vi.fn();
    const resolver = userLocationResolverFactory({ zip: null, zipCoordinateLookup: { lookup } });

    await expect(resolver.resolve()).rejects.toBeInstanceOf(LocationNotConfiguredError);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('reports a syntactically valid but unknown ZIP', async () => {
    const resolver = userLocationResolverFactory({
      zip: '99999',
      zipCoordinateLookup: { lookup: () => Promise.resolve(null) },
    });

    await expect(resolver.resolve()).rejects.toBeInstanceOf(LocationNotFoundError);
  });
});

describe('zippopotamZipCoordinateLookup', () => {
  it('maps the provider response to application coordinates', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ places: [{ latitude: '42.3648', longitude: '-71.1043' }] }),
    });
    const lookup = zippopotamZipCoordinateLookupFactory({ fetcher });

    await expect(lookup.lookup('02139')).resolves.toEqual({ lat: 42.3648, lng: -71.1043 });
    expect(fetcher).toHaveBeenCalledWith('https://api.zippopotam.us/us/02139');
  });

  it('maps provider failures to a stable adapter error', async () => {
    const lookup = zippopotamZipCoordinateLookupFactory({
      fetcher: () => Promise.reject(new Error('network unavailable')),
    });

    await expect(lookup.lookup('02139')).rejects.toBeInstanceOf(LocationLookupError);
  });

  it('rejects provider coordinates outside WGS84 bounds', async () => {
    const lookup = zippopotamZipCoordinateLookupFactory({
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
