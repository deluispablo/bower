/**
 * The quick switcher (#142, spec §5.1/§5.2; rebuilt for v4 in #593, boards
 * `Phone-Search-Start`, `Phone-Search`, `Phone-Search-None`): one field that
 * finds a folder, a note or a file, or runs a command. An `Overlay` dialog
 * (R-OVL-2): a full screen on the phone, a centred dialog on desktop
 * (`styles/switcher.css` sizes the overlay's panel per breakpoint). Every
 * opener goes through `openSwitcher()` (`switcher-store.ts`).
 *
 * Search: the session's index (`search-index.ts`, kept by
 * `switcher-store.ts`) answers synchronously from the vault index, with
 * typo tolerance, and the debounced Drive full-text search
 * (`mergeFullText`) adds what only Drive's own text index knows. Results
 * come as Folders, Notes and Files, with chips that filter by kind (with
 * counts) and by time. Opened from a folder screen the search is scoped to
 * that folder; on an empty query the PARA chips scope it too. Commands
 * always come last and only when the query matches one (R-SEARCH-8).
 *
 * The empty query shows what is near: Opened lately, Filed in the last
 * tidy-up (the run report's `items` with `to`, #583) and Searched before.
 * No results offers "Ask Bower where it is".
 *
 * v6 (#917, spec §4.7, boards SE-Empty, SE-Query, NO-Tag): the field is
 * #910's `SearchField` (the mic dictates into it; a trigger's mic opens
 * Search already dictating); results group under sentence-case labels
 * (R-LABEL-1) in rows drawn like `ListRow` with a `FileIcon` and the mixed
 * meta line "<kind> · ● <parent>" (folders add "<n> things · updated
 * <when>", R-SE-3); a `#tag` query lists the notes with that tag over the
 * note it was opened from (R-SE-5).
 *
 * Mounted once in `layout.tsx`; only actually rendered while open, so every
 * open starts from a clean field. The scrim, focus trap, Escape, inert page,
 * scroll lock and return-to-opener come from `overlay.tsx` (it portals into
 * `document.body`, outside the inert shell); arrow keys and Enter are this component's own,
 * over the flat list of rows.
 */

import { Fragment } from 'preact';
import type { JSX } from 'preact';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'preact/hooks';
import { useLocation } from 'preact-iso';

import { getRuns } from '../api.js';
import type { Run } from '../api.js';
import { loadNote, loadThumbnail } from '../cache.js';
import { FOLDER_MIME, getText, searchFullText } from '../drive.js';
import type { DriveFile } from '../drive.js';
import { formatSize } from '../file-preview.js';
import { normalizeTags, parseFrontmatter } from '../markdown/frontmatter.js';
import { metaLine, shortDate } from '../meta-line.js';
import type { MetaLine } from '../meta-line.js';
import { plainText } from '../proposals.js';
import {
  displayName,
  driveFileUrl,
  driveFolderUrl,
  folderHref,
  folderOf,
  paraKindOf,
  relativeTime,
} from '../navigation.js';
import type { ParaKind } from '../navigation.js';
import { loadNoteMeta } from '../note-meta.js';
import { noteTitle } from '../note-title.js';
import { useOnline } from '../online.js';
import { getPref } from '../prefs.js';
import { inboxCount, inboxTotal } from '../inbox-count.js';
import { useRun } from '../run-store.js';
import { pathSegments, mergeFullText, searchVault } from '../search-index.js';
import type {
  HitKind,
  SearchHit,
  SearchOptions,
  SearchResults,
  TitleSpan,
} from '../search-index.js';
import {
  OFFLINE_LINE,
  hasTag,
  loadRecentSearches,
  noResultsLine,
  saveRecentSearch,
  searchGroupLabel,
  searchTitle,
  snippet as makeSnippet,
  tagLine,
  tagOfQuery,
  withoutExtension,
} from '../search.js';
import { BOWER_PATH } from '../shell-routes.js';
import {
  closeSwitcher,
  feedCachedNoteText,
  knownNoteText,
  loadOpened,
  restoreSavedSearchIndex,
  syncedSearchIndex,
  useSwitcherOpen,
} from '../switcher-store.js';
import type { Command } from '../switcher.js';
import { commandsFor } from '../switcher.js';
import { effectiveTheme, setTheme } from '../theme.js';
import { useMediaQuery } from '../use-media-query.js';
import { FILE_KIND_LABELS, fileKind, isAppFile } from '../vault-index.js';
import type { VaultIndex } from '../vault-index.js';
import { useVault } from '../vault-store.js';
import { ListRow } from './list-row.js';
import { FolderMark } from './folder-mark.js';
import {
  IconChat,
  IconClock,
  IconClose,
  IconInbox,
  IconMoon,
  IconPlus,
  IconSun,
} from './icons.js';
import { Overlay } from './overlay.js';
import { SearchField } from './search-field.js';
import { isBowerWritten } from '../bower-written.js';
import { Queued } from './queued-overlay.js';
import { OVERLAY_PRIORITY } from '../overlay-queue.js';
import '../styles/switcher.css';

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;
const DAY_MS = 86_400_000;
const START_LIST_MAX = 5;

/** The desktop overlay's two columns start here (`switcher.css`). */
const DESKTOP_QUERY = '(min-width: 900px)';
const EXTRAS_MAX = 30;
const PREVIEW_LINES = 8;
const PREVIEW_DELAY_MS = 120;

type SearchStatus = 'idle' | 'searching' | 'done' | 'error';
type KindChip = 'all' | 'folders' | 'notes' | 'files';

/** How many tag lookups read note frontmatter at once. */
const TAG_BATCH = 8;

/** The note that describes a PDF (`Name.pdf` -> `Name.md`), if the vault has one. */
function companionOf(
  file: DriveFile,
  byPath: ReadonlyMap<string, DriveFile> | undefined,
): DriveFile | undefined {
  if (byPath === undefined || fileKind(file) !== 'pdf') return undefined;
  return byPath.get(file.path.replace(/\.[^./]+$/, '.md'));
}

