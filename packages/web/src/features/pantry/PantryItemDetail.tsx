import { useState } from 'react';
import { useMutation, useQuery } from 'urql';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import type { ResultOf } from '../../graphql';
import type { Maybe } from '../../lib/types';
import {
  initialLogPriceValues,
  type LogPriceValues,
  type PantryItemFormValues,
} from './formValues';
import { bestPerMerchant, savingsLabel } from './insight';
import { ItemImage } from './ItemImage';
import { LogPriceForm } from './LogPriceForm';
import { ManageItemSection } from './ManageItemSection';
import { PriceHistoryTable } from './PriceHistoryTable';
import {
  AddPriceEntryMutation,
  ArchivePantryItemMutation,
  DeletePantryItemMutation,
  DeletePriceEntryMutation,
  PantryItemQuery,
  UpdatePantryItemMutation,
  mutationError,
} from './queries';
import { Sparkline } from './Sparkline';
import { toPantryItemInput, toPriceEntryInput } from './toInput';
import { formatMoney, formatSize, unitAbbreviation } from './units';
import { VerdictBadge } from './VerdictBadge';

type DetailResult = ResultOf<typeof PantryItemQuery>['pantryItem'];
type DetailItem = Extract<DetailResult, { __typename: 'QueryPantryItemSuccess' }>['data'];

function toFormValues(item: DetailItem): PantryItemFormValues {
  return {
    name: item.name,
    brand: item.brand ?? '',
    couponTypeId: item.couponTypeId ?? '',
    imageUrl: item.imageUrl ?? '',
    sizeAmount: item.sizeAmount === null ? '' : String(item.sizeAmount),
    sizeUnit: item.sizeUnit ?? '',
    unitPriceUnit: item.unitPriceUnit,
    targetPrice: item.targetPrice === null ? '' : String(item.targetPrice),
    notes: item.notes ?? '',
  };
}

type MutationOutcome = {
  error?: { message: string };
  payload?: Maybe<{ __typename: string; message?: string }>;
};

