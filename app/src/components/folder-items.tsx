/**
 * The folder screen's list mode (issue #611, spec §6.5): the counts, the
 * origin filter, the tool row, the date groups and the rows, with an original
 * and its companion note as one row. Loaded on demand by `routes/folder.tsx`
 * (like `VirtualList` is by the tree), so it stays out of the startup chunk.
 *
 * Sort, kind filter and origin filter are remembered per folder in
 * `viewSettings` (#582); the pure parts are in `folder-view.ts`.
 */

import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { KEY_HINT, folderKeyAction, rowDate } from '../folder-keys.js';
import { loadViewSettings, saveViewSettings } from '../cache.js';
import type { ViewSettings } from '../cache.js';
import { parseCatalogueFiles } from '../companion.js';
import type { DriveFile } from '../drive.js';
import { CATALOGUE_PATH, originOf } from '../file-origin.js';
import type { Origin } from '../file-origin.js';
import {
  FOLDER_SORTS,
  SORT_LABELS,
  buildFolderModel,
  fileLine,
  filterKind,
  groupRows,
  kindOptions,
  lastFiled,
  metaCounts,
  rowsFor,
  sortRows,
  subjectOf,
  whenWords,
} from '../folder-view.js';
import type {
  FolderModel,
  FolderRow,
  FolderSort,
  OriginFilter,
} from '../folder-view.js';
import { keyFactsFor, kindById } from '../kinds.js';
import { parseFrontmatter } from '../markdown/frontmatter.js';
import {
  displayName,
  folderHref,
  paraKindOf,
  shortAge,
} from '../navigation.js';
import type { FolderContents } from '../navigation.js';
import { loadNoteMeta } from '../note-meta.js';
import type { NoteMeta } from '../note-meta.js';
import { noteTitle } from '../note-title.js';
import { useNew } from '../use-new.js';
import { useVault } from '../vault-store.js';
import { FILE_KIND_LABELS, fileKind, fileTitle } from '../vault-index.js';
import type { FileKind } from '../vault-index.js';
import { Bird } from './bird.js';
import { FolderMark } from './folder-mark.js';
import {
  LayoutToggle,
  NoteLines,
  Thumb,
  defaultLayout,
} from './folder-grid.js';
import type { FolderLayout } from './folder-grid.js';
import { IconDoc, IconImage, IconNote, IconPdf } from './icons.js';
import { KeyFacts } from './key-facts.js';
import { KindBadge } from './kind-badge.js';
import { QuickLook } from './quick-look.js';
import type { PanePreview } from './quick-look.js';
import { useLongPress } from './use-long-press.js';
import { BowerTag, NewTag } from './tags.js';

/** A row's type icon, coloured by kind (`folder.css`). A note copied from
 * Drive keeps the Drive page icon, as on the board. */
function KindIcon({
  file,
  origin,
  badge = false,
}: {
  file: DriveFile;
  origin: Origin | null;
  /** The grey kind badge in the tile's corner, for everything but a note. */
  badge?: boolean;
}): JSX.Element {
  const kind = fileKind(file);
  let icon: JSX.Element;
  let tone: string;
  if (kind === 'note') {
    icon = origin === 'drive' ? <IconDoc /> : <IconNote />;
    tone = origin === 'drive' ? 'drive' : 'note';
  } else if (kind === 'pdf') {
    icon = <IconPdf />;
    tone = 'pdf';
  } else if (kind === 'photo' || kind === 'image') {
    icon = <IconImage />;
    tone = 'image';
  } else {
    icon = <IconDoc />;
    tone =
      kind === 'doc' || kind === 'sheet' || kind === 'slides'
        ? 'drive'
        : 'note';
  }
  return (
    <span class={`folder-row-icon tone-${tone}`}>
      {icon}
      {badge && kind !== 'note' && <KindBadge kind={kind} file={file} />}
    </span>
  );
}

/** The path bar (R-FOLDER-1): the PARA mark, each segment a link, the
 * current one bold. */
