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
 * Mounted once in `layout.tsx`; only actually rendered while open, so every
 * open starts from a clean field. The scrim, focus trap, Escape, inert page,
 * scroll lock and return-to-opener come from `overlay.tsx` (it portals into
 * `document.body`, outside the inert shell); arrow keys and Enter are this component's own,
 * over the flat list of rows. The bird never sits over the field or Close
 * (R-SEARCH-9): the phone hides it.
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
import { things } from '../home.js';
import { parseFrontmatter } from '../markdown/frontmatter.js';
import { plainText } from '../proposals.js';
import {
  displayName,
  folderHref,
  paraKindOf,
  relativeTime,
} from '../navigation.js';
import type { ParaKind } from '../navigation.js';
import { loadNoteMeta } from '../note-meta.js';
import { noteTitle } from '../note-title.js';
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
  loadRecentSearches,
  saveRecentSearch,
  snippet as makeSnippet,
} from '../search.js';
import { BOWER_PATH } from '../shell-routes.js';
import {
  closeSwitcher,
  openSwitcher,
  feedCachedNoteText,
  knownNoteText,
  loadOpened,
  recordOpened,
  restoreSavedSearchIndex,
  syncedSearchIndex,
  useSwitcherOpen,
} from '../switcher-store.js';
import type { Command } from '../switcher.js';
import { commandsFor } from '../switcher.js';
import { effectiveTheme, setTheme } from '../theme.js';
import { useMediaQuery } from '../use-media-query.js';
import { FILE_KIND_LABELS, fileKind, fileTitle } from '../vault-index.js';
import type { FileKind, VaultIndex } from '../vault-index.js';
import { useVault } from '../vault-store.js';
import { Bird } from './bird.js';
import { FolderIcon, FolderMark } from './folder-mark.js';
import {
  IconChat,
  IconClock,
  IconClose,
  IconFile,
  IconImage,
  IconInbox,
  IconMoon,
  IconNote,
  IconPdf,
  IconPlus,
  IconSearch,
  IconSun,
} from './icons.js';
import { KindBadge } from './kind-badge.js';
import { Overlay } from './overlay.js';
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

/** The desktop chips group files by what they are: "PDFs 2 · Spreadsheets 1". */
const FAMILIES: readonly { key: string; label: string; kinds: FileKind[] }[] = [
  { key: 'pdf', label: 'PDFs', kinds: ['pdf'] },
  { key: 'sheet', label: 'Spreadsheets', kinds: ['sheet', 'excel', 'csv'] },
  { key: 'photo', label: 'Photos', kinds: ['photo', 'heic', 'image'] },
  {
    key: 'doc',
    label: 'Documents',
    kinds: ['doc', 'word', 'opendocument', 'text', 'markdown'],
  },
  { key: 'slides', label: 'Slides', kinds: ['slides', 'powerpoint'] },
  { key: 'video', label: 'Videos', kinds: ['video'] },
  { key: 'audio', label: 'Audio', kinds: ['audio'] },
];

/** The desktop chip a hit is counted under. */
function chipKeyOf(hit: Pick<SearchHit, 'kind' | 'file'>): string {
  if (hit.kind !== 'file') return hit.kind;
  const kind = fileKind(hit.file);
  return FAMILIES.find((family) => family.kinds.includes(kind))?.key ?? 'other';
}

/** The desktop chips for `results`: All, then one per kind that has a hit. */
function desktopChips(
  results: SearchResults,
): { key: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const hit of [...results.folders, ...results.notes, ...results.files]) {
    const key = chipKeyOf(hit);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const labelled = [
    { key: 'folder', label: 'Folders' },
    { key: 'note', label: 'Notes' },
    ...FAMILIES,
    { key: 'other', label: 'Other files' },
  ];
  return [
    { key: 'all', label: 'All', count: resultTotal(results) },
    ...labelled.flatMap(({ key, label }) => {
      const count = counts.get(key);
      return count === undefined ? [] : [{ key, label, count }];
    }),
  ];
}

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

