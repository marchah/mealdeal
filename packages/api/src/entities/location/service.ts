import { LocationNotConfiguredError, LocationNotFoundError } from '../../common/errors';
import { settings } from '../../common/settings';
import type { LocationService, ZipCoordinateLookup } from './types';

/** Resolves the configured `USER_LOCATION` ZIP through a provider-neutral lookup port. */
export function locationServiceFactory({
  zippopotamAdapter,
}: {
  zippopotamAdapter: ZipCoordinateLookup;
}): LocationService {
  return {
    async getUserLocation() {
      const zip = settings.USER_LOCATION;
      if (!zip) throw new LocationNotConfiguredError();
      const coordinates = await zippopotamAdapter.lookup(zip);
      if (!coordinates) throw new LocationNotFoundError(zip);
      return coordinates;
    },
  };
}
