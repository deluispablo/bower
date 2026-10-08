/**
 * Recovery without the browser (worker contract, "Runner wire", "Recovery without the browser"; TL-P3-18).
 *
 * The person object's own alarm (Cloudflare Durable Object alarms,
 * https://developers.cloudflare.com/durable-objects/api/alarms/) wakes at a run's stale deadline. A run that
 * moved on needs nothing. A stale one is looked up on GitHub Actions by its run name, `tidy <run_id> <attempt>`
 * (R3: the run name and the job's `started_at` and `completed_at` are enough to reconcile), and then:
 * - no live job at attempt 1 (no run found, a lost dispatch, or every job completed with no report, as after
 *   a cancel or a crash): redispatched once as attempt 2 with a new ticket, which retires attempt 1's;
 * - a job queued or in progress: left alone until that job's own deadline, once;
 * - otherwise (no live job at attempt 2, a failed lookup, or a second stale deadline): failed `stale`, with the
 *   sentence `staleFailure` gives its phase.
 *
 * The thresholds are the original app's (`process.ts`). Everything here is pure: the person object decides
 * with it inside one synchronous section.
 */
import { QUEUED_STALE_MS, RUNNING_STALE_MS, SAVING_FAILURE, STALE_FAILURE } from './process.js';
import type { RunWire } from '../../src/data/contracts/run-wire.js';

/**
 * The sentence a run ended for staleness is given, by the phase it was in (TL-P3-22 point 2). The runner reports
 * `saving` only once every effect is settled and the report is pending, so a run still in `saving` made its changes
 * and only its summary was not saved: it never says that nothing happened. Other phases keep `STALE_FAILURE`.
 */
export function staleFailure(phase: RunWire['phase']): string {
  return phase === 'saving' ? SAVING_FAILURE : STALE_FAILURE;
}

/**
 * How long past a run's stale deadline the read and write paths wait for the alarm's recovery when dispatch
 * is configured: two of the run's own stale windows (34 minutes queued, an hour once started). The alarm
 * decides within seconds of the deadline, and a live job's wait moves the deadline itself; the ceiling only
 * ends a run whose alarm never fired, so it cannot hang forever.
 */
export const UNRECOVERED_WINDOWS = 2;

/** The time past the stale deadline after which a run with no recovery decision is ended anyway. */
export function unrecoveredCeiling(run: Pick<RunWire, 'phase'>): number {
  return UNRECOVERED_WINDOWS * (run.phase === 'queued' ? QUEUED_STALE_MS : RUNNING_STALE_MS);
}

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

/**
 * The extra time the alarm gave the current attempt of a run (kept in the person object's key-value
 * storage). It holds only while the run has not moved since (`phaseAt`): a report replaces it with the
 * run's own deadline. `graced` marks the one wait a live job gets; reaching its end again is the second
 * stale deadline.
 */
export interface RecoveryWatch {
  runId: string;
  attempt: number;
  phaseAt: number;
  until: number;
  graced: boolean;
}

/** A run's own stale deadline: queued from `requestedAt`, a started phase from `phaseAt` (as `isStale`). */
export function ownDeadline(run: Pick<RunWire, 'phase' | 'requestedAt' | 'phaseAt'>): number {
  return run.phase === 'queued' ? run.requestedAt + QUEUED_STALE_MS : run.phaseAt + RUNNING_STALE_MS;
}

/** The watch when it still applies to this run's current attempt, unmoved since; else undefined. */
export function applyingWatch(
  run: Pick<RunWire, 'id' | 'phaseAt'>,
  attempt: number,
  watch: RecoveryWatch | undefined,
): RecoveryWatch | undefined {
  if (watch === undefined) return undefined;
  return watch.runId === run.id && watch.attempt === attempt && watch.phaseAt === run.phaseAt ? watch : undefined;
}

/** When the run goes stale: its own deadline, or later while a watch applies. */
export function staleDeadline(run: Pick<RunWire, 'id' | 'phase' | 'requestedAt' | 'phaseAt'>, attempt: number, watch: RecoveryWatch | undefined): number {
  const own = ownDeadline(run);
  const applying = applyingWatch(run, attempt, watch);
  return applying === undefined ? own : Math.max(own, applying.until);
}

/** What a stale run's lookup leads to, for its current `attempt`, at `now`. */
export function decide(lookup: TidyLookup | null, attempt: number, now: number): Recovery {
  if (lookup === null) return { kind: 'fail' };
  // No live job holds the run: attempt 1 is redispatched once, a later attempt ends.
  const noLiveJob: Recovery = attempt === 1 ? { kind: 'redispatch' } : { kind: 'fail' };
  if (!lookup.found) return noLiveJob;
  // A run created with no job listed yet is waiting for a runner, as a queued job is.
  const live = lookup.jobs.length === 0 ? [{ status: 'queued', startedAt: null, completedAt: null }] : lookup.jobs.filter((j) => j.status !== 'completed');
  if (live.length === 0) return noLiveJob;
  const until = Math.max(
    ...live.map((job) => (job.status === 'in_progress' && job.startedAt !== null ? job.startedAt + RUNNING_STALE_MS : now + QUEUED_STALE_MS)),
  );
  return until > now ? { kind: 'wait', until } : { kind: 'fail' };
}
