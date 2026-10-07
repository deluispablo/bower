/**
 * The narrow door to Bower's Worker: who is signed in, their Drive token,
 * their folder, and their runs. `WorkerHttp` speaks to the real Worker
 * (contract: docs/specs/2026-10-04-worker-contract.md); `FakeWorker` stands
 * in for it, with a scripted runner, in tests and behind `?source=fake`.
 */
import type { RunPhase, User } from '../types';
import type { LeaseReply, SessionAction } from '../session';

export interface RunWire {
  id: string;
  scope: 'all' | 'instructions';
  phase: RunPhase;
  requestedAt: number;
  phaseAt: number;
  finishedAt?: number;
  total?: number;
  failure?: string;
}

/** A run received from the Worker or read from the runner's report. */
export function isRunWire(value: unknown): value is RunWire {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  const number = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  const phases: readonly string[] = ['queued', 'reading', 'writing', 'saving', 'done', 'failed'];
  return typeof r.id === 'string' && r.id.trim().length > 0
    && (r.scope === 'all' || r.scope === 'instructions')
    && typeof r.phase === 'string' && phases.includes(r.phase)
    && number(r.requestedAt) && number(r.phaseAt)
    && (r.finishedAt === undefined || number(r.finishedAt))
    && (r.total === undefined || (number(r.total) && Number.isSafeInteger(r.total)))
    && (r.failure === undefined || (typeof r.failure === 'string' && r.failure.trim().length > 0));
}

export interface Me {
  user: User;
  folderId: string | null;
}

export interface WorkerApi {
  /** Null when signed out. */
  me(): Promise<Me | null>;
  /** Goes to Google (the real Worker never comes back here); the fake signs in at once. */
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  /** DELETE /me: the Worker forgets the person; their Drive folder is never touched. */
  deleteAccount(): Promise<void>;
  /** A Drive access token; `fresh` after Drive refused the last one. */
  driveToken(fresh: boolean): Promise<string>;
  /** Makes the Bower folder from the template (or finds it); answers its id. */
  /** The Bower folder: made from the template, or `found` when the person's earlier one is still in their Drive. */
  createFolder(): Promise<{ id: string; found: boolean }>;
  /**
   * Starts a tidy-up, or answers the one already going. `requestId`: made once per press of Tidy up and sent on
   * every retry of it (TL-P3-15); a repeat answers that press's run, even once it has ended.
   */
  process(scope: 'all' | 'instructions', opts?: { allowWeb?: boolean; requestId?: string }): Promise<RunWire>;
  /** The run going now, or the last one. */
  status(): Promise<RunWire | null>;
  /**
   * The person's one active place (TL-P2-14): `check` keeps this place's lease (or takes a free or expired
   * one), `take` moves it here with a higher epoch, `leave` lets it go. Every client has it (TL-P2-24):
   * the real Worker, and the fake (with a `FakeLease`; without one every place is active).
   */
  /** `gen`: the place's leave generation (TL-P3-14); a missing one counts as 0. */
  session(place: string, action: SessionAction, gen?: number): Promise<LeaseReply>;
}

/** The HTTP status a Worker error came with, kept as its typed cause; never read from its words. */
export const httpStatusOf = (e: unknown): number | null => {
  const cause = e instanceof Error ? e.cause : null;
  const status = cause && typeof cause === 'object' ? (cause as { httpStatus?: unknown }).httpStatus : null;
  return typeof status === 'number' ? status : null;
};