function pagesWord(pages: number): string {
  return `${pages} ${pages === 1 ? 'page' : 'pages'}`;
}

/**
 * What the rows learn after they are drawn: a PDF's page count, from its
 * companion note's `pages`, for the desktop preview. Fetched once per
 * file; a miss leaves the count out. Rows draw the FileIcon, never a
 * thumbnail (R-SE-3).
 */
function useRowExtras(
  rows: readonly RowModel[],
  byPath: ReadonlyMap<string, DriveFile> | undefined,
): { pages: ReadonlyMap<string, number> } {
  const [pages, setPages] = useState<ReadonlyMap<string, number>>(new Map());
  const asked = useRef(new Set<string>());
  const gone = useRef(false);

  useEffect(
    () => () => {
      gone.current = true;
    },
    [],
  );

  useEffect(() => {
    for (const row of rows.slice(0, EXTRAS_MAX)) {
      if (row.kind !== 'file') continue;
      const { file } = row;
      const companion = companionOf(file, byPath);
      const pagesKey = `pages:${file.id}:${companion?.modifiedTime ?? ''}`;
      if (companion !== undefined && !asked.current.has(pagesKey)) {
        asked.current.add(pagesKey);
        loadNoteMeta(companion).then(
          (meta) => {
            const count = meta.pages;
            if (gone.current || count === undefined) return;
            setPages((prev) => new Map(prev).set(file.id, count));
          },
          (err: unknown) => {
            console.error(err);
          },
        );
      }
    }
  }, [rows, byPath]);

  return { pages };
}

/**
 * The notes tagged `tag` (N-11), newest first: each note's frontmatter
 * `tags`, read through the note-meta cache (a note not cached yet is read
 * once from Drive, like a folder screen does). `null` while reading.
 */
/**
 * Which of the listed notes Bower wrote (K-14: the bird and "Bower note"),
 * read the way tag search reads tags: `loadNoteMeta`, the cached
 * frontmatter first and Drive once for a note not cached yet. Every row
 * in every list (Opened lately, results, tag search) asks the same source,
 * so a Bower note never shows as a plain note. Grows as answers come in.
 */
function useBowerNotes(files: readonly DriveFile[]): ReadonlySet<string> {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());
  const asked = useRef(new Set<string>());
  const gone = useRef(false);
  const key = files
    .slice(0, EXTRAS_MAX)
    .map((file) => `${file.id}:${file.modifiedTime ?? ''}`)
    .join(',');

  useEffect(
    () => () => {
      gone.current = true;
    },
    [],
  );

  useEffect(() => {
    for (const file of files.slice(0, EXTRAS_MAX)) {
      const ask = `${file.id}:${file.modifiedTime ?? ''}`;
      if (asked.current.has(ask)) continue;
      asked.current.add(ask);
      loadNoteMeta(file).then(
        (meta) => {
          const text = knownNoteText(file.id);
          const body =
            text === undefined ? undefined : parseFrontmatter(text).body;
          if (gone.current || !isBowerWritten(meta, { body })) return;
          setIds((prev) =>
            prev.has(file.id) ? prev : new Set(prev).add(file.id),
          );
        },
        (err: unknown) => {
          console.error('A note could not be read for its author', err);
        },
      );
    }
  }, [key]);

  return ids;
}

function useTagged(
  tag: string | null,
  index: VaultIndex | null,
): DriveFile[] | null {
  const [found, setFound] = useState<{
    tag: string;
    notes: DriveFile[];
  } | null>(null);

  useEffect(() => {
    if (tag === null || index === null) return;
    let cancelled = false;
    const notes = index.notes.filter(
      (note) => !isAppFile(note.path, note.name),
    );
    void (async () => {
      const tagged: DriveFile[] = [];
      for (let at = 0; at < notes.length; at += TAG_BATCH) {
        const batch = notes.slice(at, at + TAG_BATCH);
        const metas = await Promise.all(
          batch.map((note) =>
            loadNoteMeta(note).catch((err: unknown) => {
              console.error('A note could not be read for its tags', err);
              return null;
            }),
          ),
        );
        if (cancelled) return;
        metas.forEach((meta, i) => {
          const note = batch[i];
          if (
            note !== undefined &&
            meta !== null &&
            hasTag(normalizeTags(meta.fields.tags), tag)
          ) {
            tagged.push(note);
          }
        });
      }
      tagged.sort((a, b) =>
        (b.modifiedTime ?? '').localeCompare(a.modifiedTime ?? ''),
      );
      if (!cancelled) setFound({ tag, notes: tagged });
    })();
    return () => {
      cancelled = true;
    };
  }, [tag, index]);

  return tag !== null && found?.tag === tag ? found.notes : null;
}

