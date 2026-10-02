/**
 * Whether the quick switcher (`components/switcher.tsx`, #142) is open, and
 * the query it should start with. A plain pub/sub store, not Preact
 * context: every opener — the Notes tab's search row, the desktop sidebar's
 * switcher button, `Ctrl/Cmd + K` in `app.tsx`, the `/search` route, and
 * later #143's Home pill — just calls `openSwitcher()` without needing to
 * sit inside any particular provider.
 */

import { useEffect, useState } from 'preact/hooks';

import { loadNote } from './cache.js';
import {
  createSearchIndex,
  persistSearchIndex,
  restoreSearchIndex,
  syncSearchIndex,
} from './search-index.js';
import type { SearchIndexHandle } from './search-index.js';
import type { VaultIndex } from './vault-index.js';

export interface SwitcherOpenState {
  open: boolean;
  /** The query the field starts with; cleared once the switcher opens. */
  initialQuery: string;
}

const CLOSED: SwitcherOpenState = { open: false, initialQuery: '' };

let state: SwitcherOpenState = CLOSED;
const listeners = new Set<(state: SwitcherOpenState) => void>();
/** What was typed before the field could take it (`typeAhead`). */
let typedAhead = '';
/** The open field's way in (`setTypeAheadSink`), once it is there. */
let typeInto: ((text: string) => void) | null = null;

function set(next: SwitcherOpenState): void {
  state = next;
  for (const listener of listeners) listener(state);
}

/** Opens the switcher, optionally prefilling the field (the `/search` route's `q`). */
export function openSwitcher(initialQuery = ''): void {
  typedAhead = '';
  set({ open: true, initialQuery });
}

export function closeSwitcher(): void {
  typedAhead = '';
  typeInto = null;
  set(CLOSED);
}

// --- Typing ahead of the field (#998) -----------------------------------------
//
// The panel loads on first use, so the first characters typed straight after
// Ctrl/Cmd+K arrive before its field exists, or before it has focus. While
// the switcher is open, `typeAhead` keeps what is typed with nothing focused
// and hands it to the field as soon as the field says where to put it.

/**
 * The open panel's field takes typed text through `sink` (and focus);
 * anything typed before it was there is handed over at once. `null` when
 * the field goes.
 */
export function setTypeAheadSink(sink: ((text: string) => void) | null): void {
  typeInto = sink;
  if (sink === null || typedAhead === '') return;
  const text = typedAhead;
  typedAhead = '';
  sink(text);
}

/**
 * A keydown while the switcher is open: a character typed outside any
 * field or dialog (the field not there yet, or not focused yet) goes to
 * the field, or waits for it. Anything else is left alone.
 */
export function typeAhead(event: KeyboardEvent): void {
  if (!state.open) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  // Keys for a field, or for anything in a dialog (the switcher's own
  // chips and rows), stay where they are; the page behind (its heading,
  // a link, nothing at all) is where they land while the field loads.
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable ||
      target.closest('[role="dialog"]') !== null)
  ) {
    return;
  }
  if (event.key.length === 1) {
    event.preventDefault();
    if (typeInto === null) typedAhead += event.key;
    else typeInto(event.key);
  } else if (event.key === 'Backspace' && typeInto === null) {
    event.preventDefault();
    typedAhead = typedAhead.slice(0, -1);
  }
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

// --- The search index (#593) ------------------------------------------------
//
// One index for the whole session, kept here rather than in the switcher so
// it outlives every open and close. It starts empty and is synced from the
// vault index synchronously (a match never waits on IndexedDB); the copy
// saved on this device is restored in the background, and the note text
// already in the cache is fed in after it.

let searchHandle: SearchIndexHandle = createSearchIndex();
const noteTexts = new Map<string, string>();
/** The `modifiedTime` each text in `noteTexts` was read at (#922). */
const textVersions = new Map<string, string>();
let restoreStarted = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

const PERSIST_DELAY_MS = 1500;

function schedulePersist(): void {
  if (persistTimer !== null) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistSearchIndex(searchHandle).catch((error: unknown) => {
      console.error('The search index could not be saved', error);
    });
  }, PERSIST_DELAY_MS);
}

