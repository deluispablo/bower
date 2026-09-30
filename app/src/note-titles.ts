/**
 * Resolves `noteTitle` for a batch of files from the note cache only — no
 * network, ever (`app/src/cache.ts#loadNote`, IndexedDB). Pure aside from
 * the injected `loadNote`, so it is unit-tested with a stubbed cache
 * (`note-titles.test.ts`); `components/use-note-titles.ts` is the hook that
 * calls it from a component, with a memo and the immediate file-name
 * fallback.
 */

import type { DriveFile } from './drive.js';
import { FOLDER_MIME } from './drive.js';
import { displayName } from './navigation.js';
import { noteTitle } from './note-title.js';
import { fileKind } from './vault-index.js';

// --- One title per file (#905, R-API-7) ----------------------------------

/**
 * The titles resolved so far, keyed by `titleCacheKey`, shared by every
 * view in the tab: the list, the grid, the tree and search read the same
 * entry, so one file never shows two names at the same moment. Cleared when
 * a run completes (`cache.ts#invalidateOnRunComplete`), since a run may
 * rename or rewrite notes.
 */
const sharedTitles = new Map<string, string>();
const forgetListeners = new Set<() => void>();

/** Adds resolved titles (`resolveNoteTitles`' result) to the shared entry. */
export function rememberTitles(resolved: ReadonlyMap<string, string>): void {
  for (const [key, title] of resolved) sharedTitles.set(key, title);
}

/** Whether the shared entry already holds `file`'s title. */
export function hasSharedTitle(
  file: Pick<DriveFile, 'id' | 'modifiedTime'>,
): boolean {
  return sharedTitles.has(titleCacheKey(file));
}

/**
 * The one title of any item: a folder's display name, a note's resolved
 * title from the shared entry (its file-name fallback until resolved), a
 * file's name without its extension.
 */
export function titleFor(file: DriveFile): string {
  if (file.mimeType === FOLDER_MIME) return displayName(file.name);
  if (fileKind(file) === 'note') {
    return sharedTitles.get(titleCacheKey(file)) ?? noteTitle(file);
  }
  return displayName(file.name);
}

/** Drops every shared title and tells the listeners (views re-resolve). */
export function forgetTitles(): void {
  sharedTitles.clear();
  for (const listener of forgetListeners) listener();
}

/** Calls `listener` whenever the shared titles are forgotten; returns the
 * unsubscribe. */
export function onTitlesForgotten(listener: () => void): () => void {
  forgetListeners.add(listener);
  return () => {
    forgetListeners.delete(listener);
  };
}

/** A cached note's text and the `modifiedTime` it was fetched at
 * (`cache.ts#NoteCacheEntry`, narrowed to what this module reads). */
export interface CachedNoteText {
  text: string;
  modifiedTime: string;
}

/** `loadNote`'s own shape (`cache.ts`), taken as a parameter so this module
 * never imports IndexedDB itself and stays trivially stubbable in a test. */
export type LoadCachedNote = (
  id: string,
) => Promise<CachedNoteText | undefined>;

/**
 * A title is only valid for the exact `modifiedTime` it was resolved
 * against — a note edited since must fall back to its file name again
 * until the cache catches up. Keying on both means an edited note's stale
 * entry is simply never looked up again, rather than needing to be
 * invalidated.
 */
export function titleCacheKey(
  file: Pick<DriveFile, 'id' | 'modifiedTime'>,
): string {
  return `${file.id}:${file.modifiedTime ?? ''}`;
}

/**
 * `noteTitle` for every file in `files`, read from `loadNote`'s cache only:
 * a cache hit whose own `modifiedTime` matches the file's gives the real
 * frontmatter/heading title; a miss, a stale entry, or a rejected read
 * falls back to the file name (`noteTitle(file)`, no `text`). Keyed by
 * `titleCacheKey`, not file id, so the caller can merge this into a memo
 * that also tracks which id+modifiedTime pairs it already has.
 */
export async function resolveNoteTitles(
  files: readonly DriveFile[],
  loadNote: LoadCachedNote,
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  await Promise.all(
    files.map(async (file) => {
      const cached = await loadNote(file.id).catch(() => undefined);
      const text =
        cached !== undefined &&
        cached.modifiedTime === (file.modifiedTime ?? '')
          ? cached.text
          : undefined;
      resolved.set(titleCacheKey(file), noteTitle(file, text));
    }),
  );
  return resolved;
}
