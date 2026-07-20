import type { ZipCoordinateLookup } from '../entities/location/types';
import { zippopotamAdapterFactory } from './zippopotam/adapter';

// The third-party "package": builds every external-service adapter behind its port, so the
// composition root injects ports (not providers) into the slices. Swap a provider here.
export interface ThirdPartyServices {
  zipCoordinateLookup: ZipCoordinateLookup;
}

export function getThirdPartyServices(): ThirdPartyServices {
  return {
    zipCoordinateLookup: zippopotamAdapterFactory(),
  };
}
