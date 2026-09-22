import { Button } from '../../components/ui/button';
import type { Maybe } from '../../lib/types';
import { formatDate, formatMoney, formatSize } from './units';

export interface HistoryRow {
  id: string;
  price: number;
  currency: string;
  sizeAmount: number;
  sizeUnit: string;
  quantity: number;
  formattedUnitPrice: string;
  onSale: boolean;
  observedAt: string;
  merchant: Maybe<{ id: string; name: string }>;
}

export function PriceHistoryTable({
  entries,
  unit,
  busy,
  onRemove,
}: {
  entries: readonly HistoryRow[];
  unit: string;
  busy: boolean;
  onRemove: (id: string) => void;
}) {
  if (entries.length === 0) return <p className="text-muted-foreground">No prices logged yet.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-muted-foreground">
          <tr>
            <th scope="col" className="py-2 pr-4 font-medium">
              Date
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Store
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Paid
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Pack
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Per {unit}
            </th>
            <th scope="col" className="py-2 font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-t">
              <td className="py-2 pr-4">{formatDate(entry.observedAt)}</td>
              <td className="py-2 pr-4">{entry.merchant?.name ?? '—'}</td>
              <td className="py-2 pr-4">
                {formatMoney(entry.price, entry.currency)}
                {entry.onSale ? ' (sale)' : ''}
              </td>
              <td className="py-2 pr-4">
                {entry.quantity > 1 ? `${String(entry.quantity)} × ` : ''}
                {formatSize(entry.sizeAmount, entry.sizeUnit)}
              </td>
              <td className="py-2 pr-4">{entry.formattedUnitPrice}</td>
              <td className="py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    onRemove(entry.id);
                  }}
                >
                  <span className="sr-only">
                    Remove the price from {formatDate(entry.observedAt)}
                  </span>
                  <span aria-hidden="true">Remove</span>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
