/**
 * Just filed (#616, spec §6.10 R-JUST-1, R-JUST-2, R-JUST-5, boards
 * `Phone-JustFiled` and `Desktop-JustFiled`): what a tidy-up filed, with the
 * name each thing had, the name it has now and the folder it went to. Pure:
 * groups from a run report (`GET /runs`, or the run store's last run) and the
 * vault index, the set-aside list, the headings and the fallback to Activity
 * for a report without `to` (a runner before report v2). Raw "Moved:" lines
 * are never shown (R-JUST-1). The screen is
 * `routes/just-filed.tsx`; the Notes row is `components/just-filed-row.tsx`.
 */

import { activityCard, cardDuration, cardWhen, parseLog } from './activity.js';
import type { ActivityRow } from './activity.js';
import type { Run, RunItem, SetAsideItem, SetAsideReason } from './api.js';
import type { DriveFile } from './drive.js';
import { formatPolicy } from './formats.js';
import { runCounts, things } from './home.js';
import { failureCopy } from './run-failure.js';
import { outcomeCounts, outcomeFromRun } from './run-outcome.js';
import type { OutcomeAction, RunOutcome } from './run-outcome.js';
import { shortDay } from './rules.js';
import { displayPath, paraKindOf } from './navigation.js';
import type { ParaKind } from './components/folder-mark.js';
import { linkTitleFromFileName } from './add.js';
import { fileKind, fileTitle } from './vault-index.js';
import type { FileKind, VaultIndex } from './vault-index.js';

/** The path of the screen. */
export const JUST_FILED_PATH = '/just-filed';

/** How many earlier tidy-ups the screen lists (`GET /runs` keeps 20). */
export const EARLIER_LIMIT = 20;

/** Copy keys `just.row`, `just.sub`, `just.intro`, `just.was`, `just.aside`,
 * `just.earlier`, `just.markall` (spec §6.10). */
export const JUST_INTRO =
  'What each tidy-up did: what is new, what changed, where things went.';
export const JUST_EARLIER = 'Earlier tidy-ups';
export const JUST_EARLIER_SUB = 'The last 20, each with what it did';
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

/**
 * The address a saved link shows in the desktop table's "You added" cell
 * (board `Desktop-JustFiled`): host and path, the middle of a long path
 * elided, "rightmove.co.uk/…/kentish-town". `null` when `source` is not an
 * http(s) address.
 */
