/**
 * The folder screen's body (issue #911, spec §4.8–4.11): h2 "In this
 * folder" with the segments All / Originals <n> / By Bower <n> and the
 * Filter & sort icon on one row, then the folder's things. Loaded on demand
 * by `routes/folder.tsx`, so it stays out of the startup chunk.
 *
 * - A folder (PF-Main, LI-Main): subfolders first as rows ("Listings",
 *   "6 things"), then the date groups "Today", "Yesterday", "29 Sep" of
 *   ListRows (icon, title, kind, date only: G-18), or the same groups as
 *   grid tiles (GR-Main). An original and its companion note are one row.
 * - A folder of folders (AR-Main): the group "Folders" with folder cards,
 *   then "Recently changed in <folder>" across its subfolders (R-API-1).
 *
 * On desktop one click selects (the preview column shows it), a double
 * click or Enter opens, hover never selects (G-5). A folder opens with its
 * first row selected; a folder of folders with nothing selected (K-33).
 *
 * Counts come from `folder-view.ts#folderSegments` only, so the meta line,
 * the segments and "Show <n> things" agree (K-31); the route counts the
 * same model itself (`folder-summary.ts`). Sort, kind and layout are remembered per folder in
 * `viewSettings` (#582).
 */

import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { folderKeyAction } from '../folder-keys.js';
import { isBowerWritten } from '../bower-written.js';
import { loadViewSettings, saveViewSettings } from '../cache.js';
import type { ViewSettings } from '../cache.js';
import { FOLDER_MIME } from '../drive.js';
import type { DriveFile } from '../drive.js';
import { dayWords, metaLine, shortDate } from '../meta-line.js';
import type { MetaItem } from '../meta-line.js';
import { originOf } from '../file-origin.js';
import type { Origin } from '../file-origin.js';
import {
  CARD_RECENT_MAX,
  FOLDER_SORTS,
  RECENT_MAX,
  fileLine,
  filterKind,
  folderSegments,
  kindOptions,
  rowsFor,
  sortRows,
  folderPagesUnder,
  isFolderPage,
  subfolderThings,
} from '../folder-view.js';
import type { FolderRow, FolderSort, OriginFilter } from '../folder-view.js';
import { loadNoteMeta, peekNoteMeta } from '../note-meta.js';
import {
  displayName,
  folderHref,
  folderOf,
  paraKindOf,
} from '../navigation.js';
import type { FolderContents, FolderSubfolder } from '../navigation.js';
import { noteTitle } from '../note-title.js';
import type { PendingRequest } from '../rename-request.js';
import { useNew } from '../use-new.js';
import { useVault } from '../vault-store.js';
import {
  FILE_KIND_LABELS,
  changedUnder,
  fileKind,
  fileTitle,
} from '../vault-index.js';
import type { FileKind } from '../vault-index.js';
import { Badge } from './badge.js';
import { FilterSortSheet } from './filter-sort-sheet.js';
import type { FilterSortChoice } from './filter-sort-sheet.js';
import { FolderCard } from './folder-card.js';
import { useFolderModel } from './folder-summary.js';
import type { FolderCardItem } from './folder-card.js';
import { FolderGrid, GridTile, defaultLayout } from './folder-grid.js';
import type { FolderLayout, TileGroup } from './folder-grid.js';
import { IconChevronRight } from './icons.js';
import { ListRow } from './list-row.js';
import type { ListRowItem } from './list-row.js';
import { QuickLook } from './quick-look.js';
import type { PaneInsideItem, PaneItem } from './quick-look.js';
import { Segmented } from './segmented.js';
import { EmptyFolder, EmptySegment } from './system-state.js';
import { useBowerNotes, useBowerWritten } from './tree.js';
import { useLongPress } from './use-long-press.js';

/** "1 thing" / "3 things". */
function things(n: number): string {
  return `${n} ${n === 1 ? 'thing' : 'things'}`;
}

/** A subfolder as a row of the one list (R-PF-5, board PF-Main): the folder
 * outline in its root's colour, its name, and "6 things" with a chevron at
 * the right. */
