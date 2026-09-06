import { useRef, useState } from 'react';
import { useMutation } from 'urql';
import type { Maybe } from '../../lib/types';
import { EMPTY_ITEM, type PantryItemFormValues } from './formValues';
import { ImportFromUrl, type ImportedPrice } from './ImportFromUrl';
import { PantryItemForm } from './PantryItemForm';
import { AddPantryItemMutation, AddPriceEntryMutation, mutationError } from './queries';
import { toPantryItemInput } from './toInput';

/**
 * The add-item flow: paste a link, confirm what it read, save. Its own component so the list is
 * about listing — and so the half-dozen pieces of state this needs live with the thing that needs
 * them rather than swelling the page above it.
 */
export function AddPantryItemPanel({
  categories,
  onAdded,
  onCancel,
}: {
  categories: readonly { id: string; label: string }[];
  onAdded: () => void;
  onCancel: () => void;
}) {
  const [, addPantryItem] = useMutation(AddPantryItemMutation);
  const [, addPriceEntry] = useMutation(AddPriceEntryMutation);
  const [initial, setInitial] = useState<PantryItemFormValues>(EMPTY_ITEM);
  const [error, setError] = useState<Maybe<string>>(null);
  const [busy, setBusy] = useState(false);
  // A ref, not state: it is only ever read when the form is submitted, so storing it in state
  // would re-render the form for a value nothing renders.
  const importedPrice = useRef<Maybe<ImportedPrice>>(null);

  async function handleSubmit(values: PantryItemFormValues) {
    setBusy(true);
    setError(null);
    let outcome: Awaited<ReturnType<typeof addPantryItem>>;
    try {
      outcome = await addPantryItem({ input: toPantryItemInput(values) });
    } finally {
      // In a finally: a throw here would otherwise leave the form permanently disabled.
      setBusy(false);
    }
    const payload = outcome.data?.addPantryItem;
    const message =
      outcome.error?.message ?? (payload ? mutationError(payload) : 'Something went wrong');
    if (message !== null) {
      setError(message);
      return;
    }
    // A price the imported page stated becomes the item's first observation, so an import that
    // found one lands with history instead of an empty chart.
    const created = payload?.__typename === 'MutationAddPantryItemSuccess' ? payload.data : null;
    if (created !== null && importedPrice.current !== null) {
      await addPriceEntry({ input: { pantryItemId: created.id, ...importedPrice.current } });
    }
    importedPrice.current = null;
    onAdded();
  }

  return (
    <>
      <ImportFromUrl
        onImported={(result) => {
          setInitial((current) => ({ ...current, ...result.values }));
          importedPrice.current = result.price;
        }}
      />
      <PantryItemForm
        // Remount when an import fills the fields, so the form shows what was read.
        key={initial.name + initial.imageUrl}
        initial={initial}
        categories={categories}
        submitLabel="Add item"
        error={error}
        busy={busy}
        onSubmit={(values) => void handleSubmit(values)}
        onCancel={onCancel}
      />
    </>
  );
}
