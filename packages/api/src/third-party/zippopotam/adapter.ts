import { z } from 'zod';
import { LocationLookupError } from '../../common/errors';
import type { Maybe } from '../../common/types';
import type { Coordinates, ZipCoordinateLookup } from '../../entities/location/types';

const ZIPPOTAM_BASE_URL = 'https://api.zippopotam.us';

const CoordinateSchema = z
  .union([z.number(), z.string().trim().min(1).transform(Number)])
  .pipe(z.number().finite());

const ResponseSchema = z.object({
  places: z
    .array(
      z.object({
        latitude: CoordinateSchema.pipe(z.number().min(-90).max(90)),
        longitude: CoordinateSchema.pipe(z.number().min(-180).max(180)),
      }),
    )
    .min(1),
});

/**
 * Zippopotam.us adapter for the `ZipCoordinateLookup` port. It owns only the transport — the URL,
 * the `fetch` call, and validating the provider response — so application code can swap this HTTP
 * implementation for a local dataset without touching the domain.
 */
export function zippopotamAdapterFactory(): ZipCoordinateLookup {
  return {
    async lookup(zip: string): Promise<Maybe<Coordinates>> {
      let response: Awaited<ReturnType<typeof fetch>>;
      try {
        response = await fetch(`${ZIPPOTAM_BASE_URL}/us/${encodeURIComponent(zip)}`);
      } catch {
        throw new LocationLookupError();
      }

      if (response.status === 404) return null;
      if (!response.ok) throw new LocationLookupError();

      try {
        const { places } = ResponseSchema.parse(await response.json());
        const place = places[0];
        if (!place) throw new LocationLookupError();
        return { lat: place.latitude, lng: place.longitude };
      } catch (error) {
        if (error instanceof LocationLookupError) throw error;
        throw new LocationLookupError();
      }
    },
  };
}
