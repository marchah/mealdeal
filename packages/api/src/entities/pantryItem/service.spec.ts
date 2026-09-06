import { describe, expect, it, vi } from 'vitest';
import { ConflictError, NotFoundError, ValidationError } from '../../common/errors';
import type { Maybe } from '../../common/types';
import { Unit } from '../../common/units';
import type { CouponType, CouponTypeService } from '../couponType/types';
import { pantryItemServiceFactory } from './service';
import type { PantryItem, PantryItemInput, PantryItemRepository } from './types';

const makeItem = (over: Partial<PantryItem> = {}): PantryItem => ({
  id: 'p1',
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
  ...over,
});

const makeInput = (over: Partial<PantryItemInput> = {}): PantryItemInput => ({
  name: 'Tide Free & Gentle',
  brand: 'Tide',
  couponTypeId: null,
  imageUrl: null,
  sizeAmount: 150,
  sizeUnit: Unit.FLUID_OUNCE,
  unitPriceUnit: Unit.FLUID_OUNCE,
  targetPrice: null,
  notes: null,
  ...over,
});

const COUPON_TYPE: CouponType = {
  id: 'ct-household',
  key: 'household',
  label: 'Household',
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

function makeService(
  over: {
    existing?: Maybe<PantryItem>;
    duplicate?: Maybe<PantryItem>;
    couponTypes?: CouponType[];
    updated?: Maybe<PantryItem>;
    archivedRow?: Maybe<PantryItem>;
    deletedRow?: Maybe<PantryItem>;
  } = {},
) {
  const insertPantryItem = vi.fn((input: PantryItemInput) =>
    Promise.resolve(makeItem({ ...input, id: 'inserted' })),
  );
  const findPantryItemByNameAndBrand = vi.fn(() => Promise.resolve(over.duplicate ?? null));
  const updatePantryItem = vi.fn((_id: string, input: PantryItemInput) =>
    Promise.resolve(over.updated === undefined ? makeItem({ ...input, id: 'p1' }) : over.updated),
  );
  const setPantryItemArchived = vi.fn((id: string, archived: boolean) =>
    Promise.resolve(over.archivedRow === undefined ? makeItem({ id, archived }) : over.archivedRow),
  );
  const deletePantryItem = vi.fn((id: string) =>
    Promise.resolve(over.deletedRow === undefined ? makeItem({ id }) : over.deletedRow),
  );
  // Complete, unlike the usual partial mock: the repository is injected whole and this suite
  // reaches every method on the port.
  const pantryItemRepository: PantryItemRepository = {
    findPantryItemById: () =>
      Promise.resolve(over.existing === undefined ? makeItem() : over.existing),
    findPantryItemsByIds: (ids) => Promise.resolve(ids.map((id) => makeItem({ id }))),
    findPantryItemByNameAndBrand,
    listPantryItems: () => Promise.resolve([makeItem()]),
    countPantryItems: () => Promise.resolve(1),
    insertPantryItem,
    updatePantryItem,
    setPantryItemArchived,
    deletePantryItem,
  };
  // @ts-expect-error partial mock: only findCouponTypeById is used
  const couponTypeService: CouponTypeService = {
    findCouponTypeById: (id: string) =>
      Promise.resolve(over.couponTypes?.find((couponType) => couponType.id === id) ?? null),
  };

  return {
    service: pantryItemServiceFactory({ pantryItemRepository, couponTypeService }),
    insertPantryItem,
    findPantryItemByNameAndBrand,
    updatePantryItem,
    setPantryItemArchived,
    deletePantryItem,
  };
}

describe('pantryItemService reads', () => {
  it('returns a stored item by id', async () => {
    const { service } = makeService({ existing: makeItem({ id: 'abc' }) });
    await expect(service.getPantryItemById('abc')).resolves.toMatchObject({ id: 'abc' });
  });

  it('reports an unknown id as not found', async () => {
    const { service } = makeService({ existing: null });
    await expect(service.getPantryItemById('nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lists and counts through the repository', async () => {
    const { service } = makeService();
    await expect(
      service.listPantryItems({ includeArchived: false, couponTypeId: null }),
    ).resolves.toHaveLength(1);
    await expect(service.countPantryItems()).resolves.toBe(1);
  });
});

describe('pantryItemService normalization', () => {
  it('trims the name and stores blank optional text as absent', async () => {
    const { service, insertPantryItem } = makeService();

    await service.addPantryItem(
      makeInput({ name: '  Tide Free & Gentle  ', brand: '   ', imageUrl: '', notes: '  ' }),
    );

    expect(insertPantryItem).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Tide Free & Gentle',
        brand: null,
        imageUrl: null,
        notes: null,
      }),
    );
  });

  it('rejects a name that is only whitespace', async () => {
    // Zod's minLength(1) passes "   "; trimming is what makes the rule mean anything.
    const { service } = makeService();
    await expect(service.addPantryItem(makeInput({ name: '   ' }))).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('checks for duplicates using the normalized values, not the raw ones', async () => {
    const { service, findPantryItemByNameAndBrand } = makeService();

    await service.addPantryItem(makeInput({ name: '  Tide  ', brand: '  ' }));

    expect(findPantryItemByNameAndBrand).toHaveBeenCalledWith('Tide', null);
  });
});

describe('pantryItemService validation', () => {
  it('requires a size amount and unit together, or neither', async () => {
    const { service } = makeService();

    await expect(
      service.addPantryItem(makeInput({ sizeAmount: 150, sizeUnit: null })),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service.addPantryItem(makeInput({ sizeAmount: null, sizeUnit: Unit.FLUID_OUNCE })),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service.addPantryItem(makeInput({ sizeAmount: null, sizeUnit: null })),
    ).resolves.toBeDefined();
  });

  it('refuses a pack size that measures something else than the unit price', async () => {
    // A jug measured in fluid ounces cannot have its unit price read per pound.
    const { service } = makeService();

    await expect(
      service.addPantryItem(
        makeInput({ sizeAmount: 150, sizeUnit: Unit.FLUID_OUNCE, unitPriceUnit: Unit.POUND }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('accepts a different unit of the same dimension', async () => {
    // Sold as a 1 gallon jug, read as $/fl oz — same dimension, so this is legitimate.
    const { service } = makeService();

    await expect(
      service.addPantryItem(
        makeInput({ sizeAmount: 1, sizeUnit: Unit.GALLON, unitPriceUnit: Unit.FLUID_OUNCE }),
      ),
    ).resolves.toBeDefined();
  });

  it('reports an unknown category rather than leaving it to the foreign key', async () => {
    const { service } = makeService({ couponTypes: [] });

    await expect(
      service.addPantryItem(makeInput({ couponTypeId: 'ct-nope' })),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('accepts a category that exists', async () => {
    const { service } = makeService({ couponTypes: [COUPON_TYPE] });

    await expect(
      service.addPantryItem(makeInput({ couponTypeId: COUPON_TYPE.id })),
    ).resolves.toBeDefined();
  });
});

describe('pantryItemService duplicate rule', () => {
  it('refuses a second item with the same name and brand', async () => {
    const { service } = makeService({ duplicate: makeItem({ id: 'other' }) });

    await expect(service.addPantryItem(makeInput())).rejects.toBeInstanceOf(ConflictError);
  });

  it('reports the item already stored, not the input that was rejected', async () => {
    // Colliding on "tide" is only actionable if the message says what is already there.
    const { service } = makeService({
      duplicate: makeItem({ id: 'other', name: 'Tide Free & Gentle', brand: 'Tide' }),
    });

    await expect(service.addPantryItem(makeInput({ name: 'tide free & gentle' }))).rejects.toThrow(
      'Tide Free & Gentle (Tide)',
    );
  });

  it('omits the brand from the conflict when the stored item has none', async () => {
    const { service } = makeService({
      duplicate: makeItem({ id: 'other', name: 'Paper towels', brand: null }),
    });

    await expect(service.addPantryItem(makeInput({ name: 'paper towels' }))).rejects.toThrow(
      'called Paper towels already exists',
    );
  });

  it('lets an item keep its own name through an update', async () => {
    // The duplicate found IS the row being updated, so it must not block itself.
    const { service } = makeService({
      existing: makeItem({ id: 'p1' }),
      duplicate: makeItem({ id: 'p1' }),
    });

    await expect(service.updatePantryItem('p1', makeInput())).resolves.toBeDefined();
  });

  it('refuses an update that renames onto another item', async () => {
    const { service } = makeService({
      existing: makeItem({ id: 'p1' }),
      duplicate: makeItem({ id: 'p2' }),
    });

    await expect(service.updatePantryItem('p1', makeInput())).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('pantryItemService writes', () => {
  it('reports an unknown id as not found before checking for duplicates', async () => {
    // Otherwise a bad id whose name happens to collide reports a conflict, which explains nothing.
    const { service, findPantryItemByNameAndBrand } = makeService({
      existing: null,
      duplicate: makeItem({ id: 'other' }),
    });

    await expect(service.updatePantryItem('nope', makeInput())).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(findPantryItemByNameAndBrand).not.toHaveBeenCalled();
  });

  it('reports an item deleted between the read and the write as not found', async () => {
    const { service } = makeService({ existing: makeItem(), updated: null });

    await expect(service.updatePantryItem('p1', makeInput())).rejects.toBeInstanceOf(NotFoundError);
  });

  it('archives and restores through one call', async () => {
    const { service, setPantryItemArchived } = makeService();

    await expect(service.archivePantryItem('p1', true)).resolves.toMatchObject({ archived: true });
    expect(setPantryItemArchived).toHaveBeenCalledWith('p1', true);

    await expect(service.archivePantryItem('p1', false)).resolves.toMatchObject({
      archived: false,
    });
  });

  it('reports archiving an unknown item as not found', async () => {
    const { service } = makeService({ archivedRow: null });
    await expect(service.archivePantryItem('nope', true)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns the deleted item so the caller can report what went', async () => {
    const { service } = makeService();
    await expect(service.deletePantryItem('p1')).resolves.toMatchObject({ id: 'p1' });
  });

  it('reports deleting an unknown item as not found', async () => {
    const { service } = makeService({ deletedRow: null });
    await expect(service.deletePantryItem('nope')).rejects.toBeInstanceOf(NotFoundError);
  });
});
