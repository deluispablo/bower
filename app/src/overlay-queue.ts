/**
 * The overlay queue (R-OVL-1, spec §5 and D4): one modal at a time. Every
 * overlay asks this store to open; the first one shows, later ones wait
 * here and show, one by one, as the one in front closes.
 *
 * Priority follows the System-Overlays board, lower numbers first:
 *   1. the person's own overlays (menus, dialogs they opened);
 *   2. Is that everything? and the tidy-up sheet;
 *   3. the tour;
 *   4. hints and toasts, which never go over an overlay.
 *
 * Nothing is ever pushed aside: priority only orders the waiting line, so
 * an overlay the person is reading stays until it closes. Entries with the
 * same priority keep their arrival order. The same `id` is never held
 * twice, so an overlay asked for again while it waits (or while it shows)
 * shows once. Same plain pub/sub pattern as `toast-store.ts`; the host
 * that renders the entry in front is `OverlayHost` in
 * `components/overlay.tsx`.
 */

import type { ComponentChild } from 'preact';

export type OverlayPriority = 1 | 2 | 3 | 4;

/** Named priorities, so callers say what they are rather than a number. */
export const OVERLAY_PRIORITY = {
  own: 1,
  run: 2,
  tour: 3,
  hint: 4,
} as const satisfies Record<string, OverlayPriority>;

export interface OverlayEntry {
  /** Stable key: the same id asked for twice is one overlay. */
  id: string;
  priority: OverlayPriority;
  /** Renders the overlay (usually an `<Overlay>`) when it is in front. */
  render: () => ComponentChild;
}

export type OpenResult = 'shown' | 'queued';

let front: OverlayEntry | null = null;
let waiting: OverlayEntry[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of Array.from(listeners)) listener();
}

/** Inserts `entry` after every waiting entry of the same or higher priority. */
function enqueue(entry: OverlayEntry): void {
  const at = waiting.findIndex((other) => other.priority > entry.priority);
  if (at === -1) waiting.push(entry);
  else waiting.splice(at, 0, entry);
}

/**
 * Asks for `entry` to show. It shows now when nothing else does, and waits
 * otherwise. An id already in front answers `'shown'`, one already waiting
 * answers `'queued'`; neither is added again.
 */
export function open(entry: OverlayEntry): OpenResult {
  if (front?.id === entry.id) return 'shown';
  if (waiting.some((other) => other.id === entry.id)) return 'queued';
  if (front === null) {
    front = entry;
    notify();
    return 'shown';
  }
  enqueue(entry);
  notify();
  return 'queued';
}

/**
 * Closes the overlay `id`: in front, the next waiting one takes its place;
 * waiting, it leaves the line without ever showing. An unknown id does
 * nothing.
 */
export function close(id: string): void {
  if (front?.id === id) {
    front = waiting.shift() ?? null;
    notify();
    return;
  }
  const before = waiting.length;
  waiting = waiting.filter((entry) => entry.id !== id);
  if (waiting.length !== before) notify();
}

/** The overlay in front, or `null` when none is open. */
export function currentOverlay(): OverlayEntry | null {
  return front;
}

/** The waiting line, next first. */
export function queuedOverlays(): readonly OverlayEntry[] {
  return waiting;
}

/** Whether any overlay is open (hints and prompts wait while one is). */
export function isOverlayOpen(): boolean {
  return front !== null;
}

/** Calls `listener` after every change; returns the unsubscribe. */
export function subscribeOverlays(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Empties the store. Tests only. */
export function resetOverlayQueue(): void {
  front = null;
  waiting = [];
  listeners.clear();
}
