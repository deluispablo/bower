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

import type { RunItem, RunItemKind } from './api.js';
import type { DriveFile } from './drive.js';
import { pendingCount } from './navigation.js';
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
const CONTEXT_NOTE = /^Bower - \d{4}-\d{2}-\d{2} \d{4} Context\.md$/;

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

/** The title a row shows: the file's title, and an instruction note's
 * words without its date and time. */
function rowTitle(name: string): string {
  return fileTitle(name).replace(REQUEST_PREFIX, '');
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

/**
 * The sheet's rows: one per filed item, in the order the run filed them,
 * then, while the run is `active`, the next waiting item as `reading`.
 * None when the run does not report `processed`: the sheet then has
 * nothing true to say about any one item.
 */
export function runRows(input: {
  processed: readonly string[] | undefined;
  waiting: readonly string[];
  files: readonly DriveFile[];
  active: boolean;
  /** The run's `items` (#345), when its runner reported kinds. */
  items?: readonly RunItem[];
}): RunRow[] {
  const { processed, waiting, files, active, items } = input;
  if (processed === undefined) return [];
  const byPath = new Map(files.map((file) => [file.path, file]));
  const row = (path: string, status: RunRow['status']): RunRow => {
    const name = baseName(path);
    const destination = status === 'filed' ? destinationOf(path, files) : null;
    const file =
      byPath.get(path) ?? files.find((candidate) => candidate.name === name);
    return {
      path,
      title: rowTitle(name),
      tone: toneOf(name, file),
      status,
      destination,
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
  return rows;
}

/**
 * The folder names on the right of the sheet's scene ("Flat hunt ·
 * Finance"): the rows' destinations, each once, at most three; `null`
 * when none is known yet.
 */
export function destinationsLabel(rows: readonly RunRow[]): string | null {
  const names: string[] = [];
  for (const { destination } of rows) {
    if (destination !== null && !names.includes(destination)) {
      names.push(destination);
    }
  }
  return names.length === 0 ? null : names.slice(0, 3).join(' · ');
}
