/**
 * What the working sheet shows while a run goes (spec C.6, board
 * Phone-Working): "n of m filed" with its bar, and one row per item as it
 * is filed ("Lease agreement 2026 → Flat hunt"). Pure so it is unit-tested
 * without a real run, a real listing or a real timer.
 *
 * The counts and rows come from `run.processed`, the inbox paths the run
 * has filed so far, and the inbox as the listing showed it when the run
 * began. Today's runner (`agent/run.sh`) reports `processed` only once a
 * run is `done` or `failed`, so while a real run is going there are no
 * rows and the bar stays indeterminate; the demo's scripted run reports
 * each item as it goes. Neither reports where an item went: a row gains its
 * folder once the listing, re-read when the run ends, shows the file there.
 */

import { linkTitleFromFileName } from './add.js';
import type { RunItem, RunItemKind, SetAsideItem } from './api.js';
import type { ParaKind } from './components/folder-mark.js';
import type { DriveFile } from './drive.js';
import { formatPolicy } from './formats.js';
import type { Kind } from './kinds.js';
import { displayName, paraKindOf, pendingCount } from './navigation.js';
import { fileKind, fileTitle } from './vault-index.js';

/** The counts a run may report, when it reports them at all. */
export interface RunCounts {
  /** Items filed so far this run. */
  processed?: number;
  /** Items this run expects to file in total. */
  total?: number;
}

export interface RunProgress {
  filed: number;
  total: number;
  /** `filed / total`, clamped to 1 so a bar never overflows past 100%. */
  ratio: number;
}

/**
 * `null` (indeterminate) unless both counts are present and `total` is a
 * positive number; otherwise `{ filed, total, ratio }`, with `ratio`
 * clamped to 1 for a `filed` count past `total` (a run can pick up more
 * items along the way than it first expected).
 */
export function progressFor(counts: RunCounts): RunProgress | null {
  const { processed, total } = counts;
  if (processed === undefined || total === undefined || total <= 0) {
    return null;
  }
  return { filed: processed, total, ratio: Math.min(1, processed / total) };
}

/** The inbox roots a run files from (`agent/run.sh`). */
const INBOX_ROOTS = new Set(['0-Inbox', 'Clippings']);

