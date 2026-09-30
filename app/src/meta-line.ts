/**
 * The one source for the words under a title or a row (issue #905, spec
 * §3.5 R-META-1 to R-META-5, canon K-14 to K-16): the kind in words, the
 * short date and the meta line built from them. Every screen asks these
 * functions instead of deriving its own, so a note is "Bower note" and a
 * date is "29 Sep" everywhere. Pure: the clock is always passed in.
 */

import { FOLDER_MIME } from './drive.js';
import { ITEM_KIND_WORDS } from './kinds.js';
import type { ItemKindWord } from './kinds.js';
import { displayName } from './navigation.js';
import type { ParaKind } from './navigation.js';
import { isLinkNote } from './note-title.js';
import { fileKind } from './vault-index.js';
import type { FileKind } from './vault-index.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** A date as the helpers take it: a `Date`, epoch milliseconds or ISO text. */
export type DateInput = Date | number | string;

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** "29 Sep", or "29 Sep 2025" when `date` is in another year than `now`. */
function dayMonth(date: Date, now: Date): string {
  const base = `${date.getDate()} ${MONTHS[date.getMonth()] ?? ''}`;
  return date.getFullYear() === now.getFullYear()
    ? base
    : `${base} ${date.getFullYear()}`;
}

/**
 * The date rule (R-META-3, K-16): on the same local day as `now`, the time
 * in 24 h ("06:54"); otherwise the day and month ("29 Sep"); in another year
 * the year too ("29 Sep 2025"). Never a relative phrase. An unreadable date
 * gives `''`.
 */
export function shortDate(date: DateInput, now: DateInput): string {
  const then = toDate(date);
  const today = toDate(now);
  if (Number.isNaN(then.getTime()) || Number.isNaN(today.getTime())) return '';
  if (sameLocalDay(then, today)) {
    return `${pad(then.getHours())}:${pad(then.getMinutes())}`;
  }
  return dayMonth(then, today);
}

/**
 * The day in words for "updated …" and "filed by Bower …": "today",
 * "yesterday", else the day and month as `shortDate` writes them.
 */
export function dayWords(date: DateInput, now: DateInput): string {
  const then = toDate(date);
  const today = toDate(now);
  if (Number.isNaN(then.getTime()) || Number.isNaN(today.getTime())) return '';
  if (sameLocalDay(then, today)) return 'today';
  if (sameLocalDay(then, new Date(today.getTime() - DAY_MS))) {
    return 'yesterday';
  }
  return dayMonth(then, today);
}

/**
 * A size as the boards write it: "117 KB", "2.4 MB"; anything under a
 * kilobyte still reads "1 KB" (a short note, board PF-Main-1280).
 */