export function linkAddress(source: unknown): string | null {
  if (typeof source !== 'string') return null;
  let url: URL;
  try {
    url = new URL(source.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.replace(/^www\./i, '');
  const parts = url.pathname.split('/').filter((part) => part !== '');
  if (parts.length === 0) return host;
  const last = parts[parts.length - 1] ?? '';
  return parts.length === 1 ? `${host}/${last}` : `${host}/…/${last}`;
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
    title: linkTitleFromFileName(name) ?? fileTitle(name),
    kind,
    name,
    folder: folderLabel(folderOf(item.to)),
    para: paraOf(item.to),
    notePath: kind === 'note' ? item.to : item.to.replace(/\.[^./]+$/, '.md'),
  };
  if (item.renamedFrom !== undefined && item.renamedFrom !== '') {
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
    title: linkTitleFromFileName(name) ?? fileTitle(name),
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

/** The runs the screen can list or open: finished ones, failed and partly
 * done included (R-JUST-3). */
export function listedRuns(runs: readonly Run[]): Run[] {
  return runs.filter((run) => run.state === 'done' || run.state === 'failed');
}

/** What `?run=` names: the run id, else when it was asked for. */
export function runKey(run: Run): string {
  return run.runId ?? run.requestedAt;
}

/**
 * The run the screen opens (R-JUST-5): the one `key` names, else the latest.
 * An unknown or empty key is not an error.
 */
export function pickRun(
  key: string | undefined,
  lastFinished: Run | null,
  runs: readonly Run[],
): Run | null {
  if (key !== undefined && key !== '') {
    const found = listedRuns(runs).find((run) => runKey(run) === key);
    if (found !== undefined) return found;
  }
  return latestRun(lastFinished, runs);
}

/** The runs after `latest`, newest first, at most `EARLIER_LIMIT`; failed and
 * partly done ones are listed too (R-JUST-3). */
export function earlierRuns(latest: Run | null, runs: readonly Run[]): Run[] {
  return listedRuns(runs)
    .filter((run) => latest === null || runKey(run) !== runKey(latest))
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
  return activityCard(run, parseLog(log), [], now).rows.filter(
    (row) => row.tone !== 'move',
  );
}

/** Where the runner parks the bookkeeping copy of a request or a saved link. */
export function isProcessedPath(path: string): boolean {
  return /(^|\/)Processed(\/|$)/.test(path);
}

/** The order of the groups on a phone (R-JUST-2). */
export const GROUP_ORDER: readonly OutcomeAction[] = [
  'needs',
  'new',
  'updated',
  'filed',
];

export const ACTION_TAG: Readonly<Record<OutcomeAction, string>> = {
  needs: 'Needs you',
  new: 'New note',
  updated: 'Updated',
  filed: 'Filed',
};

const GROUP_HEADING: Readonly<Record<OutcomeAction, string>> = {
  needs: 'Needs you',
  new: 'New notes',
  updated: 'Updated',
  filed: 'Filed',
};

/**
 * The New chip shows only on a row whose action is a new note that this
 * device has not opened; a Filed row already carries its Filed tag.
 */
export function showsNewChip(
  row: Pick<TableRow, 'action' | 'id'>,
  unseen: ReadonlySet<string>,
): boolean {
  return row.action === 'new' && row.id !== undefined && unseen.has(row.id);
}

export const SAY_LABEL = 'Tell Bower what it is';
export const NO_CHANGE = '—';
const STILL_WAITING = 'Still in your inbox for the next tidy-up.';

/** One line of the table: something a tidy-up did (spec §6.6). */
export interface TableRow {
  key: string;
  action: OutcomeAction;
  /** The name it has now, without its extension. */
  title: string;
  /** The name it had, when it was renamed. */
  oldName?: string;
  kind: FileKind;
  name: string;
  folder: string;
  para: ParaKind | null;
  id?: string;
  href?: string;
  /** The note whose source address the row reads (a saved link). */
  notePath: string;
  /** "What changed": "renamed", the change note, or the reason it needs you. */
  changed: string;
  /** Needs you: the Bower box prefilled. */
  sayHref?: string;
}

function tableRow(
  action: OutcomeAction,
  path: string,
  index: VaultIndex | null,
): TableRow {
  const name = baseName(path);
  const file = fileAt(index, path);
  const kind = file === undefined ? kindOfName(name) : fileKind(file);
  const row: TableRow = {
    key: `${action}:${path}`,
    action,
    title: linkTitleFromFileName(name) ?? fileTitle(name),
    kind,
    name,
    folder: folderLabel(folderOf(path)),
    para: paraOf(path),
    notePath: kind === 'note' ? path : path.replace(/\.[^./]+$/, '.md'),
    changed: NO_CHANGE,
  };
  if (file !== undefined) {
    row.id = file.id;
    row.href = hrefFor(file, kind);
  }
  return row;
}

/**
 * The rows of a run, from its `RunOutcome`: New notes, Updated, Filed and
 * Needs you. Moves of instruction and context notes into `Processed` are
 * bookkeeping and never listed; a link saved as a note lists the note, where
 * it is now (R-JUST-1, R-JUST-4).
 */
export function tableRows(run: Run, index: VaultIndex | null): TableRow[] {
  const outcome = outcomeFromRun(run);
  const aside = new Map((run.setAside ?? []).map((i) => [i.path, i.reason]));
  const rows: TableRow[] = [];
  const seen = new Set<string>();
  for (const item of outcome.items) {
    const path = item.action === 'filed' ? (item.to ?? item.path) : item.path;
    if (item.action === 'filed') {
      if (isProcessedPath(path)) continue;
      if (aside.has(path) || aside.has(item.path)) continue;
    }
    const row = tableRow(item.action, path, index);
    if (seen.has(row.key)) continue;
    seen.add(row.key);
    if (
      item.action === 'filed' &&
      item.from !== undefined &&
      item.from !== ''
    ) {
      row.oldName = item.from;
      row.changed = 'renamed';
    }
    if (item.action === 'updated' && item.note !== undefined) {
      row.changed = item.note;
    }
    if (item.action === 'needs') {
      const reason = aside.get(item.path);
      row.changed =
        reason === undefined
          ? STILL_WAITING
          : setAsideSentence(reason, row.kind);
      row.sayHref = `/bower?text=${encodeURIComponent(`About ${row.name}: `)}`;
      row.folder = folderLabel(folderOf(item.path));
    }
    rows.push(row);
  }
  return rows;
}

export interface RowGroup {
  action: OutcomeAction;
  /** "Needs you · 1". */
  heading: string;
  rows: TableRow[];
}

/** The phone's groups, in order, empty ones left out. */
export function groupRows(rows: readonly TableRow[]): RowGroup[] {
  return GROUP_ORDER.flatMap((action) => {
    const inGroup = rows.filter((row) => row.action === action);
    return inGroup.length === 0
      ? []
      : [
          {
            action,
            heading: `${GROUP_HEADING[action]} · ${String(inGroup.length)}`,
            rows: inGroup,
          },
        ];
  });
}

/** "from your clip (rentals.example)" for a saved link, "from scan_0412.pdf"
 * for a renamed file, else the change note (updated), else nothing. */
export function originLine(
  row: TableRow,
  address: string | undefined,
): string | undefined {
  if (address !== undefined) {
    return `from your clip (${address.split('/')[0] ?? address})`;
  }
  if (row.oldName !== undefined) return `from ${row.oldName}`;
  if (row.action === 'updated' && row.changed !== NO_CHANGE) return row.changed;
  return undefined;
}

/** The desktop "You added" cell. */
export function youAdded(row: TableRow, address: string | undefined): string {
  if (address !== undefined) return address;
  if (row.oldName !== undefined) return row.oldName;
  return row.action === 'filed' || row.action === 'needs'
    ? row.name
    : NO_CHANGE;
}

export type StateTone = 'done' | 'warn' | 'danger';

/** Done, Partly done (warn) or Did not finish (danger). */
export function stateLabel(outcome: RunOutcome): {
  label: string;
  tone: StateTone;
} {
  switch (outcome.state) {
    case 'failed':
      return { label: 'Did not finish', tone: 'danger' };
    case 'partial':
      return { label: 'Partly done', tone: 'warn' };
    case 'running':
      return { label: 'Running', tone: 'done' };
    case 'done':
      return { label: 'Done', tone: 'done' };
  }
}

export interface RunLine {
  /** "Today, 13:20 · 6 min". */
  when: string;
  label: string;
  tone: StateTone;
  /** "4 new · 4 updated"; a failed run says why; a run with requests
   * leads with "1 request". */
  counts: string;
}

/** The line an earlier tidy-up shows (R-JUST-3). */
export function runLine(run: Run, now: number): RunLine {
  const outcome = outcomeFromRun(run);
  const { label, tone } = stateLabel(outcome);
  const requests = (run.items ?? []).filter((i) => i.kind === 'request').length;
  const parts: string[] = [];
  if (requests > 0) {
    parts.push(
      `${String(requests)} ${requests === 1 ? 'request' : 'requests'}`,
    );
  }
  const counts = outcomeCounts(outcome, { short: true });
  if (outcome.state === 'failed') parts.push(failureCopy(outcome.reason).short);
  else if (counts !== '') parts.push(counts);
  return {
    when: `${cardWhen(run.finishedAt ?? run.requestedAt, now)} · ${cardDuration(run)}`,
    label,
    tone,
    counts: parts.join(' · '),
  };
}
