import { describe, expect, it, vi } from 'vitest';
import { locationServiceFactory } from './service';
import { LocationNotConfiguredError, LocationNotFoundError } from '../../common/errors';

describe('locationService', () => {
  it('resolves a valid ZIP through the lookup port', async () => {
    const lookup = vi.fn().mockResolvedValue({ lat: 42.3648, lng: -71.1043 });
    const service = locationServiceFactory({ zip: '02139', zipCoordinateLookup: { lookup } });

    await expect(service.getUserLocation()).resolves.toEqual({ lat: 42.3648, lng: -71.1043 });
    expect(lookup).toHaveBeenCalledWith('02139');
  });

  it('fails clearly when USER_LOCATION is not configured', async () => {
    const lookup = vi.fn();
    const service = locationServiceFactory({ zip: null, zipCoordinateLookup: { lookup } });

    await expect(service.getUserLocation()).rejects.toBeInstanceOf(LocationNotConfiguredError);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('reports a syntactically valid but unknown ZIP', async () => {
    const service = locationServiceFactory({
      zip: '99999',
      zipCoordinateLookup: { lookup: () => Promise.resolve(null) },
    });

    await expect(service.getUserLocation()).rejects.toBeInstanceOf(LocationNotFoundError);
  });
});
