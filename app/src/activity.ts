/**
 * The Bower tab's Activity (#345, spec C.7, board Phone-Bower-Activity):
 * one card per tidy-up, "Today, 18:51 · 3 min", with what went where, what
 * was renamed, the questions answered and what was set aside, in people's
 * words. Pure, so it is unit-tested with a fixture (`test/activity.test.ts`)
 * and `routes/bower.tsx` only renders it.
 *
 * Two sources, both already Bower's own:
 * - the run records the Worker keeps (`GET /runs`, the last 20): which
 *   inbox items a run processed and what each one was (`items`, the
 *   runner's per-item kind), what the pre-scan set aside (`quarantined`),
 *   when it started and finished, and whether it failed;
 * - `log.md` in the Bower folder, where the agent writes one line per
 *   thing it did (`vault-template/CLAUDE.md`): `Filed: <name> → <folder>`
 *   (ending `, renamed from <old name>`), `Correction: <from> -> <to>
 *   (<date>)`, `Applied rule: <text>` and `Context: <text>`.
 * A row never guesses from a title what an item was: the run's `items` say
 * so (`processedKind`); the log only adds where it went.
 */

import type { Run, RunItemKind } from './api.js';
import { FOLDER_MIME } from './drive.js';
import type { DriveFile } from './drive.js';
import { displayPath } from './navigation.js';
import { failureCopy } from './run-failure.js';
import { outcomeCounts, outcomeFromRun, runSentence } from './run-outcome.js';
import type { RunOutcome } from './run-outcome.js';
import { processedKind } from './run-progress.js';
import { shortDay } from './rules.js';
import { fileTitle } from './vault-index.js';

// --- log.md -------------------------------------------------------------

/** When a log line says it happened: its day, and its time when written
 * (both as the agent wrote them: UTC, the runner's clock). */
export interface LogStamp {
  /** `YYYY-MM-DD`. */
  day: string;
  /** `HH:MM`, when the line has one. */
  time?: string;
}

/** One line of `log.md` Activity can use; every other line is skipped. */
export type LogEntry =
  | {
      type: 'filed';
      at: LogStamp | null;
      /** The name it has now, in its folder. */
      name: string;
      /** The folder it went to (`1-Projects/Flat hunt`). */
      folder: string;
      /** The name it had in the inbox, when Bower renamed it. */
      renamedFrom?: string;
    }
  | {
      type: 'correction';
      at: LogStamp | null;
      from: string;
      to: string;
    }
  | {
      type: 'moved';
      at: LogStamp | null;
      /** The path it had, in the vault (`1-Projects/Flat hunt/a.md`). */
      from: string;
      /** The path it has now. */
      to: string;
      /** A move the person made themselves (`Moved by you:`). */
      byYou: boolean;
    }
  | { type: 'rule'; at: LogStamp | null; text: string }
  | { type: 'context'; at: LogStamp | null; text: string };

/** `- 2026-09-28 18:51 · ` (the dash, the time and the dot all optional). */
const LINE_PREFIX =
  /^\s*(?:[-*]\s+)?(?:(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2})(?::\d{2})?Z?)?\s*(?:·|-|—)\s*)?/;
const FILED =
  /^Filed:\s*(.+?)\s*(?:→|->)\s*(.+?)(?:,\s*renamed from\s+(.+?))?\s*\.?$/;
const MOVED = /^Moved( by you)?:\s*(.+?)\s*(?:→|->)\s*(.+?)\s*\.?$/;
const CORRECTION =
  /^Correction:\s*(.+?)\s*->\s*(.+?)\s*\((\d{4}-\d{2}-\d{2})\)/;
const APPLIED_RULE = /^Applied rule:\s*(.+?)\s*$/;
const CONTEXT = /^Context:\s*(.+?)\s*$/;

/** A name as the agent may write it: bare, `[[wikilinked]]`, `` `quoted` ``
 * or "quoted". */
