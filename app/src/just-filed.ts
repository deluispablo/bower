/**
 * Just filed (#616, spec §6.10 R-JUST-1, R-JUST-2, R-JUST-5, boards
 * `Phone-JustFiled` and `Desktop-JustFiled`): what a tidy-up filed, with the
 * name each thing had, the name it has now and the folder it went to. Pure:
 * groups from a run report (`GET /runs`, or the run store's last run) and the
 * vault index, the set-aside list, the headings and the fallback to Activity
 * for a report without `to` (a runner before report v2). The screen is
 * `routes/just-filed.tsx`; the Notes row is `components/just-filed-row.tsx`.
 */

import { activityCard, cardWhen, parseLog } from './activity.js';
import type { ActivityRow } from './activity.js';
import type { Run, RunItem, SetAsideItem, SetAsideReason } from './api.js';
import type { DriveFile } from './drive.js';
import { formatPolicy } from './formats.js';
import { runCounts, things } from './home.js';
import { shortDay } from './rules.js';
import { displayPath, paraKindOf } from './navigation.js';
import type { ParaKind } from './components/folder-mark.js';
import { fileKind, fileTitle } from './vault-index.js';
import type { FileKind, VaultIndex } from './vault-index.js';

/** The path of the screen. */
export const JUST_FILED_PATH = '/just-filed';

/** How many earlier tidy-ups the screen lists (`GET /runs` keeps 20). */
export const EARLIER_LIMIT = 20;

/** Copy keys `just.row`, `just.sub`, `just.intro`, `just.was`, `just.aside`,
 * `just.earlier`, `just.markall` (spec §6.10). */
export const JUST_INTRO =
  'What you added, and where Bower put each thing. New marks what you have not opened yet.';
export const JUST_EARLIER = 'Earlier tidy-ups';
export const JUST_EARLIER_SUB = 'The last 20, each with where things went';
export const JUST_MARK_ALL = 'Mark all seen';
/** The Done sheet's link (R-JUST-5). */
export const JUST_SEE_WHERE = 'See where everything went';

/** `just.row`: "Just filed · 6". */
export function rowLabel(count: number): string {
  return `Just filed · ${String(count)}`;
}

/** `just.sub`: "Today's tidy-up: see where everything went", "Yesterday's…",
 * "26 Sep's…"; the sidebar's shorter "Today's tidy-up". */
export function rowSub(when: string, short: boolean): string {
  const day = when.split(',')[0] ?? when;
  const owner = day === '' ? 'The' : `${day}'s`;
  return short
    ? `${owner} tidy-up`
    : `${owner} tidy-up: see where everything went`;
}

/** `just.aside`: "Set aside · 1". */
export function asideLabel(count: number): string {
  return `Set aside · ${String(count)}`;
}

