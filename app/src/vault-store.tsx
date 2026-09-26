/**
 * Vault state: the file index and note text, cached in IndexedDB and kept
 * fresh with stale-while-revalidate. On mount the cached index (if any)
 * renders immediately, then `listVault` runs in the background; the state
 * only changes if the fresh listing actually differs (`sameListing`), so an
 * unchanged vault never flashes.
 *
 * Plain Preact context + hook, same shape as `session.tsx`. `VaultProvider`
 * is mounted once in `app.tsx`, above the router, so every route — the
 * tree (`layout.tsx`), Home, the note view, and the `RunProvider` it wraps
 * (#37) — shares one instance and one cache.
 */

import { createContext } from 'preact';
import type { ComponentChildren } from 'preact';
import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'preact/hooks';

import { ApiError } from './api.js';
import {
  invalidateIndex as invalidateIndexCache,
  loadIndex,
  loadNote,
  saveIndex,
  saveNote,
} from './cache.js';
import {
  appendToFile,
  DriveError,
  getText,
  listVault,
  readNoteForEdit,
  saveNoteText,
} from './drive.js';
import type { DriveFile, SaveOptions } from './drive.js';
import { useSession } from './session.js';
import { buildVaultIndex } from './vault-index.js';
import type { VaultIndex } from './vault-index.js';

export type VaultStatus =
  'idle' | 'loading' | 'refreshing' | 'offline' | 'error';

export interface VaultState {
  index: VaultIndex | null;
  files: DriveFile[];
  /** ISO timestamp of the index currently shown, or `null` before the first load. */
  fetchedAt: string | null;
  status: VaultStatus;
  error?: string;
}

export interface Vault extends VaultState {
  refresh: () => Promise<void>;
  getNoteText: (id: string) => Promise<string>;
  /**
   * Appends `text` to a note in Drive as its own paragraph and updates the
   * cached note text and listing, resolving to the note's new full text.
   */
  appendToNote: (id: string, text: string) => Promise<string>;
  /**
   * A note's current text from Drive plus the `modifiedTime` an edit is
   * saved against. Offline it falls back to the text on this device with
   * `modifiedTime: null` (unknown), so a later save always asks the user.
   * Also used for "take theirs" after a conflict.
   */
  openNoteForEdit: (id: string) => Promise<EditableNote>;
  /**
   * Saves an edited note's whole text (`saveNoteText`, which throws
   * `SaveError('conflict')` when the note changed) and updates the cached
   * note text and listing, resolving to the saved text.
   */
  saveEditedNote: (
    id: string,
    text: string,
    options: SaveOptions,
  ) => Promise<EditableNote>;
}

export interface EditableNote {
  text: string;
  /** Baseline for the next save; `null` when unknown (opened offline). */
  modifiedTime: string | null;
}

/** A note that has never been fetched, offline, with nothing cached to show. */
export class OfflineError extends Error {
  constructor(
    message = 'This note has not been saved for offline reading yet.',
  ) {
    super(message);
    this.name = 'OfflineError';
  }
}

interface ListingEntry {
  id: string;
  modifiedTime?: string;
}

/**
 * Whether two listings are the same vault, file for file (id and
 * `modifiedTime`; both come pre-sorted by path from `listVault`, so an
 * unchanged vault always compares equal in order).
 */