export function sizeWords(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** What `kindLabel` reads of an item. */
export interface KindItem {
  name: string;
  mimeType: string;
  /** `bower-written.ts#isBowerWritten`, or the folder model's answer. */
  bowerWritten?: boolean;
  /** A note with `type: answer`. */
  answer?: boolean;
}

const FILE_KIND_WORDS: Readonly<Partial<Record<FileKind, ItemKindWord>>> = {
  pdf: 'pdf',
  photo: 'photo',
  heic: 'photo',
  image: 'photo',
  doc: 'word',
  word: 'word',
  sheet: 'spreadsheet',
  excel: 'spreadsheet',
  csv: 'spreadsheet',
  web: 'link',
};

/** Which kind word an item takes (the key into `ITEM_KIND_WORDS`). */
export function itemKind(item: KindItem): ItemKindWord {
  if (item.mimeType === FOLDER_MIME) return 'folder';
  const kind = fileKind(item);
  if (kind === 'note' || kind === 'markdown') {
    if (isLinkNote(item.name)) return 'link';
    if (item.answer === true) return 'bower-answer';
    return item.bowerWritten === true ? 'bower-note' : 'note';
  }
  return FILE_KIND_WORDS[kind] ?? 'file';
}

/**
 * The kind in words (R-META-2, K-14): "Bower note", "Bower answer",
 * "Note", "PDF", "Word", "Spreadsheet", "Photo", "Link", "Folder", and
 * "File" for anything else.
 */
export function kindLabel(item: KindItem): string {
  return ITEM_KIND_WORDS[itemKind(item)];
}

/** Where the meta line is shown. */
export type MetaView =
  /** Under a page title (folder, note or file) or in the preview column. */
  | 'title'
  /** A row in a list of one folder's things. */
  | 'row'
  /** A row in a list that mixes folders (Home Recent, Search, Just filed,
   * Activity, tag search, Recently changed): adds "where". */
  | 'mixed-row';

export interface MetaContext {
  view: MetaView;
  now: DateInput;
}

/** Everything a meta line may say about an item; each part is optional. */
export interface MetaItem extends KindItem {
  /** The landmark the item lives under, for the dot (`null`: neutral). */
  root?: ParaKind | null;
  /** A folder title's first part: its root's display name ("Projects"). */
  rootName?: string;
  /** The folder the item is in, as Drive names it ("2-Areas" reads "Areas"). */
  parentName?: string;
  /** A folder's lifecycle when set ("Active"), kept as written. */
  lifecycle?: string;
  /** A folder's count (`folder-view.ts#folderCount`). */
  count?: number;
  /** What `count` counts: things (default) or subfolders (folder of folders). */
  countUnit?: 'thing' | 'folder';
  /** A folder's newest change, ISO. */
  updated?: string;
  /** A file's size in bytes. */
  size?: number;
  /** Who filed it and when (`file-origin.ts#filedBy(...).line`). */
  filed?: string;
  /** The item's own modified time, ISO: a note title's date. */
  modified?: string;
}

/** A built meta line: its parts, where the root dot goes, and the text. */
export interface MetaLine {
  parts: string[];
  /** The 8 px root dot goes before `parts[at]`; `null`: no dot. */
  dot: { at: number; root: ParaKind | null } | null;
  /** `parts` joined with " · " (the dot itself is drawn, not written). */
  text: string;
}

function countWords(count: number, unit: 'thing' | 'folder'): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

/** The count and "updated …" parts of a folder, those it has. */
function folderTail(item: MetaItem, now: DateInput): string[] {
  const parts: string[] = [];
  if (item.count !== undefined) {
    parts.push(countWords(item.count, item.countUnit ?? 'thing'));
  }
  if (item.updated !== undefined) {
    const when = dayWords(item.updated, now);
    if (when !== '') parts.push(`updated ${when}`);
  }
  return parts;
}

function line(
  parts: readonly (string | undefined)[],
  dot: MetaLine['dot'],
): MetaLine {
  const kept = parts.filter(
    (part): part is string => part !== undefined && part !== '',
  );
  return { parts: kept, dot, text: kept.join(' · ') };
}

/**
 * The meta line (R-META-1, K-15), "kind · where · when", lower case after
 * each dot except names:
 *
 * - folder title: "Projects · 7 things · updated today", "Areas · Active ·
 *   2 things · updated yesterday", dot before the root;
 * - note or file title (and the preview column): "Bower note · 29 Sep",
 *   "PDF · 117 KB · filed by Bower yesterday";
 * - row in one folder: "Bower note"; a folder row "6 things";
 * - row in a mixed list: "PDF · ● Visa & Immigration", a folder "Folder ·
 *   ● Moonee Ponds · 6 things", dot before the parent.
 */
export function metaLine(item: MetaItem, context: MetaContext): MetaLine {
  const { view, now } = context;
  const kind = kindLabel(item);
  const root = item.root ?? null;
  const isFolder = item.mimeType === FOLDER_MIME;
  if (view === 'mixed-row') {
    const parent =
      item.parentName === undefined ? undefined : displayName(item.parentName);
    const parts = [kind, parent, ...(isFolder ? folderTail(item, now) : [])];
    return line(parts, parent === undefined ? null : { at: 1, root });
  }
  if (isFolder) {
    if (view === 'row') return line(folderTail(item, now), null);
    const rootName =
      item.rootName === undefined ? undefined : displayName(item.rootName);
    return line([rootName, item.lifecycle, ...folderTail(item, now)], {
      at: 0,
      root,
    });
  }
  if (view === 'row') return line([kind], null);
  const size = item.size === undefined ? undefined : sizeWords(item.size);
  const when =
    item.filed ??
    (item.modified === undefined ? undefined : shortDate(item.modified, now));
  return line([kind, size, when], null);
}
