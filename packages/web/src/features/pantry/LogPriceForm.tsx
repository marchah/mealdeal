import { useId, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/button';
import type { Maybe } from '../../lib/types';
import { todayForInput, type LogPriceValues } from './formValues';
import { UNIT_OPTIONS, type UnitValue } from './units';

const field = 'h-9 rounded-md border bg-background px-3 text-sm';

export function LogPriceForm({
  initial,
  error,
  busy,
  onSubmit,
}: {
  initial: LogPriceValues;
  error: Maybe<string>;
  busy: boolean;
  onSubmit: (values: LogPriceValues) => void;
}) {
  const [values, setValues] = useState(initial);
  const ids = useId();
  const id = (name: string) => `${ids}-${name}`;
  const set = <K extends keyof LogPriceValues>(name: K, value: LogPriceValues[K]) => {
    setValues((current) => ({ ...current, [name]: value }));
  };

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit(values);
  }

  return (
    <form className="space-y-4 rounded-xl border p-4" onSubmit={handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor={id('price')}>
            Price paid
          </label>
          <input
            id={id('price')}
            className={field}
            type="number"
            min="0"
            step="any"
            required
            value={values.price}
            onChange={(event) => {
              set('price', event.target.value);
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor={id('sizeAmount')}>
            Pack size
          </label>
          <input
            id={id('sizeAmount')}
            className={field}
            type="number"
            min="0"
            step="any"
            required
            value={values.sizeAmount}
            onChange={(event) => {
              set('sizeAmount', event.target.value);
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
              set('sizeUnit', event.target.value as UnitValue);
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
          <label className="text-sm font-medium" htmlFor={id('quantity')}>
            How many packs
          </label>
          <input
            id={id('quantity')}
            className={field}
            type="number"
            min="1"
            step="any"
            value={values.quantity}
            onChange={(event) => {
              set('quantity', event.target.value);
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor={id('merchantName')}>
            Store
          </label>
          <input
            id={id('merchantName')}
            className={field}
            maxLength={200}
            value={values.merchantName}
            onChange={(event) => {
              set('merchantName', event.target.value);
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor={id('observedAt')}>
            Seen on
          </label>
          <input
            id={id('observedAt')}
            className={field}
            type="date"
            max={todayForInput()}
            value={values.observedAt}
            onChange={(event) => {
              set('observedAt', event.target.value);
            }}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor={id('note')}>
          Note
        </label>
        <input
          id={id('note')}
          className={field}
          maxLength={2000}
          value={values.note}
          onChange={(event) => {
            set('note', event.target.value);
          }}
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          id={id('onSale')}
          type="checkbox"
          className="size-4 rounded border"
          checked={values.onSale}
          onChange={(event) => {
            set('onSale', event.target.checked);
          }}
        />
        <label className="text-sm font-medium" htmlFor={id('onSale')}>
          This was a sale price
        </label>
      </div>
      {error === null ? null : (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        Log this price
      </Button>
    </form>
  );
}
