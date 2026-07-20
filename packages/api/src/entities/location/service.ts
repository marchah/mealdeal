import { LocationNotConfiguredError, LocationNotFoundError } from '../../common/errors';
import type { LocationService, ZipCoordinateLookup } from './types';

/** Resolves the configured ZIP through a provider-neutral lookup port. */
export function locationServiceFactory({
  zip,
  zipCoordinateLookup,
}: {
  zip: string | null;
  zipCoordinateLookup: ZipCoordinateLookup;
}): LocationService {
  return {
    async getUserLocation() {
      if (!zip) throw new LocationNotConfiguredError();
      const coordinates = await zipCoordinateLookup.lookup(zip);
      if (!coordinates) throw new LocationNotFoundError(zip);
      return coordinates;
    },
  };
}