/**
 * The session's search index, brought in step with `vault` and the note
 * text read so far. Cheap when nothing changed.
 */
export function syncedSearchIndex(vault: VaultIndex): SearchIndexHandle {
  const { updated, removed } = syncSearchIndex(searchHandle, vault, noteTexts);
  if (updated > 0 || removed > 0) schedulePersist();
  return searchHandle;
}

/**
 * Restores the copy saved on this device, once per session. Resolves to
 * `true` when it replaced the in-memory index (the caller syncs again and
 * re-renders); a missing or unreadable copy leaves the index as it is.
 */
export async function restoreSavedSearchIndex(): Promise<boolean> {
  if (restoreStarted) return false;
  restoreStarted = true;
  try {
    const restored = await restoreSearchIndex();
    if (restored === undefined) return false;
    searchHandle = restored;
    return true;
  } catch (error) {
    console.error('The saved search index could not be restored', error);
    return false;
  }
}

/**
 * Feeds the index the text of every note already in the cache (never the
 * network). Resolves to `true` when it learned text it did not have.
 */
export async function feedCachedNoteText(vault: VaultIndex): Promise<boolean> {
  // A note a run rewrote since its text was read is read again (#922).
  const missing = vault.notes.filter(
    (note) =>
      !noteTexts.has(note.id) ||
      textVersions.get(note.id) !== (note.modifiedTime ?? ''),
  );
  const read = await Promise.all(
    missing.map(async (note) => {
      const cached = await loadNote(note.id).catch(() => undefined);
      // Never text of a known older version (#922): it would title the hit
      // differently from every other list (R-API-7).
      return cached === undefined ||
        (cached.modifiedTime !== '' &&
          cached.modifiedTime !== (note.modifiedTime ?? ''))
        ? null
        : ([note.id, cached.text, note.modifiedTime ?? ''] as const);
    }),
  );
  let learned = false;
  for (const entry of read) {
    if (entry === null) continue;
    noteTexts.set(entry[0], entry[1]);
    textVersions.set(entry[0], entry[2]);
    learned = true;
  }
  return learned;
}

/** The text of `id` as the index knows it, for a snippet. */
export function knownNoteText(id: string): string | undefined {
  return noteTexts.get(id);
}

// --- Opened lately (#593, R-SEARCH-6) ---------------------------------------

const OPENED_KEY = 'bower.opened.recent';
const OPENED_MAX = 5;

/** The ids of the last notes and files opened on this device, newest first. */
export function loadOpened(): string[] {
  try {
    const raw = localStorage.getItem(OPENED_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    // Storage blocked or corrupt: nothing opened lately.
    return [];
  }
}

/** Forgets the opened list (sign-out and account deletion). Never throws. */
export function clearOpened(): void {
  try {
    localStorage.removeItem(OPENED_KEY);
  } catch {
    // Storage blocked: nothing to remove.
  }
}

/** Puts `id` first in the opened list, kept to the last five. */
export function recordOpened(id: string): void {
  try {
    const rest = loadOpened().filter((other) => other !== id);
    localStorage.setItem(
      OPENED_KEY,
      JSON.stringify([id, ...rest].slice(0, OPENED_MAX)),
    );
  } catch {
    // Storage full or blocked: the list just does not stick.
  }
}

// --- The page behind Search (#917, R-SE-5) ----------------------------------
//
// A tag on a note links to `/search?q=%23tag`. The route goes back to the
// page the person was on (the note) and opens Search over it, so closing
// Search returns to the note. `switcher-host.tsx` sees every location and
// records each page that is not `/search` itself.

let pageBehindSearch: string | null = null;

/** Remembers `path` as the last page shown; `/search` is never one. */
export function recordPage(path: string): void {
  if (path === '/search' || path.startsWith('/search?')) return;
  pageBehindSearch = path;
}

/** The last page shown before `/search`, or `null` on a fresh load there. */
export function lastPage(): string | null {
  return pageBehindSearch;
}
