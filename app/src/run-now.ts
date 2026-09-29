/**
 * "Just this, now" (R-REQ-3, R-ASK-3, R-MORE-5, spec §6.7): the one helper
 * behind every "run this request now" choice (the Requests menu, Ask,
 * Rename, Move). It writes nothing. It waits for any save of the note still
 * in flight, then starts an instructions-only run, so the run always sees
 * the note as it was last edited.
 *
 * The disabled states live here too, so every entry point says the same
 * thing: a run in flight, no signal, and, after a `/process` refusal with
 * the code `quota`, no runs left for the rest of the day on this device
 * (the app cannot know the quota in advance). No DOM: unit tested in
 * `test/run-now.test.ts`. `useRunNow` is the thin hook over the run store.
 */

import { useEffect } from 'preact/hooks';

import type { RunScope } from './api.js';
import { useOnline } from './online.js';
import { useRun } from './run-store.js';

/** The one name of this choice, everywhere. */
export const RUN_NOW_LABEL = 'Just this, now';
/** Its line: what it costs. */
export const RUN_NOW_LINE = 'Uses one run of your Claude plan.';

export type RunNowBlock = 'running' | 'offline' | 'quota';

export const RUN_NOW_REASONS: Record<RunNowBlock, string> = {
  running: 'A tidy-up is running',
  offline: 'No signal',
  quota: 'No runs left today',
};

/** The key that remembers a `quota` refusal, per device. */
export const QUOTA_DAY_KEY = 'bower:run-now:quota-day';

export interface DayStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

/** The local calendar day, `YYYY-MM-DD`. */
export function dayKey(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Remembers that today's runs are used up. Never throws. */
export function markQuotaReached(storage: DayStorage, now: Date): void {
  try {
    storage.setItem(QUOTA_DAY_KEY, dayKey(now));
  } catch (err) {
    console.error(err);
  }
}

/** Whether a `quota` refusal was seen today on this device. */
export function quotaReachedToday(storage: DayStorage, now: Date): boolean {
  try {
    return storage.getItem(QUOTA_DAY_KEY) === dayKey(now);
  } catch {
    return false;
  }
}

/** Why "Just this, now" is off, or `null` when it can be used. */
export function runNowBlock(state: {
  runInFlight: boolean;
  online: boolean;
  quotaReached: boolean;
}): RunNowBlock | null {
  if (state.runInFlight) return 'running';
  if (!state.online) return 'offline';
  if (state.quotaReached) return 'quota';
  return null;
}

/** What `runNow` needs, so tests stub it. */
export interface RunNowDeps {
  /** Resolves when any save of the request note in flight has finished. */
  settle?: () => Promise<unknown>;
  /** Starts a run (`POST /process`); called with `instructions`. */
  startRun: (scope: RunScope) => Promise<boolean>;
}

/**
 * Waits for the note's write, then starts an instructions-only run.
 * Resolves to whether the run started. A failed write throws and no run is
 * started: the caller says so.
 */
export async function runNow(deps: RunNowDeps): Promise<boolean> {
  if (deps.settle !== undefined) await deps.settle();
  return deps.startRun('instructions');
}

export interface RunNow {
  /** `null` when usable; else the block. */
  block: RunNowBlock | null;
  /** The sentence to show next to a disabled control, or `null`. */
  reason: string | null;
  run: (settle?: () => Promise<unknown>) => Promise<boolean>;
}

const RUNNING_PHASES = new Set(['starting', 'queued', 'running']);

function browserStorage(): DayStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The helper wired to the run store, the network state and the day's latch. */
export function useRunNow(): RunNow {
  const { phase, process } = useRun();
  const online = useOnline();

  // The store turns a `quota` refusal into the `quota` phase; remember it.
  useEffect(() => {
    if (phase !== 'quota') return;
    const storage = browserStorage();
    if (storage !== null) markQuotaReached(storage, new Date());
  }, [phase]);

  const storage = browserStorage();
  const block = runNowBlock({
    runInFlight: RUNNING_PHASES.has(phase),
    online,
    quotaReached:
      phase === 'quota' ||
      (storage !== null && quotaReachedToday(storage, new Date())),
  });

  return {
    block,
    reason: block === null ? null : RUN_NOW_REASONS[block],
    run: (settle) =>
      runNow(
        settle === undefined
          ? { startRun: process }
          : { settle, startRun: process },
      ),
  };
}
