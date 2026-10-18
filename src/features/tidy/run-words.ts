import { clock, elapsed, plural } from '@/app/words';
import type { Pose } from '@/bird/Bower';
import { RUN_STEPS, type RunPhase, type RunReport, type RunState } from '@/data/types';
import { folderWords, thingName } from '@/data/tree';
import { distinctPaths } from '@/data/spine/report';

/**
 * Every word a run shows comes from here, so the sheet, the chip, Home and
 * the status bar say the same thing. Pure: pass `now`.
 */

export const STEP_LABEL: Record<(typeof RUN_STEPS)[number], string> = {
  queued: 'Getting ready',
  reading: 'Reading',
  writing: 'Writing your notes',
  saving: 'Putting them away',
};

/** What a run that only reads your changes (no filing) calls its steps. */
const CHANGES_LABEL: Record<(typeof RUN_STEPS)[number], string> = {
  queued: 'Getting ready',
  reading: 'Reading your changes',
  writing: 'Writing what you asked',
  saving: 'Saving it',
};

/** A step's name for this run: a tidy-up files, a read of your changes does not. */
export function stepLabel(r: Pick<RunState, 'scope' | 'total'>, step: (typeof RUN_STEPS)[number]): string {
  if (r.scope === 'instructions') return CHANGES_LABEL[step];
  return step === 'reading' && r.total ? `Reading ${plural(r.total, 'thing')}` : STEP_LABEL[step];
}

export const PHASE_POSE: Record<RunPhase, Pose> = {
  queued: 'wait',
  reading: 'read',
  writing: 'write',
  saving: 'carry',
  done: 'proud',
  failed: 'alarm',
};

export function isRunning(r: RunState | null | undefined): boolean {
  return !!r && r.phase !== 'done' && r.phase !== 'failed';
}

/** A finished run with things to replay (a tidy-up that filed something). */
export function hasReplay(r: RunState | null | undefined): boolean {
  return !!r && r.phase === 'done' && r.scope === 'all' && (r.report?.filed.length ?? 0) > 0;
}

/** A finished report with any row that the person has not acknowledged, independently of replay. */
export function reportWaiting(r: RunState | null | undefined): boolean {
  if (!r || r.phase !== 'done' || r.seen || !r.report) return false;
  const rep = r.report;
  return !!rep.waiting || [rep.filed, rep.created, rep.updated, rep.setAside, rep.questions, rep.leftAsWritten,
    rep.answered, rep.alreadySaved, rep.unconfirmed, rep.kept].some((rows) => !!rows?.length);
}

/** What a run left for the next one, in its own sentence (c12-wait-words); empty when nothing waits. */
const waitWords = (n: number | undefined): string => (n ? `${plural(n, 'thing')} ${n === 1 ? 'waits' : 'wait'} for the next tidy-up.` : '');

/**
 * What a finished run left unfinished, apart from what it filed: its saved rows set aside, then what waits with no
 * row of its own. Never added together: they are different things (prod1-partial-results).
 */
export function unfinishedWords(report: Pick<RunReport, 'setAside' | 'waiting'> | undefined): string {
  const aside = report?.setAside.length ? `${plural(report.setAside.length, 'thing')} set aside.` : '';
  return [aside, waitWords(report?.waiting)].filter(Boolean).join(' ');
}

/** A finished tidy-up whose replay has not been watched. */
export function replayWaiting(r: RunState | null | undefined): boolean {
  return hasReplay(r) && !r?.seen;
}

/** A run that stopped and the person has not looked at it yet. */
export function stoppedUnseen(r: RunState | null | undefined): boolean {
  return !!r && r.phase === 'failed' && !r.seen;
}

export function runTitle(r: RunState): string {
  switch (r.phase) {
    case 'queued':
    case 'reading':
    case 'writing':
    case 'saving':
      return stepLabel(r, r.phase);
    case 'done':
      return `Done. ${r.scope === 'instructions' ? 'Bower read your changes' : filedWords(r.report)}.`;
    case 'failed':
      return 'The tidy-up stopped';
  }
}

/**
 * A pile of words already saved (c3-pair-ask, TL-P4-19 addendum 9): its lines were in one note already, by its name,
 * or in several (`null`). In lower case: it is a part of the run's sentence.
 */
export const linesAlreadyIn = (note: string | null): string => `your lines were already in ${note ?? 'your notes'}`;