/** Whether the file's picture is worth showing in its row. */
function isPictureKind(file: DriveFile): boolean {
  const kind = fileKind(file);
  return kind === 'photo' || kind === 'heic' || kind === 'image';
}

/**
 * What the rows learn after they are drawn: photo thumbnails (the listing's
 * `thumbnailLink`, blob-cached) and a PDF's page count, from its companion
 * note's `pages`. Each is fetched once per file; a miss leaves the row as it
 * was (icon, no count).
 */
function useRowExtras(
  rows: readonly RowModel[],
  byPath: ReadonlyMap<string, DriveFile> | undefined,
): { pages: ReadonlyMap<string, number>; thumbs: ReadonlyMap<string, string> } {
  const [pages, setPages] = useState<ReadonlyMap<string, number>>(new Map());
  const [thumbs, setThumbs] = useState<ReadonlyMap<string, string>>(new Map());
  const asked = useRef(new Set<string>());
  const urls = useRef(new Set<string>());
  const gone = useRef(false);

  useEffect(
    () => () => {
      gone.current = true;
      for (const url of urls.current) URL.revokeObjectURL(url);
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
      const thumbKey = `thumb:${file.id}`;
      if (isPictureKind(file) && !asked.current.has(thumbKey)) {
        asked.current.add(thumbKey);
        loadThumbnail(file).then(
          (blob) => {
            if (blob === undefined) return;
            const url = URL.createObjectURL(blob);
            if (gone.current) {
              URL.revokeObjectURL(url);
              return;
            }
            urls.current.add(url);
            setThumbs((prev) => new Map(prev).set(file.id, url));
          },
          (err: unknown) => {
            console.error(err);
          },
        );
      }
    }
  }, [rows, byPath]);

  return { pages, thumbs };
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
    title: hit.title,
    highlights: hit.highlights,
    para,
    where,
    kindWord: hit.kindWord,
    count: hit.kind === 'folder' ? childCount(index, hit.file.path) : null,
    snippet: hit.snippet,
    tail: tailFor(hit.file, now),
  };
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
          ? noteTitle(file)
          : fileTitle(file.name),
    highlights: [],
    para,
    where,
    kindWord: kind === 'file' ? FILE_KIND_LABELS[fileKind(file)] : '',
    count: kind === 'folder' ? childCount(index, file.path) : null,
    snippet: null,
    tail,
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

/** The row's icon; a file also wears its grey kind badge. */
function RowIcon({
  row,
  thumb,
}: {
  row: RowModel;
  thumb?: string | undefined;
}): JSX.Element {
  if (thumb !== undefined) {
    return (
      <span class="switcher-row-thumb">
        <img src={thumb} alt="" />
      </span>
    );
  }
  if (row.kind === 'folder') return <FolderIcon tint={row.para ?? undefined} />;
  if (row.kind === 'note') return <IconNote />;
  const kind = fileKind(row.file);
  const icon =
    kind === 'pdf' ? (
      <IconPdf />
    ) : kind === 'photo' || kind === 'heic' || kind === 'image' ? (
      <IconImage />
    ) : (
      <IconFile />
    );
  return (
    <span class="switcher-row-icon-file">
      {icon}
      <KindBadge kind={kind} file={row.file} />
    </span>
  );
}

interface HitRowProps {
  id: string;
  row: RowModel;
  selected: boolean;
  pages?: number | undefined;
  thumb?: string | undefined;
  onActivate: (row: RowModel) => void;
  onHighlight: () => void;
}

