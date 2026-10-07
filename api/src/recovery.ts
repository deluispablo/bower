/**
 * Recovery without the browser (worker contract, "Runner wire"; TL-P3-18). Stub: `worker-stale-run-recovery`
 * fills it in.
 */
import type { RunWire } from './process.js';

/** A job of the GitHub run found for an attempt. */
export interface TidyJob {
  status: string;
  startedAt: number | null;
  completedAt: number | null;
}

/** What the lookup by run name found: no run for the attempt, or its jobs. Null when the lookup failed. */
export type TidyLookup = { found: false } | { found: true; jobs: TidyJob[] };

/** What the alarm does after a lookup. */
export type Recovery = { kind: 'redispatch' } | { kind: 'wait'; until: number } | { kind: 'fail' };

export function decide(lookup: TidyLookup | null, attempt: number, now: number): Recovery {
  void lookup;
  void attempt;
  return { kind: 'wait', until: now };
}

export function ownDeadline(run: Pick<RunWire, 'phase' | 'requestedAt' | 'phaseAt'>): number {
  return run.requestedAt;
}
