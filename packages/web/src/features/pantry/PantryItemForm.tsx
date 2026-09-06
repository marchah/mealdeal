import { useId, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/button';
import type { Maybe } from '../../lib/types';
import type { PantryItemFormValues } from './formValues';
import { UNIT_OPTIONS, type UnitValue } from './units';

const field = 'h-9 rounded-md border bg-background px-3 text-sm';

export function PantryItemForm({
  initial,
  categories,
  submitLabel,
  error,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: PantryItemFormValues;
  categories: readonly { id: string; label: string }[];
  submitLabel: string;
  error: Maybe<string>;
  busy: boolean;
  onSubmit: (values: PantryItemFormValues) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState(initial);
  const ids = useId();
  const id = (name: string) => `${ids}-${name}`;
  const set = (name: keyof PantryItemFormValues) => (value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
  };

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit(values);
  }

  return (
    <form className="space-y-4 rounded-xl border p-4" onSubmit={handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor={id('name')}>
            Name
          </label>
          <input
            id={id('name')}
            className={field}
            required
            maxLength={200}
            value={values.name}
            onChange={(event) => {
              set('name')(event.target.value);
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor={id('brand')}>
            Brand
          </label>
          <input
            id={id('brand')}
            className={field}
            maxLength={200}
            value={values.brand}
            onChange={(event) => {
              set('brand')(event.target.value);
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor={id('category')}>
            Category
          </label>
          <select
            id={id('category')}
            className={field}
            value={values.couponTypeId}
            onChange={(event) => {
              set('couponTypeId')(event.target.value);
            }}
          >
            <option value="">Uncategorized</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor={id('unitPriceUnit')}>
            Compare prices per
          </label>
          <select
            id={id('unitPriceUnit')}
            className={field}
            value={values.unitPriceUnit}
            onChange={(event) => {
              setValues((current) => ({
                ...current,
                unitPriceUnit: event.target.value as UnitValue,
              }));
            }}
          >
            {UNIT_OPTIONS.map((unit) => (
              <option key={unit.value} value={unit.value}>
                {unit.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor={id('sizeAmount')}>
            Usual pack size
          </label>
          <input
            id={id('sizeAmount')}
            className={field}
            type="number"
            min="0"
            step="any"
            value={values.sizeAmount}
            onChange={(event) => {
              set('sizeAmount')(event.target.value);
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor={id('sizeUnit')}>
            Pack unit
          </label>
          <select
            id={id('sizeUnit')}
            className={field}
            value={values.sizeUnit}
            onChange={(event) => {
              setValues((current) => ({ ...current, sizeUnit: event.target.value as UnitValue }));
            }}
          >
            <option value="">No fixed size</option>
            {UNIT_OPTIONS.map((unit) => (
              <option key={unit.value} value={unit.value}>
                {unit.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor={id('targetPrice')}>
            Buy at or below (per unit)
          </label>
          <input
            id={id('targetPrice')}
            className={field}
            type="number"
            min="0"
            step="any"
            value={values.targetPrice}
            onChange={(event) => {
              set('targetPrice')(event.target.value);
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor={id('imageUrl')}>
            Image URL
          </label>
          <input
            id={id('imageUrl')}
            className={field}
            type="url"
            value={values.imageUrl}
            onChange={(event) => {
              set('imageUrl')(event.target.value);
            }}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor={id('notes')}>
          Notes
        </label>
        <textarea
          id={id('notes')}
          className="min-h-16 rounded-md border bg-background px-3 py-2 text-sm"
          value={values.notes}
          onChange={(event) => {
            set('notes')(event.target.value);
          }}
        />
      </div>
      {error === null ? null : (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
