import type { Maybe } from '../../common/types';

/** A WGS84 coordinate suitable for distance calculations. */
export interface Coordinates {
  lat: number;
  lng: number;
}

/** Adapter port: implementations translate a US ZIP code into a coordinate, or report no match. */
export interface ZipCoordinateLookup {
  lookup(zip: string): Promise<Maybe<Coordinates>>;
}

/** Service port: consumers resolve the configured user location without knowing its source. */
export interface LocationService {
  getUserLocation(): Promise<Coordinates>;
}