/** `just.was`: was “IMG_4471.jpg”. */
export function wasLabel(name: string): string {
  return `was “${name}”`;
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function folderOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

/** `1-Projects/Flat hunt` as `Projects › Flat hunt`. */
export function folderLabel(folder: string): string {
  return displayPath(folder, ' › ');
}

/** The PARA mark of the top folder of `path`, `null` when neutral. */
function paraOf(path: string): ParaKind | null {
  const top = path.split('/')[0] ?? '';
  return top === '' || !path.includes('/') ? null : paraKindOf(top);
}

/** A file the report names, as far as the index knows it. */
function fileAt(index: VaultIndex | null, path: string): DriveFile | undefined {
  return index?.byPath.get(path);
}

export interface JustFiledRow {
  /** The item's inbox path: unique within a run. */
  key: string;
  /** Where it ended up (`items[].to`). */
  to: string;
  /** The name it has now, without its extension. */
  title: string;
  /** The name it had, when it was renamed. */
  oldName?: string;
  kind: FileKind;
  /** The file name now, with its extension (the badge's letters read it). */
  name: string;
  /** The folder, as people read it: `Projects › Flat hunt`. */
  folder: string;
  para: ParaKind | null;
  /** Drive id, when the vault index has the file. */
  id?: string;
  /** Where a tap goes; absent when the index does not have the file yet. */
  href?: string;
  /** The Bower's-note path whose key facts the row shows: the note beside a
   * file, or the note itself. */
  notePath: string;
}

function hrefFor(file: DriveFile, kind: FileKind): string {
  const base = kind === 'note' ? '/note/' : '/file/';
  return `${base}${encodeURIComponent(file.id)}`;
}

/** The kind of an item whose file is not (yet) in the index: its name says. */
function kindOfName(name: string): FileKind {
  return fileKind({ name, mimeType: '' });
}

function rowOf(item: RunItem & { to: string }, index: VaultIndex | null) {
  const name = baseName(item.to);
  const file = fileAt(index, item.to);
  const kind = file === undefined ? kindOfName(name) : fileKind(file);
  const row: JustFiledRow = {
    key: item.path,
    to: item.to,
    title: fileTitle(name),
    kind,
    name,
    folder: folderLabel(folderOf(item.to)),
    para: paraOf(item.to),
    notePath: kind === 'note' ? item.to : item.to.replace(/\.[^./]+$/, '.md'),
  };
  if (item.renamedFrom !== undefined && item.renamedFrom !== name) {
    row.oldName = item.renamedFrom;
  }
  if (file !== undefined) {
    row.id = file.id;
    row.href = hrefFor(file, kind);
  }
  return row;
}

/** Whether `run` says where its items went (report v2). */
export function hasDestinations(run: Run): boolean {
  return (run.items ?? []).some(
    (item) => item.kind === 'file' && item.to !== undefined,
  );
}

/** The rows of a report with `to`: files only, a request or a rule is not a
 * thing that was filed. Set-aside items stay in the rows list of a table
 * only through their own group (`setAsideRows`). */
export function justFiledRows(
  run: Run,
  index: VaultIndex | null,
): JustFiledRow[] {
  const aside = new Set((run.setAside ?? []).map((item) => item.path));
  const rows: JustFiledRow[] = [];
  for (const item of run.items ?? []) {
    if (item.kind !== 'file' || item.to === undefined) continue;
    if (aside.has(item.to) || aside.has(item.path)) continue;
    rows.push(rowOf({ ...item, to: item.to }, index));
  }
  return rows;
}

/** The ids the rows stand for, for "Mark all seen" and the New tags. */
export function rowIds(rows: readonly JustFiledRow[]): string[] {
  return rows.flatMap((row) => (row.id === undefined ? [] : [row.id]));
}

export interface SetAsideRow {
  key: string;
  title: string;
  /** Where it is kept: `Projects › Flat hunt`. */
  folder: string;
  reason: SetAsideReason;
  /** The reason as one sentence. */
  sentence: string;
  /** The Bower box prefilled ("Say what it is"). */
  sayHref: string;
  id?: string;
  href?: string;
}

/** Why an item was set aside, in people's words (spec R-JUST-2, R-FILE-6). */
export function setAsideSentence(
  reason: SetAsideReason,
  kind: FileKind,
): string {
  switch (reason) {
    case 'kept-not-read':
      return (
        formatPolicy(kind).fileNotice ?? "Bower keeps it, but can't read it."
      );
    case 'too-large':
      return 'It is over the size limit, so Bower kept it by its name.';
    case 'unconvertible':
      return 'Bower could not turn it into text, so it kept it by its name.';
    case 'quarantined':
      return 'It reads like instructions to Bower, so it was left alone.';
  }
}

function asideRowOf(item: SetAsideItem, index: VaultIndex | null): SetAsideRow {
  const name = baseName(item.path);
  const file = fileAt(index, item.path);
  const kind = file === undefined ? kindOfName(name) : fileKind(file);
  const row: SetAsideRow = {
    key: item.path,
    title: fileTitle(name),
    folder: folderLabel(folderOf(item.path)),
    reason: item.reason,
    sentence: setAsideSentence(item.reason, kind),
    sayHref: `/bower?text=${encodeURIComponent(`About ${name}: `)}`,
  };
  if (file !== undefined) {
    row.id = file.id;
    row.href = hrefFor(file, kind);
  }
  return row;
}

export function setAsideRows(
  run: Run,
  index: VaultIndex | null,
): SetAsideRow[] {
  return (run.setAside ?? []).map((item) => asideRowOf(item, index));
}

/** How many things a run filed, set-aside ones included (`Just filed · 6`). */
export function filedCount(run: Run): number {
  return runCounts(run).filed;
}

/** Ids of the run's filed items that are not in `seen`. */
export function unseenIds(
  run: Run,
  index: VaultIndex | null,
  seen: ReadonlySet<string>,
): Set<string> {
  const ids = new Set<string>();
  for (const item of run.items ?? []) {
    if (item.to === undefined) continue;
    const file = fileAt(index, item.to);
    if (file !== undefined && !seen.has(file.id)) ids.add(file.id);
  }
  return ids;
}

/** "Today, 10:42 · 6 things", plus " · 4 new to you" when `newCount` is given. */
export function groupHeading(run: Run, now: number, newCount?: number): string {
  const when = cardWhen(run.finishedAt ?? run.requestedAt, now);
  const parts = [when, things(filedCount(run))];
  if (newCount !== undefined) parts.push(`${String(newCount)} new to you`);
  return parts.join(' · ');
}

/** "26 Sep, 18:10": an earlier tidy-up is always dated, never "Yesterday"
 * (board `Desktop-JustFiled`), on this device's clock. */
export function earlierWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number): string => String(n).padStart(2, '0');
  const day = `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${shortDay(day)}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** An earlier tidy-up's line: "26 Sep, 18:10 · 3 things", and for one or two
 * things their names ("12 Jun, 20:45 · 2 things · Offer letter, Bike shop
 * receipt"). */
export function earlierHeading(
  run: Run,
  now: number,
  index: VaultIndex | null,
): string {
  const count = filedCount(run);
  const parts = [earlierWhen(run.finishedAt ?? run.requestedAt), things(count)];
  if (count > 0 && count <= 2 && hasDestinations(run)) {
    const names = justFiledRows(run, index).map((row) => {
      const comma = row.title.indexOf(',');
      return comma === -1 ? row.title : row.title.slice(0, comma);
    });
    if (names.length > 0) parts.push(names.join(', '));
  }
  return parts.join(' · ');
}

/** The finished runs, newest first, from `GET /runs`. */
export function finishedRuns(runs: readonly Run[]): Run[] {
  return runs.filter((run) => run.state === 'done');
}

/**
 * The tidy-up the screen opens: the run store's last finished run when it
 * has one, else the newest of `GET /runs` (in the demo `GET /status` is
 * null until a run ends).
 */
export function latestRun(
  lastFinished: Run | null,
  runs: readonly Run[],
): Run | null {
  if (lastFinished !== null && lastFinished.state === 'done') {
    return lastFinished;
  }
  return finishedRuns(runs)[0] ?? null;
}

/** The runs after `latest`, newest first, at most `EARLIER_LIMIT`. */
export function earlierRuns(latest: Run | null, runs: readonly Run[]): Run[] {
  return finishedRuns(runs)
    .filter((run) => latest === null || run.requestedAt !== latest.requestedAt)
    .slice(0, EARLIER_LIMIT);
}

/**
 * The lines of a report that has no `to` (a runner before report v2): what
 * Activity says for that run (`activity.ts`), read from `log.md`.
 */
export function fallbackLines(
  run: Run,
  log: string,
  now: number,
): ActivityRow[] {
  return activityCard(run, parseLog(log), [], now).rows;
}
