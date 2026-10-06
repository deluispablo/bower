/**
 * The fake run service: the backend's side of a tidy-up on the B path.
 * Inert stub of its interface until the B path lands: it admits nothing,
 * knows no run and recovers nothing.
 */
import type { FakeDrive } from '../drive/fake-drive';
import type { Manifest, Operation } from '../contracts/run-manifest';
import type { TimeScale } from '../demo/scenario';
import { BowerError } from '../types';
import type { RunWire } from '../worker/worker-api';

/** Who asks: the synthetic account slot and the folder it is bound to. */
export interface Binding {
  account: string;
  rootId: string;
}

/** Contract B's control row, exactly. */
export type Control = {
  runId: string; requestId: string; scope: { rootId: string }; manifestHash: string; head: string;
  statusRevision: number;
  claim: null | { attemptId: string; epoch: number; expiresAt: number };
  outstandingDispatch: null | { operationId: string; dispatchId: string; epoch: number };
};

export interface DispatchAt {
  runId: string;
  attemptId: string;
  epoch: number;
  ordinal: number;
  effect: Operation['effect'];
}

export interface FakeRunServiceOptions {
  drive: FakeDrive;
  clock?: () => number;
  scale?: TimeScale;
  /** Test seam: awaited after an effect's intent is committed and before it is dispatched. */
  hooks?: { beforeDispatch?: (at: DispatchAt) => Promise<void> };
  /** Makes the rows and the Drive durable together; an admission is acknowledged only after it. */
  persist?: () => Promise<void>;
}

/** A B run that failed: the honest-phase rule guarantees no effect applied. */
export const B_FAILURE = 'The tidy-up stopped before changing anything. Try again.';
/** How long an attempt's claim lasts without progress. */
export const CLAIM_MS = 300_000;
/** How long to wait before recovering again after an attempt failed. */
export const RETRY_MS = 5_000;

export class FakeRunService {
  onChange: (() => void) | null = null;

  constructor(opts: FakeRunServiceOptions) {
    void opts;
  }

  static restore(json: string, opts: FakeRunServiceOptions): FakeRunService {
    void json;
    return new FakeRunService(opts);
  }

  toJSON(): string {
    return JSON.stringify({ v: 1, seq: 0, revoked: [], rows: {} });
  }

  ids(): { runId: string; requestId: string } {
    return { runId: 'run-stub', requestId: 'request-stub' };
  }

  async admit(binding: Binding, manifest: Manifest, opts: { failAt?: 'writing' } = {}): Promise<RunWire> {
    void binding;
    void manifest;
    void opts;
    throw new BowerError('unknown', 'Bower could not start the tidy-up. Try again.');
  }

  async status(binding: Binding): Promise<RunWire | null> {
    void binding;
    return null;
  }

  async shows(binding: Binding, view: string | null): Promise<boolean> {
    void binding;
    void view;
    return false;
  }

  runningPiles(binding: Binding): ReadonlySet<string> {
    void binding;
    return new Set();
  }

  async recover(binding: Binding, runId: string): Promise<void> {
    void binding;
    void runId;
  }

  revoke(binding: Binding): void {
    void binding;
  }

  async settled(): Promise<void> {}
}
