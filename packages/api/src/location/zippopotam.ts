import { z } from 'zod';
import { LocationLookupError } from './errors';
import type { Coordinates, ZipCoordinateLookup } from './types';

const ZIPPOTAM_BASE_URL = 'https://api.zippopotam.us';

const ResponseSchema = z.object({
  places: z
    .array(
      z.object({
        latitude: z.coerce.number().finite().min(-90).max(90),
        longitude: z.coerce.number().finite().min(-180).max(180),
      }),
    )
    .min(1),
});

export interface FetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type Fetcher = (url: string) => Promise<FetchResponse>;

/**
 * Zippopotam.us adapter. It is deliberately isolated here: application code receives only the
 * ZipCoordinateLookup port and can swap this HTTP implementation for a local dataset if needed.
 */
export function zippopotamZipCoordinateLookupFactory({
  fetcher = fetch,
}: {
  fetcher?: Fetcher;
} = {}): ZipCoordinateLookup {
  return {
    async lookup(zip: string): Promise<Coordinates | null> {
      let response: FetchResponse;
      try {
        response = await fetcher(`${ZIPPOTAM_BASE_URL}/us/${encodeURIComponent(zip)}`);
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
