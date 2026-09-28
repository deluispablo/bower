/**
 * `useNew` (#587): what is new to this device, for every screen that shows
 * the "New" tag. Reads the last finished run (`useRun`), the vault index and
 * the per-device seen set (`seen.ts`), and re-renders when any of them
 * changes.
 */

import { useEffect, useMemo, useState } from 'preact/hooks';

import {
  getSeen,
  isNew as isNewIn,
  loadSeenSet,
  markAllSeen,
  markSeen,
  newCountIn as newCountInFolder,
  newIds,
  subscribeSeen,
} from './seen.js';
import { useRun } from './run-store.js';
import { useVault } from './vault-store.js';

export interface NewState {
  /** Ids new to this device: the last run's filed items not yet opened. */
  ids: ReadonlySet<string>;
  isNew(id: string): boolean;
  /** New items under a folder (`/`-joined path), at any depth. */
  newCountIn(folderPath: string): number;
  markSeen(id: string): Promise<void>;
  markAllSeen(ids: Iterable<string>): Promise<void>;
}

export function useNew(): NewState {
  const { lastFinished } = useRun();
  const { index } = useVault();
  const [seen, setSeen] = useState<ReadonlySet<string>>(getSeen);

  useEffect(() => {
    const unsubscribe = subscribeSeen(() => setSeen(getSeen()));
    void loadSeenSet();
    return unsubscribe;
  }, []);

  const ids = useMemo(
    () => newIds(lastFinished, index, seen),
    [lastFinished, index, seen],
  );

  return {
    ids,
    isNew: (id) => isNewIn(id, ids),
    newCountIn: (folderPath) => newCountInFolder(folderPath, ids, index),
    markSeen,
    markAllSeen,
  };
}
