/**
 * The folder screen's grid mode (issue #613, spec §6.5 R-FOLDER-5, board
 * `Phone-Folder-Grid`): the layout itself (`FolderGrid`: groups of tiles, 2
 * columns on the phone, 3 on desktop, boards GR-Main and GR-PhoneGrid), the
 * thumbnail and the first lines of a note quick look shows. Layout is chosen
 * only in Filter & sort (GR-4): there is no List/Grid toggle here.
 *
 * Thumbnails come from `loadThumbnail` (the blob cache, then a fetch of
 * Drive's `thumbnailLink`, refreshed once when it has expired). The CSP
 * admits Drive's thumbnail host under `img-src` only, so when that fetch is
 * refused the tile falls back to an `<img src>` of the listing's own link.
 * Offline, or with no thumbnail at all, the caller's kind icon shows.
 */

import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';

import { loadThumbnail } from '../cache.js';
import type { DriveFile } from '../drive.js';
import { parseFrontmatter } from '../markdown/frontmatter.js';
import { kindLabel } from '../meta-line.js';
import { useVault } from '../vault-store.js';
import type { FileKind } from '../vault-index.js';
import { FileIcon } from './file-icon.js';
import { classes, follow, pointerFocus, selectionKeys } from './list-row.js';
import type { ListRowItem } from './list-row.js';

import '../styles/grid-tile.css';

export type FolderLayout = 'list' | 'grid';

/** The kinds Drive draws a thumbnail for: photos, PDFs and Office files. */
const THUMBNAIL_KINDS: ReadonlySet<FileKind> = new Set([
  'photo',
  'heic',
  'image',
  'pdf',
  'doc',
  'sheet',
  'slides',
  'excel',
  'word',
  'powerpoint',
  'opendocument',
]);

/** Whether a file of this kind has a thumbnail worth asking Drive for. */
export function hasThumbnail(kind: FileKind): boolean {
  return THUMBNAIL_KINDS.has(kind);
}

const PHOTO_KINDS: ReadonlySet<FileKind> = new Set(['photo', 'heic', 'image']);

/** The layout a folder opens in when the person has not picked one: Grid
 * when more than half of it is photos (R-FOLDER-5), else List. */
export function defaultLayout(kinds: readonly FileKind[]): FolderLayout {
  if (kinds.length === 0) return 'list';
  const photos = kinds.filter((kind) => PHOTO_KINDS.has(kind)).length;
  return photos * 2 > kinds.length ? 'grid' : 'list';
}

/** A note's first lines as a tile shows them: no frontmatter, headings,
 * list marks or emphasis, at most `max` of them. */
