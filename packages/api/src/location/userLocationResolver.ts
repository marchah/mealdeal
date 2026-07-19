import { LocationNotConfiguredError, LocationNotFoundError } from './errors';
import type { UserLocationResolver, ZipCoordinateLookup } from './types';

/** Resolves the configured ZIP through a provider-neutral lookup port. */
export function userLocationResolverFactory({
  zip,
  zipCoordinateLookup,
}: {
  zip: string | null;
  zipCoordinateLookup: ZipCoordinateLookup;
}): UserLocationResolver {
  return {
    async resolve() {
      if (!zip) throw new LocationNotConfiguredError();
      const coordinates = await zipCoordinateLookup.lookup(zip);
      if (!coordinates) throw new LocationNotFoundError(zip);
      return coordinates;
    },
  };
}
