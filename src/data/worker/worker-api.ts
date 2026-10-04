/**
 * The narrow door to Bower's Worker: who is signed in, their Drive token,
 * their folder, and their runs. `WorkerHttp` speaks to the real Worker
 * (contract: docs/specs/2026-10-04-worker-contract.md); `FakeWorker` stands
 * in for it, with a scripted runner, in tests and behind `?source=fake`.
 */
import type { RunPhase, User } from '../types';

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
  /** A Drive access token; `fresh` after Drive refused the last one. */
  driveToken(fresh: boolean): Promise<string>;
  /** Makes the Bower folder from the template (or finds it); answers its id. */
  createFolder(): Promise<string>;
  process(scope: 'all' | 'instructions', opts?: { allowWeb?: boolean }): Promise<RunWire>;
  /** The run going now, or the last one. */
  status(): Promise<RunWire | null>;
}
