/**
 * The phone drawer "Your folders" (#909, spec §3.14): whether it is open and,
 * while a finger drags it from the left edge, how far it is pulled out.
 * The files button in the top bar calls `openFoldersDrawer`; the drawer
 * itself (`explorer.tsx`) and the edge swipe (`use-edge-swipe.ts`) read and
 * write the rest.
 */

import { useSyncExternalStore } from 'preact/compat';

export interface FoldersDrawerState {
  open: boolean;
  /** Pixels of the drawer pulled out by a finger, or `null` when none. */
  drag: number | null;
}

let state: FoldersDrawerState = { open: false, drag: null };
const listeners = new Set<() => void>();

function set(next: FoldersDrawerState): void {
  if (next.open === state.open && next.drag === state.drag) return;
  state = next;
  for (const listener of listeners) listener();
}

/** Opens the drawer (the files button, a finished edge swipe, a reveal). */
export function openFoldersDrawer(): void {
  set({ open: true, drag: null });
}

/** Closes it (✕, a swipe left, the scrim, Esc, choosing an item). */
export function closeFoldersDrawer(): void {
  set({ open: false, drag: null });
}

/** A finger is pulling it out `px` far; `null` when the finger let go. */
export function dragFoldersDrawer(px: number | null): void {
  set({ open: state.open, drag: px });
}

export function foldersDrawerState(): FoldersDrawerState {
  return state;
}

export function subscribeFoldersDrawer(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useFoldersDrawer(): FoldersDrawerState {
  return useSyncExternalStore(subscribeFoldersDrawer, foldersDrawerState);
}