export function PantryItemDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [{ data, fetching, error }, refetch] = useQuery({
    query: PantryItemQuery,
    variables: { id },
  });
  const [, addPriceEntry] = useMutation(AddPriceEntryMutation);
  const [, deletePriceEntry] = useMutation(DeletePriceEntryMutation);
  const [, updatePantryItem] = useMutation(UpdatePantryItemMutation);
  const [, archivePantryItem] = useMutation(ArchivePantryItemMutation);
  const [, deletePantryItem] = useMutation(DeletePantryItemMutation);
  const [editing, setEditing] = useState(false);
  const [priceError, setPriceError] = useState<Maybe<string>>(null);
  const [itemError, setItemError] = useState<Maybe<string>>(null);
  const [busy, setBusy] = useState(false);

  const reload = () => {
    refetch({ requestPolicy: 'network-only' });
  };

  /** Unwraps the transport error and the result union, and always clears the busy flag. */
  async function runMutation(
    action: () => Promise<MutationOutcome>,
    setError: (message: Maybe<string>) => void,
  ): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const { error: transport, payload } = await action();
      if (transport) {
        setError(transport.message);
        return false;
      }
      const message = payload ? mutationError(payload) : 'Something went wrong';
      if (message !== null) {
        setError(message);
        return false;
      }
      return true;
    } finally {
      // In a finally: a throw here would otherwise leave every button on the page disabled.
      setBusy(false);
    }
  }

  if (fetching && !data)
    return (
      <p className="mt-6 text-muted-foreground" role="status">
        Loading item…
      </p>
    );
  if (error)
    return (
      <p className="mt-6 text-destructive" role="alert">
        Failed to load: {error.message}
      </p>
    );

  const result = data?.pantryItem;
  if (!result) return null;
  if (result.__typename !== 'QueryPantryItemSuccess')
    return (
      <section className="mt-6 space-y-3">
        <p className="text-destructive" role="alert">
          {result.message ?? 'That item could not be loaded.'}
        </p>
        <Button variant="outline" onClick={onBack}>
          Back to pantry
        </Button>
      </section>
    );

  const item = result.data;
  const { insight } = item;
  const history = [...item.priceEntries].reverse().map((entry) => entry.unitPrice);
  const perMerchant = bestPerMerchant(item.priceEntries);
  const unit = unitAbbreviation(item.unitPriceUnit);

  const handleLogPrice = (values: LogPriceValues) =>
    void runMutation(async () => {
      const outcome = await addPriceEntry({ input: toPriceEntryInput(id, values) });
      return { error: outcome.error, payload: outcome.data?.addPriceEntry ?? null };
    }, setPriceError).then((ok) => {
      if (ok) reload();
    });

  const handleRemovePrice = (entryId: string) =>
    void runMutation(async () => {
      const outcome = await deletePriceEntry({ id: entryId });
      return { error: outcome.error, payload: outcome.data?.deletePriceEntry ?? null };
    }, setPriceError).then((ok) => {
      if (ok) reload();
    });

  const handleSave = (values: PantryItemFormValues) =>
    void runMutation(async () => {
      const outcome = await updatePantryItem({ id, input: toPantryItemInput(values) });
      return { error: outcome.error, payload: outcome.data?.updatePantryItem ?? null };
    }, setItemError).then((ok) => {
      if (ok) {
        setEditing(false);
        reload();
      }
    });

  const handleToggleArchive = () =>
    void runMutation(async () => {
      const outcome = await archivePantryItem({ id, archived: !item.archived });
      return { error: outcome.error, payload: outcome.data?.archivePantryItem ?? null };
    }, setItemError).then((ok) => {
      if (ok) reload();
    });

  const handleDelete = () =>
    void runMutation(async () => {
      const outcome = await deletePantryItem({ id });
      return { error: outcome.error, payload: outcome.data?.deletePantryItem ?? null };
    }, setItemError).then((ok) => {
      if (ok) onBack();
    });

  return (
    <section className="mt-6 space-y-6" aria-labelledby="pantry-item-heading">
      <Button variant="outline" onClick={onBack}>
        ← Back to pantry
      </Button>

      <div className="flex flex-wrap items-start gap-4">
        <ItemImage src={item.imageUrl} name={item.name} className="size-20" />
        <div className="min-w-0 flex-1 space-y-1">
          <h2 id="pantry-item-heading" className="text-xl font-semibold">
            {item.name}
          </h2>
          <p className="text-sm text-muted-foreground">
            {[item.brand, formatSize(item.sizeAmount, item.sizeUnit), item.category?.label]
              .filter(Boolean)
              .join(' · ') || 'No details yet'}
          </p>
          {item.notes === null ? null : <p className="text-sm">{item.notes}</p>}
        </div>
        <VerdictBadge verdict={insight.verdict} />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end justify-between gap-4 p-4">
          <div>
            <p className="text-2xl font-semibold">
              {insight.formattedLatestUnitPrice ?? 'No price logged yet'}
            </p>
            <p className="text-sm text-muted-foreground">
              {insight.observationCount === 0
                ? 'Log a price below to start tracking.'
                : [
                    savingsLabel(insight.savingsVsMedianPct),
                    `${String(insight.observationCount)} prices in the last ${String(insight.windowDays)} days`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
            </p>
            {item.targetPrice === null ? null : (
              <p className="text-sm text-muted-foreground">
                Target: {formatMoney(item.targetPrice, insight.currency)}/{unit}
                {insight.meetsTargetPrice === true ? ' — met' : ''}
              </p>
            )}
          </div>
          <Sparkline
            values={history}
            label={`Price history for ${item.name}: ${String(history.length)} prices`}
          />
        </CardContent>
      </Card>

      {insight.observationCount > 0 && (
        <dl className="grid grid-cols-3 gap-4 text-sm">
          {[
            { term: 'Lowest', value: insight.lowestUnitPrice },
            { term: 'Median', value: insight.medianUnitPrice },
            { term: 'Highest', value: insight.highestUnitPrice },
          ].map((stat) => (
            <div key={stat.term}>
              <dt className="text-muted-foreground">{stat.term}</dt>
              <dd className="font-medium">
                {stat.value === null ? '—' : `${formatMoney(stat.value, insight.currency)}/${unit}`}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {perMerchant.length > 0 && (
        <section aria-labelledby="per-store-heading" className="space-y-2">
          <h3 id="per-store-heading" className="text-base font-semibold">
            Best price by store
          </h3>
          <ul className="space-y-1 text-sm">
            {perMerchant.map((store) => (
              <li key={store.name} className="flex justify-between gap-4">
                <span>{store.name}</span>
                <span className="font-medium">
                  {formatMoney(store.unitPrice, insight.currency)}/{unit}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="log-price-heading" className="space-y-2">
        <h3 id="log-price-heading" className="text-base font-semibold">
          Log a price
        </h3>
        <LogPriceForm
          // Remount after a successful save so the form comes back empty for the next price.
          key={item.priceEntries.length}
          initial={initialLogPriceValues({
            sizeAmount: item.sizeAmount,
            sizeUnit: item.sizeUnit,
            unitPriceUnit: item.unitPriceUnit,
          })}
          error={priceError}
          busy={busy}
          onSubmit={handleLogPrice}
        />
      </section>

      <section aria-labelledby="history-heading" className="space-y-2">
        <h3 id="history-heading" className="text-base font-semibold">
          Price history
        </h3>
        <PriceHistoryTable
          entries={item.priceEntries}
          unit={unit}
          busy={busy}
          onRemove={handleRemovePrice}
        />
      </section>

      <ManageItemSection
        archived={item.archived}
        editing={editing}
        initial={toFormValues(item)}
        categories={data?.getCouponTypes ?? []}
        error={itemError}
        busy={busy}
        onEdit={() => {
          setEditing(true);
          setItemError(null);
        }}
        onCancelEdit={() => {
          setEditing(false);
        }}
        onSave={handleSave}
        onToggleArchive={handleToggleArchive}
        onDelete={handleDelete}
      />
    </section>
  );
}
