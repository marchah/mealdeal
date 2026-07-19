import { NotFoundError, ServerError } from '../common/errors';

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
