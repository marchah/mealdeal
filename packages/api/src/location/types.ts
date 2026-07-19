/** A WGS84 coordinate suitable for distance calculations. */
export interface Coordinates {
  lat: number;
  lng: number;
}

/** Provider port: implementations translate a US ZIP code into a coordinate, or report no match. */
export interface ZipCoordinateLookup {
  lookup(zip: string): Promise<Coordinates | null>;
}

/** Application port: consumers resolve the configured user location without knowing its source. */
export interface UserLocationResolver {
  resolve(): Promise<Coordinates>;
}
