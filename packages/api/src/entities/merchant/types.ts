import type { Maybe } from '../../common/types';

// Ports for the merchant slice. Services depend on these interfaces, never on the db.
export interface Merchant {
  id: string;
  name: string;
  // Location (nullable; populated via updateMerchantLocation). Carried on the domain type so
  // persisted location is READABLE through the port, not just writable.
  address: Maybe<string>;
  lat: Maybe<number>;
  lng: Maybe<number>;
  createdAt: Date;
}

export interface MerchantRepository {
  findMerchantsByIds: (ids: readonly string[]) => Promise<Merchant[]>;
  findMerchantByName: (name: string) => Promise<Maybe<Merchant>>;
  createMerchant: (name: string) => Promise<Merchant>;
  countMerchants: () => Promise<number>;
  updateMerchantLocation: (
    id: string,
    args: { address?: string; lat?: number; lng?: number },
  ) => Promise<void>;
}

export interface MerchantService {
  findMerchantsByIds: (ids: readonly string[]) => Promise<Merchant[]>;
  getOrCreateMerchant: (name: string) => Promise<Merchant>;
  countMerchants: () => Promise<number>;
  updateMerchantLocation: (
    id: string,
    args: { address?: string; lat?: number; lng?: number },
  ) => Promise<void>;
}
