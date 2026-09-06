import { useId, useState } from 'react';
import { useQuery } from 'urql';
import { Button } from '../../components/ui/button';
import { AddPantryItemPanel } from './AddPantryItemPanel';
import { PantryItemCard } from './PantryItemCard';
import { PantryItemsQuery } from './queries';

const VERDICT_ORDER = ['GREAT', 'GOOD', 'TYPICAL', 'HIGH', 'UNKNOWN'];

const VERDICT_FILTERS = [
  { value: 'all', label: 'Any verdict' },
  { value: 'GREAT', label: 'Great price' },
  { value: 'GOOD', label: 'Good price' },
  { value: 'TYPICAL', label: 'Typical price' },
  { value: 'HIGH', label: 'High price' },
  { value: 'UNKNOWN', label: 'Not enough history' },
];

const field = 'h-9 rounded-md border bg-background px-3 text-sm';

export function PantryList({ onOpen }: { onOpen: (id: string) => void }) {
  const [{ data, fetching, error }, refetch] = useQuery({
    query: PantryItemsQuery,
    variables: { includeArchived: false },
  });
  const [category, setCategory] = useState('all');
  const [verdict, setVerdict] = useState('all');
  const [sort, setSort] = useState('best');
  const [adding, setAdding] = useState(false);
  const ids = useId();
  const id = (name: string) => `${ids}-${name}`;

  if (fetching && !data)
    return (
      <p className="mt-6 text-muted-foreground" role="status">
        Loading your pantry…
      </p>
    );
  if (error)
    return (
      <p className="mt-6 text-destructive" role="alert">
        Failed to load: {error.message}
      </p>
    );

  const items = data?.pantryItems ?? [];
  const filtered = items.filter(
    (item) =>
      (category === 'all' || item.category?.id === category) &&
      (verdict === 'all' || item.insight.verdict === verdict),
  );
  const sorted = filtered.toSorted((left, right) => {
    if (sort === 'name') return left.name.localeCompare(right.name);
    if (sort === 'savings')
      return (
        (right.insight.savingsVsMedianPct ?? -Infinity) -
        (left.insight.savingsVsMedianPct ?? -Infinity)
      );
    const byVerdict =
      VERDICT_ORDER.indexOf(left.insight.verdict) - VERDICT_ORDER.indexOf(right.insight.verdict);
    return byVerdict === 0 ? left.name.localeCompare(right.name) : byVerdict;
  });

  return (
    <section className="mt-6 space-y-4" aria-labelledby="pantry-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="pantry-heading" className="text-lg font-semibold">
            Pantry
          </h2>
          <p className="text-sm text-muted-foreground">
            {items.length === 0
              ? 'The things you buy regularly, and whether today’s price is any good.'
              : `${String(items.length)} tracked · ${String(
                  items.filter((item) => item.insight.verdict === 'GREAT').length,
                )} worth buying now`}
          </p>
        </div>
        <Button
          onClick={() => {
            setAdding((open) => !open);
          }}
          aria-expanded={adding}
        >
          {adding ? 'Close' : 'Add item'}
        </Button>
      </div>

      {adding && (
        <AddPantryItemPanel
          categories={data?.getCouponTypes ?? []}
          onAdded={() => {
            setAdding(false);
            // The document cache cannot know a new item belongs in a list it has already seen empty.
            refetch({ requestPolicy: 'network-only' });
          }}
          onCancel={() => {
            setAdding(false);
          }}
        />
      )}

      {items.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor={id('category')}>
              Category
            </label>
            <select
              id={id('category')}
              className={field}
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
              }}
            >
              <option value="all">All categories</option>
              {data?.getCouponTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor={id('verdict')}>
              Verdict
            </label>
            <select
              id={id('verdict')}
              className={field}
              value={verdict}
              onChange={(event) => {
                setVerdict(event.target.value);
              }}
            >
              {VERDICT_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor={id('sort')}>
              Sort by
            </label>
            <select
              id={id('sort')}
              className={field}
              value={sort}
              onChange={(event) => {
                setSort(event.target.value);
              }}
            >
              <option value="best">Best deal right now</option>
              <option value="savings">Biggest saving</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-muted-foreground">
          Nothing tracked yet. Add the things you buy regularly and log what you pay — after a few
          prices, MealDeal can tell you whether today’s is a good one.
        </p>
      ) : sorted.length === 0 ? (
        <p className="text-muted-foreground">No items match those filters.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {sorted.map((item) => (
            <li key={item.id}>
              <PantryItemCard item={item} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
