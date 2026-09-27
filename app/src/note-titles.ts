/**
 * Resolves `noteTitle` for a batch of files from the note cache only — no
 * network, ever (`app/src/cache.ts#loadNote`, IndexedDB). Pure aside from
 * the injected `loadNote`, so it is unit-tested with a stubbed cache
 * (`note-titles.test.ts`); `components/use-note-titles.ts` is the hook that
 * calls it from a component, with a memo and the immediate file-name
 * fallback.
 */

import type { DriveFile } from './drive.js';
import { noteTitle } from './note-title.js';

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
