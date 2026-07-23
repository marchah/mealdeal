import { z } from 'zod';
import { LocationLookupError } from '../../common/errors';
import { settings, type GeocoderSettings } from '../../common/settings';
import type { Maybe } from '../../common/types';
import type { Coordinates } from '../../entities/location/types';
import type { AddressCoordinateLookup } from '../../entities/merchant/types';

const REQUEST_INTERVAL_MS = 15_000;
const REQUEST_TIMEOUT_MS = 10_000;

const CoordinateSchema = z
  .union([z.number(), z.string().trim().min(1).transform(Number)])
  .pipe(z.number().finite());

const ResponseSchema = z
  .array(
    z.object({
      lat: CoordinateSchema.pipe(z.number().min(-90).max(90)),
      lon: CoordinateSchema.pipe(z.number().min(-180).max(180)),
    }),
  )
  .max(1);

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Nominatim adapter for the Merchant-owned address lookup port. Public Nominatim use is serialized
 * and limited to four requests per minute; deployments with higher throughput must configure a
 * self-hosted or alternative compatible endpoint through GEOCODER_BASE_URL.
 */
export function nominatimAdapterFactory({
  config = settings,
  wait = delay,
}: {
  config?: GeocoderSettings;
  wait?: (milliseconds: number) => Promise<void>;
} = {}): AddressCoordinateLookup {
  let previousRequest = Promise.resolve();
  let lastRequestStartedAt = Number.NEGATIVE_INFINITY;

  async function lookupAddress(address: string): Promise<Maybe<Coordinates>> {
    let release: () => void = () => undefined;
    const nextRequest = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pendingRequest = previousRequest;
    previousRequest = nextRequest;

    await pendingRequest;
    try {
      const remaining = lastRequestStartedAt + REQUEST_INTERVAL_MS - Date.now();
      if (remaining > 0) await wait(remaining);
      lastRequestStartedAt = Date.now();

      const url = new URL('search', `${config.GEOCODER_BASE_URL}/`);
      url.searchParams.set('q', address);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('limit', '1');

      let response: Awaited<ReturnType<typeof fetch>>;
      try {
        response = await fetch(url, {
          headers: { 'User-Agent': config.GEOCODER_USER_AGENT },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {
        throw new LocationLookupError();
      }
      if (!response.ok) throw new LocationLookupError();

      try {
        const results = ResponseSchema.parse(await response.json());
        const result = results[0];
        return result ? { lat: result.lat, lng: result.lon } : null;
      } catch {
        throw new LocationLookupError();
      }
    } finally {
      release();
    }
  }

  return { lookupAddress };
}
