/**
 * One result for a run (spec §6.1, R-RUN-1 to R-RUN-3, R-RUN-5, R-RUN-6): the
 * Worker's `Run` and the runner's `.bower/last-run.json` both turn into a
 * `RunOutcome`, and `runSentence` is the only place result text is made, so
 * every screen tells the same story in the same words. Pure: no Drive, no
 * clock (callers pass `now`).
 */

import type {
  DisagreeItem,
  NextItem,
  Run,
  RunItem,
  RunPhase,
  SetAsideItem,
} from './api.js';
import { sinceLabel } from './bower-tab.js';
import type { LastRunOutcome } from './last-run.js';
import { failureCopy, failureReason } from './run-failure.js';
import type { RunFailureReason } from './run-failure.js';
import { isContextNote } from './run-progress.js';

export type OutcomeState = 'running' | 'done' | 'partial' | 'failed';

export type OutcomeAction = 'new' | 'updated' | 'filed' | 'needs';

export interface OutcomeItem {
  action: OutcomeAction;
  /** What to call it: the file name, without a `.md` extension. */
  title: string;
  /** The note or file the run touched, or the pending path that needs you. */
  path: string;
  /** Filed: the name the file had in the inbox, when it was renamed. */
  from?: string;
  /** Filed: where it went. */
  to?: string;
  /** Updated: one line on what changed. */
  note?: string;
}

export interface RunOutcome {
  state: OutcomeState;
  startedAt: string;
  finishedAt?: string;
  /** Files moved out of the inbox (`items[kind=file].to`). */
  filed: number;
  /** Notes written that did not exist before. */
  created: number;
  /** Notes that existed and changed. */
  updated: number;
  /** Things the person must deal with: set aside plus left in the inbox. */
  needsYou: number;
  /** Requests (Bower notes) the run answered or kept: a request-only run is
   * still a done run, never "Nothing new". */
  requests: number;
  /** Pending inbox things the run did not get to. Part of `needsYou`. */
  left: number;
  items: OutcomeItem[];
  /** The clause about what Bower added, cleaned for a bubble (R-RUN-3). */
  quote?: string;
  /** Why a failed or partial run stopped. */
  reason?: RunFailureReason;
  /** A running run: how many things it is tidying, when known. */
  total?: number;
  phase?: RunPhase;
  /** Notes the run found disagreeing, at most 5 (R-MEAN-2); absent when none. */
  disagree?: DisagreeItem[];
  /** What is next for the person, at most 3 (R-MEAN-2); absent when none. */
  next?: NextItem[];
}

/** The fields both sources share, once read. */
interface RawOutcome {
  ended: 'running' | 'done' | 'failed';
  startedAt: string;
  finishedAt?: string;
  items: readonly RunItem[];
  /** Inbox paths the run filed, from a runner that reports no `to`. */
  processed?: readonly string[];
  setAside: readonly SetAsideItem[];
  created: readonly string[];
  updated: readonly { path: string; what?: string }[];
  left: readonly string[];
  added?: string;
  reason?: unknown;
  total?: number;
  phase?: RunPhase;
  disagree?: readonly DisagreeItem[];
  next?: readonly NextItem[];
}

const MAX_DISAGREE = 5;
const MAX_NEXT = 3;

/**
 * The report's disagreements, kept to the caps and to lines that name both
 * notes and say why (R-MEAN-2): anything else is dropped, never shown.
 */
export function cleanDisagree(
  raw: readonly DisagreeItem[] | undefined,
): DisagreeItem[] {
  return (raw ?? [])
    .filter(
      (item) =>
        item.a.trim() !== '' &&
        item.b.trim() !== '' &&
        item.reason.trim() !== '',
    )
    .slice(0, MAX_DISAGREE);
}

/**
 * The report's next steps: at most three, each with an action; a path of `-`
 * or an empty one means the action is about no note.
 */
export function cleanNext(raw: readonly NextItem[] | undefined): NextItem[] {
  const out: NextItem[] = [];
  for (const item of raw ?? []) {
    if (item.action.trim() === '') continue;
    const path = item.path === undefined ? '' : item.path.trim();
    out.push(
      path === '' || path === '-'
        ? { action: item.action }
        : { path, action: item.action },
    );
  }
  return out.slice(0, MAX_NEXT);
}

const MAX_QUOTE = 200;

/**
 * What Bower added, ready for the UI to put one full stop after: trimmed,
 * without a trailing full stop, at most 200 characters. Whether the words
 * are fit to show is the rulebook's job (R-AG-6), not filtered here.
 */
