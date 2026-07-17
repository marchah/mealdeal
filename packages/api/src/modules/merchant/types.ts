// Ports for the merchant module. Services depend on these interfaces, never on the db.
export interface Merchant {
  id: string;
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  createdAt: Date;
}

export interface UpdateLocationArgs {
  address?: string;
  lat?: number;
  lng?: number;
}

export interface MerchantRepository {
  findByIds(ids: readonly string[]): Promise<Merchant[]>;
  findByName(name: string): Promise<Merchant | null>;
  create(name: string): Promise<Merchant>;
  updateLocation(merchantId: string, args: UpdateLocationArgs): Promise<void>;
  count(): Promise<number>;
}

export interface MerchantService {
  findByIds(ids: readonly string[]): Promise<Merchant[]>;
  getOrCreate(name: string): Promise<Merchant>;
  updateLocation(merchantId: string, args: UpdateLocationArgs): Promise<void>;
  count(): Promise<number>;
}
