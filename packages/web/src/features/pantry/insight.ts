import type { Maybe } from '../../lib/types';

/** "29% below usual" — the magnitude the coarse verdict deliberately leaves out. */
export function savingsLabel(savingsVsMedianPct: Maybe<number>): Maybe<string> {
  if (savingsVsMedianPct === null) return null;
  const rounded = Math.round(savingsVsMedianPct);
  if (rounded === 0) return 'about the usual price';
  return rounded > 0
    ? `${String(rounded)}% below usual`
    : `${String(Math.abs(rounded))}% above usual`;
}

/** The cheapest price seen at each store, so the history answers "where should I buy this?". */
export function bestPerMerchant(
  entries: readonly { unitPrice: number; merchant: Maybe<{ id: string; name: string }> }[],
): { name: string; unitPrice: number }[] {
  const best = new Map<string, { name: string; unitPrice: number }>();
  for (const entry of entries) {
    if (entry.merchant === null) continue;
    const current = best.get(entry.merchant.id);
    if (!current || entry.unitPrice < current.unitPrice) {
      best.set(entry.merchant.id, { name: entry.merchant.name, unitPrice: entry.unitPrice });
    }
  }
  return [...best.values()].sort((left, right) => left.unitPrice - right.unitPrice);
}
