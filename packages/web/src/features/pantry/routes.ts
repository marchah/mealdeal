import type { Maybe } from '../../lib/types';

export const PANTRY_PATH = '/pantry';
export const PANTRY_RECEIPTS_PATH = '/pantry/receipts';

/** True for `/pantry` and anything beneath it, so an item route still selects the tab. */
export function isPantryPath(path: string): boolean {
  return path === PANTRY_PATH || path.startsWith(`${PANTRY_PATH}/`);
}

export function pantryItemPath(id: string): string {
  return `${PANTRY_PATH}/${encodeURIComponent(id)}`;
}

export function isPantryReceiptsPath(path: string): boolean {
  return path === PANTRY_RECEIPTS_PATH;
}

/** The item id in `/pantry/<id>`, or null on the list and receipts routes. */
export function pantryItemIdFromPath(path: string): Maybe<string> {
  if (!path.startsWith(`${PANTRY_PATH}/`) || isPantryReceiptsPath(path)) return null;
  const raw = path.slice(PANTRY_PATH.length + 1);
  if (raw === '') return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    // A hand-mangled hash ("#/pantry/%") makes decodeURIComponent throw. Treat it as a route
    // that matches no item rather than letting it take the whole page down.
    return raw;
  }
}
