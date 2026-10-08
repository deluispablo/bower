/**
 * The runner's "attempt ended, no terminal report" (TL-P4-16 addendum 4), on the status route of the runner wire
 * (worker contract, "Runner wire"): `POST /runner/runs/:id/status` with `{ attempt, ended: true }`, and no phase.
 *
 * A runner sends it on its way out when it stopped without `done` or `failed`: its chain unread, left in `saving`, or
 * a report the Worker did not take. It claims nothing about what changed (TL-P3-22 addendum, I1); it only tells the
 * Worker to look at the run now instead of at its stale deadline. Additive: a Worker from before it refuses the body
 * as unreadable, and the run waits for that deadline as it did.
 */
export interface AttemptEnded {
  attempt: number;
  ended: true;
}

export const attemptEnded = (attempt: number): AttemptEnded => ({ attempt, ended: true });

/** Whether a status body is the ended report: `ended: true`, a whole attempt from 1, and nothing else. */
export function isAttemptEnded(value: unknown): value is AttemptEnded {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  return r.ended === true && typeof r.attempt === 'number' && Number.isSafeInteger(r.attempt) && r.attempt >= 1 && Object.keys(r).length === 2;
}
