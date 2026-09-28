/**
 * Run state (#37): is Bower idle, queued, running, done, failed, stale or
 * over quota. `process()` starts a run (`POST /process`); the store then
 * polls `GET /status` every 5 s while a run is in flight, up to 30 minutes,
 * after which it gives up locally (`stale`) even if the server never
 * reports one. Polling pauses while the tab is hidden and resumes on
 * `visibilitychange`/`focus`.
 *
 * Mounted in `app.tsx`, inside `VaultProvider`: a run that finishes `done`,
 * or goes `stale` after the Worker's timeout, drops the cached vault index
 * and refreshes it, since the vault content may have changed underneath.
 *
 * After a run (#304): `done` goes back to `idle` as soon as the working
 * sheet is dismissed, or after `DONE_LINGER_MS`, whichever comes first; the
 * result message stays on the state for the sheet, and is announced once,
 * in the toast (`toast-store.ts`). A run that was already over when the app
 * first heard of it (a reload hours later) is not announced at all: it goes
 * straight to `idle`.
 *
 * The store also owns whether the working sheet is open, so no component
 * mounting again (a route change) can bring it back: it opens by itself
 * once per run id, and otherwise only when asked (`openSheet`).
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
import { ANSWERS_FOLDER } from './home.js';
import { folderHref } from './navigation.js';
import { useSession } from './session.js';
import { showToast } from './toast-store.js';
import { isHidden } from './vault-index.js';
import { invalidateAfterRun, useVault } from './vault-store.js';

export type RunPhase =
  'idle' | 'queued' | 'running' | 'done' | 'failed' | 'stale' | 'quota';

export interface RunState {
  phase: RunPhase;
  run: Run | null;
  message?: string;
  retryAfter?: number;
  /** Whether the working sheet is open. */
  sheetOpen: boolean;
  /** The run the sheet last opened by itself for (`runKey`), or `null`. */
  sheetRunId: string | null;
}

export type RunEvent =
  | { type: 'process-started'; run: Run }
  | { type: 'process-quota'; retryAfter: number; message: string }
  | { type: 'process-failed'; message: string }
  | { type: 'status'; run: Run | null; stale: boolean }
  | { type: 'poll-timeout' }
  | { type: 'done-timeout' }
  | { type: 'sheet-opened' }
  | { type: 'sheet-dismissed' }
  | { type: 'reset' };

const IDLE_STATE: RunState = {
  phase: 'idle',
  run: null,
  sheetOpen: false,
  sheetRunId: null,
};
const STALE_MESSAGE = 'Bower did not answer; try again';
const GENERIC_FAILED_MESSAGE = 'Something went wrong';

function phaseForRun(run: Run): RunPhase {
  if (run.state === 'queued') return 'queued';
  if (run.state === 'running') return 'running';
  if (run.state === 'done') return 'done';
  return 'failed';
}

/**
 * How a run is told apart from the one before: the runner's id when the
 * Worker has one, otherwise the time it was asked for (always set).
 */
export function runKey(run: Run): string {
  return run.runId ?? run.requestedAt;
}

/** How long `done` lasts before going back to `idle` by itself. */
export const DONE_LINGER_MS = 8_000;

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

/**
 * The sheet fields once `run` is in flight: open, the first time this run
 * is seen; otherwise as they were (a dismissed sheet stays dismissed).
 */
function sheetForActive(
  state: RunState,
  run: Run,
): Pick<RunState, 'sheetOpen' | 'sheetRunId'> {
  const key = runKey(run);
  if (key === state.sheetRunId) {
    return { sheetOpen: state.sheetOpen, sheetRunId: state.sheetRunId };
  }
  return { sheetOpen: true, sheetRunId: key };
}

function isActive(phase: RunPhase): boolean {
  return phase === 'queued' || phase === 'running';
}

/** `done` over: back to `idle`, the sheet closed, the run and its message kept. */
function afterDone(state: RunState): RunState {
  return { ...state, phase: 'idle', sheetOpen: false };
}

