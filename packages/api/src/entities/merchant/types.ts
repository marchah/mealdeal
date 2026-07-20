import type { Maybe } from '../../common/types';

// Ports for the merchant slice. Services depend on these interfaces, never on the db.
export interface Merchant {
  id: string;
  name: string;
  // Location (nullable; populated via updateLocation). Carried on the domain type so persisted
  // location is READABLE through the port, not just writable.
  address: Maybe<string>;
  lat: Maybe<number>;
  lng: Maybe<number>;
  createdAt: Date;
}

export interface MerchantRepository {
  findByIds(ids: readonly string[]): Promise<Merchant[]>;
  findByName(name: string): Promise<Maybe<Merchant>>;
  create(name: string): Promise<Merchant>;
  count(): Promise<number>;
  updateLocation(id: string, args: { address?: string; lat?: number; lng?: number }): Promise<void>;
}

export interface MerchantService {
  findByIds(ids: readonly string[]): Promise<Merchant[]>;
  getOrCreate(name: string): Promise<Merchant>;
  count(): Promise<number>;
  updateLocation(id: string, args: { address?: string; lat?: number; lng?: number }): Promise<void>;
}
