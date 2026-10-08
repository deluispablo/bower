/**
 * The session lease (worker contract, "One active session"; TL-P2-13/14/24/25, TL-P3-14): one pure decision, used by
 * the Worker's person object and by the pretend Worker, so they cannot differ (TL-P4-14 c1-shared-contracts).
 *
 * - `check` by the holder renews it with the same epoch, even after the TTL when nobody took it, and so does one
 *   by the place that let it go while nobody had it since;
 * - a free or expired lease goes to whoever checks, with epoch + 1; a live lease of another place answers `active: false`;
 * - `take` always moves the lease, with epoch + 1;
 * - `leave` records the place's generation (never lowering it) and, by the holder, frees the lease with its epoch kept;
 * - a `check` whose `gen` is older than the place's latest `leave` began before that leave: it grants and renews
 *   nothing, and answers the current state for that place. A leave older than `LEAVE_KEPT_MS` counts as none:
 *   a check in flight lasts seconds, so a place that left a day ago has nothing on its way. (The fake used to
 *   keep every leave for ever and the Worker only dropped them on the next leave; the Worker's day wins, since
 *   it bounds the storage and a stale leave must not outlive the check it was for.)
 * Fencing token in Kleppmann's sense: the epoch only grows while anyone has had the lease.
 */

/** A lease nobody renewed for this long is free. */
export const LEASE_TTL_MS = 3 * 60_000;
/** How long a place's latest leave generation is kept. */
export const LEAVE_KEPT_MS = 24 * 60 * 60 * 1000;

export type SessionAction = 'check' | 'take' | 'leave';

/** The Worker's answer to `POST /session`. */
export interface LeaseReply {
  active: boolean;
  epoch: number;
}

export interface Lease {
  holder: string | null;
  epoch: number;
  beatAt: number;
  /** The place that let it go, while nobody else has had it since. */
  left: string | null;
}

/** A place's latest leave: its generation and when it was recorded. */
export interface LeaveMark {
  gen: number;
  at: number;
}

export interface LeaseCall {
  place: string;
  action: SessionAction;
  /** The place's leave generation; a call without it counts as 0. */
  gen: number;
  now: number;
}

export interface LeaseDecision {
  reply: LeaseReply;
  /** The lease afterwards: the very object given when nothing changed. */
  lease: Lease;
  /** Set by a `leave`: the mark to keep for the place. */
  leave?: LeaveMark;
}

/** Whether a recorded leave still counts at `now`. */
export const leaveCounts = (mark: LeaveMark | undefined, now: number): mark is LeaveMark => mark !== undefined && now - mark.at < LEAVE_KEPT_MS;

/**
 * What `call` does to `lease`, given the calling place's latest leave (`mark`, if one is kept). Pure: the caller
 * stores `lease` and `leave` in one step (a synchronous transaction in the Worker, one storage write in the fake).
 */
export function decideLease(lease: Lease, mark: LeaveMark | undefined, call: LeaseCall): LeaseDecision {
  const { place, action, gen, now } = call;
  const kept = leaveCounts(mark, now) ? mark : undefined;
  if (action === 'leave') {
    const next: Lease = lease.holder === place ? { holder: null, epoch: lease.epoch, beatAt: lease.beatAt, left: place } : lease;
    return { reply: { active: false, epoch: lease.epoch }, lease: next, leave: { gen: Math.max(kept?.gen ?? 0, gen), at: now } };
  }
  if (action === 'check') {
    // Begun before this place's latest leave: it says nothing about the lease now (TL-P3-14).
    if (kept !== undefined && gen < kept.gen) return { reply: { active: lease.holder === place, epoch: lease.epoch }, lease };
    // Back after the TTL with nobody in between, or back after letting it go: the same epoch carries on (TL-P2-25).
    if (lease.holder === place || (lease.holder === null && lease.left === place)) {
      return { reply: { active: true, epoch: lease.epoch }, lease: { holder: place, epoch: lease.epoch, beatAt: now, left: null } };
    }
  }
  const live = lease.holder !== null && now - lease.beatAt < LEASE_TTL_MS;
  if (action === 'take' || !live) {
    return { reply: { active: true, epoch: lease.epoch + 1 }, lease: { holder: place, epoch: lease.epoch + 1, beatAt: now, left: null } };
  }
  return { reply: { active: false, epoch: lease.epoch }, lease };
}

/** Whether `place` holds `lease` at `epoch`: the fence on the Worker's own endpoints. An expired lease nobody took is still its holder's (TL-P2-25). */
export const holdsLease = (lease: Lease, place: string | null, epoch: number | null): boolean =>
  place !== null && epoch !== null && lease.holder === place && lease.epoch === epoch;
