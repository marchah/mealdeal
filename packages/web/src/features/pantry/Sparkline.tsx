const WIDTH = 120;
const HEIGHT = 28;

/**
 * Price history as an inline SVG polyline — no chart dependency for one line of eight points.
 * `values` run oldest to newest.
 */
export function Sparkline({ values, label }: { values: readonly number[]; label: string }) {
  if (values.length < 2) return null;

  const lowest = Math.min(...values);
  const highest = Math.max(...values);
  // A flat history would divide by zero; draw it down the middle instead.
  const span = highest - lowest;
  const x = (index: number) => (index / (values.length - 1)) * WIDTH;
  const y = (value: number) =>
    span === 0 ? HEIGHT / 2 : HEIGHT - ((value - lowest) / span) * HEIGHT;

  const points = values.map((value, index) => `${String(x(index))},${String(y(value))}`).join(' ');
  const lastValue = values[values.length - 1];

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
      width={WIDTH}
      height={HEIGHT}
      className="overflow-visible text-muted-foreground"
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {lastValue === undefined ? null : (
        <circle cx={WIDTH} cy={y(lastValue)} r={2.5} fill="currentColor" />
      )}
    </svg>
  );
}
