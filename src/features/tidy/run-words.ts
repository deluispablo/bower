import { clock, elapsed, plural } from '@/app/words';
import type { Pose } from '@/bird/Bower';
import { RUN_STEPS, type RunPhase, type RunState } from '@/data/types';

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
      if (r.scope === 'instructions') return 'Done. Bower read your changes';
      return `Done. ${plural(r.report?.filed.length ?? 0, 'thing')} filed`;
    case 'failed':
      return 'The tidy-up stopped';
  }
}

export function runDetail(r: RunState): string {
  if (r.scope === 'instructions' && r.phase !== 'done' && r.phase !== 'failed') {
    if (r.phase === 'reading') return 'Reading the changes you made, the rules you typed and what you asked.';
    if (r.phase === 'writing') return 'Wording your rules and doing what you asked. Your inbox waits for a tidy-up.';
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
      const parts: string[] = [];
      if (rep.updated.length) parts.push(`${plural(rep.updated.length, 'note')} brought up to date`);
      if (rep.questions.length) parts.push(`${plural(rep.questions.length, 'question')} for you`);
      if (rep.setAside.length) parts.push(`${plural(rep.setAside.length, 'thing')} set aside`);
      const asked = rep.requests ?? [];
      if (asked.length === 1) parts.push(`"${asked[0] ?? ''}" done`);
      else if (asked.length) parts.push(`${plural(asked.length, 'thing')} you asked done`);
      if (rep.rulesWorded) parts.push(`${plural(rep.rulesWorded, 'rule')} worded`);
      // The changes it names above are not counted again here.
      const other = asked.length || rep.rulesWorded ? 'other ' : '';
      if (rep.yourChanges) parts.push(`${rep.yourChanges} ${other}${rep.yourChanges === 1 ? 'change' : 'changes'} of yours read`);
      return parts.length ? `${parts.join(', ').replace(/, ([^,]*)$/, ' and $1')}.` : 'Everything has its place.';
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
  if (r.phase === 'done') return r.scope === 'instructions' ? 'Bower read your changes' : `${plural(r.report?.filed.length ?? 0, 'thing')} filed`;
  if (r.phase === 'failed') return 'Tidy-up stopped';
  return `${stepLabel(r, r.phase)}…`;
}

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
    const parts = f.to.split('/');
    const last = parts[parts.length - 1] ?? f.to;
    // A month folder reads better with its parent: "Receipts, 2026-10".
    const name = /^\d{4}(-\d{2})?$/.test(last) && parts.length > 1 ? `${parts[parts.length - 2]} ${last}` : last;
    per.set(name, (per.get(name) ?? 0) + 1);
  }
  const all = [...per.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const parts = all.slice(0, 2).map(([k, n]) => `${k} got ${n}`);
  const rest = all.slice(2);
  if (rest.length === 1) parts.push(`${rest[0]?.[0]} got ${rest[0]?.[1]}`);
  else if (rest.length > 1) parts.push(`${rest.length} other folders got the rest`);
  return parts.length ? `${parts.join(', ').replace(/, ([^,]*)$/, ' and $1')}.` : '';
}

/** The footer's line when nothing is running or waiting to be seen; `waiting` is undefined while the inbox loads. */
export function statusLine(run: RunState | null | undefined, waiting: number | undefined): string {
  const what = waiting === undefined ? 'Looking at the inbox…' : waiting ? `${plural(waiting, 'thing')} waiting` : 'Nothing waiting';
  return run?.phase === 'done' ? `Last tidy-up ${clock(run.finishedAt ?? run.phaseAt)}. ${what}` : what;
}
