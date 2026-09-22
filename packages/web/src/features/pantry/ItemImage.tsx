import { useState } from 'react';
import { cn } from '../../lib/utils';
import type { Maybe } from '../../lib/types';

/**
 * A remote product image, usually hotlinked from a retailer. `no-referrer` keeps the pantry's
 * contents out of that retailer's logs, and a broken URL falls back to an initial rather than a
 * torn-page icon — product image URLs rot, and a dead one must not disfigure the card.
 */
export function ItemImage({
  src,
  name,
  className,
}: {
  src: Maybe<string>;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const shell = cn(
    'flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted',
    className,
  );

  if (src === null || failed) {
    return (
      <div className={shell} aria-hidden="true">
        <span className="text-lg font-semibold text-muted-foreground">
          {name.trim().charAt(0).toUpperCase() || '?'}
        </span>
      </div>
    );
  }

  return (
    <div className={shell}>
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        loading="lazy"
        className="size-full object-contain"
        onError={() => {
          setFailed(true);
        }}
      />
    </div>
  );
}
