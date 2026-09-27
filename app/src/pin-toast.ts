/**
 * A pub/sub store for the shared "Pinned to Home" / "Unpinned" toast (spec
 * §14, issue #216): pinning happens from several places at once — the note
 * menu, a drawer row's held sheet, a tree row's hover pin and its
 * right-click menu, the Folder screen's chip — so one toast, mounted once
 * in the shell (`components/layout.tsx`), is simpler than each entry point
 * owning its own. Same plain pub/sub pattern as `switcher-store.ts`.
 */

import { useEffect, useState } from 'preact/hooks';

export interface PinToastState {
  message: string | null;
  /** Bumped on every call, so the same message twice still (re)shows. */
  key: number;
}

const INITIAL: PinToastState = { message: null, key: 0 };
let state: PinToastState = INITIAL;
const listeners = new Set<(state: PinToastState) => void>();

function set(next: PinToastState): void {
  state = next;
  for (const listener of listeners) listener(state);
}

/** Shows `message` in the shared toast. */
export function showPinToast(message: string): void {
  set({ message, key: state.key + 1 });
}

/** The toast's own state; re-renders the subscriber when it changes. */
export function usePinToastState(): PinToastState {
  const [value, setValue] = useState(state);
  useEffect(() => {
    listeners.add(setValue);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}
