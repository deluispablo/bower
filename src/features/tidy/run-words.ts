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

export function runTitle(r: RunState): string {
  switch (r.phase) {
    case 'queued':
      return 'Getting ready';
    case 'reading':
      return r.total ? `Reading ${plural(r.total, 'thing')}` : 'Reading';
    case 'writing':
      return 'Writing your notes';
    case 'saving':
      return 'Putting them away';
    case 'done':
      return `Done. ${plural(r.report?.filed.length ?? 0, 'thing')} filed`;
    case 'failed':
      return 'The tidy-up stopped';
  }
}

export function runDetail(r: RunState): string {
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
      return parts.length ? `${parts.join(', ').replace(/, ([^,]*)$/, ' and $1')}.` : 'Everything has its place.';
    }
    case 'failed':
      return r.failure ?? 'Nothing was moved. Try again in a minute.';
  }
}

/** "Started 15:00. 3 min so far. Usually about 5." */
export function runClock(r: RunState, now: number): string {
  if (r.phase === 'done' || r.phase === 'failed') {
    const end = r.finishedAt ?? r.phaseAt;
    return `${r.phase === 'done' ? 'Finished' : 'Stopped'} ${clock(end)}, after ${elapsed(end - r.requestedAt)}.`;
  }
  const so = elapsed(now - r.requestedAt);
  const tail = r.phase === 'saving' ? 'Almost there.' : 'Usually about 5.';
  return `Started ${clock(r.requestedAt)}. ${so === 'less than a minute' ? 'Less than a minute' : so} so far. ${tail}`;
}

/** The short line of the chip and the status bar. */
export function runShort(r: RunState): string {
  if (r.phase === 'done') return `${plural(r.report?.filed.length ?? 0, 'thing')} filed`;
  if (r.phase === 'failed') return 'Tidy-up stopped';
  return `${STEP_LABEL[r.phase]}…`;
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
  const parts = [...per.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} got ${n}`);
  return parts.length ? `${parts.join(', ')}.` : '';
}
