/**
 * Home's Pinned section (#913, spec §4.2, boards HM-Main and HM-Edit): the
 * pinned cards above Recent. Each card is the item's FileIcon (a folder is
 * the folder outline in its root's colour, no letter: HM-3), its full name
 * (it wraps, never "Housing Searc…") and its meta line ("Projects · 14
 * things", K-30). At most 8 show; past that, "All pinned" opens the quick
 * switcher with `pinned:`. Edit turns the cards full width, each with a
 * remove button "Unpin <name>", and the link reads "Done" (HM-Edit); a card
 * that was just unpinned holds the bird mark for two seconds before it
 * drops out. Nothing pinned: S-HM-16.
 *
 * `items` is `vault-store.tsx#pinned(index)`, already newest-pin-first;
 * `noteCounts` is `navigation.ts#folderCounts(index)`, for a pinned
 * folder's own count.
 */

import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

import { FOLDER_MIME } from '../drive.js';
import type { DriveFile } from '../drive.js';
import { metaLine } from '../meta-line.js';
import { folderHref, folderOf, paraKindOf } from '../navigation.js';
import { noteTitle } from '../note-title.js';
import { openSwitcher } from '../switcher-store.js';
import type { PinnedItem } from '../vault-store.js';
import { fileTitle } from '../vault-index.js';
import { BowerMark } from './bird.js';
import { FileIcon } from './file-icon.js';
import type { FileIconItem } from './file-icon.js';
import { IconClose } from './icons.js';
import { useBowerNotes } from './tree.js';
import type { BowerNotes } from './tree.js';
import { useNoteTitles } from './use-note-titles.js';
import '../styles/pinned-section.css';

const UNPINNED_SHOWN_MS = 2000;
const TILE_LIMIT = 8;

/** S-HM-16: the Pinned section with nothing pinned. */
export const PINNED_EMPTY = 'Pin a folder from its ⋯ to keep it here.';

interface Tile {
  key: string;
  href: string;
  name: string;
  meta: string;
  icon: FileIconItem;
  unpin: () => Promise<void>;
}

/** The last segment of a path. */
function lastName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** "Bower note · Applications": a pinned note or file's kind and folder. */
function thingMeta(file: DriveFile, bower?: BowerNotes): string {
  const parent = folderOf(file.path);
  return metaLine(
    {
      name: file.name,
      mimeType: file.mimeType,
      bowerWritten: bower?.written.has(file.id) === true,
      answer: bower?.answers.has(file.id) === true,
      ...(parent !== '' && { parentName: lastName(parent) }),
    },
    { view: 'mixed-row', now: Date.now() },
  ).text;
}

/** "Projects · 14 things" (R-HM-3, K-30): the folder's root and count. */
export function folderMeta(path: string, count: number): string {
  const top = path.split('/')[0] ?? '';
  return metaLine(
    {
      name: lastName(path),
      mimeType: FOLDER_MIME,
      ...(path.includes('/') && { rootName: top }),
      root: paraKindOf(top),
      count,
    },
    { view: 'title', now: Date.now() },
  ).text;
}

function tileFor(
  item: PinnedItem,
  noteCounts: ReadonlyMap<string, number>,
  titles: ReadonlyMap<string, string>,
  bower: BowerNotes,
  onUnpinNote: (id: string) => Promise<void>,
  onUnpinFolder: (path: string) => Promise<void>,
  onUnpinFile: (id: string) => Promise<void>,
): Tile {
  if (item.kind === 'note') {
    const folder = folderOf(item.file.path);
    // A folder's own page (`Moonee Ponds/Moonee Ponds.md`, K-31) pinned
    // stands for its folder: the folder card, "Projects · 14 things".
    if (folder !== '' && item.file.name === `${lastName(folder)}.md`) {
      return {
        ...folderTile(folder, noteCounts),
        key: item.file.id,
        unpin: () => onUnpinNote(item.file.id),
      };
    }
    return {
      key: item.file.id,
      href: `/note/${item.file.id}`,
      name: titles.get(item.file.id) ?? noteTitle(item.file),
      meta: thingMeta(item.file, bower),
      icon: item.file,
      unpin: () => onUnpinNote(item.file.id),
    };
  }
  if (item.kind === 'file') {
    return {
      key: item.file.id,
      href: `/file/${item.file.id}`,
      name: fileTitle(item.file.name),
      meta: thingMeta(item.file, bower),
      icon: item.file,
      unpin: () => onUnpinFile(item.file.id),
    };
  }
  return {
    ...folderTile(item.path, noteCounts),
    unpin: () => onUnpinFolder(item.path),
  };
}

function folderTile(
  path: string,
  noteCounts: ReadonlyMap<string, number>,
): Omit<Tile, 'unpin'> {
  const name = lastName(path);
  return {
    key: path,
    href: folderHref(path),
    name,
    meta: folderMeta(path, noteCounts.get(path) ?? 0),
    // The folder outline in its root's colour, a root itself included (no
    // letter disc on a pinned card, HM-3): the trailing "/" says "not a
    // top folder" to FileIcon.
    icon: {
      name,
      mimeType: FOLDER_MIME,
      root: paraKindOf(path.split('/')[0] ?? ''),
      path: `${path}/`,
    },
  };
}

