/**
 * The prev / next footer of a note or a file (spec §3.30, R-PAGER-1,
 * boards NO-Bottom and FI-Bottom): "<n> of <N> in <folder>", a previous
 * arrow named "Previous: <name>", and the next item's name with its arrow,
 * named "Next: <name>". The order and N come from the one sibling list
 * (`folder-view.ts#siblings`), the same list About's "In this folder"
 * shows, so a note and a file in one folder always agree (K-31). No
 * keyboard shortcut ("[ and ] to move" is gone, N-1).
 */

import type { JSX } from 'preact';

import type { DriveFile } from '../drive.js';
import { noteTitle } from '../note-title.js';
import { fileKind, fileTitle } from '../vault-index.js';
import { IconChevronLeft, IconChevronRight } from './icons.js';
import { useNoteTitles } from './use-note-titles.js';

import '../styles/pager.css';

/** Where `id` sits in `items`: its 1-based place, the count and its neighbours. */
export interface PagerPlace {
  position: number;
  total: number;
  prev: DriveFile | null;
  next: DriveFile | null;
}

/** `id`'s place among `items` (in their order); `null` when it is not one. */
export function pagerPlace(
  items: readonly DriveFile[],
  id: string,
): PagerPlace | null {
  const at = items.findIndex((item) => item.id === id);
  if (at === -1) return null;
  return {
    position: at + 1,
    total: items.length,
    prev: items[at - 1] ?? null,
    next: items[at + 1] ?? null,
  };
}

/** "2 of 6 in Job Search Australia"; without a folder, "2 of 6". */
export function pagerCount(place: PagerPlace, folder: string): string {
  const count = `${String(place.position)} of ${String(place.total)}`;
  return folder === '' ? count : `${count} in ${folder}`;
}

/** Where an item opens: a note on the note screen, anything else on its own. */
export function itemHref(item: DriveFile): string {
  return fileKind(item) === 'note' ? `/note/${item.id}` : `/file/${item.id}`;
}

/** An item's name as rows show it: a note's title, a file's name without
 * its extension. */
export function itemTitle(
  item: DriveFile,
  titles?: ReadonlyMap<string, string>,
): string {
  if (fileKind(item) !== 'note') return fileTitle(item.name);
  return titles?.get(item.id) ?? noteTitle(item);
}

export interface PagerProps {
  /** The item on show. */
  id: string;
  /** Its siblings in tree order, itself included (`siblings()`). */
  items: readonly DriveFile[];
  /** The folder's display name and its page. */
  folder: { name: string; href: string } | null;
}

export function Pager({ id, items, folder }: PagerProps): JSX.Element | null {
  const place = pagerPlace(items, id);
  const neighbours = [place?.prev, place?.next].filter(
    (item): item is DriveFile =>
      item !== null && item !== undefined && fileKind(item) === 'note',
  );
  const titles = useNoteTitles(neighbours);
  if (place === null || place.total < 2) return null;
  const { prev, next } = place;
  const count = `${String(place.position)} of ${String(place.total)}`;
  return (
    <nav class="pager" aria-label="In this folder">
      {prev === null ? (
        <span class="pager-side" />
      ) : (
        <a
          class="pager-side pager-prev"
          rel="prev"
          href={itemHref(prev)}
          aria-label={`Previous: ${itemTitle(prev, titles)}`}
        >
          <IconChevronLeft />
        </a>
      )}
      <span class="pager-count">
        {folder === null ? (
          count
        ) : (
          <>
            {`${count} in `}
            <a href={folder.href}>{folder.name}</a>
          </>
        )}
      </span>
      {next === null ? (
        <span class="pager-side" />
      ) : (
        <a
          class="pager-side pager-next"
          rel="next"
          href={itemHref(next)}
          aria-label={`Next: ${itemTitle(next, titles)}`}
        >
          <span class="pager-next-name">{itemTitle(next, titles)}</span>
          <IconChevronRight />
        </a>
      )}
    </nav>
  );
}
