import { useState } from 'react';
import { useMutation } from 'urql';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import type { Maybe } from '../../lib/types';
import { formatMoney } from '../pantry/units';
import { mutationError } from '../pantry/queries';
import { DeleteReceiptMutation, RetryReceiptMutation, type ReceiptListItem } from './queries';
import { failureLabel, flagLabel, isProcessing, statusLabel } from './status';

const dayFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const momentFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatDate(iso: string, format: Intl.DateTimeFormat): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : format.format(date);
}

export function ReceiptCard({
  receipt,
  canRetry,
  onChanged,
}: {
  receipt: ReceiptListItem;
  /** False while receipt import is off: the server would refuse the retry. */
  canRetry: boolean;
  onChanged: () => void;
}) {
  const [error, setError] = useState<Maybe<string>>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [{ fetching: retrying }, retry] = useMutation(RetryReceiptMutation);
  const [{ fetching: deleting }, remove] = useMutation(DeleteReceiptMutation);
  const busy = retrying || deleting;
  const failed = receipt.status === 'FAILED';
  const headingId = `receipt-${receipt.id}`;

  function settle(message: Maybe<string>) {
    setError(message);
    if (!message) onChanged();
  }

  async function retryReceipt() {
    const result = await retry({ id: receipt.id });
    settle(
      result.data
        ? mutationError(result.data.retryReceipt)
        : (result.error?.message ?? 'Something went wrong'),
    );
  }

  async function deleteReceipt() {
    const result = await remove({ id: receipt.id });
    setConfirmingDelete(false);
    settle(
      result.data
        ? mutationError(result.data.deleteReceipt)
        : (result.error?.message ?? 'Something went wrong'),
    );
  }

  const details = [
    receipt.purchasedAt === null ? null : `Bought ${formatDate(receipt.purchasedAt, dayFormat)}`,
    receipt.total === null ? null : `Total ${formatMoney(receipt.total, 'USD')}`,
    `${String(receipt.photoCount)} ${receipt.photoCount === 1 ? 'photo' : 'photos'}`,
    `uploaded ${formatDate(receipt.createdAt, momentFormat)}`,
  ].filter(Boolean);

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <article aria-labelledby={headingId} className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id={headingId} className="font-semibold">
              {receipt.merchant?.name ?? 'Store not read yet'}
            </h3>
            <p className="text-sm">
              <span className="sr-only">Status: </span>
              <span className={failed ? 'font-medium text-destructive' : 'font-medium'}>
                {failed ? failureLabel(receipt.failedStage) : statusLabel(receipt.status)}
              </span>
            </p>
          </div>
          <p className="text-sm text-muted-foreground">{details.join(' · ')}</p>
          {failed && receipt.error && <p className="text-sm">{receipt.error}</p>}
          {receipt.flags.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-sm" aria-label="Checks to look at">
              {receipt.flags.map((flag) => (
                <li key={flag}>{flagLabel(flag)}</li>
              ))}
            </ul>
          )}
          {!isProcessing(receipt.status) && !confirmingDelete && (
            <div className="flex flex-wrap gap-2">
              {failed && canRetry && (
                <Button
                  size="sm"
                  disabled={busy}
                  aria-describedby={headingId}
                  onClick={() => {
                    void retryReceipt();
                  }}
                >
                  {retrying ? 'Retrying…' : 'Retry'}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                aria-describedby={headingId}
                onClick={() => {
                  setConfirmingDelete(true);
                }}
              >
                Delete
              </Button>
            </div>
          )}
          {confirmingDelete && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm">Delete this receipt and its photos?</p>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => {
                  void deleteReceipt();
                }}
              >
                {deleting ? 'Deleting…' : 'Delete receipt'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setConfirmingDelete(false);
                }}
              >
                Keep it
              </Button>
            </div>
          )}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </article>
      </CardContent>
    </Card>
  );
}