/** The first lines of a note's own words (no frontmatter, callout marks or link syntax). */
export function previewLines(text: string): string[] {
  return parseFrontmatter(text)
    .body.split(/\r\n|\r|\n/)
    .map((line) =>
      plainText(
        line
          .replace(/^\s*(?:#{1,6}|[-*+>])\s*/, '')
          .replace(/^\[![\w-]+\][+-]?\s*/, ''),
      ).trim(),
    )
    .filter((line) => line !== '')
    .slice(0, PREVIEW_LINES);
}

/**
 * What the desktop preview column shows for the highlighted row: the file's
 * first page or picture (Drive's thumbnail) and the lines of the note
 * (its own, or the one Bower wrote beside a PDF). Read after a short pause,
 * so arrowing down the list does not fetch every row it passes.
 */
function usePreview(
  row: RowModel | null,
  byPath: ReadonlyMap<string, DriveFile> | undefined,
): { picture: string | null; lines: string[] | null } {
  const [picture, setPicture] = useState<string | null>(null);
  const [lines, setLines] = useState<string[] | null>(null);
  const file = row?.file;
  const id = file?.id;
  const kind = row?.kind;

  useEffect(() => {
    setPicture(null);
    setLines(null);
    if (file === undefined || kind === undefined || kind === 'folder') return;
    let cancelled = false;
    let url: string | null = null;
    const timer = setTimeout(() => {
      if (kind === 'file') {
        loadThumbnail(file).then(
          (blob) => {
            if (blob === undefined) return;
            url = URL.createObjectURL(blob);
            if (cancelled) URL.revokeObjectURL(url);
            else setPicture(url);
          },
          (err: unknown) => {
            console.error(err);
          },
        );
      }
      const source = kind === 'note' ? file : companionOf(file, byPath);
      if (source === undefined) return;
      void (async () => {
        const text =
          knownNoteText(source.id) ??
          (await loadNote(source.id).catch(() => undefined))?.text ??
          (await getText(source.id));
        if (!cancelled) setLines(previewLines(text));
      })().catch((err: unknown) => {
        console.error(err);
      });
    }, PREVIEW_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (url !== null) URL.revokeObjectURL(url);
    };
  }, [id, kind, byPath]);

  return { picture, lines };
}
type TimeKey = 'any' | 'today' | '7d' | '30d' | 'year';

const TIME_LABELS: Readonly<Record<TimeKey, string>> = {
  any: 'Any time',
  today: 'Today',
  '7d': '7 days',
  '30d': '30 days',
  year: 'This year',
};

/** The earliest modified time (epoch ms) a time filter lets through. */
function sinceFor(time: TimeKey, now: number): number | undefined {
  switch (time) {
    case 'any':
      return undefined;
    case 'today': {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return start.getTime();
    }
    case '7d':
      return now - 7 * DAY_MS;
    case '30d':
      return now - 30 * DAY_MS;
    case 'year':
      return new Date(new Date(now).getFullYear(), 0, 1).getTime();
  }
}

/** A folder to search inside: its path from the top, and how it reads. */
interface Scope {
  path: string;
  label: string;
}

function scopeOf(path: string): Scope {
  const last = path.split('/').filter(Boolean).pop() ?? path;
  return { path, label: displayName(last) };
}

/** The folder a `/folder/...` location shows, or `null` on any other screen. */
function folderOfLocation(
  location: string | undefined,
  index: VaultIndex | null,
): Scope | null {
  if (index === null || location === undefined) return null;
  if (!location.startsWith('/folder/')) return null;
  try {
    const path = location
      .slice('/folder/'.length)
      .split('/')
      .filter(Boolean)
      .map((part) => decodeURIComponent(part))
      .join('/');
    return path !== '' && index.byPath.has(path) ? scopeOf(path) : null;
  } catch {
    return null;
  }
}

const PARA_CHIPS: readonly {
  kind: Exclude<ParaKind, 'inbox'>;
  label: string;
}[] = [
  { kind: 'projects', label: 'Projects' },
  { kind: 'areas', label: 'Areas' },
  { kind: 'resources', label: 'Resources' },
  { kind: 'archives', label: 'Archives' },
];

/** The top folder that is `kind`'s landmark, if the folder has one. */
function paraFolder(
  index: VaultIndex | null,
  kind: ParaKind,
): DriveFile | null {
  if (index === null) return null;
  return (
    index.folders.find(
      (folder) =>
        !folder.path.includes('/') && paraKindOf(folder.name) === kind,
    ) ?? null
  );
}

// --- Rows -----------------------------------------------------------------

/** What one result row draws, whichever list it comes from. */
interface RowModel {
  file: DriveFile;
  kind: HitKind;
  title: string;
  highlights: TitleSpan[];
  /** The PARA landmark the item sits in, drawn as its mark. */
  para: ParaKind | null;
  /** Where it sits below the landmark ("Flat hunt"), or the landmark's own name. */
  where: string;
  /** "PDF", "Photo"... (shown for files). */
  kindWord: string;
  /** How many things a folder holds. */
  count: number | null;
  /** The text hit's snippet. */
  snippet: string | null;
  /** How long ago, when there is no snippet ("yesterday"). */
  tail: string | null;
  /** The root the item lives under, for its icon and the meta dot. */
  root: ParaKind | null;
  /** The folder it is in, as Drive names it; `''` at the top. */
  parentName: string;
  /** A folder's newest change inside it, ISO (the folder page's "updated"). */
  updated: string;
}

/** The row's meta line (R-SE-3, K-15): "Bower note · ● Moonee Ponds",
 * "Folder · ● Housing Search Australia · 7 things · updated today". */
function rowMeta(row: RowModel, bowerWritten: boolean, now: number): MetaLine {
  return metaLine(
    {
      name: row.file.name,
      mimeType: row.file.mimeType,
      bowerWritten,
      root: row.root,
      ...(row.parentName !== '' && { parentName: row.parentName }),
      ...(row.count !== null && { count: row.count }),
      ...(row.kind === 'folder' &&
        row.updated !== '' && { updated: row.updated }),
    },
    { view: 'mixed-row', now },
  );
}

function hrefOf(row: RowModel): string {
  if (row.kind === 'folder') return folderHref(row.file.path);
  return row.kind === 'note' ? `/note/${row.file.id}` : `/file/${row.file.id}`;
}

function whereOf(hit: Pick<SearchHit, 'path'>): {
  para: ParaKind | null;
  where: string;
} {
  const [first, ...rest] = hit.path;
  if (first === undefined) return { para: null, where: '' };
  if (rest.length === 0) return { para: first.para, where: first.name };
  return {
    para: first.para,
    where: rest.map((segment) => segment.name).join(' › '),
  };
}

/** How many things sit directly in the folder at `path`. */
function childCount(index: VaultIndex, path: string): number {
  const prefix = `${path}/`;
  let count = 0;
  for (const list of [index.folders, index.notes, index.files]) {
    for (const file of list) {
      if (
        file.path.startsWith(prefix) &&
        !file.path.slice(prefix.length).includes('/')
      ) {
        count += 1;
      }
    }
  }
  return count;
}

function tailFor(file: DriveFile, now: number): string | null {
  return file.modifiedTime === undefined
    ? null
    : relativeTime(file.modifiedTime, now);
}

function rowFromHit(hit: SearchHit, index: VaultIndex, now: number): RowModel {
  const { para, where } = whereOf(hit);
  return {
    file: hit.file,
    kind: hit.kind,
    title: searchTitle(hit.title),
    highlights: hit.highlights,
    para,
    where,
    kindWord: hit.kindWord,
    count: hit.kind === 'folder' ? childCount(index, hit.file.path) : null,
    snippet: hit.snippet,
    tail: tailFor(hit.file, now),
    root: hit.root,
    parentName: lastSegment(folderOf(hit.file.path)),
    updated: hit.updated,
  };
}

function lastSegment(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** A folder's newest change anywhere inside it, ISO, `''` when unknown. */
function newestInside(index: VaultIndex, path: string): string {
  const prefix = `${path}/`;
  let newest = '';
  for (const list of [index.notes, index.files]) {
    for (const file of list) {
      const time = file.modifiedTime ?? '';
      if (file.path.startsWith(prefix) && time > newest) newest = time;
    }
  }
  return newest;
}

/** A row for a file the empty screen lists (no query, so nothing highlighted). */
function rowFromFile(
  file: DriveFile,
  index: VaultIndex,
  tail: string | null,
): RowModel {
  const kind: HitKind =
    file.mimeType === FOLDER_MIME
      ? 'folder'
      : fileKind(file) === 'note'
        ? 'note'
        : 'file';
  const segments = pathSegments(file.path, true);
  const { para, where } = whereOf({ path: segments });
  return {
    file,
    kind,
    title:
      kind === 'folder'
        ? displayName(file.name)
        : kind === 'note'
          ? searchTitle(noteTitle(file))
          : withoutExtension(file.name),
    highlights: [],
    para,
    where,
    kindWord: kind === 'file' ? FILE_KIND_LABELS[fileKind(file)] : '',
    count: kind === 'folder' ? childCount(index, file.path) : null,
    snippet: null,
    tail,
    root: paraKindOf(file.path.split('/')[0] ?? ''),
    parentName: lastSegment(folderOf(file.path)),
    updated: kind === 'folder' ? newestInside(index, file.path) : '',
  };
}

interface Section {
  id: string;
  heading: string;
  rows: RowModel[];
}

/** `title`, with the matched stretches wrapped in `<mark>`. */
function Highlighted({
  text,
  spans,
}: {
  text: string;
  spans: TitleSpan[];
}): JSX.Element {
  const parts: JSX.Element[] = [];
  let at = 0;
  for (const span of spans) {
    if (span.start > at) parts.push(<>{text.slice(at, span.start)}</>);
    parts.push(
      <mark class="switcher-match">{text.slice(span.start, span.end)}</mark>,
    );
    at = span.end;
  }
  if (at < text.length) parts.push(<>{text.slice(at)}</>);
  return <>{parts}</>;
}

function commandIcon(command: Command, theme: 'light' | 'dark'): JSX.Element {
  switch (command.id) {
    case 'tidy-up':
      return <IconInbox />;
    case 'add':
      return <IconPlus />;
    case 'tell':
      return <IconChat />;
    case 'theme':
      return theme === 'dark' ? <IconSun /> : <IconMoon />;
  }
}

interface HitRowProps {
  id: string;
  row: RowModel;
  selected: boolean;
  bowerWritten: boolean;
  now: number;
  onActivate: (row: RowModel) => void;
  onHighlight: () => void;
}

/**
 * One result: #908's `ListRow` (§3.17: the FileIcon in its 32 px box, the
 * title with the matched words marked, the meta line, the time on the
 * right) inside a listbox `option`. Roving focus is off: Search keeps the
 * focus in the field (`aria-activedescendant`) and owns the arrows.
 */
function HitRow({
  id,
  row,
  selected,
  bowerWritten,
  now,
  onActivate,
  onHighlight,
}: HitRowProps): JSX.Element {
  const line = rowMeta(row, bowerWritten, now);
  // A text hit adds its snippet as the last part of the meta line.
  const meta: MetaLine =
    row.snippet === null
      ? line
      : {
          ...line,
          parts: [...line.parts, `“${row.snippet}”`],
          text: `${line.text} · “${row.snippet}”`,
        };
  const time =
    row.kind === 'folder' || row.file.modifiedTime === undefined
      ? null
      : shortDate(row.file.modifiedTime, now);
  return (
    <li
      id={id}
      role="option"
      aria-selected={selected}
      class="switcher-row-item"
    >
      <ListRow
        item={{
          id: row.file.id,
          title: <Highlighted text={row.title} spans={row.highlights} />,
          name: row.file.name,
          mimeType: row.file.mimeType,
          path: row.file.path,
          root: row.root,
          bowerWritten,
          href: hrefOf(row),
        }}
        meta={meta}
        trailing={
          time === null || time === '' ? undefined : (
            <time dateTime={row.file.modifiedTime}>{time}</time>
          )
        }
        selected={selected}
        roving={false}
        rowProps={{
          class: 'switcher-row',
          'data-highlighted': selected,
          'data-kind': row.kind,
          onMouseEnter: onHighlight,
          onClick: (event: MouseEvent) => {
            event.preventDefault();
            onActivate(row);
          },
        }}
      />
    </li>
  );
}

interface CommandRowProps {
  id: string;
  command: Command;
  selected: boolean;
  theme: 'light' | 'dark';
  onActivate: (command: Command) => void;
  onHighlight: () => void;
}

function CommandRow({
  id,
  command,
  selected,
  theme,
  onActivate,
  onHighlight,
}: CommandRowProps): JSX.Element {
  const icon = commandIcon(command, theme);
  const label = <span class="switcher-row-text">{command.label}</span>;
  return (
    <li
      id={id}
      role="option"
      aria-selected={selected}
      class="switcher-row-item"
    >
      {command.href !== undefined ? (
        <a
          href={command.href}
          class="switcher-row"
          tabIndex={-1}
          data-highlighted={selected}
          onMouseEnter={onHighlight}
          onClick={(event) => {
            event.preventDefault();
            onActivate(command);
          }}
        >
          {icon}
          {label}
        </a>
      ) : (
        <button
          type="button"
          class="switcher-row"
          tabIndex={-1}
          data-highlighted={selected}
          onMouseEnter={onHighlight}
          onClick={() => {
            onActivate(command);
          }}
        >
          {icon}
          {label}
        </button>
      )}
    </li>
  );
}

/** The desktop column beside the list: the highlighted result, larger. */
function SearchPreview({
  row,
  bowerWritten,
  now,
  pages,
  picture,
  lines,
  onOpen,
}: {
  row: RowModel | null;
  bowerWritten: boolean;
  now: number;
  pages: number | undefined;
  picture: string | null;
  lines: string[] | null;
  onOpen: (row: RowModel) => void;
}): JSX.Element {
  if (row === null) {
    return (
      <aside class="switcher-preview" aria-label="Preview">
        <p class="switcher-preview-empty">Pick a result to see it here.</p>
      </aside>
    );
  }
  // The meta line under a title (SE-Query-1280: "Folder · 7 things ·
  // updated today"); a file adds its pages and size.
  const facts: string[] = [];
  if (row.kind === 'folder') {
    facts.push(
      ...metaLine(
        {
          name: row.file.name,
          mimeType: row.file.mimeType,
          ...(row.count !== null && { count: row.count }),
          ...(row.updated !== '' && { updated: row.updated }),
        },
        { view: 'row', now },
      ).parts,
    );
    facts.unshift('Folder');
  } else {
    facts.push(
      metaLine(
        { name: row.file.name, mimeType: row.file.mimeType, bowerWritten },
        { view: 'row', now },
      ).text,
    );
    if (pages !== undefined) facts.push(pagesWord(pages));
    if (row.kind === 'file' && row.file.size !== undefined) {
      facts.push(formatSize(row.file.size));
    }
  }
  const drive =
    row.kind === 'folder' ? driveFolderUrl(row.file) : driveFileUrl(row.file);
  return (
    <aside class="switcher-preview" aria-label="Preview">
      <b class="switcher-preview-title">{row.title}</b>
      <p class="switcher-preview-meta">{facts.join(' · ')}</p>
      <div class="switcher-preview-actions">
        <button
          type="button"
          class="btn btn-sm"
          onClick={() => {
            onOpen(row);
          }}
        >
          Open
        </button>
        <a
          class="btn btn-secondary btn-sm"
          href={drive}
          target="_blank"
          rel="noopener"
        >
          Open in Drive
        </a>
      </div>
      {picture !== null && (
        <img class="switcher-preview-picture" src={picture} alt="" />
      )}
      {lines !== null && lines.length > 0 && (
        <div class="switcher-preview-lines">
          {lines.map((line, at) => (
            <p key={at}>{line}</p>
          ))}
        </div>
      )}
    </aside>
  );
}

const CHIP_KINDS: Readonly<Record<KindChip, HitKind | null>> = {
  all: null,
  folders: 'folder',
  notes: 'note',
  files: 'file',
};

function resultTotal(results: SearchResults): number {
  return results.folders.length + results.notes.length + results.files.length;
}

/** The dialog's contents; mounted only while the switcher is open, so its state always starts clean. */
function SwitcherPanel({
  initialQuery,
}: {
  initialQuery: string;
}): JSX.Element {
  const { path: location, route } = useLocation();
  const { index, files } = useVault();
  const { tidyUp, lastFinished: seenRun } = useRun();
  // A fresh page has seen no run yet: the last tidy-up's report comes from
  // the Worker's history (`GET /runs`, newest first).
  const [reportedRun, setReportedRun] = useState<Run | null>(null);
  const lastFinished = seenRun ?? reportedRun;

  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [snippets, setSnippets] = useState<ReadonlyMap<string, string | null>>(
    new Map(),
  );
  const [recent] = useState<string[]>(() => loadRecentSearches());
  const [opened] = useState<string[]>(() => loadOpened());
  const [scope, setScope] = useState<Scope | null>(() =>
    folderOfLocation(location, index),
  );
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [kindChip, setKindChip] = useState<KindChip>('all');
  const [time, setTime] = useState<TimeKey>('any');
  const [timeOpen, setTimeOpen] = useState(false);
  // Bumped when the index learns something on its own (a restored copy, note
  // text read from the cache), so the results are worked out again.
  const [indexVersion, setIndexVersion] = useState(0);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  // S-SE-9: offline, the index on this device still answers.
  const online = useOnline();
  const [theme, setThemeState] = useState(effectiveTheme);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  // SearchField hands its input over through this ref; the combobox role
  // goes on as soon as it does, whenever the overlay host mounts it.
  const [inputRef] = useState(() => {
    let field: HTMLInputElement | null = null;
    return {
      get current(): HTMLInputElement | null {
        return field;
      },
      set current(next: HTMLInputElement | null) {
        field = next;
        if (next === null) return;
        next.setAttribute('role', 'combobox');
        next.setAttribute('aria-expanded', 'true');
        next.setAttribute('aria-controls', 'switcher-listbox');
        next.setAttribute('autocomplete', 'off');
      },
    };
  });
  const panelRef = useRef<HTMLDivElement>(null);
  // The clock is read once per open: rows say "yesterday", not a live counter.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (seenRun !== null) return;
    let cancelled = false;
    getRuns()
      .then(({ runs }) => {
        if (!cancelled) setReportedRun(runs[0] ?? null);
      })
      .catch((error: unknown) => {
        console.error('The last tidy-up could not be read', error);
      });
    return () => {
      cancelled = true;
    };
  }, [seenRun]);

  // The copy saved on this device, then the note text already cached: each
  // can change what matches, so each bumps the version when it did.
  useEffect(() => {
    if (index === null) return;
    let cancelled = false;
    void (async () => {
      const restored = await restoreSavedSearchIndex();
      const learned = await feedCachedNoteText(index);
      if (!cancelled && (restored || learned)) {
        setIndexVersion((version) => version + 1);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [index]);

  const runSearch = useCallback((q: string) => {
    const id = ++requestIdRef.current;
    setStatus('searching');
    searchFullText(q)
      .then(async (found) => {
        if (id !== requestIdRef.current) return;
        const notes = new Map<string, string | null>();
        await Promise.all(
          found.map(async (file) => {
            const known = knownNoteText(file.id);
            const text =
              known ?? (await loadNote(file.id).catch(() => undefined))?.text;
            notes.set(
              file.id,
              text === undefined ? null : makeSnippet(text, q),
            );
          }),
        );
        if (id !== requestIdRef.current) return;
        setDriveFiles(found);
        setSnippets(notes);
        setStatus('done');
      })
      .catch((err: unknown) => {
        if (id !== requestIdRef.current) return;
        console.error(err);
        setDriveFiles([]);
        setStatus('error');
      });
  }, []);

  useEffect(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < MIN_QUERY_LENGTH) {
      requestIdRef.current++;
      setStatus('idle');
      setDriveFiles([]);
      return;
    }
    timerRef.current = setTimeout(() => {
      saveRecentSearch(trimmedQuery);
      // A tag reads the notes' own tags (`useTagged`), not Drive's text.
      if (tagOfQuery(trimmedQuery) === null) runSearch(trimmedQuery);
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [query, runSearch]);

  const commands = useMemo(
    () => commandsFor({ pending: inboxTotal(inboxCount(files, false)), theme }),
    [files, theme],
  );

  const trimmed = query.trim();
  const searching = trimmed.length >= MIN_QUERY_LENGTH;
  const tag = searching ? tagOfQuery(trimmed) : null;
  const tagged = useTagged(tag, index);

  // Names and paths are matched at once from the index already in memory:
  // no Drive call, so this never waits on the full-text search.
  const results = useMemo((): SearchResults | null => {
    if (!searching || tag !== null || index === null) return null;
    const since = sinceFor(time, now);
    const options: SearchOptions = {
      showAppFiles: getPref('showAppFiles'),
      ...(scope !== null && { scope: scope.path }),
      ...(since !== undefined && { since }),
    };
    const handle = syncedSearchIndex(index);
    const local = searchVault(handle, index, trimmed, options);
    return mergeFullText(local, driveFiles, index, trimmed, options, snippets);
    // `indexVersion` is not read here: it only forces this to run again.
  }, [
    searching,
    tag,
    index,
    trimmed,
    scope,
    time,
    now,
    driveFiles,
    snippets,
    indexVersion,
  ]);

  const topHit = useMemo((): SearchHit | null => {
    if (results === null) return null;
    let best: SearchHit | null = null;
    for (const hit of [
      ...results.folders,
      ...results.notes,
      ...results.files,
    ]) {
      if (best === null || hit.score > best.score) best = hit;
    }
    return best;
  }, [results]);

  // One set of kind chips on both sizes (SE-Query-375/1280).
  const activeChip = kindChip;

  const sections = useMemo((): Section[] => {
    if (index === null) return [];
    if (tag !== null) {
      // N-11: one list of the tagged notes, no group label.
      return tagged === null || tagged.length === 0
        ? []
        : [
            {
              id: 'tag',
              heading: '',
              rows: tagged.map((file) => rowFromFile(file, index, null)),
            },
          ];
    }
    if (results !== null) {
      const wanted = CHIP_KINDS[activeChip];
      const groups: [HitKind, SearchHit[]][] = [
        ['folder', results.folders],
        ['note', results.notes],
        ['file', results.files],
      ];
      return groups
        .filter(
          ([kind, hits]) =>
            hits.length > 0 && (wanted === null || wanted === kind),
        )
        .map(([kind, hits]) => ({
          id: kind,
          heading: searchGroupLabel(kind),
          rows: hits.map((hit) => rowFromHit(hit, index, now)),
        }));
    }
    if (searching) return [];
    const out: Section[] = [];
    const lately = opened
      .map((id) => index.byId.get(id))
      .filter((file): file is DriveFile => file !== undefined)
      .slice(0, START_LIST_MAX)
      .map((file) => rowFromFile(file, index, null));
    if (lately.length > 0) {
      out.push({ id: 'opened', heading: 'Opened lately', rows: lately });
    }
    const filedAt =
      lastFinished?.finishedAt !== undefined ? lastFinished.finishedAt : null;
    const filed = (lastFinished?.items ?? [])
      .flatMap((item) => {
        const file =
          item.to === undefined ? undefined : index.byPath.get(item.to);
        return file === undefined
          ? []
          : [
              rowFromFile(
                file,
                index,
                filedAt === null ? null : relativeTime(filedAt, now),
              ),
            ];
      })
      .slice(0, START_LIST_MAX);
    if (filed.length > 0) {
      out.push({
        id: 'filed',
        heading: 'Filed in the last tidy-up',
        rows: filed,
      });
    }
    return out;
  }, [
    index,
    tag,
    tagged,
    results,
    activeChip,
    searching,
    opened,
    lastFinished,
    now,
  ]);

  const matchingCommands = useMemo(() => {
    if (!searching || tag !== null) return [];
    const needle = trimmed.toLowerCase();
    return commands.filter((command) =>
      command.label.toLowerCase().includes(needle),
    );
  }, [searching, tag, trimmed, commands]);

  const flatRows = useMemo(
    () => sections.flatMap((section) => section.rows),
    [sections],
  );
  // Which note rows Bower wrote: the bird and "Bower note" (K-14).
  const noteFiles = useMemo(
    () => flatRows.filter((row) => row.kind === 'note').map((row) => row.file),
    [flatRows],
  );
  const bower = useBowerNotes(noteFiles);
  const entryCount = flatRows.length + matchingCommands.length;
  const extras = useRowExtras(flatRows, index?.byPath);
  const highlightedRow = flatRows[highlightedIndex] ?? null;
  const preview = usePreview(desktop ? highlightedRow : null, index?.byPath);

  // The highlight starts (and resets) on the list's first row whenever the
  // list itself changes shape.
  useEffect(() => {
    setHighlightedIndex(0);
  }, [entryCount, trimmed, activeChip, scope, time]);

  const goTo = useCallback(
    (href: string) => {
      closeSwitcher();
      route(href);
    },
    [route],
  );

  const activateRow = useCallback(
    (row: RowModel) => {
      goTo(hrefOf(row));
    },
    [goTo],
  );

  const runCommand = useCallback(
    (command: Command) => {
      if (command.id === 'tidy-up') {
        closeSwitcher();
        tidyUp();
        return;
      }
      if (command.id === 'theme') {
        const nextTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(nextTheme);
        setThemeState(nextTheme);
        return;
      }
      if (command.href !== undefined) goTo(command.href);
    },
    [tidyUp, goTo, theme],
  );

  const openHighlighted = useCallback(() => {
    const row = flatRows[highlightedIndex];
    if (row !== undefined) {
      activateRow(row);
      return;
    }
    const command = matchingCommands[highlightedIndex - flatRows.length];
    if (command !== undefined) runCommand(command);
  }, [flatRows, matchingCommands, highlightedIndex, activateRow, runCommand]);

  // From the chips: arrows walk along them, Enter opens the highlighted
  // result (the hint says "Enter open"; Space or a click picks a filter).
  const handleChipsKeyDown = useCallback(
    (event: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
      const chips = Array.from(
        event.currentTarget.querySelectorAll<HTMLElement>(
          '.switcher-chip:not(:disabled)',
        ),
      );
      const at = chips.indexOf(document.activeElement as HTMLElement);
      if (event.key === 'Enter' && desktop) {
        event.preventDefault();
        openHighlighted();
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        const next = at + (event.key === 'ArrowRight' ? 1 : -1);
        const chip = chips[next];
        if (at >= 0 && chip !== undefined) {
          event.preventDefault();
          chip.focus();
        }
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        inputRef.current?.focus();
      }
    },
    [desktop, openHighlighted],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlightedIndex((i) => Math.min(i + 1, entryCount - 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlightedIndex((i) => Math.max(i - 1, 0));
      } else if (event.key === 'Tab' && !event.shiftKey && desktop) {
        // Tab goes to the filters (the hint under the list says so), not to
        // Close; Enter still opens the highlighted result from there.
        const chip =
          panelRef.current?.querySelector<HTMLElement>(
            '.switcher-chips .switcher-chip[aria-pressed="true"], .switcher-chips .switcher-chip:not(:disabled)',
          ) ?? null;
        if (chip !== null) {
          event.preventDefault();
          chip.focus();
        }
      } else if (event.key === 'Enter') {
        event.preventDefault();
        openHighlighted();
      }
    },
    [desktop, entryCount, openHighlighted],
  );

  const total = results === null ? 0 : resultTotal(results);
  const noResults =
    searching &&
    results !== null &&
    total === 0 &&
    status !== 'searching' &&
    status !== 'idle';
  const paraScope =
    scope !== null &&
    !scope.path.includes('/') &&
    paraKindOf(scope.path) !== null
      ? paraKindOf(scope.path)
      : null;
  const paraOfScope =
    scope === null ? null : paraKindOf(scope.path.split('/')[0] ?? '');
  const showParaChips = !searching && (scope === null || paraScope !== null);

  // The note Search was opened over (a tag on it, R-SE-5): "you stay on …".
  const stayOn = useMemo((): string | null => {
    const match = /^\/note\/([^/?#]+)/.exec(location ?? '');
    if (match?.[1] === undefined || index === null) return null;
    let id: string;
    try {
      id = decodeURIComponent(match[1]);
    } catch {
      return null;
    }
    const file = index.byId.get(id);
    return file === undefined ? null : searchTitle(noteTitle(file));
  }, [location, index]);

  // The highlighted option, on the field (the listbox pattern).
  useEffect(() => {
    const input = inputRef.current;
    if (input === null) return;
    if (entryCount > 0) {
      input.setAttribute(
        'aria-activedescendant',
        `switcher-option-${highlightedIndex}`,
      );
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  });

  let at = 0;
  const statusText =
    status === 'searching'
      ? 'Searching…'
      : status === 'error'
        ? 'Search is not available right now.'
        : results === null
          ? ''
          : total === 0
            ? `No results for ${trimmed}.`
            : `${total} result${total === 1 ? '' : 's'}.`;

  return (
    <Queued id="switcher" priority={OVERLAY_PRIORITY.own}>
      <Overlay kind="dialog" label="Quick switcher" onClose={closeSwitcher}>
        <div ref={panelRef} class="switcher-panel">
          <div class="switcher-field">
            <SearchField
              variant="input"
              size={desktop ? 'desktop' : 'phone'}
              value={query}
              onChange={setQuery}
              onClose={closeSwitcher}
              inputRef={inputRef}
              onKeyDown={handleKeyDown}
            />
          </div>
          {tag !== null && tagged !== null && (
            <p class="switcher-tag-line">
              {tagLine(tagged.length, tag, stayOn)}
            </p>
          )}
          <div class="switcher-chips" onKeyDown={handleChipsKeyDown}>
            {scope !== null && !showParaChips && (
              <button
                type="button"
                class="switcher-chip"
                aria-pressed="true"
                aria-label={`Clear search in ${scope.label}`}
                onClick={() => {
                  setScope(null);
                }}
              >
                {paraOfScope !== null && (
                  <FolderMark kind={paraOfScope} size={18} />
                )}
                {scope.label}
                <IconClose />
              </button>
            )}
            {showParaChips &&
              PARA_CHIPS.map(({ kind, label }) => {
                const folder = paraFolder(index, kind);
                const on = folder !== null && scope?.path === folder.path;
                return (
                  <button
                    key={kind}
                    type="button"
                    class="switcher-chip"
                    aria-pressed={on}
                    disabled={folder === null}
                    onClick={() => {
                      if (folder === null) return;
                      setScope(on ? null : scopeOf(folder.path));
                      inputRef.current?.focus();
                    }}
                  >
                    <FolderMark kind={kind} size={18} />
                    {label}
                  </button>
                );
              })}
            {searching && tag === null && (
              <>
                {(
                  [
                    { key: 'all', label: 'All', count: total },
                    {
                      key: 'folders',
                      label: 'Folders',
                      count: results?.folders.length ?? 0,
                    },
                    {
                      key: 'notes',
                      label: 'Notes',
                      count: results?.notes.length ?? 0,
                    },
                    {
                      key: 'files',
                      label: 'Files',
                      count: results?.files.length ?? 0,
                    },
                  ] as const
                ).map(({ key, label, count }) => (
                  <button
                    key={key}
                    type="button"
                    class="switcher-chip"
                    aria-pressed={activeChip === key}
                    onClick={() => {
                      setKindChip(key);
                    }}
                  >
                    {label} {count}
                  </button>
                ))}
                <button
                  type="button"
                  class="switcher-chip switcher-time"
                  aria-expanded={timeOpen}
                  data-active={time !== 'any'}
                  onClick={() => {
                    setTimeOpen((open) => !open);
                  }}
                >
                  <IconClock />
                  {TIME_LABELS[time]}
                </button>
              </>
            )}
          </div>
          {searching && timeOpen && (
            <div class="switcher-chips" role="group" aria-label="Time">
              {(Object.keys(TIME_LABELS) as TimeKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  class="switcher-chip"
                  aria-pressed={time === key}
                  onClick={() => {
                    setTime(key);
                    setTimeOpen(false);
                  }}
                >
                  {TIME_LABELS[key]}
                </button>
              ))}
            </div>
          )}
          <div class="switcher-columns">
            <div class="switcher-body">
              {scope !== null && !desktop && (
                <button
                  type="button"
                  class="switcher-link"
                  onClick={() => {
                    setScope(null);
                  }}
                >
                  Search everywhere
                </button>
              )}
              <p
                class={`switcher-status${
                  status === 'searching' || status === 'error'
                    ? ''
                    : ' switcher-quiet'
                }`}
                aria-live="polite"
              >
                {searching && statusText}
              </p>
              {!online && searching && (
                <p class="switcher-line">{OFFLINE_LINE}</p>
              )}
              {noResults && (
                <div class="switcher-none">
                  <p class="switcher-line">{noResultsLine(trimmed)}</p>
                  <a
                    class="button"
                    href={`${BOWER_PATH}?text=${encodeURIComponent(`Where is ${trimmed}?`)}`}
                    onClick={(event) => {
                      event.preventDefault();
                      goTo(
                        `${BOWER_PATH}?text=${encodeURIComponent(`Where is ${trimmed}?`)}`,
                      );
                    }}
                  >
                    Ask Bower where it is
                  </a>
                  {scope !== null && (
                    <button
                      type="button"
                      class="switcher-link"
                      onClick={() => {
                        setScope(null);
                      }}
                    >
                      Search all folders
                    </button>
                  )}
                </div>
              )}
              <ul
                id="switcher-listbox"
                role="listbox"
                aria-label="Folders, notes, files and commands"
                class="switcher-list"
              >
                {sections.map((section) => (
                  <Fragment key={section.id}>
                    {section.heading !== '' && (
                      <li
                        class="group-label switcher-heading"
                        role="presentation"
                      >
                        {section.heading}
                      </li>
                    )}
                    {section.rows.map((row) => {
                      const position = at++;
                      return (
                        <HitRow
                          key={`${section.id}-${row.file.id}`}
                          id={`switcher-option-${position}`}
                          row={row}
                          selected={position === highlightedIndex}
                          bowerWritten={bower.has(row.file.id)}
                          now={now}
                          onActivate={activateRow}
                          onHighlight={() => {
                            setHighlightedIndex(position);
                          }}
                        />
                      );
                    })}
                  </Fragment>
                ))}
                {matchingCommands.length > 0 && (
                  <li class="group-label switcher-heading" role="presentation">
                    Commands
                  </li>
                )}
                {matchingCommands.map((command) => {
                  const position = at++;
                  return (
                    <CommandRow
                      key={command.id}
                      id={`switcher-option-${position}`}
                      command={command}
                      selected={position === highlightedIndex}
                      theme={theme}
                      onActivate={runCommand}
                      onHighlight={() => {
                        setHighlightedIndex(position);
                      }}
                    />
                  );
                })}
              </ul>
              {results !== null && results.fuzzy && topHit !== null && (
                <p class="switcher-hint">
                  Close enough counts: “{trimmed}” finds {topHit.title}.
                </p>
              )}
              {!searching && recent.length > 0 && (
                <div class="switcher-recent-group">
                  <p class="group-label switcher-heading">Searched before</p>
                  <div class="switcher-recent">
                    {recent.map((entry) => (
                      <button
                        key={entry}
                        type="button"
                        class="switcher-chip"
                        onClick={() => {
                          setQuery(entry);
                          inputRef.current?.focus();
                        }}
                      >
                        {entry}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {desktop && (
                <div class="switcher-foot">
                  <span>
                    {scope !== null && (
                      <>
                        Only in {scope.label}.{' '}
                        <button
                          type="button"
                          class="switcher-link switcher-link-inline"
                          onClick={() => {
                            setScope(null);
                          }}
                        >
                          Search everywhere
                        </button>
                      </>
                    )}
                  </span>
                  <span class="switcher-kbhint">
                    <span>
                      <kbd>Tab</kbd> filters
                    </span>
                    <span>
                      <kbd>Enter</kbd> open
                    </span>
                  </span>
                </div>
              )}
            </div>
            {desktop && (
              <SearchPreview
                row={highlightedRow}
                bowerWritten={
                  highlightedRow !== null && bower.has(highlightedRow.file.id)
                }
                now={now}
                onOpen={activateRow}
                pages={
                  highlightedRow === null
                    ? undefined
                    : extras.pages.get(highlightedRow.file.id)
                }
                picture={preview.picture}
                lines={preview.lines}
              />
            )}
          </div>
        </div>
      </Overlay>
    </Queued>
  );
}

/** The panel, mounted by `switcher-host.tsx` once the switcher has been opened. */
export function Switcher(): JSX.Element | null {
  const { open, initialQuery } = useSwitcherOpen();
  if (!open) return null;
  return <SwitcherPanel initialQuery={initialQuery} />;
}
