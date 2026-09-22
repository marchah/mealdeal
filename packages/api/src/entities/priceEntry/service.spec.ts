import { describe, expect, it, vi } from 'vitest';
import { ConflictError, NotFoundError, ValidationError } from '../../common/errors';
import type { Maybe } from '../../common/types';
import { Unit } from '../../common/units';
import type { Merchant, MerchantService } from '../merchant/types';
import type { PantryItem, PantryItemService } from '../pantryItem/types';
import { priceEntryServiceFactory } from './service';
import {
  PriceSource,
  type AddPriceEntryInput,
  type NewPriceEntry,
  type PriceEntry,
  type PriceEntryRepository,
} from './types';

const ITEM: PantryItem = {
  id: 'item-1',
  name: 'Tide Free & Gentle',
  brand: 'Tide',
  couponTypeId: null,
  imageUrl: null,
  sizeAmount: 150,
  sizeUnit: Unit.FLUID_OUNCE,
  unitPriceUnit: Unit.FLUID_OUNCE,
  targetPrice: null,
  notes: null,
  archived: false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const makeEntry = (over: Partial<PriceEntry> = {}): PriceEntry => ({
  id: 'pe-1',
  pantryItemId: ITEM.id,
  merchantId: null,
  price: 19.94,
  currency: 'USD',
  sizeAmount: 150,
  sizeUnit: Unit.FLUID_OUNCE,
  quantity: 1,
  unitPrice: 19.94 / 150,
  onSale: false,
  source: PriceSource.MANUAL,
  url: null,
  note: null,
  observedAt: new Date('2026-02-01T00:00:00Z'),
  createdAt: new Date('2026-02-01T00:00:00Z'),
  ...over,
});

const makeInput = (over: Partial<AddPriceEntryInput> = {}): AddPriceEntryInput => ({
  pantryItemId: ITEM.id,
  merchantName: null,
  price: 19.94,
  currency: 'USD',
  sizeAmount: 150,
  sizeUnit: Unit.FLUID_OUNCE,
  quantity: 1,
  onSale: false,
  source: PriceSource.MANUAL,
  url: null,
  note: null,
  observedAt: null,
  ...over,
});

function makeService(
  over: {
    item?: PantryItem;
    previous?: PriceEntry[];
    deletedRow?: Maybe<PriceEntry>;
  } = {},
) {
  const insertPriceEntry = vi.fn((entry: NewPriceEntry) =>
    Promise.resolve(makeEntry({ ...entry, id: 'inserted' })),
  );
  const getOrCreateMerchant = vi.fn((name: string) =>
    Promise.resolve<Merchant>({
      id: `merchant-${name}`,
      name,
      address: null,
      lat: null,
      lng: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    }),
  );
  const priceEntryRepository: PriceEntryRepository = {
    listPriceEntries: () => Promise.resolve(over.previous ?? []),
    findPriceEntriesByPantryItemIds: () => Promise.resolve(over.previous ?? []),
    insertPriceEntry,
    deletePriceEntry: (id: string) =>
      Promise.resolve(over.deletedRow === undefined ? makeEntry({ id }) : over.deletedRow),
  };
  const item = over.item ?? ITEM;
  // @ts-expect-error partial mock: only getPantryItemById is used
  const pantryItemService: PantryItemService = {
    getPantryItemById: (id: string) =>
      id === item.id
        ? Promise.resolve(item)
        : Promise.reject(new NotFoundError(`No pantry item with id ${id}`)),
  };
  // @ts-expect-error partial mock: only getOrCreateMerchant is used
  const merchantService: MerchantService = { getOrCreateMerchant };

  return {
    service: priceEntryServiceFactory({ priceEntryRepository, pantryItemService, merchantService }),
    insertPriceEntry,
    getOrCreateMerchant,
  };
}

/** The unit price the service computed for an input, read off the row it tried to insert. */
async function unitPriceFor(input: AddPriceEntryInput, item?: PantryItem): Promise<number> {
  const { service, insertPriceEntry } = makeService(item ? { item } : {});
  await service.addPriceEntry(input);
  const [row] = insertPriceEntry.mock.calls[0] ?? [];
  if (!row) throw new Error('insertPriceEntry was not called');
  return row.unitPrice;
}

describe('priceEntryService unit price', () => {
  it('divides the price by the pack size in base units', async () => {
    // $19.94 for a 150 fl oz jug.
    expect(await unitPriceFor(makeInput())).toBeCloseTo(0.132933, 6);
  });

  it('accounts for identical packs bought together', async () => {
    // A 2-pack of 46 fl oz bottles at $12.98 is dearer per ounce than the jug, despite the
    // smaller sticker price — the whole reason this number is stored.
    const twoPack = await unitPriceFor(
      makeInput({ price: 12.98, sizeAmount: 46, quantity: 2, sizeUnit: Unit.FLUID_OUNCE }),
    );

    expect(twoPack).toBeCloseTo(0.141087, 6);
    expect(twoPack).toBeGreaterThan(await unitPriceFor(makeInput()));
  });

  it('normalizes across units of the same dimension', async () => {
    // 1 gallon and 128 fluid ounces of the same product at the same price are the same number.
    const gallon = await unitPriceFor(
      makeInput({ price: 17.02, sizeAmount: 1, sizeUnit: Unit.GALLON }),
    );
    const fluidOunces = await unitPriceFor(
      makeInput({ price: 17.02, sizeAmount: 128, sizeUnit: Unit.FLUID_OUNCE }),
    );

    expect(gallon).toBeCloseTo(fluidOunces, 10);
  });

  it('computes per pound as per ounce for a weight item', async () => {
    const item = { ...ITEM, sizeUnit: Unit.OUNCE, unitPriceUnit: Unit.OUNCE };
    const perOunce = await unitPriceFor(
      makeInput({ price: 8, sizeAmount: 2, sizeUnit: Unit.POUND }),
      item,
    );

    expect(perOunce).toBeCloseTo(0.25, 10);
  });
});

describe('priceEntryService validation', () => {
  it('reports an unknown pantry item as not found', async () => {
    const { service } = makeService();
    await expect(service.addPriceEntry(makeInput({ pantryItemId: 'nope' }))).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('refuses a size that measures something other than the item', async () => {
    // $/gallon against an item tracked by weight is not a cheaper price, it is a meaningless one.
    const { service } = makeService();
    await expect(
      service.addPriceEntry(makeInput({ sizeAmount: 2, sizeUnit: Unit.POUND })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('names both units so the mismatch is actionable', async () => {
    const { service } = makeService();
    await expect(service.addPriceEntry(makeInput({ sizeUnit: Unit.POUND }))).rejects.toThrow(
      /POUND.*Tide Free & Gentle.*FLUID_OUNCE/,
    );
  });

  it('refuses a non-positive price, size or quantity', async () => {
    const { service } = makeService();

    await expect(service.addPriceEntry(makeInput({ price: 0 }))).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(service.addPriceEntry(makeInput({ price: -1 }))).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(service.addPriceEntry(makeInput({ sizeAmount: 0 }))).rejects.toBeInstanceOf(
      ValidationError,
    );
    // Would divide by zero and store Infinity as a unit price.
    await expect(service.addPriceEntry(makeInput({ quantity: 0 }))).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(service.addPriceEntry(makeInput({ quantity: -2 }))).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('refuses a price observed in the future', async () => {
    const { service } = makeService();
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1_000);

    await expect(service.addPriceEntry(makeInput({ observedAt: tomorrow }))).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('accepts a price observed in the past and defaults an absent date to now', async () => {
    const { service, insertPriceEntry } = makeService();
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);

    await service.addPriceEntry(makeInput({ observedAt: lastWeek }));
    expect(insertPriceEntry.mock.calls[0]?.[0].observedAt).toEqual(lastWeek);

    await service.addPriceEntry(makeInput());
    const defaulted = insertPriceEntry.mock.calls[1]?.[0].observedAt;
    expect(defaulted?.getTime()).toBeGreaterThan(Date.now() - 5_000);
  });

  it('normalizes the currency and refuses a malformed code', async () => {
    const { service, insertPriceEntry } = makeService();

    await service.addPriceEntry(makeInput({ currency: ' usd ' }));
    expect(insertPriceEntry.mock.calls[0]?.[0].currency).toBe('USD');

    // Intl.NumberFormat throws on a malformed code, so it must never reach storage.
    await expect(service.addPriceEntry(makeInput({ currency: 'US' }))).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(service.addPriceEntry(makeInput({ currency: 'US1' }))).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('refuses a currency the item is not already tracked in', async () => {
    // A history mixing currencies makes "lowest" meaningless and the verdict built on it wrong.
    const { service } = makeService({ previous: [makeEntry({ currency: 'USD' })] });

    await expect(service.addPriceEntry(makeInput({ currency: 'EUR' }))).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('accepts any currency for the first entry on an item', async () => {
    const { service } = makeService({ previous: [] });
    await expect(service.addPriceEntry(makeInput({ currency: 'EUR' }))).resolves.toBeDefined();
  });
});

describe('priceEntryService store and text handling', () => {
  it('resolves the store by name, creating it the first time', async () => {
    const { service, getOrCreateMerchant, insertPriceEntry } = makeService();

    await service.addPriceEntry(makeInput({ merchantName: '  Costco  ' }));

    expect(getOrCreateMerchant).toHaveBeenCalledWith('Costco');
    expect(insertPriceEntry.mock.calls[0]?.[0].merchantId).toBe('merchant-Costco');
  });

  it('leaves the store unset when no name is given', async () => {
    const { service, getOrCreateMerchant, insertPriceEntry } = makeService();

    await service.addPriceEntry(makeInput({ merchantName: '   ' }));

    expect(getOrCreateMerchant).not.toHaveBeenCalled();
    expect(insertPriceEntry.mock.calls[0]?.[0].merchantId).toBeNull();
  });

  it('stores blank optional text as absent', async () => {
    const { service, insertPriceEntry } = makeService();

    await service.addPriceEntry(makeInput({ url: '  ', note: '' }));

    expect(insertPriceEntry.mock.calls[0]?.[0]).toMatchObject({ url: null, note: null });
  });
});

describe('priceEntryService reads and deletes', () => {
  it('lists an item’s history through the repository', async () => {
    const { service } = makeService({ previous: [makeEntry(), makeEntry({ id: 'pe-2' })] });

    await expect(
      service.listPriceEntries({ pantryItemId: ITEM.id, limit: null, since: null }),
    ).resolves.toHaveLength(2);
  });

  it('returns the deleted entry so the caller can report what went', async () => {
    const { service } = makeService();
    await expect(service.deletePriceEntry('pe-1')).resolves.toMatchObject({ id: 'pe-1' });
  });

  it('reports deleting an unknown entry as not found', async () => {
    const { service } = makeService({ deletedRow: null });
    await expect(service.deletePriceEntry('nope')).rejects.toBeInstanceOf(NotFoundError);
  });
});