export function PathBar({ path }: { path: string }): JSX.Element {
  const segments = path.split('/').filter(Boolean);
  const para = paraKindOf(segments[0] ?? '');
  let acc = '';
  return (
    <nav class="folder-path" aria-label="You are in">
      {para !== null && <FolderMark kind={para} size={18} />}
      {segments.map((segment, at) => {
        acc = acc === '' ? segment : `${acc}/${segment}`;
        const last = at === segments.length - 1;
        return (
          <span key={acc} class="folder-path-part">
            {at > 0 && (
              <span class="folder-path-sep" aria-hidden="true">
                ›
              </span>
            )}
            {last ? (
              <b aria-current="page">{displayName(segment)}</b>
            ) : (
              <a href={folderHref(acc)}>{displayName(segment)}</a>
            )}
          </span>
        );
      })}
    </nav>
  );
}

const NO_FILES: ReadonlyMap<string, DriveFile> = new Map();

/** Past this many rows the list renders only the ones in view (`VirtualList`,
 * #590/#611); below it every row is in the DOM. */
const VIRTUAL_FROM_ROWS = 150;

/** A row's and a date heading's height in px before they are measured. */
const ROW_ESTIMATE = 62;
const GROUP_ESTIMATE = 34;

/** How many notes' frontmatter are read at once. */
const META_BATCH = 8;

type VirtualModule = typeof import('./virtual-list.js');

// Loaded the first time a folder passes the threshold, as the tree does, so
// the virtualiser stays out of the startup chunk.
let virtualModule: VirtualModule | null = null;

interface FolderViewState {
  sort: FolderSort;
  kind: FileKind | null;
  origin: OriginFilter;
  /** `null` until the person picks one: the folder then chooses (#613). */
  layout: FolderLayout | null;
}

const DEFAULT_VIEW: FolderViewState = {
  sort: 'newest',
  kind: null,
  origin: 'all',
  layout: null,
};

/** The folder's `viewSettings` record. `folderSort` is the exact sort (the
 * shared `sort` only knows name and modified); `compareColumns` is Compare's
 * and is kept whenever this screen writes. */
type StoredView = ViewSettings & { folderSort?: FolderSort };

function readView(stored: StoredView | undefined): FolderViewState {
  if (stored === undefined) return DEFAULT_VIEW;
  const sort =
    FOLDER_SORTS.find((candidate) => candidate === stored.folderSort) ??
    (stored.sort === 'name' ? 'name' : 'newest');
  const origin: OriginFilter =
    stored.originFilter === 'originals' || stored.originFilter === 'bower'
      ? stored.originFilter
      : 'all';
  const kind =
    typeof stored.kindFilter === 'string'
      ? (stored.kindFilter as FileKind)
      : null;
  const layout: FolderLayout | null =
    stored.layoutChosen !== true
      ? null
      : stored.layout === 'grid'
        ? 'grid'
        : 'list';
  return { sort, kind, origin, layout };
}

/** Sort, kind filter and origin filter, remembered per folder (#582). */
function useFolderView(
  path: string,
): [FolderViewState, (patch: Partial<FolderViewState>) => void] {
  const [view, setView] = useState<FolderViewState>(DEFAULT_VIEW);

  useEffect(() => {
    let cancelled = false;
    setView(DEFAULT_VIEW);
    loadViewSettings(path).then(
      (stored) => {
        if (!cancelled) setView(readView(stored));
      },
      (err: unknown) => console.error(err),
    );
    return () => {
      cancelled = true;
    };
  }, [path]);

  function update(patch: Partial<FolderViewState>): void {
    const next = { ...view, ...patch };
    setView(next);
    loadViewSettings(path)
      .then((stored) => {
        const base: StoredView = stored ?? {
          sort: 'modified',
          kindFilter: null,
          originFilter: null,
          layout: 'list',
        };
        const record: StoredView = {
          ...base,
          sort:
            next.sort === 'name' || next.sort === 'kind' ? 'name' : 'modified',
          folderSort: next.sort,
          kindFilter: next.kind,
          originFilter: next.origin === 'all' ? null : next.origin,
          ...(next.layout !== null && {
            layout: next.layout,
            layoutChosen: true,
          }),
        };
        return saveViewSettings(path, record);
      })
      .catch((err: unknown) => console.error(err));
  }

  return [view, update];
}

function versionKey(notes: readonly DriveFile[]): string {
  return notes.map((note) => `${note.id}:${note.modifiedTime ?? ''}`).join('|');
}

