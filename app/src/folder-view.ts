/**
 * The folder screen's list, as pure functions (issue #611, spec §6.5
 * R-FOLDER-2/3/4/7): who wrote what (the origin filter), pairing an original
 * with the note Bower wrote about it, the four sorts, the kind filter with
 * its counts and the date groups. The screen reads the folder, the notes'
 * frontmatter and `index.md` and hands the results in; nothing here touches
 * Drive, the clock or the locale.
 */

import { isBowerWritten } from './bower-written.js';
import { findCompanion } from './companion.js';
import { sizeWords } from './meta-line.js';
import type { DriveFile } from './drive.js';
import { CATALOGUE_PATH, originLine, originOf } from './file-origin.js';
import type { Origin } from './file-origin.js';
import { kindById } from './kinds.js';
import { folderOf } from './navigation.js';
import type { TreeNode } from './navigation.js';
import type { NoteMeta } from './note-meta.js';
import {
  FILE_KIND_LABELS,
  FILE_KIND_PLURALS,
  fileKind,
} from './vault-index.js';
import type { FileKind } from './vault-index.js';

/** Which of the folder's things the list shows. */
export type OriginFilter = 'all' | 'originals' | 'bower';

export type FolderSort = 'newest' | 'oldest' | 'name' | 'kind';

export const FOLDER_SORTS: readonly FolderSort[] = [
  'newest',
  'oldest',
  'name',
  'kind',
];

export const SORT_LABELS: Readonly<Record<FolderSort, string>> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  name: 'Name',
  kind: 'Kind',
};

/** The Drive `modifiedTime`, `''` when there is none. */
function modifiedOf(file: Pick<DriveFile, 'modifiedTime'>): string {
  return file.modifiedTime ?? '';
}

export interface FolderSources {
  /** The folder's own notes and files (`FolderContents.items`). */
  items: readonly DriveFile[];
  byPath: ReadonlyMap<string, DriveFile>;
  /** Frontmatter read so far, by note id; rows work with none of it. */
  metas: ReadonlyMap<string, NoteMeta>;
  /** `parseCatalogueOrigins` of `index.md`. */
  origins: ReadonlyMap<string, Origin>;
  /** `parseCatalogueFiles` of `index.md`. */
  catalogueFiles: ReadonlyMap<string, string>;
}

export interface FolderModel {
  items: readonly DriveFile[];
  /** Note id → the original it is about, both in this folder. */
  pairs: ReadonlyMap<string, DriveFile>;
  /** Ids of everything Bower wrote. */
  bowerIds: ReadonlySet<string>;
  /** Anything the person added or wrote. */
  originals: readonly DriveFile[];
  /** Anything Bower wrote. */
  bower: readonly DriveFile[];
  metas: ReadonlyMap<string, NoteMeta>;
  origins: ReadonlyMap<string, Origin>;
}

function writtenByBower(
  file: DriveFile,
  meta: NoteMeta | undefined,
  origins: ReadonlyMap<string, Origin>,
  companions: ReadonlySet<string>,
): boolean {
  if (companions.has(file.id)) return true;
  if (file.path === CATALOGUE_PATH) return true;
  if (fileKind(file) !== 'note') return false;
  if (originOf(file, origins) === 'asked') return true;
  return isBowerWritten(meta);
}

/**
 * The origin filter's counts and the pairs: for each file that is not a
 * note, its companion note (`companion.ts`) when that note is in this same
 * folder. A person's own note that merely shares a file's name is not a
 * companion; a companion whose original lives elsewhere is not paired (both
 * show as separate rows).
 */
export function buildFolderModel(sources: FolderSources): FolderModel {
  const { byPath, metas, origins } = sources;
  const items = sources.items.filter(
    (item) => !isFolderPage(item, metas.get(item.id)),
  );
  const notes = items.filter((item) => fileKind(item) === 'note');
  const originalsOf = new Map<string, string>();
  for (const note of notes) {
    const original = metas.get(note.id)?.original;
    if (original !== undefined) originalsOf.set(note.id, original);
  }
  const noteIds = new Set(notes.map((note) => note.id));
  const pairs = new Map<string, DriveFile>();
  for (const file of items) {
    if (fileKind(file) === 'note') continue;
    const note = findCompanion(file, {
      notes,
      byPath,
      originals: originalsOf,
      catalogue: sources.catalogueFiles,
    });
    if (note === undefined || !noteIds.has(note.id) || pairs.has(note.id)) {
      continue;
    }
    if (originOf(note, origins) === 'yours') continue;
    pairs.set(note.id, file);
  }
  const companions = new Set(pairs.keys());
  const bowerIds = new Set<string>();
  for (const item of items) {
    if (writtenByBower(item, metas.get(item.id), origins, companions)) {
      bowerIds.add(item.id);
    }
  }
  return {
    items,
    pairs,
    bowerIds,
    originals: items.filter((item) => !bowerIds.has(item.id)),
    bower: items.filter((item) => bowerIds.has(item.id)),
    metas,
    origins,
  };
}

