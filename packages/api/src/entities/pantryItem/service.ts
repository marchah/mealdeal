import { ConflictError, NotFoundError, ValidationError } from '../../common/errors';
import type { Maybe } from '../../common/types';
import { dimensionOf } from '../../common/units';
import type { CouponTypeService } from '../couponType/types';
import type {
  ListPantryItemsInput,
  PantryItemInput,
  PantryItemRepository,
  PantryItemService,
} from './types';

/** A field the user left blank is absent, not an empty string — one representation, not two. */
function blankToNull(value: Maybe<string>): Maybe<string> {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// Business logic. The repository is injected whole and first; the collaborator service is
// destructured down to the function actually used.
export function pantryItemServiceFactory({
  pantryItemRepository,
  couponTypeService: { findCouponTypeById },
}: {
  pantryItemRepository: PantryItemRepository;
  couponTypeService: CouponTypeService;
}): PantryItemService {
  function normalize(input: PantryItemInput): PantryItemInput {
    const name = input.name.trim();
    // Zod's minLength passes a name of only spaces; trimming is what makes the rule mean anything.
    if (name === '') throw new ValidationError('name must not be blank');
    if ((input.sizeAmount === null) !== (input.sizeUnit === null)) {
      throw new ValidationError('sizeAmount and sizeUnit must be given together');
    }
    if (
      input.sizeUnit !== null &&
      dimensionOf(input.sizeUnit) !== dimensionOf(input.unitPriceUnit)
    ) {
      // A pack measured by weight cannot have its unit price read per gallon.
      throw new ValidationError(
        `sizeUnit ${input.sizeUnit} and unitPriceUnit ${input.unitPriceUnit} do not measure the same thing`,
      );
    }
    return {
      ...input,
      name,
      brand: blankToNull(input.brand),
      imageUrl: blankToNull(input.imageUrl),
      notes: blankToNull(input.notes),
    };
  }

  async function assertCategoryExists(couponTypeId: Maybe<string>) {
    if (couponTypeId === null) return;
    // Caught here rather than left to the foreign key, which would surface as an opaque 500.
    if (!(await findCouponTypeById(couponTypeId))) {
      throw new NotFoundError(`No coupon type with id ${couponTypeId}`);
    }
  }

  /**
   * The duplicate rule slice 4 could not express as an index: case- and null-folded, so "Tide"
   * and "tide" collide and so do two unbranded "paper towels". `excludeId` lets an update keep
   * its own name.
   */
  async function assertNameIsFree(input: PantryItemInput, excludeId: Maybe<string>) {
    const existing = await pantryItemRepository.findPantryItemByNameAndBrand(
      input.name,
      input.brand,
    );
    if (existing && existing.id !== excludeId) {
      // Names the STORED item, not the rejected input: "tide" colliding with "Tide Free & Gentle"
      // is only useful if the message says which item is already there.
      const label =
        existing.brand === null ? existing.name : `${existing.name} (${existing.brand})`;
      throw new ConflictError(`A pantry item called ${label} already exists`);
    }
  }

  async function getPantryItemById(id: string) {
    const item = await pantryItemRepository.findPantryItemById(id);
    if (!item) throw new NotFoundError(`No pantry item with id ${id}`);
    return item;
  }

  function findPantryItemsByIds(ids: readonly string[]) {
    return pantryItemRepository.findPantryItemsByIds(ids);
  }

  function listPantryItems(input: ListPantryItemsInput) {
    return pantryItemRepository.listPantryItems(input);
  }

  function countPantryItems() {
    return pantryItemRepository.countPantryItems();
  }

  async function addPantryItem(rawInput: PantryItemInput) {
    const input = normalize(rawInput);
    await assertCategoryExists(input.couponTypeId);
    await assertNameIsFree(input, null);
    return pantryItemRepository.insertPantryItem(input);
  }

  async function updatePantryItem(id: string, rawInput: PantryItemInput) {
    // Read first so an unknown id reports NotFound rather than tripping the duplicate check.
    await getPantryItemById(id);
    const input = normalize(rawInput);
    await assertCategoryExists(input.couponTypeId);
    await assertNameIsFree(input, id);
    const updated = await pantryItemRepository.updatePantryItem(id, input);
    if (!updated) throw new NotFoundError(`No pantry item with id ${id}`);
    return updated;
  }

  async function archivePantryItem(id: string, archived: boolean) {
    const item = await pantryItemRepository.setPantryItemArchived(id, archived);
    if (!item) throw new NotFoundError(`No pantry item with id ${id}`);
    return item;
  }

  async function deletePantryItem(id: string) {
    const item = await pantryItemRepository.deletePantryItem(id);
    if (!item) throw new NotFoundError(`No pantry item with id ${id}`);
    return item;
  }

  return {
    getPantryItemById,
    findPantryItemsByIds,
    listPantryItems,
    countPantryItems,
    addPantryItem,
    updatePantryItem,
    archivePantryItem,
    deletePantryItem,
  };
}