/** An instruction note's name (`Bower - YYYY-MM-DD HHmm <title>.md`). */
const REQUEST_PREFIX = /^Bower - \d{4}-\d{2}-\d{2} \d{4} /;

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * Add's "What is this?" note (`add.ts#contextNoteName`): always titled
 * "Context". It applies to its own batch (#446, #444) — not a thing being
 * filed — so the working sheet never gives it a row, counts it toward the
 * bar, or names it in the Done message.
 */
const CONTEXT_NOTE =
  /^Bower - \d{4}-\d{2}-\d{2} \d{4}(?:-\d{2})? Context(?: [0-9a-f]{2})?\.md$/;

/** Whether `path` is Add's own "What is this?" note for its batch. */
export function isContextNote(path: string): boolean {
  return CONTEXT_NOTE.test(baseName(path));
}

/**
 * What a processed item was (#345): the kind the runner reported for
 * `path` in `items`. A report from a runner that predates kinds (no
 * `items`) falls back to what the name says, the only thing such a report
 * has: Add's context note by its title, any other `Bower - ` note in
 * `0-Inbox/` as a request, everything else a file.
 */
export function processedKind(
  path: string,
  items: readonly RunItem[] | undefined,
): RunItemKind {
  if (items !== undefined) {
    return items.find((item) => item.path === path)?.kind ?? 'file';
  }
  if (isContextNote(path)) return 'context';
  const top = path.slice(0, path.indexOf('/'));
  return top === '0-Inbox' &&
    path === `0-Inbox/${baseName(path)}` &&
    REQUEST_PREFIX.test(baseName(path))
    ? 'request'
    : 'file';
}

/**
 * The paths waiting in the inbox, sorted: the same rule as the Inbox
 * card's count (`navigation.ts#pendingCount`), one file at a time.
 */
export function waitingPaths(files: readonly DriveFile[]): string[] {
  return files
    .filter((file) => pendingCount([file]) === 1)
    .map((file) => file.path)
    .sort();
}

/**
 * How many things are waiting in the inbox, the way a person would count
 * them: `navigation.ts#pendingCount`'s rule, minus the context note (#506)
 * — it is Add's own scratch note for the batch, not a thing waiting to be
 * filed, and every other count in this file already leaves it out. Home's
 * "N things" (waiting, tidying up, or left after a failure) uses this, so
 * it never runs one ahead of the working sheet's own total for the same
 * inbox.
 */
export function visiblePendingCount(files: readonly DriveFile[]): number {
  return waitingPaths(files).filter((path) => !isContextNote(path)).length;
}

/**
 * The counts for `progressFor`: `processed` only when the run reports it,
 * and a total only then too, since a total with nothing filed to set
 * against it would pin the bar at zero for the whole of a real run.
 * `waiting` is the inbox as the run began; items filed that it did not
 * list still count. The context note (#446) counts toward neither.
 */
export function runCounts(
  processed: readonly string[] | undefined,
  waiting: readonly string[],
  items?: readonly RunItem[],
): RunCounts {
  if (processed === undefined) return {};
  const filed = processed.filter(
    (path) => processedKind(path, items) !== 'context',
  );
  const stillWaiting = waiting.filter((path) => !isContextNote(path));
  const all = new Set([...stillWaiting, ...filed]);
  return { processed: filed.length, total: all.size };
}

/** A row's icon and colour, as on a folder screen. */
export type RowTone = 'note' | 'pdf' | 'image' | 'file';

export interface RunRow {
  /** The inbox path, unique within a run. */
  path: string;
  /** What people read: the name without its extension. */
  title: string;
  tone: RowTone;
  /** `filed`, or `reading` for the item the run is on now. */
  status: 'filed' | 'reading';
  /** The folder it was filed in ("Flat hunt"), once the listing shows it
   * there; `null` before, and always for `reading`. */
  destination: string | null;
  /** The PARA landmark the folder is under (`P Projects › Flat hunt`), or
   * `null` while the destination is not known or is not a PARA folder. */
  para: ParaKind | null;
  /** The folder as the row shows it after the mark: "Projects › Flat hunt";
   * `null` while the destination is not known. */
  folderPath: string | null;
  /** What Bower read (report v2, board `Flow-04-Working`): `facts` when a
   * companion note of a known kind was written (`readLabels` are its first
   * three key-fact labels, lower-case), `plain` for a note or text it read,
   * `null` when nothing is known to have been read. */
  read: 'facts' | 'plain' | null;
  readLabels: string[];
  /** The name the item had before Bower renamed it, or `null`. */
  was: string | null;
  /** "Kept, not read: Bower can't watch videos" for an item the run set
   * aside without reading it, else `null`. */
  keptNote: string | null;
}

/** What a link's in-progress row says: the page is fetched, not opened. */
export const READING_PAGE = 'Reading the page…';
export const READING = 'Reading…';

/** The words on a row for an item that was kept, not read; `null` for a
 * reason the sheet does not word (a quarantined file is the Done state's). */
export function keptNote(
  aside: Pick<SetAsideItem, 'path' | 'reason'>,
): string | null {
  if (aside.reason === 'too-large') return 'Kept, not read: over 50 MB';
  if (aside.reason !== 'kept-not-read') return null;
  const line = formatPolicy(
    fileKind({ name: baseName(aside.path), mimeType: '' }),
  ).queueLine;
  return line ?? 'Kept, not read: Bower keeps it by its name';
}

/** The first three key-fact labels of the kind `kindId`, lower-case ("rent,
 * rooms, dates"); empty for an unknown kind. */
export function readLabels(kind: Kind | undefined): string[] {
  if (kind === undefined) return [];
  const labels: string[] = [];
  for (const key of kind.keyFacts) {
    const field = kind.fields.find((candidate) => candidate.key === key);
    if (field === undefined) continue;
    const label = field.label.trim().toLowerCase();
    if (label !== '' && !labels.includes(label)) labels.push(label);
    if (labels.length === 3) break;
  }
  return labels;
}

const IMAGE_EXTENSIONS = /\.(jpe?g|png|heic|heif|webp|gif)$/i;

function toneOf(name: string, file: DriveFile | undefined): RowTone {
  if (file === undefined) {
    if (/\.md$/i.test(name)) return 'note';
    if (/\.pdf$/i.test(name)) return 'pdf';
    return IMAGE_EXTENSIONS.test(name) ? 'image' : 'file';
  }
  const kind = fileKind(file);
  if (kind === 'note' || kind === 'pdf') return kind;
  return kind === 'photo' || kind === 'image' ? 'image' : 'file';
}

/** The title a row shows: a filed link's own host (#557, `linkNoteName`'s
 * generated name never was a title), else the file's title, and an
 * instruction note's words without its date and time. */
function rowTitle(name: string): string {
  return (linkTitleFromFileName(name) ?? fileTitle(name)).replace(
    REQUEST_PREFIX,
    '',
  );
}

/**
 * Where `path` went: the folder of a file with the same name outside the
 * inbox, when the listing has one. `null` while the listing still shows
 * the file in the inbox (it is only re-read when a run ends), when the run
 * renamed it, or when it went to `0-Inbox/Processed/` (a request).
 */
export function destinationOf(
  path: string,
  files: readonly DriveFile[],
): string | null {
  const name = baseName(path);
  for (const file of files) {
    if (file.name !== name || file.path === path) continue;
    const segments = file.path.split('/');
    if (INBOX_ROOTS.has(segments[0] ?? '') || segments.length < 2) continue;
    return segments[segments.length - 2] ?? null;
  }
  return null;
}

/** The folder of `to` as the row shows it: "Projects › Flat hunt". */
function folderPathOf(to: string): string | null {
  const folders = to.split('/').slice(0, -1);
  return folders.length === 0 ? null : folders.map(displayName).join(' › ');
}

/**
 * The sheet's rows: one per filed item, in the order the run filed them,
 * then, while the run is `active`, the next waiting item as `reading`, then
 * any item the run set aside that no row names yet. None when the run does
 * not report `processed`: the sheet then has nothing true to say about any
 * one item.
 */
export function runRows(input: {
  processed: readonly string[] | undefined;
  waiting: readonly string[];
  files: readonly DriveFile[];
  active: boolean;
  /** The run's `items` (#345), when its runner reported kinds. */
  items?: readonly RunItem[];
  /** The run's `setAside` (report v2). */
  setAside?: readonly SetAsideItem[];
  /** The kind id of each filed item's companion note, keyed by the item's
   * `to` path, as far as the sheet has read them. */
  companionLabels?: ReadonlyMap<string, string[]>;
}): RunRow[] {
  const { processed, waiting, files, active, items, setAside } = input;
  if (processed === undefined) return [];
  const byPath = new Map(files.map((file) => [file.path, file]));
  const row = (path: string, status: RunRow['status']): RunRow => {
    const item = items?.find((candidate) => candidate.path === path);
    const to = status === 'filed' ? item?.to : undefined;
    const name = baseName(to ?? path);
    const destination =
      status !== 'filed'
        ? null
        : to !== undefined
          ? (to.split('/').slice(-2, -1)[0] ?? null)
          : destinationOf(path, files);
    const file =
      byPath.get(to ?? path) ??
      files.find((candidate) => candidate.name === name);
    const labels =
      to === undefined ? [] : (input.companionLabels?.get(to) ?? []);
    const asideNote = setAside?.find((aside) => aside.path === path);
    const kept = asideNote === undefined ? null : keptNote(asideNote);
    const isText = /\.(md|txt)$/i.test(name);
    const top = to?.split('/')[0];
    return {
      path,
      title: rowTitle(name),
      tone: toneOf(name, file),
      status,
      destination,
      para: top === undefined ? null : paraKindOf(top),
      folderPath: to === undefined ? null : folderPathOf(to),
      read:
        kept !== null || status !== 'filed' || to === undefined
          ? null
          : labels.length > 0
            ? 'facts'
            : isText || input.companionLabels?.has(to) === true
              ? 'plain'
              : null,
      readLabels: labels,
      was:
        item?.renamedFrom !== undefined && item.renamedFrom !== name
          ? item.renamedFrom
          : null,
      keptNote: kept,
    };
  };
  const rows = processed
    .filter((path) => processedKind(path, items) !== 'context')
    .map((path) => row(path, 'filed'));
  if (active) {
    const filed = new Set(processed);
    const next = waiting.find(
      (path) => !filed.has(path) && !isContextNote(path),
    );
    if (next !== undefined) rows.push(row(next, 'reading'));
  }
  const known = new Set(rows.map((entry) => entry.path));
  for (const aside of setAside ?? []) {
    if (known.has(aside.path) || keptNote(aside) === null) continue;
    known.add(aside.path);
    rows.push(row(aside.path, 'filed'));
  }
  return rows;
}

/** What the in-progress row says: "Reading the page…" for a link. */
export function readingLine(path: string): string {
  return linkTitleFromFileName(baseName(path)) !== null
    ? READING_PAGE
    : READING;
}

/**
 * The folder names on the right of the sheet's scene ("Flat hunt ·
 * Finance"): the rows' destinations, each once, at most three; `null`
 * when none is known yet.
 */
export function destinationsLabel(rows: readonly RunRow[]): string | null {
  const names: string[] = [];
  for (const { destination } of rows) {
    if (destination !== null && !names.includes(displayName(destination))) {
      names.push(displayName(destination));
    }
  }
  return names.length === 0 ? null : names.slice(0, 3).join(' · ');
}
