/**
 * The narrow door to Bower's Worker: who is signed in, their Drive token,
 * their folder, and their runs. `WorkerHttp` speaks to the real Worker
 * (contract: docs/specs/2026-10-04-worker-contract.md); `FakeWorker` stands
 * in for it, with a scripted runner, in tests and behind `?source=fake`.
 */
import type { User } from '../types';
import type { LeaseReply, SessionAction } from '../session';

export type { RunWire } from '../contracts/run-wire';
export { isRunWire } from '../contracts/run-wire';
import type { RunWire } from '../contracts/run-wire';

/** A run received from the Worker or read from the runner's report. */
/**
 * A run with the Worker's revision of it (TL-P3-15): the revision only rises, so of two answers the higher is the
 * newer, whatever order they arrive in.
 */
export interface RunReply {
  run: RunWire;
  revision: number;
  /** An answer kept for the end of the run going (`run`): the Worker starts its run then (TL-P4-13 addendum). */
  waits?: true;
}
export interface StatusReply { run: RunWire | null; revision: number }

/** How a press is sent: see `WorkerApi.process`. */
export interface ProcessOptions {
  allowWeb?: boolean;
  requestId?: string;
  subject?: string;
  answer?: boolean;
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
   * every retry of it (TL-P3-15); a repeat answers that press's run, even once it has ended. `subject`: an answer's
   * run takes only the pile of the inbox that holds this thing or pile (TL-P4-08 addendum 8). `answer`: while a run is
   * going, the Worker keeps the answer and starts its run when that run ends, and answers `waits` (TL-P4-13 addendum).
   */
  process(scope: 'all' | 'instructions', opts?: ProcessOptions): Promise<RunReply>;
  /** The run going now, or the last one. */
  status(): Promise<StatusReply>;
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
