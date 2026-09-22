import { cn } from '../../lib/utils';

// Colour AND words. A badge that says "good price" only in green is invisible to a colour-blind
// reader and to anyone reading the page aloud.
const VERDICTS: Record<string, { label: string; className: string }> = {
  GREAT: { label: 'Great price', className: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  GOOD: { label: 'Good price', className: 'bg-lime-100 text-lime-900 border-lime-300' },
  TYPICAL: { label: 'Typical price', className: 'bg-amber-100 text-amber-900 border-amber-300' },
  HIGH: { label: 'High price', className: 'bg-rose-100 text-rose-900 border-rose-300' },
  UNKNOWN: {
    label: 'Not enough history',
    className: 'bg-muted text-muted-foreground border-border',
  },
};

export function VerdictBadge({ verdict, className }: { verdict: string; className?: string }) {
  const { label, className: tone } = VERDICTS[verdict] ?? VERDICTS.UNKNOWN!;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        tone,
        className,
      )}
    >
      {label}
    </span>
  );
}
