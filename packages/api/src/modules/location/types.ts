import { NotFoundError, ServerError } from '../../common/errors';

/** A WGS84 coordinate suitable for distance calculations. */
export interface Coordinates {
  lat: number;
  lng: number;
}

/** Adapter port: implementations translate a US ZIP code into a coordinate, or report no match. */
export interface ZipCoordinateLookup {
  lookup(zip: string): Promise<Coordinates | null>;
}

/** Service port: consumers resolve the configured user location without knowing its source. */
export interface LocationService {
  getUserLocation(): Promise<Coordinates>;
}

export class LocationNotConfiguredError extends ServerError {
  constructor() {
    super('USER_LOCATION is not configured');
    this.name = 'LocationNotConfiguredError';
    this.status = 503;
  }
}

export class LocationNotFoundError extends NotFoundError {
  constructor(zip: string) {
    super(`No coordinates found for ZIP code ${zip}`);
    this.name = 'LocationNotFoundError';
  }
}

export class LocationLookupError extends ServerError {
  constructor() {
    super('Unable to resolve USER_LOCATION');
    this.name = 'LocationLookupError';
    this.status = 502;
  }
}
