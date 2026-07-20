import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocationNotConfiguredError, LocationNotFoundError } from '../../common/errors';
import { settings } from '../../common/settings';
import { locationServiceFactory } from './service';

// The service reads settings.USER_LOCATION directly; mock the module and set it per test.
vi.mock('../../common/settings', () => ({ settings: { USER_LOCATION: null } }));

beforeEach(() => {
  settings.USER_LOCATION = null;
});

describe('locationService', () => {
  it('resolves the configured ZIP through the lookup port', async () => {
    settings.USER_LOCATION = '02139';
    const lookup = vi.fn().mockResolvedValue({ lat: 42.3648, lng: -71.1043 });
    const service = locationServiceFactory({ zipCoordinateLookup: { lookup } });

    await expect(service.getUserLocation()).resolves.toEqual({ lat: 42.3648, lng: -71.1043 });
    expect(lookup).toHaveBeenCalledWith('02139');
  });

  it('fails clearly when USER_LOCATION is not configured', async () => {
    const lookup = vi.fn();
    const service = locationServiceFactory({ zipCoordinateLookup: { lookup } });

    await expect(service.getUserLocation()).rejects.toBeInstanceOf(LocationNotConfiguredError);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('reports a syntactically valid but unknown ZIP', async () => {
    settings.USER_LOCATION = '99999';
    const service = locationServiceFactory({
      zipCoordinateLookup: { lookup: () => Promise.resolve(null) },
    });

    await expect(service.getUserLocation()).rejects.toBeInstanceOf(LocationNotFoundError);
  });
});