export interface FolderRow {
  /** Stable across filters and sorts. */
  key: string;
  /** What the row opens: the note for a pair. */
  file: DriveFile;
  /** The original a note is about, when it is in this folder. */
  original?: DriveFile;
  /** The kind the badge and the kind filter use: the original's for a pair. */
  kind: FileKind;
  /** The row's own file is something Bower wrote. */
  bower: boolean;
  answer: boolean;
  /** The newest of the row's files. */
  modified: string;
}

function rowOf(
  model: FolderModel,
  file: DriveFile,
  original: DriveFile | undefined,
): FolderRow {
  const meta = model.metas.get(file.id);
  const modified = [modifiedOf(file), original ? modifiedOf(original) : '']
    .sort()
    .pop();
  return {
    key: file.id,
    file,
    ...(original === undefined ? {} : { original }),
    kind: fileKind(original ?? file),
    bower: model.bowerIds.has(file.id),
    answer: meta?.type === 'answer',
    modified: modified ?? '',
  };
}

/**
 * The rows of one origin filter. All: a pair is one row (the note, badge
 * from the original) and the original itself is not listed again. Originals:
 * the person's things, an original alone. By Bower: Bower's things, the
 * note alone.
 */
export function rowsFor(model: FolderModel, filter: OriginFilter): FolderRow[] {
  const paired = new Set([...model.pairs.values()].map((file) => file.id));
  if (filter === 'originals') {
    return model.originals.map((file) => rowOf(model, file, undefined));
  }
  if (filter === 'bower') {
    return model.bower.map((file) =>
      rowOf(model, file, model.pairs.get(file.id)),
    );
  }
  return model.items
    .filter((file) => !paired.has(file.id))
    .map((file) => rowOf(model, file, model.pairs.get(file.id)));
}

/** "Room 2 bed" sorts as "room 2 bed": case and accents do not count. */
function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true });
}

/** `rows` in `sort` order; `titleOf` is what the row shows as its title. */
export function sortRows(
  rows: readonly FolderRow[],
  sort: FolderSort,
  titleOf: (row: FolderRow) => string,
): FolderRow[] {
  const byName = (a: FolderRow, b: FolderRow): number =>
    compareText(titleOf(a), titleOf(b)) || a.key.localeCompare(b.key);
  const sorted = [...rows];
  if (sort === 'name') return sorted.sort(byName);
  if (sort === 'kind') {
    return sorted.sort(
      (a, b) =>
        compareText(FILE_KIND_LABELS[a.kind], FILE_KIND_LABELS[b.kind]) ||
        byName(a, b),
    );
  }
  const direction = sort === 'oldest' ? 1 : -1;
  return sorted.sort(
    (a, b) => direction * a.modified.localeCompare(b.modified) || byName(a, b),
  );
}

export interface KindOption {
  kind: FileKind;
  label: string;
  /** Plural, "Notes". */
  plural: string;
  count: number;
}

/** The kinds present in `rows`, most rows first, with their counts. */
export function kindOptions(rows: readonly FolderRow[]): KindOption[] {
  const counts = new Map<FileKind, number>();
  for (const row of rows) counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);
  return [...counts.entries()]
    .map(([kind, count]) => ({
      kind,
      label: FILE_KIND_LABELS[kind],
      plural: FILE_KIND_PLURALS[kind],
      count,
    }))
    .sort((a, b) => b.count - a.count || compareText(a.label, b.label));
}

/** `rows` of one kind, or all of them for `null`. */
export function filterKind(
  rows: readonly FolderRow[],
  kind: FileKind | null,
): FolderRow[] {
  return kind === null ? [...rows] : rows.filter((row) => row.kind === kind);
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const SHORT_MONTHS = MONTHS.map((month) => month.slice(0, 3));

const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(time: number): number {
  const date = new Date(time);
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS,
  );
}

/** How many calendar days before `now` the time is (0 = today). */
function daysAgo(iso: string, now: number): number {
  const time = Date.parse(iso);
  return dayNumber(now) - dayNumber(time);
}

/** The date group a time falls in: Today, Yesterday, This week, Earlier this
 * month, then its month ("August", "December 2025" outside this year). */
export function groupLabel(iso: string, now: number): string {
  if (iso === '' || Number.isNaN(Date.parse(iso))) return 'Undated';
  const days = daysAgo(iso, now);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'This week';
  const then = new Date(iso);
  const current = new Date(now);
  if (
    then.getFullYear() === current.getFullYear() &&
    then.getMonth() === current.getMonth()
  ) {
    return 'Earlier this month';
  }
  const month = MONTHS[then.getMonth()] ?? '';
  return then.getFullYear() === current.getFullYear()
    ? month
    : `${month} ${then.getFullYear()}`;
}

export interface RowGroup {
  label: string;
  rows: FolderRow[];
}

/** Runs of `rows` (already in date order) under their date group. */
export function groupRows(rows: readonly FolderRow[], now: number): RowGroup[] {
  const groups: RowGroup[] = [];
  for (const row of rows) {
    const label = groupLabel(row.modified, now);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.rows.push(row);
    else groups.push({ label, rows: [row] });
  }
  return groups;
}

