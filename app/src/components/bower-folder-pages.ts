/**
 * The pages Bower wrote for a folder (K-31, #950): a same-name note like
 * `Moonee Ponds/Moonee Ponds.md` with `by: bower`. They are not one of a
 * folder's things, so every count of things (`navigation.ts#folderCount`)
 * leaves them out; only the notes' frontmatter tells them apart, so the
 * hooks here read it (the cache first, Drive once).
 */

import { useEffect, useMemo, useState } from 'preact/hooks';

import type { DriveFile } from '../drive.js';
import { folderPagesUnder, isFolderPage } from '../folder-view.js';
import { loadNoteMeta, peekNoteMeta } from '../note-meta.js';
import type { VaultIndex } from '../vault-index.js';

const NO_IDS: ReadonlySet<string> = new Set();

/**
 * Which of `pages` are a folder's own page Bower wrote (`isFolderPage`),
 * read from each note's frontmatter, so a count does not depend on which
 * notes happen to be cached: every such page at every depth is left out.
 */
export function useBowerFolderPages(
  pages: readonly DriveFile[],
): ReadonlySet<string> {
  // What this tab already read (#922): a count is never guessed.
  const [ids, setIds] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        pages
          .filter((page) => {
            const meta = peekNoteMeta(page);
            return meta !== undefined && isFolderPage(page, meta);
          })
          .map((page) => page.id),
      ),
  );
  const key = pages
    .map((page) => `${page.id}:${page.modifiedTime ?? ''}`)
    .join(',');
  useEffect(() => {
    if (pages.length === 0) {
      setIds((prev) => (prev.size === 0 ? prev : NO_IDS));
      return;
    }
    let cancelled = false;
    void Promise.all(
      pages.map((page) =>
        loadNoteMeta(page).then(
          (meta) => (isFolderPage(page, meta) ? page.id : null),
          (err: unknown) => {
            console.error("A folder's own page could not be read", err);
            return null;
          },
        ),
      ),
    ).then((found) => {
      if (cancelled) return;
      setIds(new Set(found.filter((id): id is string => id !== null)));
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return ids;
}

/**
 * The ids of the pages Bower wrote for each folder in `paths` and every
 * folder under them: the `exclude` of `folderCount` for those folders.
 */
export function useBowerPagesUnder(
  paths: readonly string[],
  index: VaultIndex | null,
): ReadonlySet<string> {
  const key = paths.join('\n');
  const pages = useMemo(
    () =>
      index === null
        ? []
        : paths.flatMap((path) =>
            folderPagesUnder(index.folders, index.byPath, path),
          ),
    // `paths` by value (`key`): callers rebuild the array every render.
    [key, index],
  );
  return useBowerFolderPages(pages);
}
