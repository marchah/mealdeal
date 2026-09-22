import { ConflictError, NotFoundError, ValidationError } from '../../common/errors';
import type { Maybe } from '../../common/types';
import { dimensionOf, toBaseAmount } from '../../common/units';
import type { MerchantService } from '../merchant/types';
import type { PantryItemService } from '../pantryItem/types';
import type {
  AddPriceEntryInput,
  ListPriceEntriesInput,
  PriceEntry,
  PriceEntryRepository,
  PriceEntryService,
} from './types';

const CURRENCY_CODE = /^[A-Z]{3}$/;

function blankToNull(value: Maybe<string>): Maybe<string> {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// Business logic. The repository is injected whole and first; collaborator services are
// destructured down to the functions actually used.
export function priceEntryServiceFactory({
  priceEntryRepository,
  pantryItemService: { getPantryItemById },
  merchantService: { getOrCreateMerchant },
}: {
  priceEntryRepository: PriceEntryRepository;
  pantryItemService: PantryItemService;
  merchantService: MerchantService;
}): PriceEntryService {
  function listPriceEntries(input: ListPriceEntriesInput) {
    return priceEntryRepository.listPriceEntries(input);
  }

  function findPriceEntriesByPantryItemIds(ids: readonly string[]) {
    return priceEntryRepository.findPriceEntriesByPantryItemIds(ids);
  }

  async function addPriceEntry(input: AddPriceEntryInput) {
    const item = await getPantryItemById(input.pantryItemId);

    if (dimensionOf(input.sizeUnit) !== dimensionOf(item.unitPriceUnit)) {
      // The check slice 4 made unit_price_unit non-null for: $/gallon against an item sold by
      // weight is not a cheaper price, it is a meaningless one.
      throw new ValidationError(
        `sizeUnit ${input.sizeUnit} does not measure the same thing as ${item.name}, which is tracked in ${item.unitPriceUnit}`,
      );
    }
    if (input.price <= 0) throw new ValidationError('price must be greater than 0');
    if (input.sizeAmount <= 0) throw new ValidationError('sizeAmount must be greater than 0');
    if (input.quantity <= 0) throw new ValidationError('quantity must be greater than 0');

    const currency = input.currency.trim().toUpperCase();
    if (!CURRENCY_CODE.test(currency)) {
      // Guards Intl.NumberFormat downstream, which throws on a malformed code.
      throw new ValidationError('currency must be a three-letter ISO 4217 code');
    }

    const observedAt = input.observedAt ?? new Date();
    if (observedAt.getTime() > Date.now()) {
      throw new ValidationError('observedAt cannot be in the future');
    }

    // A history mixing currencies makes "lowest" and "median" meaningless, and the verdict built
    // on them silently wrong. Cheaper to refuse the entry than to explain the wrong answer.
    const [previous] = await priceEntryRepository.listPriceEntries({
      pantryItemId: item.id,
      limit: 1,
      since: null,
    });
    if (previous && previous.currency !== currency) {
      throw new ConflictError(
        `${item.name} is tracked in ${previous.currency}; a ${currency} price cannot be compared against its history`,
      );
    }

    const merchantName = blankToNull(input.merchantName);
    const merchant = merchantName === null ? null : await getOrCreateMerchant(merchantName);

    // The denormalization decision made real: price per base unit, so differently-sized packs
    // compare as plain numbers (docs/PLAN.md decision 2).
    const unitPrice =
      input.price / (toBaseAmount(input.sizeAmount, input.sizeUnit) * input.quantity);

    return priceEntryRepository.insertPriceEntry({
      pantryItemId: item.id,
      merchantId: merchant?.id ?? null,
      price: input.price,
      currency,
      sizeAmount: input.sizeAmount,
      sizeUnit: input.sizeUnit,
      quantity: input.quantity,
      unitPrice,
      onSale: input.onSale,
      source: input.source,
      url: blankToNull(input.url),
      note: blankToNull(input.note),
      observedAt,
    });
  }

  async function deletePriceEntry(id: string): Promise<PriceEntry> {
    const entry = await priceEntryRepository.deletePriceEntry(id);
    if (!entry) throw new NotFoundError(`No price entry with id ${id}`);
    return entry;
  }

  return { listPriceEntries, findPriceEntriesByPantryItemIds, addPriceEntry, deletePriceEntry };
}
