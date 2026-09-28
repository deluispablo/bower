/**
 * "New" per device (D16, R-JUST-3, #587): what the last tidy-up filed that
 * this device has not opened yet. The seen set lives in the `seen` store
 * (`cache.ts`) and never leaves the device: no Worker call. The last run's
 * report gives the candidates (`items[].to`); a report without `to` (an older
 * runner) yields no New, nothing is guessed from names. Screens read it
 * through `useNew` (`use-new.ts`).
 */

import { loadSeen, saveSeen } from './cache.js';
import type { RunItem } from './api.js';
import type { VaultIndex } from './vault-index.js';

/** The part of a run report New reads (`Run` and `LastRunOutcome` both fit). */
export interface RunWithItems {
  items?: RunItem[];
}

/**
 * Ids of the last run's processed items (`items[].to` looked up in the index)
 * minus the seen set. Items without `to`, or whose destination is not in the
 * index, are skipped.
 */
export function newIds(
  lastRun: RunWithItems | null | undefined,
  index: VaultIndex | null,
  seen: ReadonlySet<string>,
): Set<string> {
  const result = new Set<string>();
  if (!lastRun?.items || !index) return result;
  for (const item of lastRun.items) {
    if (!item.to) continue;
    const file = index.byPath.get(item.to);
    if (file && !seen.has(file.id)) result.add(file.id);
  }
  return result;
}

/**
 * How many of `newSet` sit under `folderPath` at any depth. An empty path is
 * the whole Bower folder.
 */
export function newCountIn(
  folderPath: string,
  newSet: ReadonlySet<string>,
  index: VaultIndex | null,
): number {
  if (!index || newSet.size === 0) return 0;
  const prefix = folderPath === '' ? '' : `${folderPath.replace(/\/+$/, '')}/`;
  let count = 0;
  for (const [path, file] of index.byPath) {
    if (newSet.has(file.id) && path.startsWith(prefix)) count += 1;
  }
  return count;
}

let seenSet: Set<string> = new Set();
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Loads the persisted seen set once; later calls share the same load. */
export function loadSeenSet(): Promise<void> {
  loaded ??= loadSeen().then((ids) => {
    // Anything marked while the load was in flight stays marked.
    for (const id of ids) seenSet.add(id);
    notify();
  });
  return loaded;
}

/** The seen set as it stands (a fresh copy). */
export function getSeen(): ReadonlySet<string> {
  return new Set(seenSet);
}

/** Whether `id` is in `newSet` and not opened on this device since. */
export function isNew(id: string, newSet: ReadonlySet<string>): boolean {
  return newSet.has(id) && !seenSet.has(id);
}

/** Marks one item opened on this device. */
export async function markSeen(id: string): Promise<void> {
  await markAllSeen([id]);
}

/** Marks several items opened on this device ("Mark all as seen"). */
export async function markAllSeen(ids: Iterable<string>): Promise<void> {
  await loadSeenSet();
  let changed = false;
  for (const id of ids) {
    if (!seenSet.has(id)) {
      seenSet.add(id);
      changed = true;
    }
  }
  if (!changed) return;
  notify();
  await saveSeen([...seenSet]);
}

/** Subscribes to seen-set changes; returns the unsubscribe function. */
export function subscribeSeen(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam: forget the in-memory set so the next load reads the store. */
export function resetSeenForTests(): void {
  seenSet = new Set();
  loaded = null;
  listeners.clear();
}