/**
 * What a finished tidy-up did with the inbox, in a few words: how many things it filed, or, when it filed none and
 * only found things already saved, how many those were (never "0 things filed" for a run that did something).
 */
export function filedWords(report: RunReport | undefined): string {
  const filed = report?.filed.length ?? 0;
  const saved = report?.alreadySaved?.length ?? 0;
  return !filed && saved ? `${plural(saved, 'thing')} already saved` : `${plural(filed, 'thing')} filed`;
}

export function runDetail(r: RunState): string {
  if (r.scope === 'instructions' && r.phase !== 'done' && r.phase !== 'failed') {
    if (r.phase === 'reading') return 'Reading the changes you made and anything you asked.';
    if (r.phase === 'writing') return 'Doing what your changes call for. Your inbox waits for a tidy-up.';
    if (r.phase === 'saving') return 'Saving it in your Drive.';
  }
  switch (r.phase) {
    case 'queued':
      return 'Waiting for a turn on the machine that does the work. Usually under a minute.';
    case 'reading':
      return 'Copying your inbox and reading what each thing is.';
    case 'writing':
      return 'The longest part. Bower names each thing, writes its note and updates the notes it touches.';
    case 'saving':
      return 'Moving each thing to its folder in your Drive.';
    case 'done': {
      const rep = r.report;
      if (!rep) return '';
      if (rep.nothingReady && !rep.waiting && !rep.setAside.length) return 'Nothing in the inbox was ready yet, so it stays as it is.';
      const parts: string[] = [];
      if (rep.updated.length) parts.push(`${plural(notesUpdated(rep), 'note')} brought up to date`);
      // Only this run's questions: "new", beside the total of open ones elsewhere (qa6).
      if (rep.questions.length) parts.push(`${plural(rep.questions.length, 'new question')} for you`);
      if (rep.setAside.length) parts.push(`${plural(rep.setAside.length, 'thing')} set aside`);
      // Never counted as set aside: possibly changed, then gone before Bower read it back.
      if (rep.unconfirmed?.length) parts.push(`Bower couldn't confirm ${plural(rep.unconfirmed.length, 'thing')}`);
      if (rep.kept?.length === 1) parts.push(`${thingName(rep.kept[0]?.name ?? '')} kept as you left it`);
      else if (rep.kept?.length) parts.push(`${plural(rep.kept.length, 'thing')} kept as you left them`);
      // Things already saved went to the Bin: one alone names the file already saved, without its extension. A pile of
      // words whose lines were in its notes already (`notes`) says so, apart.
      const lines = (rep.alreadySaved ?? []).filter((s) => s.notes !== undefined);
      const saved = (rep.alreadySaved ?? []).filter((s) => s.notes === undefined);
      if (lines.length) parts.push(linesAlreadyIn(lines.length === 1 && lines[0]?.notes === 1 ? thingName(lines[0].as) : null));
      if (saved.length === 1) parts.push(`1 thing already saved as ${thingName(saved[0]?.as ?? '')}`);
      else if (saved.length) parts.push(`${plural(saved.length, 'thing')} already saved`);
      const asked = rep.requests ?? [];
      if (asked.length === 1) parts.push(`"${asked[0] ?? ''}" done`);
      else if (asked.length) parts.push(`${plural(asked.length, 'thing')} you asked done`);
      if (rep.rulesWorded) parts.push(`${plural(rep.rulesWorded, 'rule')} worded`);
      // The changes it names above are not counted again here.
      const other = asked.length || rep.rulesWorded ? 'other ' : '';
      if (rep.yourChanges) parts.push(`${rep.yourChanges} ${other}${rep.yourChanges === 1 ? 'change' : 'changes'} of yours read`);
      // Joined part by part: a name may hold a comma of its own.
      const said = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1) ?? ''}` : (parts[0] ?? '');
      // What the run left for the next one: its own sentence, after the parts (c12-wait-words).
      const wait = waitWords(rep.waiting);
      if (said) return [`${said.charAt(0).toUpperCase()}${said.slice(1)}.`, wait].filter(Boolean).join(' ');
      if (wait) return wait;
      // A read of your changes that did nothing never claims a tidy inbox (design8-run-words).
      if (r.scope === 'instructions' && !rep.leftAsWritten?.length && !rep.created.length && !rep.filed.length) return "Bower didn't change anything this time.";
      return rep.leftAsWritten?.length ? '' : 'Everything has its place.';
    }
    case 'failed':
      return r.failure ?? 'Nothing was moved. Try again in a minute.';
  }
}

/** "Started 15:00. 3 min so far. Usually about 5 minutes." */
export function runClock(r: RunState, now: number): string {
  if (r.phase === 'done' || r.phase === 'failed') {
    const end = r.finishedAt ?? r.phaseAt;
    return `${r.phase === 'done' ? 'Finished' : 'Stopped'} ${clock(end)}, after ${elapsed(end - r.requestedAt)}.`;
  }
  const so = elapsed(now - r.requestedAt);
  const tail = r.phase === 'saving' ? 'Almost there.' : r.scope === 'instructions' ? 'Usually under a minute.' : 'Usually about 5 minutes.';
  return `Started ${clock(r.requestedAt)}. ${so === 'less than a minute' ? 'Less than a minute' : so} so far. ${tail}`;
}

/** The short line of the chip and the status bar. */
export function runShort(r: RunState): string {
  if (r.phase === 'done') return r.scope === 'instructions' ? 'Bower read your changes' : filedWords(r.report);
  if (r.phase === 'failed') return 'The tidy-up stopped';
  return `${stepLabel(r, r.phase)}…`;
}

/** The line that offers a finished tidy-up's replay: the whole action, never "Watch" alone (qa6). */
export const watchLine = (r: RunState): string => `${runShort(r)}. Watch what Bower did`;

export function stepState(r: RunState, step: (typeof RUN_STEPS)[number]): 'done' | 'now' | 'later' {
  const order = [...RUN_STEPS, 'done'] as RunPhase[];
  const at = r.phase === 'failed' ? order.indexOf('writing') : order.indexOf(r.phase);
  const i = order.indexOf(step);
  return i < at ? 'done' : i === at ? 'now' : 'later';
}

/** Where things went, per folder: "Flat hunt got 3, Money got 2". */
export function landedSummary(r: RunState): string {
  const per = new Map<string, number>();
  for (const f of r.report?.filed ?? []) {
    const name = folderWords(f.to.split('/'));
    per.set(name, (per.get(name) ?? 0) + 1);
  }
  const all = [...per.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const parts = all.slice(0, 2).map(([k, n]) => `${k} got ${n}`);
  const rest = all.slice(2);
  if (rest.length === 1) parts.push(`${rest[0]?.[0]} got ${rest[0]?.[1]}`);
  else if (rest.length > 1) parts.push(`${rest.length} other folders got the rest`);
  // Each new folder once, by its sentence, in filed order: the first two, then how many more.
  const areas = [...new Set((r.report?.filed ?? []).flatMap((f) => (f.area ? [f.area] : [])))];
  const said = areas.slice(0, 2).map((a) => `${a}.`);
  if (areas.length > 2) said.push(`${plural(areas.length - 2, 'more new folder')}.`);
  return parts.length ? [`${parts.join(', ').replace(/, ([^,]*)$/, ' and $1')}.`, ...said].join(' ') : '';
}

/** The footer's line when nothing is running or waiting to be seen; `waiting` is undefined while the inbox loads. */
export function statusLine(run: RunState | null | undefined, waiting: number | undefined): string {
  const what = waiting === undefined ? 'Looking at the inbox…' : waiting ? `${plural(waiting, 'thing')} waiting` : 'Nothing waiting';
  return run?.phase === 'done' && run.scope === 'all' && !run.report?.nothingReady ? `Last tidy-up ${clock(run.finishedAt ?? run.phaseAt)}. ${what}` : what;
}

export type RunLinkRow = { path: string; what: string };

/** How many notes a run brought up to date: one per note, however many of its lines the report lists. */
export function notesUpdated(report: Pick<RunReport, 'updated'>): number {
  return distinctPaths(report.updated).length;
}

/** The notes a run made and brought up to date, in report order; a note listed as new is not listed again. */
export function runLinkRows(report: Pick<RunReport, 'created' | 'updated'>): { made: RunLinkRow[]; updated: RunLinkRow[] } {
  const first = (rows: RunLinkRow[], path: string): RunLinkRow[] => rows.filter((r) => r.path === path).slice(0, 1);
  const made = distinctPaths(report.created);
  return {
    made: made.flatMap((p) => first(report.created, p)),
    updated: distinctPaths(report.updated).filter((p) => !made.includes(p)).flatMap((p) => first(report.updated, p)),
  };
}
