/**
 * Run state (#37): is Bower idle, queued, running, done, failed, stale or
 * over quota. `process()` starts a run (`POST /process`); the store then
 * polls `GET /status` every 5 s while a run is in flight, up to 30 minutes,
 * after which it gives up locally (`stale`) even if the server never
 * reports one. Polling pauses while the tab is hidden and resumes on
 * `visibilitychange`/`focus`.
 *
 * Mounted in `app.tsx`, inside `VaultProvider`: a run that finishes `done`
 * drops the cached vault index and refreshes it, since the vault content
 * may have changed underneath.
 *
 * The state machine is a pure reducer (`reduce`) so every transition is
 * unit-testable without rendering anything; the provider below is just
 * wiring: `fetch` calls, timers and the two side effects on `done`.
 */

import { createContext } from 'preact';
import type { ComponentChildren } from 'preact';
import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'preact/hooks';

import { ApiError, getStatus, startProcess } from './api.js';
import type { Run } from './api.js';
import { FOLDER_MIME } from './drive.js';
import type { DriveFile } from './drive.js';
import { useSession } from './session.js';
import { isHidden } from './vault-index.js';
import { invalidateAfterRun, useVault } from './vault-store.js';

export type RunPhase =
  'idle' | 'queued' | 'running' | 'done' | 'failed' | 'stale' | 'quota';

export interface RunState {
  phase: RunPhase;
  run: Run | null;
  message?: string;
  retryAfter?: number;
}

export type RunEvent =
  | { type: 'process-started'; run: Run }
  | { type: 'process-quota'; retryAfter: number; message: string }
  | { type: 'process-failed'; message: string }
  | { type: 'status'; run: Run | null; stale: boolean }
  | { type: 'poll-timeout' }
  | { type: 'done-timeout' }
  | { type: 'reset' };

const IDLE_STATE: RunState = { phase: 'idle', run: null };
const STALE_MESSAGE = 'Bower did not answer; try again';
const GENERIC_FAILED_MESSAGE = 'Something went wrong';

function phaseForRun(run: Run): RunPhase {
  if (run.state === 'queued') return 'queued';
  if (run.state === 'running') return 'running';
  if (run.state === 'done') return 'done';
  return 'failed';
}

/**
 * "N files processed" / "1 file processed" / "Nothing new to process": the
 * same wording as the push notification body (`api/src/runner.ts`).
 */
export function resultMessage(run: Run): string {
  const count = run.processed?.length ?? 0;
  if (count === 0) return 'Nothing new to process';
  return `${count} ${count === 1 ? 'file' : 'files'} processed`;
}

/**
 * "Daily limit reached. Bower can run again in 3 h 20 min." (or, under an
 * hour, "in 12 min.").
 */
export function quotaMessage(retryAfterSeconds: number): string {
  const totalMinutes = Math.max(
    1,
    Math.round(Math.max(0, retryAfterSeconds) / 60),
  );
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const time = hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
  return `Daily limit reached. Bower can run again in ${time}.`;
}

const POLL_INTERVAL_MS = 5_000;
export const POLL_TIMEOUT_MS = 30 * 60_000;

/**
 * How long to wait before the next `GET /status`, or `null` to stop polling:
 * the phase isn't active, the tab is hidden, or 30 minutes are up. Pure so
 * the scheduling decision is unit-testable without a real timer or a real
 * `document`.
 */
export function nextPollDelay(
  phase: RunPhase,
  visible: boolean,
  elapsedMs: number,
): number | null {
  if (phase !== 'queued' && phase !== 'running') return null;
  if (!visible) return null;
  if (elapsedMs >= POLL_TIMEOUT_MS) return null;
  return POLL_INTERVAL_MS;
}

