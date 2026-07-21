import type { Maybe } from '../../common/types';

/** A merchant with a complete location, ready to be shown in a distance search. */
export interface Store {
  id: string;
  name: string;
  address: Maybe<string>;
  lat: number;
  lng: number;
  distanceMiles: number;
}

export interface StoresNearLocationInput {
  lat: number;
  lng: number;
  radiusMiles: number;
}

export interface StoreRepository {
  listWithLocation(input: StoresNearLocationInput): Promise<Store[]>;
}

export interface StoreService {
  storesNearLocation(input: StoresNearLocationInput): Promise<Store[]>;
}