function HitRow({
  id,
  row,
  selected,
  pages,
  thumb,
  onActivate,
  onHighlight,
}: HitRowProps): JSX.Element {
  return (
    <li
      id={id}
      role="option"
      aria-selected={selected}
      class="switcher-row-item"
    >
      <a
        href={hrefOf(row)}
        class="switcher-row"
        data-highlighted={selected}
        data-kind={row.kind}
        onMouseEnter={onHighlight}
        onClick={(event) => {
          event.preventDefault();
          onActivate(row);
        }}
      >
        <RowIcon row={row} thumb={thumb} />
        <span class="switcher-row-text">
          <span class="switcher-row-name">
            <Highlighted text={row.title} spans={row.highlights} />
          </span>
          <span class="switcher-row-path">
            {row.kind === 'file' &&
              `${row.kindWord} · ${pages === undefined ? '' : `${pagesWord(pages)} · `}`}
            {row.para !== null && (
              <>
                <FolderMark kind={row.para} size={18} />{' '}
              </>
            )}
            {row.where}
            {row.count !== null && ` · ${things(row.count)}`}
            {row.snippet !== null ? (
              <>
                {' · “'}
                <span class="switcher-row-snippet">{row.snippet}</span>”
              </>
            ) : (
              row.tail !== null && ` · ${row.tail}`
            )}
          </span>
        </span>
      </a>
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
  pages,
  picture,
  lines,
}: {
  row: RowModel | null;
  pages: number | undefined;
  picture: string | null;
  lines: string[] | null;
}): JSX.Element {
  if (row === null) {
    return (
      <aside class="switcher-preview" aria-label="Preview">
        <p class="switcher-preview-empty">Pick a result to see it here.</p>
      </aside>
    );
  }
  const facts: string[] = [];
  if (row.kind === 'folder') {
    facts.push('Folder');
    if (row.count !== null) facts.push(things(row.count));
  } else if (row.kind === 'note') {
    facts.push('Note');
  } else {
    facts.push(row.kindWord);
    if (pages !== undefined) facts.push(pagesWord(pages));
    if (row.file.size !== undefined) facts.push(formatSize(row.file.size));
  }
  return (
    <aside class="switcher-preview" aria-label="Preview">
      <b class="switcher-preview-title">{row.title}</b>
      <p class="switcher-preview-meta">{facts.join(' · ')}</p>
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

function headingFor(kind: HitKind, count: number): string {
  if (kind === 'folder') return count === 1 ? 'Folder' : 'Folders';
  return kind === 'note' ? 'Notes' : 'Files';
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
  const [kindChip, setKindChip] = useState<string>('all');
  const [time, setTime] = useState<TimeKey>('any');
  const [timeOpen, setTimeOpen] = useState(false);
  // Bumped when the index learns something on its own (a restored copy, note
  // text read from the cache), so the results are worked out again.
  const [indexVersion, setIndexVersion] = useState(0);
  const [fieldFocused, setFieldFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [theme, setThemeState] = useState(effectiveTheme);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
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
      runSearch(trimmedQuery);
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

  // Names and paths are matched at once from the index already in memory:
  // no Drive call, so this never waits on the full-text search.
  const results = useMemo((): SearchResults | null => {
    if (!searching || index === null) return null;
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

  // Desktop chips count by what the thing is ("PDFs 2"); the phone's by group.
  const chipList = useMemo(
    () => (results === null ? [] : desktopChips(results)),
    [results],
  );
  const activeChip =
    desktop && !chipList.some((chip) => chip.key === kindChip)
      ? 'all'
      : kindChip;

  const sections = useMemo((): Section[] => {
    if (index === null) return [];
    if (results !== null) {
      const wanted = desktop
        ? null
        : (CHIP_KINDS[activeChip as KindChip] ?? null);
      const groups: [HitKind, SearchHit[]][] = desktop
        ? [
            ['folder', results.folders],
            ['file', results.files],
            ['note', results.notes],
          ]
        : [
            ['folder', results.folders],
            ['note', results.notes],
            ['file', results.files],
          ];
      return groups
        .map(([kind, all]): [HitKind, SearchHit[]] => [
          kind,
          desktop && activeChip !== 'all'
            ? all.filter((hit) => chipKeyOf(hit) === activeChip)
            : all,
        ])
        .filter(
          ([kind, hits]) =>
            hits.length > 0 && (wanted === null || wanted === kind),
        )
        .map(([kind, hits]) => ({
          id: kind,
          heading: headingFor(kind, hits.length),
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
    results,
    desktop,
    activeChip,
    searching,
    opened,
    lastFinished,
    now,
  ]);

  const matchingCommands = useMemo(() => {
    if (!searching) return [];
    const needle = trimmed.toLowerCase();
    return commands.filter((command) =>
      command.label.toLowerCase().includes(needle),
    );
  }, [searching, trimmed, commands]);

  const flatRows = useMemo(
    () => sections.flatMap((section) => section.rows),
    [sections],
  );
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
    (event: JSX.TargetedKeyboardEvent<HTMLInputElement>) => {
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
  const placeholder =
    scope === null
      ? 'Search folders, notes and files'
      : `Search in ${scope.label}`;

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
            <IconSearch />
            <input
              ref={inputRef}
              type="text"
              class="switcher-input"
              placeholder={placeholder}
              aria-label={placeholder}
              role="combobox"
              aria-expanded="true"
              aria-controls="switcher-listbox"
              aria-activedescendant={
                entryCount > 0
                  ? `switcher-option-${highlightedIndex}`
                  : undefined
              }
              autocomplete="off"
              value={query}
              onInput={(event) => {
                setQuery((event.target as HTMLInputElement).value);
              }}
              onFocus={() => {
                setFieldFocused(true);
              }}
              onBlur={() => {
                setFieldFocused(false);
              }}
              onKeyDown={handleKeyDown}
            />
            {desktop && scope !== null && (
              <button
                type="button"
                class="switcher-scope"
                aria-label={`Clear search in ${scope.label}`}
                onClick={() => {
                  setScope(null);
                }}
              >
                in
                {paraOfScope !== null && (
                  <FolderMark kind={paraOfScope} size={18} />
                )}
                {scope.label}
                <IconClose />
              </button>
            )}
            <button
              type="button"
              class="icon-button"
              aria-label="Close"
              onClick={closeSwitcher}
            >
              <IconClose />
            </button>
            <div class="switcher-bird" aria-hidden="true">
              <Bird state={fieldFocused ? 'shiny' : 'peeking'} flip size={72} />
            </div>
          </div>
          <div class="switcher-chips" onKeyDown={handleChipsKeyDown}>
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
            {scope !== null && !showParaChips && !desktop && (
              <button
                type="button"
                class="switcher-chip"
                aria-pressed="true"
                aria-label={`Clear search in ${scope.label}`}
                onClick={() => {
                  setScope(null);
                }}
              >
                {scope.label}
                <IconClose />
              </button>
            )}
            {searching && (
              <>
                {(desktop
                  ? chipList
                  : [
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
                    ]
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
                    {label} <i>{count}</i>
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
              {noResults && (
                <div class="switcher-none">
                  <b class="switcher-none-title">Nothing called “{trimmed}”</b>
                  <span class="switcher-none-text">
                    No folder, note or file has those words in its name or its
                    text.
                  </span>
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
                      Search all of {scope.label} instead
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
                    <li class="switcher-heading" role="presentation">
                      {section.heading}
                    </li>
                    {section.rows.map((row) => {
                      const position = at++;
                      return (
                        <HitRow
                          key={`${section.id}-${row.file.id}`}
                          id={`switcher-option-${position}`}
                          row={row}
                          selected={position === highlightedIndex}
                          pages={extras.pages.get(row.file.id)}
                          thumb={extras.thumbs.get(row.file.id)}
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
                  <li class="switcher-heading" role="presentation">
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
                  <p class="switcher-heading">Searched before</p>
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

/** Notes and files open on this device, most recent first: `/note/:id`, `/file/:id`. */
function openedIdOf(location: string | undefined): string | null {
  if (location === undefined) return null;
  const match = /^\/(?:note|file)\/([^/?#]+)/.exec(location);
  if (match?.[1] === undefined) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function Switcher(): JSX.Element | null {
  const { open, initialQuery } = useSwitcherOpen();
  const { path } = useLocation();

  // "/" opens search from anywhere that is not a text field (R-DESK-4);
  // Ctrl/Cmd+K is `app.tsx`'s.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (open) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      openSwitcher();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Mounted for the whole session, so this sees every note or file opened.
  useEffect(() => {
    const id = openedIdOf(path);
    if (id !== null) recordOpened(id);
  }, [path]);

  if (!open) return null;
  return <SwitcherPanel initialQuery={initialQuery} />;
}