/**
 * The last finished run once `run` is known: `run` itself when it ended
 * (`done` or `failed`), otherwise the one kept from before (a run in
 * flight has not finished yet).
 */
export function lastFinishedRun(
  previous: Run | null,
  run: Run | null,
): Run | null {
  if (run === null) return previous;
  if (run.state === 'done' || run.state === 'failed') return run;
  return previous;
}

/** The state machine, pure: every transition the store can make. */
export function reduce(state: RunState, event: RunEvent): RunState {
  const sheet = { sheetOpen: state.sheetOpen, sheetRunId: state.sheetRunId };
  switch (event.type) {
    case 'process-started': {
      const phase = phaseForRun(event.run);
      const opened = isActive(phase) ? sheetForActive(state, event.run) : sheet;
      return { phase, run: event.run, ...opened };
    }
    case 'process-quota':
      return {
        phase: 'quota',
        run: state.run,
        message: event.message,
        retryAfter: event.retryAfter,
        ...sheet,
      };
    case 'process-failed':
      return {
        phase: 'failed',
        run: state.run,
        message: event.message,
        ...sheet,
      };
    case 'status': {
      if (event.stale) {
        return {
          phase: 'stale',
          run: event.run,
          message: STALE_MESSAGE,
          ...sheet,
        };
      }
      if (event.run === null) {
        return { ...IDLE_STATE, sheetRunId: state.sheetRunId };
      }
      const run = event.run;
      const phase = phaseForRun(run);
      if (isActive(phase)) {
        return {
          phase,
          run,
          message: undefined,
          ...sheetForActive(state, run),
        };
      }
      if (phase === 'done') {
        const message = resultMessage(run);
        // Only a run this session saw in flight finishes as `done`; one that
        // was already over when it was first heard of is just the last run.
        if (!isActive(state.phase) && state.phase !== 'done') {
          return {
            phase: 'idle',
            run,
            message,
            sheetOpen: false,
            sheetRunId: state.sheetRunId,
          };
        }
        return { phase, run, message, ...sheet };
      }
      return {
        phase,
        run,
        message: run.error ?? GENERIC_FAILED_MESSAGE,
        ...sheet,
      };
    }
    case 'poll-timeout':
      return {
        phase: 'stale',
        run: state.run,
        message: STALE_MESSAGE,
        ...sheet,
      };
    case 'done-timeout':
      return state.phase === 'done' ? afterDone(state) : state;
    case 'sheet-opened':
      return state.sheetOpen ? state : { ...state, sheetOpen: true };
    case 'sheet-dismissed':
      if (state.phase === 'done') return afterDone(state);
      return state.sheetOpen ? { ...state, sheetOpen: false } : state;
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
  /**
   * What every Tidy up control calls (the Inbox card, Add's hint, the
   * switcher command, #320). Opens the "Is that everything?" confirmation
   * (#337) first; only the sheet's "Yes, tidy up" (`confirmTidyUp`) starts
   * the run. `count`, when given, is the confirmation's own count instead
   * of the inbox's pending files — for a future requests-only run (#344,
   * the count of requests rather than files); no caller passes it yet.
   */
  tidyUp: (count?: number) => void;
  /** Opens the working sheet (a tap during or after a run). */
  openSheet: () => void;
  /**
   * Bumped on every `openSheet`, so the sheet measures its linger window
   * again even when the phase itself has not changed (a failure reopened
   * after it already faded).
   */
  sheetReopenKey: number;
  /**
   * The most recent run this session saw finish, `done` or `failed`
   * (`lastFinishedRun`): Home's Last tidy-up card (#321). It stays put while
   * the next run goes, so the card can still say how the one before went.
   */
  lastFinished: Run | null;
  /** Closes the working sheet; a `done` run goes back to `idle` with it. */
  dismissSheet: () => void;
  /** Whether the "Is that everything?" confirmation is open. */
  confirmOpen: boolean;
  /** The count the confirmation shows (see `tidyUp`). */
  confirmCount: number;
  /** The confirmation's "Yes, tidy up": closes it and starts the run. */
  confirmTidyUp: () => void;
  /** The confirmation's "Add more first": closes it, no run starts. */
  dismissConfirm: () => void;
}

const RunContext = createContext<RunStore | undefined>(undefined);

interface RunProviderProps {
  children: ComponentChildren;
}

export function RunProvider({ children }: RunProviderProps) {
  const { me } = useSession();
  const { files, refresh } = useVault();
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

  // `done` lasts `DONE_LINGER_MS` at most, then goes back to idle (closing
  // the sheet first gets there sooner: `sheet-dismissed`).
  useEffect(() => {
    if (state.phase !== 'done') return;
    const timer = setTimeout(() => {
      apply({ type: 'done-timeout' });
    }, DONE_LINGER_MS);
    return () => clearTimeout(timer);
  }, [state.phase, apply]);

  // A finished run announces itself once, in the toast, with a link to the
  // answers. Keyed on the run so a second `done` for the same run (or this
  // effect running again) never shows it twice.
  const announcedRef = useRef<string | null>(null);
  useEffect(() => {
    if (state.phase !== 'done' || state.run === null) return;
    const key = runKey(state.run);
    if (announcedRef.current === key) return;
    announcedRef.current = key;
    showToast(state.message ?? resultMessage(state.run), {
      href: folderHref(ANSWERS_FOLDER),
      label: 'See',
    });
  }, [state.phase, state.run, state.message]);

  // On `done`, and on `stale` after the Worker's timeout (the run may have
  // filed part of the inbox before it stopped answering): the vault content
  // may have changed underneath, so drop the cached index and refresh it.
  // Runs once per transition (the effect depends on `state.run`, which does
  // not change again while the phase stays put).
  useEffect(() => {
    if (state.phase !== 'done' && state.phase !== 'stale') return;
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

  const [sheetReopenKey, setSheetReopenKey] = useState(0);

  const [lastFinished, setLastFinished] = useState<Run | null>(null);
  useEffect(() => {
    setLastFinished((previous) => lastFinishedRun(previous, state.run));
  }, [state.run]);

  const openSheet = useCallback((): void => {
    apply({ type: 'sheet-opened' });
    setSheetReopenKey((key) => key + 1);
  }, [apply]);

  const dismissSheet = useCallback((): void => {
    apply({ type: 'sheet-dismissed' });
  }, [apply]);

  // The "Is that everything?" confirmation (#337): every `tidyUp()` opens
  // this first, showing `count` (the caller's own, or the inbox's pending
  // files); only `confirmTidyUp` (the sheet's "Yes, tidy up") goes on to
  // open the working sheet and start the run.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmCount, setConfirmCount] = useState(0);

  const tidyUp = useCallback(
    (count?: number): void => {
      setConfirmCount(count ?? pendingCount(files));
      setConfirmOpen(true);
    },
    [files],
  );

  // Opening the working sheet first means a run that cannot start (the
  // day's limit, an error) still shows its reason in the sheet.
  const confirmTidyUp = useCallback((): void => {
    setConfirmOpen(false);
    openSheet();
    void process();
  }, [openSheet, process]);

  const dismissConfirm = useCallback((): void => {
    setConfirmOpen(false);
  }, []);

  const value: RunStore = {
    ...state,
    process,
    tidyUp,
    openSheet,
    sheetReopenKey,
    lastFinished,
    dismissSheet,
    confirmOpen,
    confirmCount,
    confirmTidyUp,
    dismissConfirm,
  };

  return <RunContext.Provider value={value}>{children}</RunContext.Provider>;
}

export function useRun(): RunStore {
  const ctx = useContext(RunContext);
  if (ctx === undefined) {
    throw new Error('useRun must be used within a RunProvider');
  }
  return ctx;
}