export function cleanQuote(added: string | undefined): string | undefined {
  if (added === undefined) return undefined;
  let text = added.trim();
  if (text.endsWith('.')) text = text.slice(0, -1).trimEnd();
  if (text.length > MAX_QUOTE) text = text.slice(0, MAX_QUOTE).trimEnd();
  return text === '' ? undefined : text;
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function titleOf(path: string): string {
  return baseName(path).replace(/\.md$/i, '');
}

function buildItems(raw: RawOutcome): OutcomeItem[] {
  const items: OutcomeItem[] = [];
  const asideKeys = new Set(raw.setAside.map((aside) => aside.path));
  const seen = new Set<string>();
  for (const item of raw.items) {
    if (item.kind !== 'file') continue;
    const to = item.to === undefined || item.to === '' ? undefined : item.to;
    // A runner from before report v2 says an item was filed but not where:
    // it still counts as filed, so a done run never reads "Nothing new".
    // One it set aside is not filed.
    if (to === undefined && asideKeys.has(item.path)) continue;
    seen.add(item.path);
    const entry: OutcomeItem = {
      action: 'filed',
      title: baseName(to ?? item.path),
      path: item.path,
    };
    if (to !== undefined) entry.to = to;
    if (item.renamedFrom !== undefined) entry.from = item.renamedFrom;
    items.push(entry);
  }
  if (raw.ended === 'done') {
    for (const path of raw.processed ?? []) {
      if (seen.has(path) || asideKeys.has(path) || isContextNote(path)) {
        continue;
      }
      seen.add(path);
      items.push({ action: 'filed', title: baseName(path), path });
    }
  }
  for (const path of raw.created) {
    if (isContextNote(path)) continue;
    items.push({ action: 'new', title: titleOf(path), path });
  }
  for (const change of raw.updated) {
    const entry: OutcomeItem = {
      action: 'updated',
      title: titleOf(change.path),
      path: change.path,
    };
    if (change.what !== undefined && change.what !== '') {
      entry.note = change.what;
    }
    items.push(entry);
  }
  for (const item of raw.setAside) {
    items.push({
      action: 'needs',
      title: baseName(item.path),
      path: item.path,
    });
  }
  for (const path of raw.left) {
    items.push({ action: 'needs', title: baseName(path), path });
  }
  return items;
}

function build(raw: RawOutcome): RunOutcome {
  const items = buildItems(raw);
  const count = (action: OutcomeAction): number =>
    items.filter((item) => item.action === action).length;
  const filed = count('filed');
  const created = count('new');
  const updated = count('updated');
  const left = raw.left.length;
  const requests = raw.items.filter((item) => item.kind === 'request').length;
  let state: OutcomeState;
  if (raw.ended === 'running') state = 'running';
  else if (raw.ended === 'done') state = 'done';
  else state = created + updated + filed > 0 ? 'partial' : 'failed';

  const outcome: RunOutcome = {
    state,
    startedAt: raw.startedAt,
    filed,
    created,
    updated,
    needsYou: raw.setAside.length + left,
    requests,
    left,
    items,
  };
  if (raw.finishedAt !== undefined) outcome.finishedAt = raw.finishedAt;
  const quote = cleanQuote(raw.added);
  if (quote !== undefined) outcome.quote = quote;
  if (state === 'failed' || state === 'partial') {
    outcome.reason = failureReason(raw.reason);
  }
  if (raw.total !== undefined) outcome.total = raw.total;
  if (raw.phase !== undefined) outcome.phase = raw.phase;
  // Only a finished, done run says what it means (R-MEAN-2).
  if (state === 'done') {
    const disagree = cleanDisagree(raw.disagree);
    if (disagree.length > 0) outcome.disagree = disagree;
    const next = cleanNext(raw.next);
    if (next.length > 0) outcome.next = next;
  }
  return outcome;
}

/** The outcome of a Worker `Run` (`GET /status`, `GET /runs`). */
export function outcomeFromRun(run: Run): RunOutcome {
  const raw: RawOutcome = {
    ended:
      run.state === 'done'
        ? 'done'
        : run.state === 'failed'
          ? 'failed'
          : 'running',
    startedAt: run.startedAt ?? run.requestedAt,
    items: run.items ?? [],
    setAside: run.setAside ?? [],
    created: run.created ?? [],
    updated: run.updated ?? [],
    left: run.left ?? [],
    reason: run.reason,
  };
  if (run.finishedAt !== undefined) raw.finishedAt = run.finishedAt;
  if (run.added !== undefined) raw.added = run.added;
  // A runner from before `items` reports only which inbox paths it filed.
  if (run.items === undefined && run.processed !== undefined) {
    raw.processed = run.processed;
  }
  if (run.total !== undefined) raw.total = run.total;
  if (run.phase !== undefined) raw.phase = run.phase;
  if (run.disagree !== undefined) raw.disagree = run.disagree;
  if (run.next !== undefined) raw.next = run.next;
  return build(raw);
}

/**
 * The outcome of `.bower/last-run.json` (R-RUNNER-2): a run the Worker gave
 * up on still reads in full. The file has no start time; its finish time
 * stands in.
 */
export function outcomeFromLastRun(last: LastRunOutcome): RunOutcome {
  const raw: RawOutcome = {
    ended: last.state,
    startedAt: last.finishedAt,
    finishedAt: last.finishedAt,
    items: last.items ?? [],
    setAside: last.setAside ?? [],
    created: last.created ?? [],
    updated: last.updated ?? [],
    left: last.left ?? [],
    reason: last.reason,
  };
  if (last.added !== undefined) raw.added = last.added;
  if (last.disagree !== undefined) raw.disagree = last.disagree;
  if (last.next !== undefined) raw.next = last.next;
  return build(raw);
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export interface SentenceOptions {
  /** The clock, for "{ago}" (defaults to now). */
  now?: number;
  /** `first`: the bird's bubble ("I wrote 3 notes"); `third`: every other
   * surface ("Bower wrote 3 notes"). R-RUN-6. Defaults to `first`, the words
   * of the copy table. */
  voice?: 'first' | 'third';
}

export interface CountsOptions {
  /** RUN-S6: "new" for "new notes", for the bar and the Last tidy-up card. */
  short?: boolean;
}

/**
 * The counts as one line, zeros left out, in the order filed, new, updated,
 * then what is left: "2 filed · 3 new notes · 2 updated · 1 needs you". On a
 * partly done run what is left in the inbox reads "5 still in your inbox"
 * (R-RUN-5) and "needs you" keeps only what Bower could not read.
 */
export function outcomeCounts(
  outcome: RunOutcome,
  options: CountsOptions = {},
): string {
  const parts: string[] = [];
  if (outcome.filed > 0) parts.push(`${outcome.filed} filed`);
  if (outcome.created > 0) {
    parts.push(
      options.short === true
        ? `${outcome.created} new`
        : plural(outcome.created, 'new note'),
    );
  }
  if (outcome.updated > 0) parts.push(`${outcome.updated} updated`);
  if (outcome.state === 'partial') {
    if (outcome.left > 0) parts.push(`${outcome.left} still in your inbox`);
    const unread = outcome.needsYou - outcome.left;
    if (unread > 0) parts.push(`${unread} needs you`);
  } else if (outcome.needsYou > 0) {
    parts.push(`${outcome.needsYou} needs you`);
  }
  return parts.join(' · ');
}

/** The only source of result text (R-RUN-2, RUN-S1 to RUN-S5). */
export function runSentence(
  outcome: RunOutcome,
  options: SentenceOptions = {},
): string {
  const first = options.voice !== 'third';
  const verb = (i: string, bower: string): string =>
    first ? `I ${i}` : `Bower ${bower}`;
  switch (outcome.state) {
    case 'running': {
      const what =
        outcome.total === undefined
          ? 'your things'
          : plural(outcome.total, 'thing');
      return `${first ? 'Tidying' : 'Bower is tidying'} up ${what}. It takes a few minutes; you can keep adding.`;
    }
    case 'done': {
      // Requests are not counted with the files, but a run of only requests
      // did something: it never reads "Nothing new".
      const counts =
        outcomeCounts(outcome) ||
        (outcome.requests > 0 ? plural(outcome.requests, 'request') : '');
      if (counts === '') return 'Nothing new: the inbox was empty.';
      const ago =
        outcome.finishedAt === undefined
          ? ''
          : sinceLabel(outcome.finishedAt, options.now ?? Date.now());
      const only = counts === plural(outcome.requests, 'request');
      const said = only && outcome.requests === 1 ? 'your request' : counts;
      return `Done${ago === '' ? '' : ` ${ago}`}: ${said}.`;
    }
    case 'partial': {
      const did =
        outcome.created > 0
          ? `${verb('wrote', 'wrote')} ${plural(outcome.created, 'note')}`
          : outcome.updated > 0
            ? `${verb('updated', 'updated')} ${plural(outcome.updated, 'note')}`
            : `${verb('filed', 'filed')} ${plural(outcome.filed, 'thing')}`;
      return outcome.left > 0
        ? `${did}, then stopped before filing your ${plural(outcome.left, 'thing')}.`
        : `${did}, then stopped before finishing.`;
    }
    case 'failed': {
      const reason = failureCopy(outcome.reason).sentence;
      return outcome.left > 0
        ? `${reason} Nothing changed; your ${plural(outcome.left, 'thing')} ${outcome.left === 1 ? 'is' : 'are'} still in the inbox.`
        : `${reason} Nothing changed.`;
    }
  }
}
