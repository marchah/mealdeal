import { useId, useState, type FormEvent } from 'react';
import { useMutation } from 'urql';
import { Button } from '../../components/ui/button';
import type { Maybe } from '../../lib/types';
import type { PantryItemFormValues } from './formValues';
import { DraftFromUrlMutation, mutationError } from './queries';
import type { UnitValue } from './units';

/** A price the page stated, kept aside so it can be logged once the item exists. */
export interface ImportedPrice {
  price: number;
  sizeAmount: number;
  sizeUnit: UnitValue;
}

export interface ImportResult {
  values: Partial<PantryItemFormValues>;
  price: Maybe<ImportedPrice>;
  /** False when the page could not be read — the form still opens, just empty. */
  found: boolean;
}

export function ImportFromUrl({ onImported }: { onImported: (result: ImportResult) => void }) {
  const [{ fetching }, draftFromUrl] = useMutation(DraftFromUrlMutation);
  const [url, setUrl] = useState('');
  const [error, setError] = useState<Maybe<string>>(null);
  const [notice, setNotice] = useState<Maybe<string>>(null);
  const inputId = useId();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const result = await draftFromUrl({ url: url.trim() });
    const payload = result.data?.draftPantryItemFromUrl;
    const message =
      result.error?.message ?? (payload ? mutationError(payload) : 'Something went wrong');
    if (message !== null) {
      setError(message);
      return;
    }
    if (payload?.__typename !== 'MutationDraftPantryItemFromUrlSuccess') return;
    const draft = payload.data;

    if (!draft.found) {
      // The common path for a retailer that blocks server-side reads. Say so plainly and leave
      // the form open rather than turning a paste into a dead end.
      setNotice(
        'We could not read that page — fill the form in below and keep the link if useful.',
      );
      onImported({ values: { imageUrl: '' }, price: null, found: false });
      return;
    }

    onImported({
      found: true,
      values: {
        name: draft.name ?? '',
        brand: draft.brand ?? '',
        imageUrl: draft.imageUrl ?? '',
        sizeAmount: draft.sizeAmount === null ? '' : String(draft.sizeAmount),
        sizeUnit: draft.sizeUnit ?? '',
        ...(draft.sizeUnit === null ? {} : { unitPriceUnit: draft.sizeUnit }),
      },
      price:
        draft.price === null || draft.sizeAmount === null || draft.sizeUnit === null
          ? null
          : { price: draft.price, sizeAmount: draft.sizeAmount, sizeUnit: draft.sizeUnit },
    });
    setNotice(
      draft.price === null
        ? 'Read the page — check the details below.'
        : `Read the page — the price it showed will be logged when you add the item.`,
    );
  }

  return (
    <form
      className="space-y-2 rounded-xl border p-4"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <label className="text-sm font-medium" htmlFor={inputId}>
        Paste a product link
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id={inputId}
          className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
          type="url"
          placeholder="https://www.amazon.com/…"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
          }}
        />
        <Button type="submit" variant="outline" disabled={fetching || url.trim() === ''}>
          {fetching ? 'Reading…' : 'Read page'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Fills in what the page states. Many retailers block this — if it fails, just type the
        details in.
      </p>
      {error === null ? null : (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {notice === null ? null : (
        <p className="text-sm text-muted-foreground" role="status">
          {notice}
        </p>
      )}
    </form>
  );
}