/**
 * Which of `pages` are a folder's own page Bower wrote (`isFolderPage`),
 * read from each note's frontmatter (the cache first, Drive once), so a
 * count does not depend on which notes happen to be cached: every such page
 * at every depth is left out (K-31, #950).
 */
function useBowerFolderPages(pages: readonly DriveFile[]): ReadonlySet<string> {
  // What this tab already read (#922): a card's count is never guessed.
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

export function SubfolderRow({
  folder,
}: {
  folder: FolderSubfolder;
}): JSX.Element {
  const count = folder.things > 0 ? things(folder.things) : '';
  return (
    <ListRow
      item={{
        id: folder.path,
        title: folder.name,
        name: folder.name,
        mimeType: FOLDER_MIME,
        path: folder.path,
        href: folderHref(folder.path),
      }}
      trailing={
        <>
          {count}
          <IconChevronRight />
        </>
      }
      rowProps={{ class: 'folder-sub-row' }}
    />
  );
}

/** The title a list shows for `file`: a note's title, a file's name
 * without its extension. */
function titleOfFile(file: DriveFile): string {
  return fileKind(file) === 'note' ? noteTitle(file) : fileTitle(file.name);
}

/** The first things inside a folder, newest first, as its card lists them
 * (title and kind only, G-18; R-API-1). `bower` names the notes Bower wrote,
 * so they read "Bower note" with the bird. */
export function firstInside(
  byPath: ReadonlyMap<string, DriveFile>,
  path: string,
  max = 3,
  bower: ReadonlySet<string> = new Set(),
  answers: ReadonlySet<string> = new Set(),
): FolderCardItem[] {
  return changedUnder(byPath, path, max).map((file) => ({
    id: file.id,
    title: titleOfFile(file),
    name: file.name,
    mimeType: file.mimeType,
    path: file.path,
    bowerWritten: bower.has(file.id),
    answer: answers.has(file.id),
  }));
}

export { RECENT_MAX } from '../folder-view.js';

/** A day group's label: "Today", "Yesterday", "29 Sep" (S-PF-6). */
export function dayLabel(iso: string, now: number): string {
  const words = iso === '' ? '' : dayWords(iso, now);
  if (words === '') return 'Undated';
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

/** Runs of `rows` (already in date order) under their day's label. */
export function dayGroups<T extends { modified: string }>(
  rows: readonly T[],
  now: number,
): TileGroup<T>[] {
  const groups: { label: string; items: T[] }[] = [];
  for (const row of rows) {
    const label = dayLabel(row.modified, now);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(row);
    else groups.push({ label, items: [row] });
  }
  return groups;
}

const NO_FILES: ReadonlyMap<string, DriveFile> = new Map();

/** Past this many rows the list renders only the ones in view
 * (`VirtualList`, #590/#611); below it every row is in the DOM. */
const VIRTUAL_FROM_ROWS = 150;

const ROW_ESTIMATE = 62;
const GROUP_ESTIMATE = 34;

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

/** Sort, kind, origin and layout, remembered per folder (#582). */
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

/** A row's line for what the person added or wrote. A CSV that is the copy
 * of a Google Sheet (`appProperties.bowerSource`, set when Bower exports one
 * from Drive) says so, as the board has it. */
export function addedLine(
  file: DriveFile,
  origin: Origin | null,
  pages: number | undefined,
): string {
  const source = file.appProperties?.bowerSource;
  if (fileKind(file) === 'csv' && source !== undefined && source !== '') {
    return `${FILE_KIND_LABELS.csv} · copy of your Google Sheet`;
  }
  return fileLine(file, origin, pages);
}

const NO_WAITING: ReadonlyMap<string, PendingRequest> = new Map();

export interface FolderItemsProps {
  contents: FolderContents;
  titles: ReadonlyMap<string, string>;
  catalogue: ReadonlyMap<string, Origin>;
  now: number;
  /** From 1200 px: one click selects and the preview column shows it. */
  desktop?: boolean;
  /** A root folder with subfolders (AR-Main): cards and Recently changed. */
  folderOfFolders?: boolean;
  /** The Rename and Move requests that wait, by path (`pendingByPath`):
   * their rows say so (#765, R-MORE-4, D32). */
  waiting?: ReadonlyMap<string, PendingRequest>;
  /** Tells the preview column what is selected (desktop only). */
  onPreview?: (item: PaneItem | null) => void;
  /** Opens Ask Bower about this folder (the empty folder's link). */
  onAsk?: () => void;
  /** Takes the person up a folder (Backspace); absent at a top level. */
  onUp?: (() => void) | undefined;
  /** Opens a row's address (Enter, double click). */
  onOpen?: (href: string) => void;
}

/** The row the preview shows: the chosen one, else the first row. */
export function pickSelected<T extends { key: string; file: { id: string } }>(
  rows: readonly T[],
  selectedKey: string | null,
  skipId?: string,
): T | null {
  const chosen = rows.find((row) => row.key === selectedKey);
  if (chosen !== undefined) return chosen;
  return rows.find((row) => row.file.id !== skipId) ?? null;
}

type Entry = { type: 'group'; label: string } | { type: 'row'; row: FolderRow };

function entryKey(entry: Entry): string {
  return entry.type === 'group' ? `g:${entry.label}` : entry.row.key;
}

const SEGMENT_LABELS: Readonly<Record<OriginFilter, string>> = {
  all: 'All',
  originals: 'Originals',
  bower: 'By Bower',
};

export function FolderItems({
  contents,
  titles,
  catalogue,
  now,
  desktop = false,
  folderOfFolders = false,
  waiting = NO_WAITING,
  onPreview,
  onAsk,
  onUp,
  onOpen,
}: FolderItemsProps): JSX.Element {
  const fresh = useNew();
  const [quick, setQuick] = useState<FolderRow | null>(null);
  const { index } = useVault();
  const byPath = index?.byPath ?? NO_FILES;
  // K-31 on a subfolder's row and card: the same count as its own page, so
  // a page Bower wrote for a folder is not one of its things (#950).
  const folderPages = useMemo(
    () =>
      contents.subfolders.flatMap((sub) =>
        folderPagesUnder(index?.folders ?? [], byPath, sub.path),
      ),
    [contents.subfolders, index, byPath],
  );
  const bowerPages = useBowerFolderPages(folderPages);
  const subfolders = useMemo(
    () =>
      contents.subfolders.map((sub) => ({
        ...sub,
        things: subfolderThings(sub, index?.folders ?? [], byPath, bowerPages),
      })),
    [contents.subfolders, index, byPath, bowerPages],
  );
  const [view, onView] = useFolderView(contents.path);
  const { model } = useFolderModel(contents, catalogue);
  const [loaded, setLoaded] = useState<VirtualModule | null>(virtualModule);

  // A folder of folders: what its cards and Recently changed list.
  const recent = useMemo(
    () =>
      folderOfFolders ? changedUnder(byPath, contents.path, RECENT_MAX) : [],
    [folderOfFolders, byPath, contents.path],
  );
  const cardFiles = useMemo(
    () =>
      folderOfFolders
        ? subfolders.flatMap((folder) =>
            changedUnder(byPath, folder.path, CARD_RECENT_MAX),
          )
        : [],
    [folderOfFolders, byPath, subfolders],
  );
  const bowerSet = useBowerWritten(
    useMemo(() => [...recent, ...cardFiles], [recent, cardFiles]),
  );
  // Which of those are answers: "Bower answer", as the list says (K-14).
  const { answers } = useBowerNotes(
    useMemo(() => [...recent, ...cardFiles], [recent, cardFiles]),
  );

  const titleOf = (row: FolderRow): string =>
    fileKind(row.file) === 'note'
      ? (titles.get(row.file.id) ?? noteTitle(row.file))
      : fileTitle(row.file.name);

  // K-31: subfolders count as originals, except on a folder of folders,
  // whose cards are not its own things (AR-Main: "Originals 0").
  const subCount = folderOfFolders ? 0 : subfolders.length;
  const segments = folderSegments({ subfolders: subCount, model });

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
  const grouped = view.sort === 'newest' || view.sort === 'oldest';
  const groups = useMemo<TileGroup<FolderRow>[]>(
    () => (grouped ? dayGroups(rows, now) : [{ label: null, items: rows }]),
    [rows, grouped, now],
  );
  const entries = useMemo<Entry[]>(
    () =>
      groups.flatMap((group): Entry[] => [
        ...(group.label === null
          ? []
          : [{ type: 'group', label: group.label } as const]),
        ...group.items.map((row): Entry => ({ type: 'row', row })),
      ]),
    [groups],
  );

  const pages = useMemo(() => {
    const map = new Map<string, number>();
    for (const [noteId, original] of model.pairs) {
      const count = model.metas.get(noteId)?.pages;
      if (count !== undefined) map.set(original.id, count);
    }
    return map;
  }, [model]);

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

  // Grid when the person chose it, else when most of the folder is photos.
  const allKinds = useMemo(
    () => rowsFor(model, 'all').map((row) => row.kind),
    [model],
  );
  const folderLayout = defaultLayout(allKinds);
  const layout: FolderLayout = view.layout ?? folderLayout;

  // Subfolders are rows of the list in All and Originals (they are
  // originals, K-31) until a kind narrows it.
  const showSubs = (origin: OriginFilter, kindOn: string | null): boolean =>
    !folderOfFolders && origin !== 'bower' && kindOn === null;
  const subs = showSubs(view.origin, kind) ? subfolders : [];

  /** What Filter & sort's "Show <n> things" counts for a draft (K-31):
   * things, not rows, so in All a pair (one row) counts as its two files
   * and the number equals the meta line's. */
  const countFor = (choice: FilterSortChoice): number => {
    const known = options.some((option) => option.kind === choice.kind)
      ? (choice.kind as FileKind | null)
      : null;
    const shown = filterKind(originRows, known).reduce(
      (n, row) =>
        n + (view.origin === 'all' && row.original !== undefined ? 2 : 1),
      0,
    );
    return shown + (showSubs(view.origin, known) ? subfolders.length : 0);
  };

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
    class: 'folder-item',
    onClick: (event: Event): void => {
      if (consumeLongPress()) event.preventDefault();
    },
    onKeyDown: (event: KeyboardEvent): void => {
      if (event.key !== ' ') return;
      event.preventDefault();
      setQuick(row);
    },
  });
  const hrefOfFile = (file: DriveFile): string =>
    fileKind(file) === 'note' ? `/note/${file.id}` : `/file/${file.id}`;
  const hrefOf = (row: FolderRow): string => hrefOfFile(row.file);

  /** What a row or tile shows of its file (FileIcon, title, link). */
  function itemOf(row: FolderRow): ListRowItem & MetaItem {
    return {
      id: row.key,
      title: titleOf(row),
      href: hrefOf(row),
      name: row.file.name,
      mimeType: row.file.mimeType,
      bowerWritten: row.bower,
      answer: row.answer,
      path: row.file.path,
    };
  }
  const isNewRow = (row: FolderRow): boolean =>
    fresh.isNew(row.file.id) ||
    (row.original !== undefined && fresh.isNew(row.original.id));

  // The desktop's selection (#614): the preview column shows it, the arrow
  // keys move it, Space and Enter act on it. A folder of folders starts
  // with nothing selected (K-33).
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  useEffect(() => setSelectedKey(null), [contents.path]);
  const selected =
    desktop && !folderOfFolders ? pickSelected(rows, selectedKey) : null;
  const selectProps = (
    key: string,
    href: string,
  ): { selected: boolean; onSelect?: () => void; onOpen?: () => void } =>
    desktop
      ? {
          selected: folderOfFolders
            ? key === selectedKey
            : key === selected?.key,
          onSelect: () => setSelectedKey(key),
          ...(onOpen !== undefined && { onOpen: () => onOpen(href) }),
        }
      : { selected: false };

  function renderTile(row: FolderRow): JSX.Element {
    const date = row.modified === '' ? '' : shortDate(row.modified, now);
    return (
      <GridTile
        item={itemOf(row)}
        date={date}
        {...(row.modified !== '' && { dateTime: row.modified })}
        badge={isNewRow(row) ? <Badge tone="new">New</Badge> : undefined}
        rowProps={holdProps(row)}
        {...selectProps(row.key, hrefOf(row))}
      />
    );
  }

  function renderEntry(entry: Entry): JSX.Element {
    if (entry.type === 'group') {
      // Inside the desktop's listbox a heading is not allowed: plain text.
      return (
        <h3 class="folder-group" role={desktop ? 'presentation' : undefined}>
          {entry.label}
        </h3>
      );
    }
    const { row } = entry;
    const isWaiting =
      waiting.has(row.file.path) ||
      (row.original !== undefined && waiting.has(row.original.path));
    const item = itemOf(row);
    const meta = metaLine(item, { view: 'row', now }).text;
    const when = row.file.modifiedTime ?? (row.modified || undefined);
    return (
      <ListRow
        item={item}
        meta={isWaiting ? `${meta} · waiting for the next tidy-up` : meta}
        badge={isNewRow(row) ? <Badge tone="new">New</Badge> : undefined}
        trailing={
          when === undefined ? undefined : (
            <time class="folder-row-date" dateTime={when}>
              {shortDate(when, now)}
            </time>
          )
        }
        rowProps={holdProps(row)}
        {...selectProps(row.key, hrefOf(row))}
      />
    );
  }

  /** A file of this folder or below, as the preview column shows it. */
  function paneOfFile(file: DriveFile, original?: DriveFile): PaneItem {
    const shown = original ?? file;
    const bower =
      model.bowerIds.has(file.id) ||
      bowerSet.has(file.id) ||
      isBowerWritten(model.metas.get(file.id), file);
    return {
      title:
        fileKind(file) === 'note'
          ? (titles.get(file.id) ?? noteTitle(file))
          : fileTitle(file.name),
      href: hrefOfFile(file),
      file,
      original,
      kind: fileKind(shown),
      pages: pages.get(shown.id),
      origin: originOf(shown, catalogue),
      folderPath: folderOf(file.path),
      now: Date.now(),
      bower,
      answer: model.metas.get(file.id)?.type === 'answer',
    };
  }

  /** A subfolder card, as the preview column shows it (AR-Select-1280). */
  function paneOfFolder(folder: FolderSubfolder): PaneItem {
    const inside: PaneInsideItem[] = changedUnder(byPath, folder.path, 10).map(
      (file) => ({
        id: file.id,
        title: titleOfFile(file),
        href: hrefOfFile(file),
        name: file.name,
        mimeType: file.mimeType,
        path: file.path,
        bowerWritten: bowerSet.has(file.id),
        isNew: fresh.isNew(file.id),
        ...(file.modifiedTime !== undefined && { modified: file.modifiedTime }),
      }),
    );
    const own = byPath.get(folder.path);
    return {
      type: 'folder',
      title: folder.name,
      href: folderHref(folder.path),
      path: folder.path,
      ...(own !== undefined && { file: own }),
      things: folder.things,
      ...(folder.updated !== undefined && { updated: folder.updated }),
      inside,
      now: Date.now(),
    };
  }

  const orderedRows = useMemo(
    () =>
      layout === 'grid'
        ? groups.flatMap((group) => [...group.items])
        : entries.flatMap((entry) => (entry.type === 'row' ? [entry.row] : [])),
    [layout, groups, entries],
  );

  // Tell the preview column what is selected.
  const selectedRowKey = folderOfFolders
    ? selectedKey
    : (selected?.key ?? null);
  // `titles` is a new map on every render, so the effect follows the one
  // title it uses instead.
  const selectedTitle = selected === null ? null : titleOf(selected);
  useEffect(() => {
    if (!desktop || onPreview === undefined) return;
    if (!folderOfFolders) {
      onPreview(
        selected === null ? null : paneOfFile(selected.file, selected.original),
      );
      return;
    }
    const folder = subfolders.find((sub) => sub.path === selectedKey);
    if (folder !== undefined) {
      onPreview(paneOfFolder(folder));
      return;
    }
    const file = recent.find((one) => `recent:${one.id}` === selectedKey);
    onPreview(file === undefined ? null : paneOfFile(file));
    // The selected key names it; the rest follow the model.
  }, [
    desktop,
    folderOfFolders,
    selectedRowKey,
    selectedTitle,
    model,
    catalogue,
    pages,
    bowerSet,
  ]);
  useEffect(
    () => () => {
      onPreview?.(null);
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
    if (!desktop || folderOfFolders) return;
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
  }, [desktop, folderOfFolders]);

  const VirtualList = loaded?.VirtualList;
  const choice: FilterSortChoice = { sort: view.sort, kind, layout };
  const defaults: FilterSortChoice = {
    sort: 'newest',
    kind: null,
    layout: folderLayout,
  };
  const para = paraKindOf(contents.path.split('/')[0] ?? '');
  const emptyFolder = contents.items.length === 0 && subfolders.length === 0;

  function body(): JSX.Element {
    if (emptyFolder) {
      return <EmptyFolder onAsk={() => onAsk?.()} />;
    }
    if (folderOfFolders && view.origin === 'all') {
      return (
        <>
          <h3 class="folder-group">Folders</h3>
          <ul
            class="folder-cards"
            role={desktop ? 'listbox' : 'list'}
            aria-label={`Folders in ${displayName(contents.name)}`}
          >
            {subfolders.map((folder) => (
              <li key={folder.path} role={desktop ? 'none' : undefined}>
                <FolderCard
                  folder={{
                    path: folder.path,
                    name: folder.name,
                    href: folderHref(folder.path),
                    things: folder.things,
                    ...(folder.updated !== undefined && {
                      updated: folder.updated,
                    }),
                  }}
                  items={firstInside(byPath, folder.path, 3, bowerSet, answers)}
                  newCount={fresh.newCountIn(folder.path)}
                  now={now}
                  {...selectProps(folder.path, folderHref(folder.path))}
                />
              </li>
            ))}
          </ul>
          {recent.length > 0 && (
            <>
              <h3 class="folder-group">
                Recently changed in {displayName(contents.name)}
              </h3>
              <ul
                class="folder-list"
                role={desktop ? 'listbox' : 'list'}
                aria-label={`Recently changed in ${displayName(contents.name)}`}
              >
                {recent.map((file) => {
                  const parent = folderOf(file.path);
                  const item: ListRowItem & MetaItem = {
                    id: `recent:${file.id}`,
                    title: titleOfFile(file),
                    href: hrefOfFile(file),
                    name: file.name,
                    mimeType: file.mimeType,
                    path: file.path,
                    bowerWritten: bowerSet.has(file.id),
                    answer: answers.has(file.id),
                    root: para,
                    parentName: parent.slice(parent.lastIndexOf('/') + 1),
                  };
                  return (
                    <li key={file.id} role={desktop ? 'none' : undefined}>
                      <ListRow
                        item={item}
                        meta={metaLine(item, { view: 'mixed-row', now })}
                        badge={
                          fresh.isNew(file.id) ? (
                            <Badge tone="new">New</Badge>
                          ) : undefined
                        }
                        trailing={
                          file.modifiedTime === undefined ? undefined : (
                            <time
                              class="folder-row-date"
                              dateTime={file.modifiedTime}
                            >
                              {shortDate(file.modifiedTime, now)}
                            </time>
                          )
                        }
                        {...selectProps(item.id, hrefOfFile(file))}
                      />
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      );
    }
    if (rows.length === 0 && subs.length === 0) {
      if (view.origin !== 'all' && kind === null) {
        return (
          <EmptySegment
            segment={view.origin}
            folderOfFolders={folderOfFolders}
          />
        );
      }
      return <p class="empty-segment">Nothing of that kind here.</p>;
    }
    if (layout === 'grid') {
      return (
        <>
          {subs.length > 0 && (
            <ul
              class="folder-list"
              role="list"
              aria-label={`Folders in ${contents.name}`}
            >
              {subs.map((folder) => (
                <li key={folder.path}>
                  <SubfolderRow folder={folder} />
                </li>
              ))}
            </ul>
          )}
          <FolderGrid
            groups={groups}
            keyOf={(row) => row.key}
            renderTile={renderTile}
            selectable={desktop}
            label={`In ${contents.name}`}
          />
        </>
      );
    }
    if (wantsVirtual && VirtualList !== undefined) {
      return (
        <>
          {subs.length > 0 && (
            <ul
              class="folder-list"
              role="list"
              aria-label={`Folders in ${contents.name}`}
            >
              {subs.map((folder) => (
                <li key={folder.path}>
                  <SubfolderRow folder={folder} />
                </li>
              ))}
            </ul>
          )}
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
            {...(desktop && {
              role: 'listbox' as const,
              'aria-label': `In ${contents.name}`,
              rowProps: () => ({ role: 'none' as const }),
            })}
          />
        </>
      );
    }
    if (desktop) {
      // The desktop's rows can be selected: a listbox of options (spec
      // 3.17), the folders above it in a list of their own.
      return (
        <>
          {subs.length > 0 && (
            <ul
              class="folder-list"
              role="list"
              aria-label={`Folders in ${contents.name}`}
            >
              {subs.map((folder) => (
                <li key={folder.path}>
                  <SubfolderRow folder={folder} />
                </li>
              ))}
            </ul>
          )}
          <ul
            class="folder-list"
            role="listbox"
            aria-label={`In ${contents.name}`}
          >
            {entries.map((entry) => (
              <li key={entryKey(entry)} role="none">
                {renderEntry(entry)}
              </li>
            ))}
          </ul>
        </>
      );
    }
    return (
      <ul class="folder-list" role="list" aria-label={`In ${contents.name}`}>
        {subs.map((folder) => (
          <li key={folder.path}>
            <SubfolderRow folder={folder} />
          </li>
        ))}
        {entries.map((entry) => (
          <li key={entryKey(entry)}>{renderEntry(entry)}</li>
        ))}
      </ul>
    );
  }

  return (
    <div class="folder-section">
      <div class="folder-in-head">
        <h2 class="folder-in-title">In this folder</h2>
        <div class="folder-in-row">
          <Segmented<OriginFilter>
            label="Show"
            outlined
            options={(['all', 'originals', 'bower'] as const).map((value) => ({
              value,
              label: SEGMENT_LABELS[value],
              ...(value === 'originals' && { count: segments.originals }),
              ...(value === 'bower' && { count: segments.bower }),
            }))}
            value={view.origin}
            onChange={(origin) => onView({ origin, kind: null })}
          />
          <FilterSortSheet
            value={choice}
            defaults={defaults}
            kinds={options}
            countFor={countFor}
            onApply={(next) =>
              onView({
                sort: next.sort,
                kind: next.kind as FileKind | null,
                layout: next.layout,
              })
            }
          />
        </div>
      </div>
      {body()}
      {quick !== null && (
        <QuickLook
          title={titleOf(quick)}
          href={hrefOf(quick)}
          file={quick.file}
          original={quick.original}
          kind={quick.kind}
          pages={pages.get((quick.original ?? quick.file).id)}
          origin={originOf(quick.original ?? quick.file, catalogue)}
          bower={isBowerWritten(model.metas.get(quick.file.id), quick.file)}
          answer={model.metas.get(quick.file.id)?.type === 'answer'}
          folderPath={contents.path}
          now={now}
          onClose={() => setQuick(null)}
        />
      )}
    </div>
  );
}
