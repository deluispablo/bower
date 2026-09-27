/**
 * Home's Pinned section (spec §14, issue #216): a two-column grid of tiles
 * above Recent, hidden while there is nothing pinned. At most 8 tiles show;
 * past that, "All pinned" opens the quick switcher — which has no filter
 * mode yet, so this prefills the query with `pinned:` instead (see the PR's
 * "Left out"). Edit turns the grid into a single column of rows, each with
 * its own unpin button; a row that was just unpinned holds the bird's
 * `done` pose for its own two seconds (`styles/bird.css`) before it drops
 * out of the list along with everything else `items` no longer carries.
 *
 * `items` is `vault-store.tsx#pinned(index)`, already newest-pin-first;
 * this only ever slices and renders it. `noteCounts` is
 * `navigation.ts#folderCounts(index)`, for a pinned folder's own "n notes".
 */

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';

import type { DriveFile } from '../drive.js';
import { folderHref, folderOf } from '../navigation.js';
import { noteTitle } from '../note-title.js';
import { openSwitcher } from '../switcher-store.js';
import type { PinnedItem } from '../vault-store.js';
import { Bird } from './bird.js';
import { IconClose, IconFolder, IconNote } from './icons.js';
import { useNoteTitles } from './use-note-titles.js';
import '../styles/pinned-section.css';

const TILE_LIMIT = 8;

interface Tile {
  key: string;
  href: string;
  name: string;
  meta: string;
  icon: JSX.Element;
  unpin: () => Promise<void>;
}

function noteMeta(path: string): string {
  const folder = folderOf(path);
  return folder === '' ? '' : folder.split('/').join(' / ');
}

function folderMeta(path: string, count: number): string {
  const parent = folderOf(path);
  const notes = `${count} ${count === 1 ? 'note' : 'notes'}`;
  return parent === '' ? notes : `${parent.split('/').join(' / ')} · ${notes}`;
}

function tileFor(
  item: PinnedItem,
  noteCounts: ReadonlyMap<string, number>,
  titles: ReadonlyMap<string, string>,
  onUnpinNote: (id: string) => Promise<void>,
  onUnpinFolder: (path: string) => Promise<void>,
): Tile {
  if (item.kind === 'note') {
    return {
      key: item.file.id,
      href: `/note/${item.file.id}`,
      name: titles.get(item.file.id) ?? noteTitle(item.file),
      meta: noteMeta(item.file.path),
      icon: <IconNote />,
      unpin: () => onUnpinNote(item.file.id),
    };
  }
  return {
    key: item.path,
    href: folderHref(item.path),
    name: item.path.slice(item.path.lastIndexOf('/') + 1),
    meta: folderMeta(item.path, noteCounts.get(item.path) ?? 0),
    icon: <IconFolder />,
    unpin: () => onUnpinFolder(item.path),
  };
}

export interface PinnedSectionProps {
  items: readonly PinnedItem[];
  noteCounts: ReadonlyMap<string, number>;
  onUnpinNote: (id: string) => Promise<void>;
  onUnpinFolder: (path: string) => Promise<void>;
  /** Runs an unpin through the shared toast (`pin-action.ts`); resolves to
   * whether it succeeded. Injected so this stays free of the toast import
   * and easy to mount in a smoke test with a plain fixture. */
  runUnpin: (unpin: () => Promise<void>) => Promise<boolean>;
}

export function PinnedSection({
  items,
  noteCounts,
  onUnpinNote,
  onUnpinFolder,
  runUnpin,
}: PinnedSectionProps): JSX.Element | null {
  const [editing, setEditing] = useState(false);
  // The tile that just finished unpinning: kept on screen, showing the
  // bird's `done` pose, even once `items` itself has already dropped it.
  const [pending, setPending] = useState<Tile | null>(null);
  const shown = items.slice(0, TILE_LIMIT);
  const noteFiles: DriveFile[] = shown
    .filter(
      (item): item is Extract<PinnedItem, { kind: 'note' }> =>
        item.kind === 'note',
    )
    .map((item) => item.file);
  const titles = useNoteTitles(noteFiles);

  if (items.length === 0) return null;

  const live = shown.map((item) =>
    tileFor(item, noteCounts, titles, onUnpinNote, onUnpinFolder),
  );
  const tiles =
    pending !== null && !live.some((tile) => tile.key === pending.key)
      ? [...live, pending]
      : live;
  const hasMore = items.length > TILE_LIMIT;

  async function handleUnpin(tile: Tile): Promise<void> {
    const ok = await runUnpin(tile.unpin);
    if (ok) setPending(tile);
  }

  return (
    <div class="home-pinned">
      <div class="home-pinned-head">
        <h2>Pinned</h2>
        <button
          type="button"
          class="home-pinned-edit"
          onClick={() => setEditing((value) => !value)}
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
              <Bird state="done" size={20} onDone={() => setPending(null)} />
              <span class="home-pinned-tile-name">Unpinned</span>
            </div>
          ) : editing ? (
            <div key={tile.key} class="home-pinned-tile">
              {tile.icon}
              <span class="home-pinned-tile-text">
                <span class="home-pinned-tile-name">{tile.name}</span>
                <span class="home-pinned-tile-meta">{tile.meta}</span>
              </span>
              <button
                type="button"
                class="home-pinned-unpin"
                aria-label={`Unpin ${tile.name}`}
                onClick={() => void handleUnpin(tile)}
              >
                <IconClose />
              </button>
            </div>
          ) : (
            <a key={tile.key} href={tile.href} class="home-pinned-tile">
              {tile.icon}
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
