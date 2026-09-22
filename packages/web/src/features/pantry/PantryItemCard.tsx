import { Card, CardContent } from '../../components/ui/card';
import type { ResultOf } from '../../graphql';
import { ItemImage } from './ItemImage';
import { savingsLabel } from './insight';
import type { PantryItemsQuery } from './queries';
import { Sparkline } from './Sparkline';
import { formatSize } from './units';
import { VerdictBadge } from './VerdictBadge';

export type PantryListItem = ResultOf<typeof PantryItemsQuery>['pantryItems'][number];

export function PantryItemCard({
  item,
  onOpen,
}: {
  item: PantryListItem;
  onOpen: (id: string) => void;
}) {
  const { insight } = item;
  const size = formatSize(item.sizeAmount, item.sizeUnit);
  // Oldest to newest: the query returns newest first, which would draw the trend backwards.
  const history = [...item.priceEntries].reverse().map((entry) => entry.unitPrice);
  const savings = savingsLabel(insight.savingsVsMedianPct);

  return (
    <Card className="h-full">
      <CardContent className="flex gap-4 p-4">
        <ItemImage src={item.imageUrl} name={item.name} />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <button
                type="button"
                className="text-left text-base font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onClick={() => {
                  onOpen(item.id);
                }}
              >
                {item.name}
              </button>
              <p className="text-sm text-muted-foreground">
                {[item.brand, size, item.category?.label].filter(Boolean).join(' · ') ||
                  'No details yet'}
              </p>
            </div>
            <VerdictBadge verdict={insight.verdict} />
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-lg font-semibold">
                {insight.formattedLatestUnitPrice ?? 'No price logged'}
              </p>
              <p className="text-sm text-muted-foreground">
                {insight.observationCount === 0
                  ? 'Log a price to start tracking'
                  : [
                      savings,
                      insight.cheapestMerchant === null
                        ? null
                        : `cheapest at ${insight.cheapestMerchant.name}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
              </p>
            </div>
            <Sparkline
              values={history}
              label={`Price history for ${item.name}: ${String(history.length)} prices`}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
