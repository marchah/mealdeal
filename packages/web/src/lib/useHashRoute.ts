import { useCallback, useSyncExternalStore } from 'react';

// The hash IS the route. At two tabs and one sub-nav a ~30-line subscription beats a router
// dependency; revisit if the surface grows. useSyncExternalStore (rather than useState + an
// effect) keeps React and the address bar in step without rendering the stale route first.

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener('hashchange', onStoreChange);
  return () => {
    window.removeEventListener('hashchange', onStoreChange);
  };
}

function getSnapshot(): string {
  return window.location.hash;
}

/** `#/coupons/near-me/` → `/coupons/near-me`; a bare, absent or slash-only hash → `/`. */
export function normalizeHashPath(hash: string): string {
  const raw = hash.replace(/^#/, '');
  if (raw === '') return '/';
  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, '');
  return withoutTrailingSlash === '' ? '/' : withoutTrailingSlash;
}

export interface HashRoute {
  path: string;
  navigate: (path: string) => void;
}

/**
 * Read the current route and move to another. Safe to call from several components — they all
 * subscribe to the one browser-owned store, so there is no state to thread through props.
 */
export function useHashRoute(): HashRoute {
  const hash = useSyncExternalStore(subscribe, getSnapshot);
  const navigate = useCallback((path: string) => {
    window.location.hash = `#${path}`;
  }, []);
  return { path: normalizeHashPath(hash), navigate };
}