/** The frontmatter of the folder's notes, read lazily a few at a time: rows
 * render first and their key facts follow. */
function useNoteMetas(
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
function useCatalogueFiles(
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

/** The first line of each answer's text, read only when By Bower shows it. */
function useFirstLines(
  notes: readonly DriveFile[],
  getNoteText: (id: string) => Promise<string>,
): ReadonlyMap<string, string> {
  const [lines, setLines] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const key = versionKey(notes);
  const latest = useRef(notes);
  latest.current = notes;

  useEffect(() => {
    let cancelled = false;
    const read = new Map<string, string>();
    void (async () => {
      for (const note of latest.current) {
        if (cancelled) return;
        try {
          const { body } = parseFrontmatter(await getNoteText(note.id));
          const first = body
            .split(/\r\n|\r|\n/)
            .map((line) => line.trim())
            .find((line) => line !== '' && !line.startsWith('#'));
          if (first !== undefined) read.set(note.id, first);
        } catch (err) {
          console.error(err);
        }
      }
      if (!cancelled) setLines(new Map(read));
    })();
    return () => {
      cancelled = true;
    };
  }, [key, getNoteText]);

  return lines;
}

const FILTER_LABELS: Readonly<Record<OriginFilter, string>> = {
  all: 'All',
  originals: 'Originals',
  bower: 'By Bower',
};

const TIP_LIST =
  'marks what Bower wrote. Everything else is yours: what you added or wrote. An original and the note Bower wrote about it share one row.';
const TIP_BOWER =
  'Only what Bower wrote, with its key facts, so you can skim a folder without opening the originals. Tap All to see them again.';

/** What a row says under its title. */
function RowDetail({
  row,
  view,
  model,
  catalogue,
  pages,
  now,
  firstLine,
}: {
  row: FolderRow;
  view: FolderViewState;
  model: FolderModel;
  catalogue: ReadonlyMap<string, Origin>;
  pages: ReadonlyMap<string, number>;
  now: number;
  firstLine: string | undefined;
}): JSX.Element {
  const meta = model.metas.get(row.file.id);
  if (!row.bower) {
    return (
      <span class="folder-row-detail">
        {fileLine(
          row.file,
          originOf(row.file, catalogue),
          pages.get(row.file.id),
        )}
      </span>
    );
  }
  const inBower = view.origin === 'bower';
  if (row.answer) {
    const when = row.modified === '' ? 'undated' : whenWords(row.modified, now);
    return (
      <>
        <span class="folder-row-detail">
          <BowerTag />{' '}
          {inBower ? `answer · ${when}` : 'answer to your question'}
        </span>
        {inBower && firstLine !== undefined && (
          <span class="folder-row-lead">{firstLine}</span>
        )}
      </>
    );
  }
  const kind = meta?.kind === undefined ? undefined : kindById(meta.kind);
  const facts =
    kind === undefined || meta === undefined
      ? []
      : keyFactsFor(kind, meta.fields);
  const about =
    row.original === undefined ? 'note' : `note on the ${subjectOf(meta)}`;
  const original = row.original === undefined ? '' : FILE_KIND_LABELS[row.kind];
  const dot = facts.length > 0 ? ' ·' : '';
  return (
    <>
      <span class="folder-row-detail">
        <BowerTag /> {about}
        {original !== '' && ` ${inBower ? original : `${original}${dot}`}`}
        {!inBower && facts.length > 0 && (
          <>
            {' '}
            <KeyFacts facts={facts} inline />
          </>
        )}
      </span>
      {inBower && facts.length > 0 && <KeyFacts facts={facts} />}
    </>
  );
}

export interface FolderItemsProps {
  contents: FolderContents;
  titles: ReadonlyMap<string, string>;
  catalogue: ReadonlyMap<string, Origin>;
  now: number;
  /** The desktop's "Compare <n> <plural>" button beside the kind filter
   * (#613, R-COMP-1); `undefined` when the folder has nothing to compare. */
  compare?: { label: string; onOpen: () => void };
  /** From 1200 px (#614): a selection that follows the arrow keys, the
   * kind chips, the right-hand dates and the key hint. */
  desktop?: boolean;
  /** Tells the preview pane what is selected (desktop only). */
  onPreview?: (item: PanePreview | null) => void;
  /** Takes the person up a folder (Backspace); absent at a top level. */
  onUp?: (() => void) | undefined;
  /** Opens a row's address (Enter). */
  onOpen?: (href: string) => void;
}

/** A tile's line under its title: "PDF · Bower's note", "Photo",
 * "PDF · 6 pages", "Spreadsheet (CSV)", "Note". */
export function tileLine(row: FolderRow, pages: number | undefined): string {
  const label =
    row.kind === 'csv' ? 'Spreadsheet (CSV)' : FILE_KIND_LABELS[row.kind];
  if (row.original !== undefined) return `${label} · Bower's note`;
  if (row.kind === 'note') return row.bower ? "Bower's note" : label;
  if (pages !== undefined && pages > 0) {
    return `${label} · ${pages} ${pages === 1 ? 'page' : 'pages'}`;
  }
  return label;
}

type Entry = { type: 'group'; label: string } | { type: 'row'; row: FolderRow };

function entryKey(entry: Entry): string {
  return entry.type === 'group' ? `g:${entry.label}` : entry.row.key;
}

/** The list mode of the folder screen (issue #611): origin filter, tool row,
 * date groups and rows, with pairs as one row. */
export function FolderItems({
  contents,
  titles,
  catalogue,
  now,
  compare,
  desktop = false,
  onPreview,
  onUp,
  onOpen,
}: FolderItemsProps): JSX.Element {
  const fresh = useNew();
  const newHere = fresh.newCountIn(contents.path);
  const [quick, setQuick] = useState<FolderRow | null>(null);
  const { index, getNoteText } = useVault();
  const byPath = index?.byPath ?? NO_FILES;
  const catalogueFile = byPath.get(CATALOGUE_PATH);
  const [view, onView] = useFolderView(contents.path);
  const metas = useNoteMetas(contents.notes);
  const catalogueFiles = useCatalogueFiles(catalogueFile, getNoteText);
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
  const filed = lastFiled(contents.items, now);
  const [loaded, setLoaded] = useState<VirtualModule | null>(virtualModule);

  const titleOf = (row: FolderRow): string =>
    fileKind(row.file) === 'note'
      ? (titles.get(row.file.id) ?? noteTitle(row.file))
      : fileTitle(row.file.name);

  const originRows = useMemo(
    () => rowsFor(model, view.origin),
    [model, view.origin],
  );
  const options = useMemo(() => kindOptions(originRows), [originRows]);
  const kind = options.some((option) => option.kind === view.kind)
    ? view.kind
    : null;
  const rows = useMemo(
    () => sortRows(filterKind(originRows, kind), view.sort, titleOf),
    // `titleOf` follows `titles`.
    [originRows, kind, view.sort, titles],
  );
  const entries = useMemo<Entry[]>(() => {
    if (view.sort === 'name' || view.sort === 'kind') {
      return rows.map((row): Entry => ({ type: 'row', row }));
    }
    return groupRows(rows, now).flatMap((group): Entry[] => [
      { type: 'group', label: group.label },
      ...group.rows.map((row): Entry => ({ type: 'row', row })),
    ]);
  }, [rows, view.sort, now]);

  const pages = useMemo(() => {
    const map = new Map<string, number>();
    for (const [noteId, original] of model.pairs) {
      const count = model.metas.get(noteId)?.pages;
      if (count !== undefined) map.set(original.id, count);
    }
    return map;
  }, [model]);

  const answers = useMemo(
    () =>
      view.origin === 'bower'
        ? rows.filter((row) => row.answer).map((row) => row.file)
        : [],
    [rows, view.origin],
  );
  const firstLines = useFirstLines(answers, getNoteText);

  const wantsVirtual = rows.length > VIRTUAL_FROM_ROWS;
  useEffect(() => {
    if (!wantsVirtual || loaded !== null) return;
    let cancelled = false;
    void import('./virtual-list.js')
      .then((mod) => {
        virtualModule = mod;
        if (!cancelled) setLoaded(mod);
      })
      .catch((err: unknown) =>
        console.error('Could not load the long-list support', err),
      );
    return () => {
      cancelled = true;
    };
  }, [wantsVirtual, loaded]);

  const showTime = view.sort === 'name' || view.sort === 'kind';

  // Grid when the person chose it, else when most of the folder is photos.
  const allKinds = useMemo(
    () => rowsFor(model, 'all').map((row) => row.kind),
    [model],
  );
  const layout: FolderLayout = view.layout ?? defaultLayout(allKinds);

  // Holding a row or tile opens quick look (#613); the click that follows a
  // real long press must not also open the row.
  const { consumeLongPress, ...press } = useLongPress((target) => {
    const key = target.dataset.rowKey;
    const held = rows.find((row) => row.key === key);
    if (held !== undefined) setQuick(held);
  });
  const holdProps = (row: FolderRow): Record<string, unknown> => ({
    ...press,
    'data-row-key': row.key,
    ...(desktop && {
      'data-selected': row.key === selected?.key ? 'true' : undefined,
      onFocus: (): void => setSelectedKey(row.key),
      onPointerEnter: (event: PointerEvent): void => {
        if (event.pointerType === 'mouse') setSelectedKey(row.key);
      },
    }),
    onClick: (event: Event): void => {
      if (consumeLongPress()) event.preventDefault();
    },
    onKeyDown: (event: KeyboardEvent): void => {
      if (event.key !== ' ') return;
      event.preventDefault();
      setQuick(row);
    },
  });
  const hrefOf = (row: FolderRow): string =>
    fileKind(row.file) === 'note'
      ? `/note/${row.file.id}`
      : `/file/${row.file.id}`;

  function renderTile(row: FolderRow): JSX.Element {
    const shown = row.original ?? row.file;
    const isNote = row.original === undefined && row.kind === 'note';
    const showsNote = isNote || row.original !== undefined;
    const isNew =
      fresh.isNew(row.file.id) ||
      (row.original !== undefined && fresh.isNew(row.original.id));
    const icon = (
      <KindIcon file={shown} origin={originOf(row.file, catalogue)} />
    );
    return (
      <a class="folder-tile folder-item" href={hrefOf(row)} {...holdProps(row)}>
        <span class="folder-tile-thumb">
          {showsNote ? (
            <span class="folder-tile-note">
              {row.bower && (
                <span class="folder-tile-bower">
                  <Bird state="idle" size={16} />
                  Bower&rsquo;s note
                </span>
              )}
              <NoteLines id={row.file.id} />
            </span>
          ) : (
            <Thumb file={shown} kind={row.kind} fallback={icon} />
          )}
          {row.kind !== 'note' && <KindBadge kind={row.kind} file={shown} />}
        </span>
        <span class="folder-tile-title">
          {titleOf(row)}
          {isNew && (
            <>
              {' '}
              <NewTag />
            </>
          )}
        </span>
        <span class="folder-tile-line">
          {tileLine(row, pages.get(shown.id))}
        </span>
      </a>
    );
  }

  function renderEntry(entry: Entry): JSX.Element {
    if (entry.type === 'group') {
      return <h3 class="folder-group">{entry.label}</h3>;
    }
    const { row } = entry;
    const href = hrefOf(row);
    const isNew =
      fresh.isNew(row.file.id) ||
      (row.original !== undefined && fresh.isNew(row.original.id));
    return (
      <a class="folder-row folder-item" href={href} {...holdProps(row)}>
        <KindIcon
          file={row.original ?? row.file}
          origin={originOf(row.file, catalogue)}
          badge
        />
        <span class="folder-row-text">
          <span class="folder-row-title">
            <span class="folder-row-name">{titleOf(row)}</span>
            {isNew && <NewTag />}
          </span>
          <RowDetail
            row={row}
            view={view}
            model={model}
            catalogue={catalogue}
            pages={pages}
            now={now}
            firstLine={firstLines.get(row.file.id)}
          />
        </span>
        {desktop && row.file.modifiedTime !== undefined && (
          <time class="folder-row-date" dateTime={row.file.modifiedTime}>
            {rowDate(row.file.modifiedTime, now)}
          </time>
        )}
        {!desktop && showTime && row.file.modifiedTime !== undefined && (
          <time class="folder-row-meta" dateTime={row.file.modifiedTime}>
            {shortAge(row.file.modifiedTime, now)}
          </time>
        )}
      </a>
    );
  }

  // The desktop's selection (#614): the preview pane shows this row, the
  // arrow keys move it, Space and Enter act on it.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = desktop
    ? (rows.find((row) => row.key === selectedKey) ?? rows[0] ?? null)
    : null;
  const orderedRows = useMemo(
    () =>
      layout === 'grid'
        ? rows
        : entries.flatMap((entry) => (entry.type === 'row' ? [entry.row] : [])),
    [layout, rows, entries],
  );

  function panePropsOf(row: FolderRow): PanePreview {
    const shown = row.original ?? row.file;
    const meta = model.metas.get(row.file.id);
    const noteKind = meta?.kind === undefined ? undefined : kindById(meta.kind);
    return {
      title: titleOf(row),
      href: hrefOf(row),
      file: row.file,
      original: row.original,
      kind: row.kind,
      pages: pages.get(shown.id),
      origin: originOf(shown, catalogue),
      folderPath: contents.path,
      now: Date.now(),
      facts:
        noteKind === undefined || meta === undefined
          ? []
          : keyFactsFor(noteKind, meta.fields),
    };
  }

  const selectedRowKey = selected?.key ?? null;
  // `titles` is a new map on every render, so the effect follows the one
  // title it uses instead.
  const selectedTitle = selected === null ? null : titleOf(selected);
  useEffect(() => {
    if (!desktop || onPreview === undefined) return;
    onPreview(selected === null ? null : panePropsOf(selected));
    // The selected row's key names it; the rest follow the model.
  }, [desktop, selectedRowKey, selectedTitle, model, catalogue, pages]);
  useEffect(
    () => () => {
      if (onPreview !== undefined) onPreview(null);
    },
    [],
  );

  // The key handler is set once and reads what the last render left here, so
  // a key pressed before a render has settled still sees the newest state.
  const live = useRef({
    selectedKey: null as string | null,
    orderedRows,
    selected,
    layout,
    onUp,
    onOpen,
  });
  live.current = {
    selectedKey: selected?.key ?? null,
    orderedRows,
    selected,
    layout,
    onUp,
    onOpen,
  };

  useEffect(() => {
    if (!desktop) return;
    function onKeyDown(event: KeyboardEvent): void {
      const { orderedRows, layout, onUp, onOpen } = live.current;
      if (event.defaultPrevented) return;
      // Quick look is a dialog; it has the keys while it is open.
      if (document.querySelector('.quick-look-panel') !== null) return;
      const target = event.target;
      const element = target instanceof HTMLElement ? target : null;
      if (element?.closest('[role="dialog"]') != null) return;
      const typing =
        element !== null &&
        (element.tagName === 'INPUT' ||
          element.tagName === 'TEXTAREA' ||
          element.tagName === 'SELECT' ||
          element.isContentEditable);
      const onControl =
        element !== null && element.closest('a, button, summary') !== null;
      const grid = document.querySelector('.folder-grid');
      const columns =
        layout === 'grid' && grid !== null
          ? Math.max(
              1,
              getComputedStyle(grid)
                .gridTemplateColumns.split(' ')
                .filter(Boolean).length,
            )
          : 1;
      const action = folderKeyAction(event, {
        selected: orderedRows.findIndex(
          (row) => row.key === live.current.selectedKey,
        ),
        count: orderedRows.length,
        columns,
        canGoUp: onUp !== undefined,
        typing,
        onControl,
      });
      // Search is the switcher's own key handling.
      if (action === null || action.type === 'search') return;
      event.preventDefault();
      if (action.type === 'up') {
        onUp?.();
      } else if (action.type === 'select') {
        const next = orderedRows[action.index];
        if (next === undefined) return;
        live.current.selectedKey = next.key;
        live.current.selected = next;
        setSelectedKey(next.key);
        document
          .querySelector(`[data-row-key="${CSS.escape(next.key)}"]`)
          ?.scrollIntoView?.({ block: 'nearest' });
      } else if (live.current.selected !== null) {
        if (action.type === 'quick-look') setQuick(live.current.selected);
        else onOpen?.(hrefOf(live.current.selected));
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [desktop]);

  const VirtualList = loaded?.VirtualList;
  const counts: Record<OriginFilter, number | null> = {
    all: null,
    originals: model.originals.length,
    bower: model.bower.length,
  };

  return (
    <div class="folder-section">
      <div class="folder-facts">
        <p class="folder-counts">
          {desktop && newHere > 0
            ? metaCounts(model).replace(
                /^\d+ things?/,
                (things) => `${things} · ${newHere} new`,
              )
            : metaCounts(model)}
        </p>
        {filed !== null && <p class="folder-filed">{filed}</p>}
      </div>
      <div class="folder-seg" role="group" aria-label="Show">
        {(['all', 'originals', 'bower'] as const).map((filter) => (
          <button
            key={filter}
            type="button"
            class="folder-seg-btn"
            aria-pressed={view.origin === filter}
            onClick={() => onView({ origin: filter, kind: null })}
          >
            {FILTER_LABELS[filter]}
            {counts[filter] !== null && (
              <span class="folder-seg-count"> {counts[filter]}</span>
            )}
          </button>
        ))}
      </div>
      <div class="folder-tools">
        <select
          class="folder-select"
          aria-label="Sort"
          value={view.sort}
          onChange={(event) =>
            onView({ sort: event.currentTarget.value as FolderSort })
          }
        >
          {FOLDER_SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {SORT_LABELS[sort]}
            </option>
          ))}
        </select>
        {desktop ? (
          <div class="folder-kind-chips" role="group" aria-label="Kind">
            <button
              type="button"
              class="folder-kind-chip"
              aria-pressed={kind === null}
              onClick={() => onView({ kind: null })}
            >
              All {originRows.length}
            </button>
            {options.map((option) => (
              <button
                key={option.kind}
                type="button"
                class="folder-kind-chip"
                aria-pressed={kind === option.kind}
                onClick={() => onView({ kind: option.kind })}
              >
                {option.label}s {option.count}
              </button>
            ))}
          </div>
        ) : (
          <select
            class="folder-select"
            aria-label="Kind"
            value={kind ?? ''}
            onChange={(event) =>
              onView({
                kind:
                  event.currentTarget.value === ''
                    ? null
                    : (event.currentTarget.value as FileKind),
              })
            }
          >
            <option value="">All kinds</option>
            {options.map((option) => (
              <option key={option.kind} value={option.kind}>
                {option.label} {option.count}
              </option>
            ))}
          </select>
        )}
        {compare !== undefined && (
          <button
            type="button"
            class="folder-compare-btn"
            onClick={compare.onOpen}
          >
            {compare.label}
          </button>
        )}
        <LayoutToggle
          layout={layout}
          onChange={(next) => onView({ layout: next })}
        />
      </div>
      {rows.length === 0 ? (
        <p class="folder-elsewhere">
          {view.origin === 'bower'
            ? `Bower has not written anything in ${contents.name} yet.`
            : 'Nothing of that kind here.'}
        </p>
      ) : layout === 'grid' ? (
        <ul class="folder-grid">
          {rows.map((row) => (
            <li key={row.key}>{renderTile(row)}</li>
          ))}
        </ul>
      ) : wantsVirtual && VirtualList !== undefined ? (
        <VirtualList
          as="ul"
          rowAs="li"
          class="folder-list folder-virtual"
          items={entries}
          estimateSize={(at) =>
            entries[at]?.type === 'group' ? GROUP_ESTIMATE : ROW_ESTIMATE
          }
          overscan={10}
          getKey={entryKey}
          renderRow={renderEntry}
        />
      ) : (
        <ul class="folder-list">
          {entries.map((entry) => (
            <li key={entryKey(entry)}>{renderEntry(entry)}</li>
          ))}
        </ul>
      )}
      <p class="folder-list-tip">
        {view.origin === 'bower' ? (
          <span>{TIP_BOWER}</span>
        ) : (
          <span>
            <BowerTag /> {TIP_LIST}
          </span>
        )}
      </p>
      {desktop && <p class="folder-keys-hint">{KEY_HINT}</p>}
      {quick !== null && (
        <QuickLook
          title={titleOf(quick)}
          href={hrefOf(quick)}
          file={quick.file}
          original={quick.original}
          kind={quick.kind}
          pages={pages.get((quick.original ?? quick.file).id)}
          origin={originOf(quick.original ?? quick.file, catalogue)}
          folderPath={contents.path}
          now={now}
          onClose={() => setQuick(null)}
        />
      )}
    </div>
  );
}
