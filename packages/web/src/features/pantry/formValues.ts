import type { Maybe } from '../../lib/types';
import type { UnitValue } from './units';

export interface PantryItemFormValues {
  name: string;
  brand: string;
  couponTypeId: string;
  imageUrl: string;
  sizeAmount: string;
  sizeUnit: UnitValue | '';
  unitPriceUnit: UnitValue;
  targetPrice: string;
  notes: string;
}

export const EMPTY_ITEM: PantryItemFormValues = {
  name: '',
  brand: '',
  couponTypeId: '',
  imageUrl: '',
  sizeAmount: '',
  sizeUnit: '',
  unitPriceUnit: 'OUNCE',
  targetPrice: '',
  notes: '',
};

export interface LogPriceValues {
  price: string;
  sizeAmount: string;
  sizeUnit: UnitValue;
  quantity: string;
  merchantName: string;
  observedAt: string;
  onSale: boolean;
  note: string;
}

/** Today in the browser's own timezone, for a date input's yyyy-mm-dd value. */
export function todayForInput(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function initialLogPriceValues(item: {
  sizeAmount: Maybe<number>;
  sizeUnit: Maybe<UnitValue>;
  unitPriceUnit: UnitValue;
}): LogPriceValues {
  return {
    price: '',
    // Prefilled from the item's usual pack, which is the pack most prices will be for.
    sizeAmount: item.sizeAmount === null ? '' : String(item.sizeAmount),
    sizeUnit: item.sizeUnit ?? item.unitPriceUnit,
    quantity: '1',
    merchantName: '',
    observedAt: todayForInput(),
    onSale: false,
    note: '',
  };
}
