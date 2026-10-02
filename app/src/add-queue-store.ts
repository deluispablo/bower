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

/** A file of a pile, as the pile store takes it (`attachToPile`). */
export interface PileHandOffItem {
  name: string;
  state: QueueStatus;
  fileId?: string;
}

/** Takes one file of a pile; a pile this session does not know is ignored. */
export type PileHandOff = (pileId: string, item: PileHandOffItem) => void;

/** Set by `pile-store.ts` when it loads. Registered rather than imported,
 * so this store stays free of Drive and loads first wherever it is used. */
let handOff: PileHandOff | null = null;

export function setPileHandOff(next: PileHandOff | null): void {
  handOff = next;
}

function handTo(pileId: string, item: PileHandOffItem): void {
  if (handOff === null || pileId === NO_PILE) return;
  handOff(pileId, item);
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
    handTo(row.pileId, {
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
      handTo(item.pileId, {
        name: item.name,
        state: item.state,
        ...(item.fileId === undefined ? {} : { fileId: item.fileId }),
      });
    }
  };
  sync();
  return uploads.subscribe(sync);
}

/** A file of a pile, as far as the pending count needs it. */
export interface PendingPileItem {
  name: string;
  state: QueueStatus;
}

/**
 * The one pending count of Add (R-CONF-2, D33, #998): what the inbox
 * listing already holds (`inboxTotal`, the number Home and the confirm
 * sheet read) plus the piles' files still on their way, which the listing
 * cannot hold yet: the open pile's above all. Add's "Tidy up <n> things"
 * and "Waiting for the tidy-up" both show it, so the open pile is never
 * left out. A landed file is the listing's to count (one missing from it
 * was already filed); a failed one never counts. `inboxNames` is the
 * listing's names directly in the inbox.
 */
export function pendingTotal(
  inboxTotal: number,
  inboxNames: ReadonlySet<string>,
  piles: readonly { items: readonly PendingPileItem[] }[],
): number {
  const extra = new Set<string>();
  for (const pile of piles) {
    for (const item of pile.items) {
      if (item.state !== 'waiting' && item.state !== 'uploading') continue;
      if (!inboxNames.has(item.name)) extra.add(item.name);
    }
  }
  return inboxTotal + extra.size;
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