export interface PinnedSectionProps {
  items: readonly PinnedItem[];
  noteCounts: ReadonlyMap<string, number>;
  onUnpinNote: (id: string) => Promise<void>;
  onUnpinFolder: (path: string) => Promise<void>;
  onUnpinFile: (id: string) => Promise<void>;
  /** Runs an unpin through the shared toast (`pin-action.ts`); resolves to
   * whether it succeeded. Injected so this stays free of the toast import
   * and easy to mount in a smoke test with a plain fixture. */
  runUnpin: (unpin: () => Promise<void>) => Promise<boolean>;
  /**
   * Edit mode, when the screen needs to know about it too (Home hides
   * Recent while pins are edited, and its ⋯ has "Edit pinned"). Left out,
   * the section keeps it to itself.
   */
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
}

export function PinnedSection({
  items,
  noteCounts,
  onUnpinNote,
  onUnpinFolder,
  onUnpinFile,
  runUnpin,
  editing: editingProp,
  onEditingChange,
}: PinnedSectionProps): JSX.Element {
  const [editingState, setEditingState] = useState(false);
  const editing = editingProp ?? editingState;
  function setEditing(value: boolean): void {
    setEditingState(value);
    onEditingChange?.(value);
  }
  // The card that just finished unpinning: kept on screen with the bird
  // mark, even once `items` itself has already dropped it.
  const [pending, setPending] = useState<Tile | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (pending === null) return;
    const timer = setTimeout(() => setPending(null), UNPINNED_SHOWN_MS);
    return () => clearTimeout(timer);
  }, [pending]);
  const shown = items.slice(0, TILE_LIMIT);
  const noteFiles: DriveFile[] = shown
    .filter(
      (item): item is Extract<PinnedItem, { kind: 'note' }> =>
        item.kind === 'note',
    )
    .map((item) => item.file);
  const titles = useNoteTitles(noteFiles);
  const bower = useBowerNotes(noteFiles);

  if (items.length === 0 && pending === null) {
    return (
      <div class="home-pinned">
        <div class="home-pinned-head">
          <h2 ref={headingRef} tabIndex={-1}>
            Pinned
          </h2>
        </div>
        <p class="home-pinned-empty">{PINNED_EMPTY}</p>
      </div>
    );
  }

  const live = shown.map((item) =>
    tileFor(
      item,
      noteCounts,
      titles,
      bower,
      onUnpinNote,
      onUnpinFolder,
      onUnpinFile,
    ),
  );
  const tiles =
    pending !== null && !live.some((tile) => tile.key === pending.key)
      ? [...live, pending]
      : live;
  const hasMore = items.length > TILE_LIMIT;

  async function handleUnpin(tile: Tile): Promise<void> {
    const last = items.length === 1;
    const ok = await runUnpin(tile.unpin);
    if (!ok) return;
    setPending(tile);
    // The button that had focus is gone; after the last pin, focus waits
    // on the Pinned heading rather than dropping to the page (T-20).
    if (last) headingRef.current?.focus();
  }

  return (
    <div class="home-pinned">
      <div class="home-pinned-head">
        <h2 ref={headingRef} tabIndex={-1}>
          Pinned
        </h2>
        <button
          type="button"
          class="home-pinned-edit"
          aria-pressed={editing}
          onClick={() => setEditing(!editing)}
        >
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>
      <div
        class={
          editing
            ? 'home-pinned-grid home-pinned-grid-edit'
            : 'home-pinned-grid'
        }
      >
        {tiles.map((tile) =>
          pending?.key === tile.key ? (
            <div key={tile.key} class="home-pinned-tile home-pinned-tile-done">
              <BowerMark size={20} />
              <span class="home-pinned-tile-name">Unpinned</span>
            </div>
          ) : editing ? (
            <div key={tile.key} class="home-pinned-tile">
              <FileIcon item={tile.icon} size={20} />
              <span class="home-pinned-tile-text">
                <span class="home-pinned-tile-name">{tile.name}</span>
                <span class="home-pinned-tile-meta">{tile.meta}</span>
              </span>
              <button
                type="button"
                class="home-pinned-unpin"
                aria-label={`Unpin ${tile.name}`}
                title={`Unpin ${tile.name}`}
                onClick={() => void handleUnpin(tile)}
              >
                <IconClose />
              </button>
            </div>
          ) : (
            <a key={tile.key} href={tile.href} class="home-pinned-tile">
              <FileIcon item={tile.icon} size={20} />
              <span class="home-pinned-tile-text">
                <span class="home-pinned-tile-name">{tile.name}</span>
                <span class="home-pinned-tile-meta">{tile.meta}</span>
              </span>
            </a>
          ),
        )}
      </div>
      {hasMore && (
        <button
          type="button"
          class="home-pinned-all"
          onClick={() => {
            openSwitcher('pinned:');
          }}
        >
          All pinned
        </button>
      )}
    </div>
  );
}