/** "yesterday", "3 days ago", "5 Sep": the header's "Last filed …". */
export function whenWords(iso: string, now: number): string {
  const days = daysAgo(iso, now);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const then = new Date(iso);
  return `${then.getDate()} ${SHORT_MONTHS[then.getMonth()] ?? ''}`;
}

/** "7 things · 5 originals, 2 by Bower" (the header's first line). */
export function metaCounts(model: FolderModel): string {
  const things = model.items.length;
  return `${things} ${things === 1 ? 'thing' : 'things'} · ${
    model.originals.length
  } ${model.originals.length === 1 ? 'original' : 'originals'}, ${
    model.bower.length
  } by Bower`;
}

/** "Last filed yesterday", or `null` when nothing has a date. */
export function lastFiled(
  items: readonly DriveFile[],
  now: number,
): string | null {
  const newest = items.map(modifiedOf).sort().pop();
  if (newest === undefined || newest === '') return null;
  return `Last filed ${whenWords(newest, now)}`;
}

/** The noun a companion note is about ("listing" for a rental listing),
 * from the note's kind; "original" when it has none. */
export function subjectOf(meta: NoteMeta | undefined): string {
  const kind = meta?.kind === undefined ? undefined : kindById(meta.kind);
  const word = kind?.name.split(' ').pop();
  return word === undefined || word === '' ? 'original' : word;
}

/**
 * The one line under a row the person added or wrote: "Photo · 2.4 MB",
 * "PDF · 6 pages", "Spreadsheet (CSV) · copy of your Google Sheet", "Note ·
 * written by you". `pages` is the page count a companion note recorded.
 */
export function fileLine(
  file: DriveFile,
  origin: Origin | null,
  pages?: number,
): string {
  const kind = fileKind(file);
  if (kind === 'note') {
    return origin === 'drive'
      ? originLine(file, origin)
      : 'Note · written by you';
  }
  const label = FILE_KIND_LABELS[kind];
  if (origin === 'drive') {
    return kind === 'csv'
      ? 'Spreadsheet (CSV) · copy of your Google Sheet'
      : `${label} · copy from your Drive`;
  }
  if (pages !== undefined && pages > 0) {
    return `${label} · ${pages} ${pages === 1 ? 'page' : 'pages'}`;
  }
  return file.size === undefined ? label : `${label} · ${sizeWords(file.size)}`;
}

/**
 * Whether `file` is its folder's own page (K-31, lead ruling on #903): a
 * note named after its folder that Bower wrote (`by: bower`, like
 * `Moonee Ponds/Moonee Ponds.md`). It is not listed and not counted. A
 * note of the same name that the person wrote is an ordinary note, listed
 * and counted (`Visa & Immigration/Visa & Immigration.md`).
 */
export function isFolderPage(
  file: Pick<DriveFile, 'path' | 'name' | 'mimeType'>,
  meta: NoteMeta | undefined,
): boolean {
  if (meta === undefined || fileKind(file) !== 'note') return false;
  const folder = folderOf(file.path);
  const name = folder.slice(folder.lastIndexOf('/') + 1);
  if (name === '' || file.name !== `${name}.md`) return false;
  const by = meta.fields.by;
  return typeof by === 'string' && by.trim().toLowerCase() === 'bower';
}

/** What `folderCount` adds up: the folder's subfolders and its model. */
export interface FolderCountInput {
  /** How many subfolders the folder shows (they count as originals). */
  subfolders: number;
  model: Pick<FolderModel, 'originals' | 'bower'>;
}

/**
 * The folder's two segments (R-API-9, K-31): Originals are its subfolders
 * and everything the person added; By Bower is everything Bower wrote.
 */
export function folderSegments(folder: FolderCountInput): {
  originals: number;
  bower: number;
} {
  return {
    originals: folder.subfolders + folder.model.originals.length,
    bower: folder.model.bower.length,
  };
}

/**
 * The one count of a folder (R-API-9, K-31): the sum of its segments, so
 * the meta line ("7 things"), the Filter's "Show 7 things" and search's
 * "7 things" can never disagree with Originals 1 + By Bower 6.
 */
export function folderCount(folder: FolderCountInput): number {
  const { originals, bower } = folderSegments(folder);
  return originals + bower;
}

/**
 * The things in the same folder as `item`, in tree order (R-API-9): what
 * About's "In this folder", the prev / next footer and "next item" walk.
 * `item` itself is included; subfolders and the folder's own page are
 * not (`metas` tells the page apart). Empty when its folder is not in
 * `tree`.
 */
export function siblings(
  item: Pick<DriveFile, 'path'>,
  tree: TreeNode,
  metas: ReadonlyMap<string, NoteMeta> = new Map(),
): DriveFile[] {
  const parent = folderOf(item.path);
  let node: TreeNode | undefined = tree;
  if (parent !== '') {
    for (const name of parent.split('/')) {
      node = node.folders.find((folder) => folder.name === name);
      if (node === undefined) return [];
    }
  }
  // The folder's own page (`isFolderPage`) is not one of its things.
  return node.items.filter((file) => !isFolderPage(file, metas.get(file.id)));
}
