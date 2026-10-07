/** `POST /process` (stub first, METHOD step 6): the contract's types and constants; the route comes next. */
export type RunScope = 'all' | 'instructions';
export type RunPhase = 'queued' | 'reading' | 'writing' | 'saving' | 'done' | 'failed';

/** A run as the app receives it (worker contract, `RunWire`). */
export interface RunWire {
  id: string;
  scope: RunScope;
  phase: RunPhase;
  requestedAt: number;
  phaseAt: number;
  finishedAt?: number;
  total?: number;
  failure?: string;
}

/** What `POST /process` and `GET /status` answer: the run, and the person's status revision. */
export interface RunReply {
  run: RunWire | null;
  revision: number;
}

/** What admission decided: the run (admitted, repeated or already going), or the day's limit reached. */
export type AdmitResult = { admitted: true; run: RunWire; revision: number } | { admitted: false; refused: 'rate-limited' };

export interface AdmitInput {
  scope: RunScope;
  allowWeb: boolean;
  requestId: string;
  now: number;
  /** `DAILY_RUN_LIMIT`: new runs a person may start per UTC day. */
  dailyLimit: number;
}

/** A queued run nobody started within this long is stale (the original's `QUEUED_STALE_MS`). */
export const QUEUED_STALE_MS = 17 * 60 * 1000;
/** A started run with no news of its phase for this long is stale (the original's `RUNNING_STALE_MS`). */
export const RUNNING_STALE_MS = 30 * 60 * 1000;
/** The failure a stale run is given (TL-P3-15; the original's "it took too long", #1000). */
export const STALE_FAILURE = 'This tidy-up took too long and stopped. Try again.';

export const ACTIVE_PHASES: readonly RunPhase[] = ['queued', 'reading', 'writing', 'saving'];

