import type { ZipCoordinateLookup } from '../entities/location/types';
import type { AddressCoordinateLookup } from '../entities/merchant/types';
import { nominatimAdapterFactory } from './nominatim/adapter';
import { zippopotamAdapterFactory } from './zippopotam/adapter';

// The third-party module: builds every external-service adapter behind its port, so the
// composition root injects ports (not providers) into the slices. Swap a provider here.
export interface ThirdPartyServices {
  zippopotamAdapter: ZipCoordinateLookup;
  nominatimAdapter: AddressCoordinateLookup;
}

export function getThirdPartyServices(): ThirdPartyServices {
  return {
    zippopotamAdapter: zippopotamAdapterFactory(),
    nominatimAdapter: nominatimAdapterFactory(),
  };
}