/** The state machine, pure: every transition the store can make. */
export function reduce(state: RunState, event: RunEvent): RunState {
  switch (event.type) {
    case 'process-started':
      return { phase: phaseForRun(event.run), run: event.run };
    case 'process-quota':
      return {
        phase: 'quota',
        run: state.run,
        message: event.message,
        retryAfter: event.retryAfter,
      };
    case 'process-failed':
      return { phase: 'failed', run: state.run, message: event.message };
    case 'status': {
      if (event.stale) {
        return { phase: 'stale', run: event.run, message: STALE_MESSAGE };
      }
      if (event.run === null) {
        return { phase: 'idle', run: null };
      }
      const run = event.run;
      const message =
        run.state === 'done'
          ? resultMessage(run)
          : run.state === 'failed'
            ? (run.error ?? GENERIC_FAILED_MESSAGE)
            : undefined;
      return { phase: phaseForRun(run), run, message };
    }
    case 'poll-timeout':
      return { phase: 'stale', run: state.run, message: STALE_MESSAGE };
    case 'done-timeout':
      return state.phase === 'done'
        ? { phase: 'idle', run: state.run, message: state.message }
        : state;
    case 'reset':
      return IDLE_STATE;
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

/**
 * Count of files waiting to be processed: everything under `0-Inbox/` or
 * `Clippings/`, excluding `Processed/`, folder notes (`_*.md`) and folders
 * themselves. Reuses `isHidden` (`vault-index.ts`) for that exclusion so
 * the two never drift apart.
 */
const PENDING_ROOTS = new Set(['0-Inbox', 'Clippings']);

export function pendingCount(files: DriveFile[]): number {
  return files.filter((file) => {
    if (file.mimeType === FOLDER_MIME) return false;
    if (isHidden(file)) return false;
    const root = file.path.split('/')[0];
    return root !== undefined && PENDING_ROOTS.has(root);
  }).length;
}

export interface RunStore extends RunState {
  process: () => Promise<void>;
}

const RunContext = createContext<RunStore | undefined>(undefined);

interface RunProviderProps {
  children: ComponentChildren;
}

export function RunProvider({ children }: RunProviderProps) {
  const { me } = useSession();
  const { refresh } = useVault();
  const hasVault = me?.vault != null;

  const [state, setState] = useState<RunState>(IDLE_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  const apply = useCallback((event: RunEvent): void => {
    setState((prev) => reduce(prev, event));
  }, []);

  const poll = useCallback(async (): Promise<void> => {
    try {
      const { run, stale } = await getStatus();
      apply({ type: 'status', run, stale });
    } catch (err) {
      // A transient failure just means the next tick (or the 30-minute
      // fallback) tries again; nothing here is user-facing yet.
      console.error(err);
    }
  }, [apply]);

  // On load, reflect a run started elsewhere (another device, another tab).
  useEffect(() => {
    if (!hasVault) return;
    void poll();
    // Intentionally once per mount / once a vault becomes available: the
    // interval effect below takes over from there.
  }, [hasVault, poll]);

  // `done` shows for 3 s, then the button label goes back to idle.
  useEffect(() => {
    if (state.phase !== 'done') return;
    const timer = setTimeout(() => {
      apply({ type: 'done-timeout' });
    }, 3_000);
    return () => clearTimeout(timer);
  }, [state.phase, apply]);

  // On `done`: the vault content may have changed underneath, so drop the
  // cached index and refresh it. Runs once per transition into `done` (the
  // effect depends on `state.run`, which does not change again while the
  // phase stays `done`).
  useEffect(() => {
    if (state.phase !== 'done') return;
    void invalidateAfterRun().then(() => refresh());
  }, [state.phase, state.run, refresh]);

  // Poll every 5 s while queued/running, up to 30 min; pause while hidden,
  // resume on visibilitychange/focus. See `nextPollDelay` for the pure
  // scheduling decision this loop follows.
  useEffect(() => {
    if (state.phase !== 'queued' && state.phase !== 'running') return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function isVisible(): boolean {
      return (
        typeof document === 'undefined' || document.visibilityState !== 'hidden'
      );
    }

    function elapsedMs(): number {
      const requestedAt = stateRef.current.run?.requestedAt;
      return requestedAt !== undefined
        ? Date.now() - Date.parse(requestedAt)
        : 0;
    }

    function schedule(): void {
      const phase = stateRef.current.phase;
      const elapsed = elapsedMs();
      const delay = nextPollDelay(phase, isVisible(), elapsed);
      if (delay === null) {
        if (
          (phase === 'queued' || phase === 'running') &&
          elapsed >= POLL_TIMEOUT_MS
        ) {
          apply({ type: 'poll-timeout' });
        }
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        void poll().then(() => {
          if (!cancelled) schedule();
        });
      }, delay);
    }

    function onVisible(): void {
      // A pending timer already covers the next check; only act if polling
      // had actually paused (hidden, or timed out while hidden).
      if (timer !== null || cancelled) return;
      void poll().then(() => {
        if (!cancelled) schedule();
      });
    }

    schedule();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [state.phase, apply, poll]);

  const process = useCallback(async (): Promise<void> => {
    try {
      const { run } = await startProcess();
      apply({ type: 'process-started', run });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'quota') {
        const retryAfter = err.retryAfter ?? 0;
        apply({
          type: 'process-quota',
          retryAfter,
          message: quotaMessage(retryAfter),
        });
        return;
      }
      console.error(err);
      apply({
        type: 'process-failed',
        message: 'Could not start. Try again.',
      });
    }
  }, [apply]);

  const value: RunStore = { ...state, process };

  return <RunContext.Provider value={value}>{children}</RunContext.Provider>;
}

export function useRun(): RunStore {
  const ctx = useContext(RunContext);
  if (ctx === undefined) {
    throw new Error('useRun must be used within a RunProvider');
  }
  return ctx;
}
