import { Button } from '../../components/ui/button';
import type { Maybe } from '../../lib/types';
import type { PantryItemFormValues } from './formValues';
import { PantryItemForm } from './PantryItemForm';

export function ManageItemSection({
  archived,
  editing,
  initial,
  categories,
  error,
  busy,
  onEdit,
  onCancelEdit,
  onSave,
  onToggleArchive,
  onDelete,
}: {
  archived: boolean;
  editing: boolean;
  initial: PantryItemFormValues;
  categories: readonly { id: string; label: string }[];
  error: Maybe<string>;
  busy: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (values: PantryItemFormValues) => void;
  onToggleArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <section className="space-y-3 border-t pt-4" aria-labelledby="manage-heading">
      <h3 id="manage-heading" className="text-base font-semibold">
        Manage item
      </h3>
      {editing ? (
        <PantryItemForm
          initial={initial}
          categories={categories}
          submitLabel="Save changes"
          error={error}
          busy={busy}
          onSubmit={onSave}
          onCancel={onCancelEdit}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onEdit}>
            Edit
          </Button>
          <Button variant="outline" disabled={busy} onClick={onToggleArchive}>
            {archived ? 'Restore' : 'Archive'}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onDelete}>
            Delete permanently
          </Button>
        </div>
      )}
      {error === null || editing ? null : (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Archiving hides an item but keeps its price history. Deleting removes the history too.
      </p>
    </section>
  );
}