export function sameListing(a: ListingEntry[], b: ListingEntry[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (file, i) =>
      file.id === b[i]?.id && file.modifiedTime === b[i]?.modifiedTime,
  );
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * A short "Updated …" indicator. Anything past 24 h just says "yesterday":
 * the app expects a refresh long before that matters.
 */
export function formatAgo(fetchedAt: string, now: number | Date): string {
  const nowMs = now instanceof Date ? now.getTime() : now;
  const diffMs = Math.max(0, nowMs - Date.parse(fetchedAt));
  if (diffMs < MINUTE_MS) return 'just now';
  if (diffMs < HOUR_MS) return `${Math.floor(diffMs / MINUTE_MS)} min ago`;
  if (diffMs < DAY_MS) return `${Math.floor(diffMs / HOUR_MS)} h ago`;
  return 'yesterday';
}

/** A failed fetch whose only reasonable explanation is "no network". */
function isNetworkFailure(err: unknown): boolean {
  return (
    (err instanceof DriveError || err instanceof ApiError) && err.status === 0
  );
}

/** The listed file for note `id`; a note missing from the index is a bug. */
function noteFile(state: VaultState, id: string): DriveFile {
  const file = state.index?.byId.get(id);
  if (file === undefined) throw new Error('Note not in the index.');
  return file;
}

const VaultContext = createContext<Vault | undefined>(undefined);

interface VaultProviderProps {
  children: ComponentChildren;
}

export function VaultProvider({ children }: VaultProviderProps) {
  const { me } = useSession();
  const folderId = me?.vault?.folderId ?? null;

  const [state, setState] = useState<VaultState>({
    index: null,
    files: [],
    fetchedAt: null,
    status: folderId === null ? 'idle' : 'loading',
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  const load = useCallback(
    async (mode: 'initial' | 'refresh'): Promise<void> => {
      if (folderId === null) return;
      const cachedFiles = stateRef.current.files;
      const hadIndex = stateRef.current.index !== null;
      if (mode === 'refresh') {
        setState((prev) => ({ ...prev, status: 'refreshing' }));
      }
      try {
        const fresh = await listVault(folderId);
        if (hadIndex && sameListing(cachedFiles, fresh)) {
          // Identical to what's already shown: leave the state alone (no flash).
          setState((prev) => ({ ...prev, status: 'idle', error: undefined }));
          return;
        }
        const fetchedAt = new Date().toISOString();
        await saveIndex(fresh, fetchedAt);
        setState({
          index: buildVaultIndex(fresh),
          files: fresh,
          fetchedAt,
          status: 'idle',
        });
      } catch (err) {
        console.error(err);
        const offline =
          isNetworkFailure(err) && stateRef.current.index !== null;
        setState((prev) => ({
          ...prev,
          status: offline ? 'offline' : 'error',
          error: offline ? undefined : 'Could not load your notes.',
        }));
      }
    },
    [folderId],
  );

  useEffect(() => {
    if (folderId === null) {
      // Either not onboarded yet, or signed out: `me` (and so `folderId`)
      // goes back to `undefined`/`null` the moment `session.tsx` sets
      // `status: 'signed-out'`, on sign-out, delete-account and a 401 for
      // a session that was previously signed in. Reacting to that here —
      // rather than a separate explicit reset call — is the seam that
      // needs no wiring from `forget.ts` itself: the in-memory index and
      // note text are dropped as an ordinary consequence of `me` becoming
      // unavailable, the same way this effect already resets state for a
      // signed-in user with no vault yet.
      setState({ index: null, files: [], fetchedAt: null, status: 'idle' });
      return;
    }
    let cancelled = false;
    loadIndex()
      .then((cached) => {
        if (cancelled || cached === undefined) return;
        setState({
          index: buildVaultIndex(cached.files),
          files: cached.files,
          fetchedAt: cached.fetchedAt,
          status: 'idle',
        });
      })
      .catch((err: unknown) => {
        console.error(err);
      })
      .finally(() => {
        if (!cancelled) void load('initial');
      });
    return () => {
      cancelled = true;
    };
  }, [folderId, load]);

  const refresh = useCallback((): Promise<void> => load('refresh'), [load]);

  const getNoteText = useCallback(async (id: string): Promise<string> => {
    const file = stateRef.current.index?.byId.get(id);
    const cached = await loadNote(id);
    if (
      cached !== undefined &&
      file?.modifiedTime !== undefined &&
      cached.modifiedTime === file.modifiedTime
    ) {
      return cached.text;
    }
    try {
      const text = await getText(id);
      await saveNote(
        id,
        text,
        file?.modifiedTime ?? '',
        new Date().toISOString(),
      );
      return text;
    } catch (err) {
      if (cached !== undefined) return cached.text;
      if (isNetworkFailure(err)) throw new OfflineError();
      throw err;
    }
  }, []);

  /**
   * Caches `text` as note `id` under its new `modifiedTime` and patches that
   * one file in the listing, so the note view shows it at once without
   * walking the whole Bower folder again. Cache failures are logged only.
   */
  const recordNote = useCallback(
    async (
      id: string,
      text: string,
      saved: { modifiedTime?: string; size?: number },
    ): Promise<void> => {
      const modifiedTime = saved.modifiedTime ?? '';
      const now = new Date().toISOString();
      try {
        await saveNote(id, text, modifiedTime, now);
      } catch (err) {
        console.error(err);
      }
      const files = stateRef.current.files.map((f) =>
        f.id === id
          ? {
              ...f,
              ...(modifiedTime !== '' ? { modifiedTime } : {}),
              ...(saved.size !== undefined ? { size: saved.size } : {}),
            }
          : f,
      );
      const fetchedAt = stateRef.current.fetchedAt ?? now;
      setState((prev) => ({
        ...prev,
        files,
        index: buildVaultIndex(files),
      }));
      try {
        await saveIndex(files, fetchedAt);
      } catch (err) {
        console.error(err);
      }
    },
    [],
  );

  const appendToNote = useCallback(
    async (id: string, text: string): Promise<string> => {
      const result = await appendToFile(noteFile(stateRef.current, id), text);
      await recordNote(id, result.text, result.file);
      return result.text;
    },
    [recordNote],
  );

  const openNoteForEdit = useCallback(
    async (id: string): Promise<EditableNote> => {
      try {
        const fresh = await readNoteForEdit(id);
        await recordNote(id, fresh.text, { modifiedTime: fresh.modifiedTime });
        return fresh;
      } catch (err) {
        if (!isNetworkFailure(err)) throw err;
        return { text: await getNoteText(id), modifiedTime: null };
      }
    },
    [recordNote, getNoteText],
  );

  const saveEditedNote = useCallback(
    async (
      id: string,
      text: string,
      options: SaveOptions,
    ): Promise<EditableNote> => {
      const result = await saveNoteText(
        noteFile(stateRef.current, id),
        text,
        options,
      );
      await recordNote(id, result.text, result.file);
      return {
        text: result.text,
        modifiedTime: result.file.modifiedTime ?? null,
      };
    },
    [recordNote],
  );

  const value: Vault = {
    ...state,
    refresh,
    getNoteText,
    appendToNote,
    openNoteForEdit,
    saveEditedNote,
  };

  return (
    <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
  );
}

export function useVault(): Vault {
  const ctx = useContext(VaultContext);
  if (ctx === undefined) {
    throw new Error('useVault must be used within a VaultProvider');
  }
  return ctx;
}

/**
 * Call once a run reports `done` (#37): the vault content may have changed
 * underneath, so drop the cached index. `run-store.tsx` calls this and then
 * `refresh()` from `useVault()` to update the mounted provider right away.
 */
export async function invalidateAfterRun(): Promise<void> {
  await invalidateIndexCache();
}
