/**
 * Whether the quick switcher (`components/switcher.tsx`, #142) is open, and
 * the query it should start with. A plain pub/sub store, not Preact
 * context: every opener — the drawer's filter field, the desktop sidebar's
 * switcher button, `Ctrl/Cmd + K` in `app.tsx`, the `/search` route, and
 * later #143's Home pill — just calls `openSwitcher()` without needing to
 * sit inside any particular provider.
 */

import { useEffect, useState } from 'preact/hooks';

export interface SwitcherOpenState {
  open: boolean;
  /** The query the field starts with; cleared once the switcher opens. */
  initialQuery: string;
}

const CLOSED: SwitcherOpenState = { open: false, initialQuery: '' };

let state: SwitcherOpenState = CLOSED;
const listeners = new Set<(state: SwitcherOpenState) => void>();

function set(next: SwitcherOpenState): void {
  state = next;
  for (const listener of listeners) listener(state);
}

/** Opens the switcher, optionally prefilling the field (the `/search` route's `q`). */
export function openSwitcher(initialQuery = ''): void {
  set({ open: true, initialQuery });
}

export function closeSwitcher(): void {
  set(CLOSED);
}

/** The switcher's own open state; re-renders the subscriber when it changes. */
export function useSwitcherOpen(): SwitcherOpenState {
  const [value, setValue] = useState(state);
  useEffect(() => {
    listeners.add(setValue);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}
