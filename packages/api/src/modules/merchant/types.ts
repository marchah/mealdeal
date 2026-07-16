// Ports for the merchant module. Services depend on these interfaces, never on the db.
export interface Merchant {
  id: string;
  name: string;
  createdAt: Date;
}

export interface MerchantRepository {
  findByIds(ids: readonly string[]): Promise<Merchant[]>;
  findByName(name: string): Promise<Merchant | null>;
  create(name: string): Promise<Merchant>;
  count(): Promise<number>;
}

export interface MerchantService {
  findByIds(ids: readonly string[]): Promise<Merchant[]>;
  getOrCreate(name: string): Promise<Merchant>;
  count(): Promise<number>;
}
