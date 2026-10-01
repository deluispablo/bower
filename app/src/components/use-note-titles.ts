/**
 * A `noteTitle` per file, filled in from the note cache (issue #306's
 * "Left out": Recent, Pinned, the tree and the folder list never load a
 * note's full text, only its Drive metadata). Every file starts at its own
 * file-name fallback — always available, so a row never shows nothing —
 * and gets its real frontmatter/heading title once `resolveNoteTitles`'
 * cache read answers, entirely from IndexedDB (`cache.ts#loadNote`): no
 * network call this hook could ever cause.
 *
 * Resolved titles are kept in a module-level memo keyed by
 * `titleCacheKey` (id + `modifiedTime`), so Home's Recent and Pinned
 * sections, the sidebar, the tree and a folder screen showing the same
 * note each read its cached text at most once, and an edited note (its
 * `modifiedTime` changed) is resolved again rather than shown stale.
 */

import { useEffect, useMemo, useState } from 'preact/hooks';

import { loadNote } from '../cache.js';
import type { DriveFile } from '../drive.js';
import { noteTitle } from '../note-title.js';
import { resolveNoteTitles, titleCacheKey } from '../note-titles.js';

/** Shared across every component instance and the lifetime of the tab —
 * same trade-off as `cache.ts`'s own IndexedDB store: unbounded, but
 * bounded in practice by how many distinct (id, modifiedTime) pairs a
 * session ever shows. */
const memo = new Map<string, string>();

/**
 * `titles.get(file.id)` for each of `files`: `noteTitle(file)` (the file
 * name) until a cache hit resolves, the real title from then on. Pass the
 * same files this render is about to show — a note not in `files` is
 * simply never resolved.
 */
export function useNoteTitles(
  files: readonly DriveFile[],
): ReadonlyMap<string, string> {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const pending = files.filter((file) => !memo.has(titleCacheKey(file)));
    if (pending.length === 0) return;
    let cancelled = false;
    void resolveNoteTitles(pending, loadNote).then((resolved) => {
      if (cancelled) return;
      for (const [key, title] of resolved) memo.set(key, title);
      forceUpdate((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [files]);

  const titles = new Map<string, string>();
  for (const file of files) {
    titles.set(file.id, memo.get(titleCacheKey(file)) ?? noteTitle(file));
  }
  return titles;
}

/**
 * The titles of the notes at `paths`, by path, from the same source as
 * every other list (`useNoteTitles`): Bower's answers on the run sheet and
 * Just filed read "What do I still need…?" as Home does, never their dated
 * file name. A path with no file in `files` is left out.
 */
export function useTitlesAt(
  paths: readonly string[],
  files: readonly DriveFile[],
): ReadonlyMap<string, string> {
  const key = paths.join('\n');
  const found = useMemo(
    () => files.filter((file) => paths.includes(file.path)),
    // `key` stands for `paths`, a new array on every render.
    [key, files],
  );
  const titles = useNoteTitles(found);
  return new Map(
    found.map((file) => [file.path, titles.get(file.id) ?? noteTitle(file)]),
  );
}