function cleanName(raw: string): string {
  return raw
    .trim()
    .replace(/^\[\[(.*)\]\]$/, '$1')
    .replace(/^[`"'](.*)[`"']$/, '$1')
    .trim();
}

/** A folder path without a leading or trailing slash. */
function cleanFolder(raw: string): string {
  return cleanName(raw).replace(/^\/+|\/+$/g, '');
}

/** Every line of `log.md` Activity can use, in the order written. */
export function parseLog(text: string): LogEntry[] {
  const entries: LogEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    const prefix = LINE_PREFIX.exec(line);
    const day = prefix?.[1];
    const at: LogStamp | null =
      day === undefined
        ? null
        : prefix?.[2] === undefined
          ? { day }
          : { day, time: `${prefix[2]}:${prefix[3] ?? '00'}` };
    const rest = line.slice(prefix?.[0].length ?? 0).trim();

    const filed = FILED.exec(rest);
    if (filed !== null) {
      const entry: LogEntry = {
        type: 'filed',
        at,
        name: cleanName(filed[1] ?? ''),
        folder: cleanFolder(filed[2] ?? ''),
      };
      const old = filed[3];
      if (old !== undefined) entry.renamedFrom = cleanName(old);
      if (entry.name !== '' && entry.folder !== '') entries.push(entry);
      continue;
    }
    const moved = MOVED.exec(rest);
    if (moved !== null) {
      const from = cleanFolder(moved[2] ?? '');
      const to = cleanFolder(moved[3] ?? '');
      if (from !== '' && to !== '') {
        entries.push({
          type: 'moved',
          at,
          from,
          to,
          byYou: moved[1] !== undefined,
        });
      }
      continue;
    }
    const correction = CORRECTION.exec(rest);
    if (correction !== null) {
      entries.push({
        type: 'correction',
        at: at ?? { day: correction[3] ?? '' },
        from: cleanFolder(correction[1] ?? ''),
        to: cleanFolder(correction[2] ?? ''),
      });
      continue;
    }
    const rule = APPLIED_RULE.exec(rest);
    if (rule !== null) {
      entries.push({ type: 'rule', at, text: rule[1] ?? '' });
      continue;
    }
    const context = CONTEXT.exec(rest);
    if (context !== null) {
      entries.push({ type: 'context', at, text: context[1] ?? '' });
    }
  }
  return entries;
}

// --- the cards ----------------------------------------------------------

/** A row's icon and colour, as on the board. */
export type ActivityTone =
  | 'note'
  | 'pdf'
  | 'image'
  | 'file'
  | 'question'
  | 'rule'
  // No card row is a move any more (R-JUST-1); the tone stays only because
  // `just-filed.ts` still filters on it.
  | 'move'
  | 'set-aside';

export interface ActivityRow {
  /** Unique within its card. */
  key: string;
  tone: ActivityTone;
  /** What people recognise: the name it had when they added it. */
  title: string;
  /** The folder it went to, as people read it (`1-Projects / Flat hunt`). */
  destination?: string;
  /** The name Bower gave it, without its extension. */
  renamed?: string;
  /** The answer's Drive id: the row's "read it" opens it. */
  answerId?: string;
  /** What came of a request with no answer to show: `done`, `in your
   * rules`. */
  outcome?: string;
  /** Why it was set aside, in people's words. */
  setAside?: string;
}

export interface ActivityCard {
  /** Stable per run: its `requestedAt`. */
  key: string;
  /** "Today, 18:51", "Yesterday, 09:12", "25 Sep, 18:02". */
  when: string;
  /** "3 min". */
  duration: string;
  /** The chip: "Done", "One thing set aside", "Failed · Took too long". */
  status: string;
  failed: boolean;
  /** What the run did, from the one place that reads a report (R-RUN-4). */
  outcome: RunOutcome;
  /** The counts, "2 filed · 3 new notes · 1 needs you"; `''` when none. */
  counts: string;
  /** The card's sentence, in the third person ("Done 3 h ago: …"). */
  sentence: string;
  rows: ActivityRow[];
}

export interface ActivityInput {
  /** `GET /runs`, newest first. */
  runs: readonly Run[];
  /** `log.md`'s text, `''` before it is read. */
  log: string;
  /** The folder listing, for the answers in `Answers/`. */
  files: readonly DriveFile[];
  /** Now, for "Today" and "Yesterday". */
  now: number;
}

/** Why the pre-scan set a file aside (spec A.5), in people's words. */
export const QUARANTINED_REASON =
  'it reads like instructions to Bower, so it was left alone.';

/** Why a document with no text Bower could read was set aside. */
export const UNREADABLE_REASON = 'could not be read.';

/** Documents the runner converts before Bower reads them (`run.sh`): one
 * that was not filed could not be converted (`CLAUDE.md`, Ingest step 1). */
const CONVERTED = /\.(docx|odt|html?|epub|rtf)$/i;
const IMAGE = /\.(jpe?g|png|heic|heif|webp|gif|svg)$/i;
const REQUEST_NAME = /^Bower - (\d{4}-\d{2}-\d{2}) \d{4} (.+)\.md$/i;
const ANSWER_NAME = /^(\d{4}-\d{2}-\d{2}) (.+)\.md$/;
/** How far a log line's time may sit outside its run's window. */
const SLACK_MS = 2 * 60 * 1000;

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function toneOf(name: string): ActivityTone {
  if (/\.md$/i.test(name)) return 'note';
  if (/\.pdf$/i.test(name)) return 'pdf';
  return IMAGE.test(name) ? 'image' : 'file';
}

/** What people read for a file: a note's title, any other file's name. */
function fileDisplayName(name: string): string {
  return /\.md$/i.test(name) ? fileTitle(name) : name;
}

/** `1-Projects/Flat hunt` as `Projects / Flat hunt`. */
export function folderLabel(folder: string): string {
  return displayPath(folder);
}

/** Letters and digits only, lower-cased: how a title is compared across a
 * file name that dropped its punctuation. */
function comparable(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function stampMs(stamp: LogStamp): number {
  return Date.parse(`${stamp.day}T${stamp.time ?? '00:00'}:00Z`);
}

function utcDay(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/** Whether a log line written at `stamp` belongs to `run`: its time inside
 * the run's window, give or take `SLACK_MS`; a line with a day only, that
 * day being the day the run finished, when `run` is the last run of that
 * day (`lastOfDay`). A line with no date at all fits any run. */
function fits(stamp: LogStamp | null, run: Run, lastOfDay: boolean): boolean {
  if (stamp === null) return true;
  const end = run.finishedAt ?? run.startedAt ?? run.requestedAt;
  if (stamp.time === undefined) return lastOfDay && stamp.day === utcDay(end);
  const at = stampMs(stamp);
  const start = Date.parse(run.startedAt ?? run.requestedAt);
  return at >= start - SLACK_MS && at <= Date.parse(end) + SLACK_MS;
}

/** The `Filed:` line for the inbox item named `name` in `run`: the last one
 * that names it (as filed, or as the name it was renamed from) and fits
 * the run's window. */
function filedLine(
  entries: readonly LogEntry[],
  name: string,
  run: Run,
  lastOfDay: boolean,
): Extract<LogEntry, { type: 'filed' }> | undefined {
  let found: Extract<LogEntry, { type: 'filed' }> | undefined;
  for (const entry of entries) {
    if (entry.type !== 'filed' || !fits(entry.at, run, lastOfDay)) continue;
    if (entry.name === name || entry.renamedFrom === name) found = entry;
  }
  return found;
}

/** The answer in `Answers/` to the request note `name`: same words in its
 * title, written on or after the day the request was sent. */
function answerTo(
  name: string,
  answers: readonly DriveFile[],
): DriveFile | undefined {
  const request = REQUEST_NAME.exec(name);
  if (request === null) return undefined;
  const sent = request[1] ?? '';
  const words = comparable(request[2] ?? '');
  return answers.find((file) => {
    const answer = ANSWER_NAME.exec(file.name);
    return (
      answer !== null &&
      (answer[1] ?? '') >= sent &&
      comparable(answer[2] ?? '') === words
    );
  });
}

/** A request note's words: its title without the date and time. */
function requestTitle(name: string): string {
  return REQUEST_NAME.exec(name)?.[2] ?? fileTitle(name);
}

function fileRow(
  path: string,
  run: Run,
  entries: readonly LogEntry[],
  lastOfDay: boolean,
): ActivityRow {
  const name = baseName(path);
  const line = filedLine(entries, name, run, lastOfDay);
  if (line === undefined) {
    if (run.state === 'done' && CONVERTED.test(name)) {
      return {
        key: path,
        tone: 'set-aside',
        title: name,
        setAside: UNREADABLE_REASON,
      };
    }
    return { key: path, tone: toneOf(name), title: fileDisplayName(name) };
  }
  const row: ActivityRow = {
    key: path,
    tone: toneOf(name),
    title: fileDisplayName(name),
    destination: folderLabel(line.folder),
  };
  if (line.renamedFrom === name && line.name !== name) {
    row.renamed = fileTitle(line.name);
  }
  return row;
}

function requestRow(
  path: string,
  kind: RunItemKind,
  answers: readonly DriveFile[],
): ActivityRow {
  const name = baseName(path);
  const title = requestTitle(name);
  const answer = kind === 'rule' ? undefined : answerTo(name, answers);
  if (answer !== undefined) {
    const question = /[?.!]$/.test(title) ? title : `${title}?`;
    return {
      key: path,
      tone: 'question',
      title: question,
      answerId: answer.id,
    };
  }
  if (kind === 'rule') {
    return { key: path, tone: 'rule', title, outcome: 'in your rules' };
  }
  return { key: path, tone: 'note', title, outcome: 'done' };
}

/** "Today, 18:51", "Yesterday, 09:12", "25 Sep, 18:02", on this device's
 * clock. */
export function cardWhen(iso: string, now: number): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number): string => String(n).padStart(2, '0');
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const dayOf = (d: Date): string =>
    `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = new Date(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const day = dayOf(date);
  if (day === dayOf(today)) return `Today, ${time}`;
  if (day === dayOf(yesterday)) return `Yesterday, ${time}`;
  return `${shortDay(day)}, ${time}`;
}

/** "3 min" from start to finish, never under a minute; "1 h 5 min" past
 * the hour. */
export function cardDuration(run: Run): string {
  const start = Date.parse(run.startedAt ?? run.requestedAt);
  const end = Date.parse(run.finishedAt ?? run.startedAt ?? run.requestedAt);
  const minutes = Math.max(1, Math.round((end - start) / 60_000) || 1);
  if (minutes < 60) return `${String(minutes)} min`;
  const rest = minutes % 60;
  const hours = `${String(Math.floor(minutes / 60))} h`;
  return rest === 0 ? hours : `${hours} ${String(rest)} min`;
}

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five'];

function setAsideStatus(count: number): string {
  const word = NUMBER_WORDS[count] ?? String(count);
  return `${word} ${count === 1 ? 'thing' : 'things'} set aside`;
}

/** One card for `run` (see the module note); `lastOfDay` when no later
 * run finished the same (UTC) day, so a log line with a day and no time
 * belongs to this one. */
export function activityCard(
  run: Run,
  entries: readonly LogEntry[],
  answers: readonly DriveFile[],
  now: number,
  lastOfDay = true,
): ActivityCard {
  const rows: ActivityRow[] = [];
  for (const path of run.processed ?? []) {
    const kind = processedKind(path, run.items);
    if (kind === 'context') continue;
    rows.push(
      kind === 'file'
        ? fileRow(path, run, entries, lastOfDay)
        : requestRow(path, kind, answers),
    );
  }
  // Moves and corrections are not rows: the card says what the run did in
  // counts (`RunOutcome`), never as raw "Moved" lines (R-JUST-1, R-REQ-4).
  for (const entry of entries) {
    if (entry.at === null || !fits(entry.at, run, lastOfDay)) continue;
    if (entry.type === 'rule') {
      rows.push({
        key: `rule:${entry.text}`,
        tone: 'rule',
        title: entry.text,
        outcome: 'your rule, applied',
      });
    }
  }
  for (const path of run.quarantined ?? []) {
    rows.push({
      key: `quarantined:${path}`,
      tone: 'set-aside',
      title: baseName(path),
      setAside: QUARANTINED_REASON,
    });
  }

  const failed = run.state === 'failed';
  const setAside = rows.filter((row) => row.setAside !== undefined).length;
  const status = failed
    ? `Failed · ${failureCopy(run.reason).short}`
    : setAside > 0
      ? setAsideStatus(setAside)
      : 'Done';
  const outcome = outcomeFromRun(run);
  return {
    key: run.requestedAt,
    when: cardWhen(run.finishedAt ?? run.requestedAt, now),
    duration: cardDuration(run),
    status,
    failed,
    outcome,
    counts: outcomeCounts(outcome),
    sentence: runSentence(outcome, { now, voice: 'third' }),
    rows,
  };
}

/** Every card, newest first: one per run the Worker kept. */
export function activityCards({
  runs,
  log,
  files,
  now,
}: ActivityInput): ActivityCard[] {
  const entries = parseLog(log);
  const answers = files.filter(
    (file) =>
      file.mimeType !== FOLDER_MIME && file.path === `Answers/${file.name}`,
  );
  const finished = runs.filter(
    (run) => run.state === 'done' || run.state === 'failed',
  );
  const endDay = (run: Run): string =>
    utcDay(run.finishedAt ?? run.startedAt ?? run.requestedAt);
  // Newest first: a run is the last of its day unless one before it in
  // the list finished that same day.
  return finished.map((run, i) =>
    activityCard(
      run,
      entries,
      answers,
      now,
      !finished.slice(0, i).some((newer) => endDay(newer) === endDay(run)),
    ),
  );
}
