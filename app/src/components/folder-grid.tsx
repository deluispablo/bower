/**
 * The folder screen's grid mode (issue #613, spec §6.5 R-FOLDER-5, board
 * `Phone-Folder-Grid`): the List/Grid toggle, the thumbnail a tile shows and
 * the first lines of a note. Shared with quick look (`quick-look.tsx`).
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

/** The List/Grid switch of the tool row (board `Phone-Folder-Grid`). */
export function LayoutToggle({
  layout,
  onChange,
}: {
  layout: FolderLayout;
  onChange: (layout: FolderLayout) => void;
}): JSX.Element {
  return (
    <div class="folder-layout" role="group" aria-label="View">
      <button
        type="button"
        class="folder-layout-btn"
        aria-label="List"
        aria-pressed={layout === 'list'}
        onClick={() => onChange('list')}
      >
        <svg
          class="icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
        </svg>
      </button>
      <button
        type="button"
        class="folder-layout-btn"
        aria-label="Grid"
        aria-pressed={layout === 'grid'}
        onClick={() => onChange('grid')}
      >
        <svg
          class="icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <rect x="4" y="4" width="7" height="7" rx="1.5" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" />
          <rect x="13" y="13" width="7" height="7" rx="1.5" />
        </svg>
      </button>
    </div>
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
