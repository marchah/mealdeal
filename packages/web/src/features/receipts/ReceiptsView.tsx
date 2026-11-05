import { useCallback, useEffect } from 'react';
import { useQuery } from 'urql';
import { ReceiptCard } from './ReceiptCard';
import { ReceiptUpload } from './ReceiptUpload';
import { ReceiptsQuery } from './queries';
import { isProcessing } from './status';

/** OCR and the parse take a minute or two a receipt, so a few seconds between looks is plenty. */
export const RECEIPTS_POLL_MS = 5_000;

export function ReceiptsView() {
  const [{ data, fetching, error }, refetch] = useQuery({ query: ReceiptsQuery });
  const receipts = data?.receipts ?? [];
  const processing = receipts.filter((receipt) => isProcessing(receipt.status)).length;
  // The document cache cannot know a new receipt belongs in a list it has already seen.
  const refresh = useCallback(() => {
    refetch({ requestPolicy: 'network-only' });
  }, [refetch]);

  // Polls only while something is moving: a settled list has nothing new to show.
  useEffect(() => {
    if (processing === 0) return;
    const timer = setInterval(refresh, RECEIPTS_POLL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [processing, refresh]);

  if (fetching && !data)
    return (
      <p className="mt-6 text-muted-foreground" role="status">
        Loading your receipts…
      </p>
    );
  if (error && !data)
    return (
      <p className="mt-6 text-destructive" role="alert">
        Failed to load: {error.message}
      </p>
    );

  const enabled = data?.appConfig.receiptImportEnabled ?? false;

  return (
    <section className="mt-6 space-y-4" aria-labelledby="receipts-heading">
      <div>
        <h2 id="receipts-heading" className="text-lg font-semibold">
          Receipts
        </h2>
        <p className="text-sm text-muted-foreground">
          Photograph a grocery receipt and MealDeal reads its store, date and lines for you. Nothing
          becomes a price until you review it.
        </p>
      </div>

      {enabled ? (
        <ReceiptUpload onUploaded={refresh} />
      ) : (
        <aside
          role="status"
          aria-labelledby="receipt-import-off"
          className="rounded-xl border border-border bg-muted p-4 text-sm"
        >
          <p id="receipt-import-off" className="font-medium">
            Receipt import is off
          </p>
          <p className="mt-1 text-muted-foreground">
            No OCR service is configured, so receipt photos cannot be read. Set OCR_BASE_URL on the
            server to the OCR service’s address (see the README) and restart it to turn this on.
          </p>
        </aside>
      )}

      {/* A live region, so a screen reader hears a receipt finish without re-reading the list. */}
      <p className="text-sm text-muted-foreground" role="status">
        {processing === 0
          ? ''
          : `${String(processing)} ${processing === 1 ? 'receipt is' : 'receipts are'} being read, one at a time; each takes a minute or two. This list updates on its own.`}
      </p>

      {receipts.length === 0 ? (
        <p className="text-muted-foreground">No receipts yet.</p>
      ) : (
        <ul className="space-y-3">
          {receipts.map((receipt) => (
            <li key={receipt.id}>
              <ReceiptCard receipt={receipt} canRetry={enabled} onChanged={refresh} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