export function noteLines(text: string, max = 3): string[] {
  let body = text;
  try {
    body = parseFrontmatter(text).body;
  } catch {
    // Not frontmatter after all: the text is the body.
  }
  const lines: string[] = [];
  for (const raw of body.split(/\r\n|\r|\n/)) {
    const line = raw
      .replace(/^\s*(?:>\s*)+/, '')
      .replace(/^\s*(?:[-*+]|\d+\.)\s+/, '')
      .replace(/[*_`]/g, '')
      .trim();
    // Blank lines, headings, rules and a callout's own marker (`[!bower]`).
    if (line === '' || line.startsWith('#') || line === '---') continue;
    if (/^\[![\w-]+\]/.test(line)) continue;
    lines.push(line);
    if (lines.length === max) break;
  }
  return lines;
}

/** True once the element is (about to be) on screen; without
 * `IntersectionObserver` it is always true. */
function useInView(ref: { current: HTMLElement | null }): boolean {
  const [seen, setSeen] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const element = ref.current;
    if (seen || element === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [seen, ref]);
  return seen;
}

/** A file's Drive thumbnail, or `fallback` while it loads, offline and when
 * Drive has none. */
export function Thumb({
  file,
  kind,
  fallback,
  alt = '',
}: {
  file: Pick<DriveFile, 'id' | 'thumbnailLink'>;
  kind: FileKind;
  fallback: JSX.Element;
  alt?: string;
}): JSX.Element {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref);
  const [src, setSrc] = useState<string | null>(null);
  const wanted = hasThumbnail(kind);

  useEffect(() => {
    setSrc(null);
    if (!wanted || !inView) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    loadThumbnail(file).then(
      (blob) => {
        if (cancelled) return;
        if (blob !== undefined) {
          objectUrl = URL.createObjectURL(blob);
          setSrc(objectUrl);
        } else if (
          file.thumbnailLink !== undefined &&
          navigator.onLine !== false
        ) {
          // The fetch was refused (CSP, CORS) or Drive had nothing cached:
          // an <img> is allowed where a fetch is not.
          setSrc(file.thumbnailLink);
        }
      },
      (err: unknown) => console.error('Could not load a thumbnail', err),
    );
    return () => {
      cancelled = true;
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [file.id, file.thumbnailLink, wanted, inView]);

  return (
    <span class="thumb" ref={ref}>
      {src === null ? (
        fallback
      ) : (
        <img
          class="thumb-img"
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setSrc(null)}
        />
      )}
    </span>
  );
}

/** A note's first lines, read once the element is on screen. */
export function NoteLines({
  id,
  max = 3,
  class: className = 'note-lines',
}: {
  id: string;
  max?: number;
  class?: string;
}): JSX.Element {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref);
  const { getNoteText } = useVault();
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    if (!inView) return;
    let cancelled = false;
    getNoteText(id).then(
      (text) => {
        if (!cancelled) setLines(noteLines(text, max));
      },
      (err: unknown) => console.error('Could not read a note', err),
    );
    return () => {
      cancelled = true;
    };
  }, [id, max, inView, getNoteText]);

  return (
    <span class={className} ref={ref}>
      {lines.map((line, at) => (
        <span key={at} class="note-line">
          {line}
        </span>
      ))}
    </span>
  );
}

export interface GridTileProps {
  item: ListRowItem;
  /** The date line (`shortDate`, R-META-3); empty for none. */
  date: string;
  /** ISO time for the `<time>` element. */
  dateTime?: string;
  /** A Badge at the top right ("New"). */
  badge?: ComponentChildren;
  selected?: boolean;
  /** Present on the desktop, where one click selects (see `ListRow`). */
  onSelect?: () => void;
  onOpen?: () => void;
  /** Extra attributes for the tile (long press, data hooks). */
  rowProps?: Record<string, unknown>;
}

function call(handler: unknown, event: Event): void {
  if (typeof handler === 'function') (handler as (e: Event) => void)(event);
}

/** Columns of the grid that holds `element` (1 when it is not a grid). */
function columnsOf(element: HTMLElement): number {
  const grid = element.closest('.folder-grid');
  if (grid === null) return 1;
  return Math.max(
    1,
    getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean)
      .length,
  );
}

/**
 * The grid tile (issue #908, spec §3.18 R-TILE-1, R-TILE-2, boards GR-Main
 * and GR-PhoneGrid): the kind line (FileIcon 16 and the kind in words), the
 * title up to three lines and the date; every tile the same height. No
 * excerpt, score or facts (G-18). Selected: 1 px teal border and the
 * selection tint (K-19); select and open as `ListRow`.
 */
export function GridTile({
  item,
  date,
  dateTime,
  badge,
  selected = false,
  onSelect,
  onOpen,
  rowProps = {},
}: GridTileProps): JSX.Element {
  const titleId = useId();
  const open =
    onOpen ?? (item.href === undefined ? undefined : () => follow(item.href));
  return (
    <a
      {...rowProps}
      {...pointerFocus}
      class={classes('grid-tile', rowProps.class, selected)}
      href={item.href}
      data-row-key={rowProps['data-row-key'] ?? item.id}
      data-selected={selected ? 'true' : undefined}
      aria-current={selected ? 'true' : undefined}
      aria-labelledby={titleId}
      onClick={(event: MouseEvent) => {
        call(rowProps.onClick, event);
        if (event.defaultPrevented || onSelect === undefined) return;
        event.preventDefault();
        event.stopPropagation();
        onSelect();
      }}
      onDblClick={(event: MouseEvent) => {
        if (onSelect === undefined) return;
        event.preventDefault();
        open?.();
      }}
      onFocus={(event: FocusEvent) => {
        call(rowProps.onFocus, event);
        onSelect?.();
      }}
      onKeyDown={(event: KeyboardEvent) => {
        call(rowProps.onKeyDown, event);
        const target = event.currentTarget;
        const columns = target instanceof HTMLElement ? columnsOf(target) : 1;
        selectionKeys(
          event,
          '.grid-tile',
          columns,
          onSelect === undefined ? onOpen : open,
        );
      }}
    >
      <span class="grid-tile-kind">
        <FileIcon item={item} size={16} />
        <span class="grid-tile-kind-word">{kindLabel(item)}</span>
        {badge !== undefined && badge !== null && (
          <span class="grid-tile-badge">{badge}</span>
        )}
      </span>
      <span class="grid-tile-title" id={titleId}>
        {item.title}
      </span>
      {date !== '' && (
        <time class="grid-tile-date" dateTime={dateTime}>
          {date}
        </time>
      )}
    </a>
  );
}

/** One date group of tiles ("Today", "Yesterday", "29 Sep"); `label` is
 * `null` when the sort has no groups (Name, Kind). */
export interface TileGroup<T> {
  label: string | null;
  items: readonly T[];
}

export interface FolderGridProps<T> {
  groups: readonly TileGroup<T>[];
  keyOf: (item: T) => string;
  renderTile: (item: T) => JSX.Element;
}

/**
 * The grid layout (§3.18, R-GR-1, boards GR-Main and GR-PhoneGrid): each
 * group's label, then its tiles, 2 columns on the phone and 3 on desktop,
 * every tile the same height. The tile itself is `GridTile`.
 */
export function FolderGrid<T>({
  groups,
  keyOf,
  renderTile,
}: FolderGridProps<T>): JSX.Element {
  return (
    <div class="folder-grid-groups">
      {groups.map((group, at) => (
        <div key={group.label ?? `group-${at}`} class="folder-grid-group">
          {group.label !== null && <h3 class="folder-group">{group.label}</h3>}
          <ul class="folder-grid" role="list">
            {group.items.map((item) => (
              <li key={keyOf(item)}>{renderTile(item)}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
