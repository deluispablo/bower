/**
 * Bird presence (spec 6.21 rule 1, R-BIRD-3): one animated Bower per screen.
 * A tiny external store counts the birds on screen. `Bird` registers itself
 * on mount; the perch is drawn only while the count is 0; while an overlay
 * shows Bower, every other bird holds its still pose. The still mark
 * (`BowerMark`) never counts.
 */

import { useSyncExternalStore } from 'preact/compat';

interface Presence {
  /** Birds on screen, overlay birds included. */
  count: number;
  /** Of those, the ones an overlay shows. */
  overlays: number;
}

let state: Presence = { count: 0, overlays: 0 };
const listeners = new Set<() => void>();

function set(next: Presence): void {
  state = next;
  for (const listener of [...listeners]) listener();
}

/** Registers one bird; returns its unregister (idempotent, never below 0). */
export function registerBird(overlay = false): () => void {
  set({
    count: state.count + 1,
    overlays: state.overlays + (overlay ? 1 : 0),
  });
  let done = false;
  return () => {
    if (done) return;
    done = true;
    set({
      count: Math.max(0, state.count - 1),
      overlays: Math.max(0, state.overlays - (overlay ? 1 : 0)),
    });
  };
}

/** Calls `listener` on every change; returns the unsubscribe. */
export function subscribeBirds(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function birdCount(): number {
  return state.count;
}

export function overlayBirdCount(): number {
  return state.overlays;
}

/** For tests: back to no birds, no listeners. */
export function resetBirdPresence(): void {
  listeners.clear();
  state = { count: 0, overlays: 0 };
}

/** How many birds are on screen (re-renders on change). */
export function useBirdCount(): number {
  return useSyncExternalStore(subscribeBirds, birdCount);
}

/** Whether an overlay shows Bower right now (re-renders on change). */
export function useOverlayBird(): boolean {
  return useSyncExternalStore(subscribeBirds, overlayBirdCount) > 0;
}

/** The perch is drawn only when no other bird is on screen. */
export function usePerchVisible(): boolean {
  return useBirdCount() === 0;
}
