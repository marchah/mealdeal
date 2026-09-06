import type { LogPriceValues, PantryItemFormValues } from './formValues';

/** A blank text field means "not set", not an empty string. */
function text(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** A blank number field means "not set"; anything unparseable is left to the server to reject. */
function num(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function toPantryItemInput(values: PantryItemFormValues) {
  return {
    name: values.name.trim(),
    brand: text(values.brand),
    couponTypeId: text(values.couponTypeId),
    imageUrl: text(values.imageUrl),
    sizeAmount: num(values.sizeAmount),
    sizeUnit: values.sizeUnit === '' ? undefined : values.sizeUnit,
    unitPriceUnit: values.unitPriceUnit,
    targetPrice: num(values.targetPrice),
    notes: text(values.notes),
  };
}

export function toPriceEntryInput(pantryItemId: string, values: LogPriceValues) {
  return {
    pantryItemId,
    price: num(values.price) ?? 0,
    sizeAmount: num(values.sizeAmount) ?? 0,
    sizeUnit: values.sizeUnit,
    quantity: num(values.quantity) ?? 1,
    merchantName: text(values.merchantName),
    note: text(values.note),
    onSale: values.onSale,
    // A date input gives a calendar day; noon local keeps it on that day in any timezone, and
    // keeps "today" from landing in the future once converted to UTC.
    observedAt:
      values.observedAt === ''
        ? undefined
        : new Date(`${values.observedAt}T12:00:00`).toISOString(),
  };
}
