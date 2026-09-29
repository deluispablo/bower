/**
 * Add's queue, kept outside `routes/add.tsx` so it survives navigating
 * away and back within the same session (#334, issue 21.2): Home, then
 * Add again, must still show the rows from before, not an empty screen.
 * Same plain pub/sub pattern as `toast-store.ts`. The module-level
 * `queue` array is the single source of truth — `routes/add.tsx` no
 * longer keeps its own ref copy of it (the #289 workaround this used to
 * need); `getQueue()` always reads the value current as of the last
 * `setQueue()`, synchronously, which is what that workaround was for.
 */

import { useEffect, useState } from 'preact/hooks';

import { attachToPile, getPiles } from './pile-store.js';
import type { UploadQueue } from './upload-queue.js';

export type QueueStatus = 'waiting' | 'uploading' | 'done' | 'failed';

export interface QueueItem {
  id: string;
  /** A picked/dropped/shared file, a pasted link's note, or a file picked
   * in the user's Drive and copied into the inbox. */
  kind: 'file' | 'link' | 'drive';
  /** Set for `kind: 'file'`. */
  file?: File;
  /** The original's Drive id, set for `kind: 'drive'`. */
  driveId?: string;
  /** The original's MIME type, set for `kind: 'drive'`: decides whether it
   * is copied as it is or exported first (`exportPlanFor`, #218). */
  driveMimeType?: string;
  /** The pasted URL, kept for `kind: 'link'` so a failed save can retry. */
  url?: string;
  /** Possibly renamed to stay unique in the inbox. */
  name: string;
  status: QueueStatus;
  /** 0–100; always 100 once `done` (a link note has no progress of its own). */
  progress: number;
  error?: string;
  /** The pile the row joined (`pile-store.ts`, R-PILE-1), when it did. */
  pileId?: string;
  /** Drive's id once the row is in the inbox, when known. */
  fileId?: string;
}

/** The upload queue's pile id for a row that joined no pile. */
export const NO_PILE = 'inbox';

/** The pile id a row is handed to the upload queue with (`AddUpload`). */
export function uploadPileId(item: Pick<QueueItem, 'pileId'>): string {
  return item.pileId ?? NO_PILE;
}

/**
 * Hands each row that joined a pile to the pile store: its first attach
 * writes the pile's note, and each row that lands rewrites it (R-PILE-1).
 * Rows that leave the queue stay in their pile: only the pile's own
 * remove takes a file out of it.
 */
function handToPiles(rows: readonly QueueItem[]): void {
  for (const row of rows) {
    if (row.pileId === undefined) continue;
    void attachToPile(row.pileId, {
      name: row.name,
      state: row.status,
      ...(row.fileId === undefined ? {} : { fileId: row.fileId }),
    });
  }
}

/**
 * Follows the durable upload queue (`upload-queue.ts`) for files of a pile
 * of this session, so a file that lands there rewrites its pile's note even
 * when Add is not open. Returns the unsubscribe.
 */
export function followUploads(
  uploads: Pick<UploadQueue, 'items' | 'subscribe'>,
): () => void {
  const sync = (): void => {
    for (const item of uploads.items()) {
      if (item.pileId === NO_PILE) continue;
      if (!getPiles().some((pile) => pile.id === item.pileId)) continue;
      void attachToPile(item.pileId, {
        name: item.name,
        state: item.state,
        ...(item.fileId === undefined ? {} : { fileId: item.fileId }),
      });
    }
  };
  sync();
  return uploads.subscribe(sync);
}

let queue: QueueItem[] = [];
const listeners = new Set<(queue: QueueItem[]) => void>();

/** The queue as of the last `setQueue()`, read synchronously — the same
 * value every subscriber was just handed, and every subscriber will be
 * handed next. */
export function getQueue(): QueueItem[] {
  return queue;
}

export function setQueue(next: QueueItem[]): void {
  queue = next;
  for (const listener of listeners) listener(queue);
  handToPiles(next);
}

/** The run key (`runKey`, `run-store.tsx`) of the last finished run this
 * queue has already caught up with. Module-level like `queue` itself, so
 * a remount (Add left, then opened again) does not re-clear a batch added
 * after that run — only a run whose key is actually new does anything. */
let syncedRunKey: string | null = null;

/**
 * Called with the key of a run Add just saw finish `done` (#493): drops
 * the rows already filed (`status: 'done'`, i.e. copied into the inbox
 * before the run started) since the tidy-up just moved them out of it,
 * leaving anything still `waiting` or `failed` — never part of that run —
 * untouched. A no-op once this key was already synced. Returns whether it
 * actually dropped anything, so the caller knows whether to also retire
 * the "Added to your inbox." message.
 */
export function clearFiledAfterRun(key: string): boolean {
  if (key === syncedRunKey) return false;
  syncedRunKey = key;
  const remaining = queue.filter((item) => item.status !== 'done');
  if (remaining.length === queue.length) return false;
  setQueue(remaining);
  return true;
}

/** The queue; re-renders the subscriber when it changes, including from
 * a batch started before this mount (Add left, then opened again). */
export function useAddQueue(): QueueItem[] {
  const [value, setValue] = useState(queue);
  useEffect(() => {
    listeners.add(setValue);
    // Catch up with a change made between the first render and this effect.
    setValue(queue);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}
