/**
 * The folder's summary for the header's meta line (K-31, R-PF-2): its one
 * count (`folderCount`), its lifecycle and when it last changed. Computed
 * at the route from the folder's own data, so the meta reads the same
 * whichever tab (List or Compare) shows first (#920). The list body
 * (`folder-items.tsx`) builds its rows from the same hooks.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { parseCatalogueFiles } from '../companion.js';
import type { DriveFile } from '../drive.js';
import type { Origin } from '../file-origin.js';
import { CATALOGUE_PATH } from '../file-origin.js';
import { buildFolderModel, folderCount, isFolderPage } from '../folder-view.js';
import type { FolderModel } from '../folder-view.js';
import type { FolderContents } from '../navigation.js';
import { loadNoteMeta } from '../note-meta.js';
import type { NoteMeta } from '../note-meta.js';
import { useVault } from '../vault-store.js';

/** How many notes' frontmatter is read at once. */
const META_BATCH = 8;

const NO_FILES: ReadonlyMap<string, DriveFile> = new Map();

function versionKey(notes: readonly DriveFile[]): string {
  return notes.map((note) => `${note.id}:${note.modifiedTime ?? ''}`).join('|');
}

/** The frontmatter of the folder's notes, read lazily a few at a time: rows
 * render first and their kinds follow. */
export function useNoteMetas(
  notes: readonly DriveFile[],
): ReadonlyMap<string, NoteMeta> {
  const [metas, setMetas] = useState<ReadonlyMap<string, NoteMeta>>(
    () => new Map(),
  );
  const key = versionKey(notes);
  const latest = useRef(notes);
  latest.current = notes;

  useEffect(() => {
    let cancelled = false;
    const read = new Map<string, NoteMeta>();
    void (async () => {
      const all = latest.current;
      for (let at = 0; at < all.length && !cancelled; at += META_BATCH) {
        await Promise.all(
          all.slice(at, at + META_BATCH).map(async (note) => {
            try {
              read.set(note.id, await loadNoteMeta(note));
            } catch (err) {
              console.error(err);
            }
          }),
        );
        if (!cancelled) setMetas(new Map(read));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return metas;
}

/** `index.md`'s file-to-note rows (`parseCatalogueFiles`), for pairing. */
export function useCatalogueFiles(
  catalogue: DriveFile | undefined,
  getNoteText: (id: string) => Promise<string>,
): ReadonlyMap<string, string> {
  const [files, setFiles] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const id = catalogue?.id;
  const version = catalogue?.modifiedTime;

  useEffect(() => {
    if (id === undefined) {
      setFiles(new Map());
      return;
    }
    let cancelled = false;
    getNoteText(id).then(
      (text) => {
        if (!cancelled) setFiles(parseCatalogueFiles(text));
      },
      (err: unknown) => {
        console.error(err);
        if (!cancelled) setFiles(new Map());
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, version, getNoteText]);

  return files;
}

/** What the route's header reads (K-31). */
export interface FolderSummary {
  /** The meta line's count: things, or for a folder of folders, folders. */
  count: number;
  unit: 'thing' | 'folder';
  /** The folder's lifecycle from its own note's `status` ("Active"). */
  lifecycle?: string;
  /** The newest change in the folder, ISO. */
  updated?: string;
}

/** A folder's lifecycle (AR-Sub: "Areas · Active · 2 things"): the `status`
 * of the note named after the folder, capitalised. */
export function lifecycleOf(
  contents: Pick<FolderContents, 'name' | 'notes'>,
  metas: ReadonlyMap<string, NoteMeta>,
): string | undefined {
  const own = contents.notes.find(
    (note) => note.name === `${contents.name}.md`,
  );
  const meta = own === undefined ? undefined : metas.get(own.id);
  // The person's own note about the folder says its lifecycle; a page Bower
  // keeps for a project (`isFolderPage`) does not (PF-Main: no "Active").
  if (own === undefined || isFolderPage(own, meta)) return undefined;
  const status = meta?.fields.status;
  if (typeof status !== 'string' || status.trim() === '') return undefined;
  const word = status.trim();
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}

/** The newest of the folder's own things and its subfolders, ISO. */
export function folderUpdated(contents: FolderContents): string | undefined {
  let newest: string | undefined;
  const take = (iso: string | undefined): void => {
    if (
      iso !== undefined &&
      iso !== '' &&
      (newest === undefined || iso > newest)
    ) {
      newest = iso;
    }
  };
  for (const item of contents.items) take(item.modifiedTime);
  for (const folder of contents.subfolders) take(folder.updated);
  return newest;
}

/** The folder's model (rows by origin, pairs) and the notes' frontmatter. */
export function useFolderModel(
  contents: FolderContents,
  catalogue: ReadonlyMap<string, Origin>,
): { model: FolderModel; metas: ReadonlyMap<string, NoteMeta> } {
  const { index, getNoteText } = useVault();
  const byPath = index?.byPath ?? NO_FILES;
  const metas = useNoteMetas(contents.notes);
  const catalogueFiles = useCatalogueFiles(
    byPath.get(CATALOGUE_PATH),
    getNoteText,
  );
  const model = useMemo(
    () =>
      buildFolderModel({
        items: contents.items,
        byPath,
        metas,
        origins: catalogue,
        catalogueFiles,
      }),
    [contents.items, byPath, metas, catalogue, catalogueFiles],
  );
  return { model, metas };
}

/** The meta line's summary, from the folder's data alone (K-31): the same
 * `folderCount` as List's segments, whatever the page shows. */
export function useFolderSummary(
  contents: FolderContents,
  catalogue: ReadonlyMap<string, Origin>,
  folderOfFolders: boolean,
): FolderSummary {
  const { model, metas } = useFolderModel(contents, catalogue);
  // K-31: subfolders count as originals, except on a folder of folders,
  // whose cards are not its own things (AR-Main: "Originals 0").
  const summary: FolderSummary = folderOfFolders
    ? { count: contents.subfolders.length, unit: 'folder' }
    : {
        count: folderCount({
          subfolders: contents.subfolders.length,
          model,
        }),
        unit: 'thing',
      };
  const lifecycle = lifecycleOf(contents, metas);
  const updated = folderUpdated(contents);
  if (lifecycle !== undefined) summary.lifecycle = lifecycle;
  if (updated !== undefined) summary.updated = updated;
  return summary;
}
