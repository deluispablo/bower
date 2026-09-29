/**
 * Run state (#37): is Bower idle, starting, queued, running, done, failed,
 * stale or over quota. `process()` starts a run (`POST /process`); the
 * store then polls `GET /status` every 5 s while a run is in flight, up to
 * 30 minutes, after which it gives up locally (`stale`) even if the server
 * never reports one. Polling pauses while the tab is hidden and resumes on
 * `visibilitychange`/`focus`.
 *
 * `starting` (#505) covers the gap between "Yes, tidy up" and the
 * `POST /process` answer: on the real instance that can take four seconds
 * or more, during which nothing used to change on screen and people tapped
 * again. `confirmTidyUp` dispatches it, and opens the sheet, before
 * `process()` is even called; `process-started` then moves on to `queued`
 * or `running` as before, and a failure to start moves on to `failed` as
 * before — `starting` only ever sits in between.
 *
 * Mounted in `app.tsx`, inside `VaultProvider`: a run that finishes `done`,
 * or goes `stale` after the Worker's timeout, drops the cached vault index
 * and refreshes it, since the vault content may have changed underneath.
 *
 * After a run (#304, #506): `done` stays until the working sheet is
 * dismissed (Close or Escape) — never on a timer, so there is always time
 * to read what went where before it closes. The result message stays on
 * the state for the sheet, and is announced once, in the toast
 * (`toast-store.ts`). A run that was already over when the app first heard
 * of it (a reload hours later) is not announced at all: it goes straight
 * to `idle`.
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

import { writeContextNote } from './add-context.js';
import { linkTitleFromFileName } from './add.js';
import { ApiError, getStatus, startProcess } from './api.js';
import type { Run, RunScope } from './api.js';
import type { ConfirmBreakdown } from './components/tidy-confirm-sheet.js';
import type { DriveFile } from './drive.js';
import { ANSWERS_FOLDER } from './home.js';
import type { LastRunOutcome } from './last-run.js';
import { folderHref } from './navigation.js';
import { failureCopy } from './run-failure.js';
import { inboxCount, inboxTotal } from './inbox-count.js';
import type { InboxCount } from './inbox-count.js';
import { outcomeFromRun, runSentence } from './run-outcome.js';
import { processedKind, visiblePendingCount } from './run-progress.js';
import { useSession } from './session.js';
import { showToast } from './toast-store.js';
import {
  invalidateAfterRun,
  readLastRunOutcome,
  useVault,
} from './vault-store.js';

export type RunPhase =
  | 'idle'
  | 'starting'
  | 'queued'
  | 'running'
  | 'done'
  | 'failed'
  | 'stale'
  | 'quota';

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
  | { type: 'starting' }
  | { type: 'process-started'; run: Run }
  | { type: 'process-quota'; retryAfter: number; message: string }
  | { type: 'process-failed'; message: string }
  | { type: 'status'; run: Run | null; stale: boolean }
  | { type: 'poll-timeout' }
  | { type: 'last-run'; outcome: LastRunOutcome | null }
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

/** The working sheet's line while `starting` (#505). */
export const STARTING_MESSAGE = 'Starting the tidy-up…';

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

/**
 * A `Storage`-like interface (`sessionStorage`'s own shape, narrowed to
 * what this needs) so a plain object can stand in for it in tests.
 */
export interface RunSheetStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const SHEET_SEEN_KEY = 'bower-run-sheet-seen';

/**
 * The run key (`runKey`) whose working sheet has already opened, kept in
 * `sessionStorage` (#497) so a run already seen never opens it again —
 * not on a full reload, which used to lose this the moment the provider
 * remounted with a fresh, empty `sheetRunId`, and the sheet read a run
 * still `queued`/`running` as new. Storage can be unavailable (private
 * mode, quota, a non-browser test environment): read/write both fail
 * closed, so the worst case is the pre-#497 behaviour, never a crash.
 */
export function readSeenRunKey(storage: RunSheetStorage): string | null {
  try {
    return storage.getItem(SHEET_SEEN_KEY);
  } catch {
    return null;
  }
}

/** Keeps `sessionStorage` in step with `state.sheetRunId`; `null` clears it
 * (a fresh run, or none at all — nothing left to keep from reopening). */
export function writeSeenRunKey(
  storage: RunSheetStorage,
  key: string | null,
): void {
  try {
    if (key === null) storage.removeItem(SHEET_SEEN_KEY);
    else storage.setItem(SHEET_SEEN_KEY, key);
  } catch {
    // Nothing user-facing: worst case the sheet opens once more next time.
  }
}

/** The tidy-up chip's "seen" flag, per device and run (R-CHIP, D24). */
export const RUN_SEEN_PREFIX = 'bower:run-seen:';

/** How long a finished run's chip stays when nobody opens the sheet. */
export const RUN_CHIP_LIFETIME_MS = 24 * 60 * 60_000;

/** Whether the run with `key` has had its result seen (sheet opened). */
export function readRunSeen(storage: RunSheetStorage, key: string): boolean {
  try {
    return storage.getItem(`${RUN_SEEN_PREFIX}${key}`) !== null;
  } catch {
    return false;
  }
}

/** Marks the run with `key` seen; storage trouble only means the chip stays. */
export function writeRunSeen(storage: RunSheetStorage, key: string): void {
  try {
    storage.setItem(`${RUN_SEEN_PREFIX}${key}`, '1');
  } catch {
    // Nothing user-facing: the chip stays until its 24 hours are up.
  }
}

/**
 * What a finished run says in the toast and the sheet's state message: the
 * one sentence `runSentence` makes from its outcome (R-RUN-4), in the third
 * person. Add's "What is this?" context note never counts (`RunOutcome`).
 */
export function resultMessage(run: Run): string {
  return runSentence(outcomeFromRun(run), { voice: 'third' });
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
    case 'starting':
      return {
        phase: 'starting',
        run: null,
        message: STARTING_MESSAGE,
        sheetOpen: true,
        sheetRunId: null,
      };
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
        // The reason's sentence for people (#375), never `run.error`,
        // which names the runner's step for the operator.
        message: failureCopy(run.reason).sentence,
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
    case 'last-run': {
      // A race (the phase already moved on) or the file said nothing
      // usable (missing, or did not parse): stays exactly as it was —
      // `stale`'s own `STALE_MESSAGE` if nothing else has changed it.
      if (state.phase !== 'stale' || event.outcome === null) return state;
      const { outcome } = event;
      const run: Run = {
        state: outcome.state,
        requestedAt: state.run?.requestedAt ?? outcome.finishedAt,
        finishedAt: outcome.finishedAt,
        // The runner's own sentence, kept for `lastTidyUpLine` (`home.ts`):
        // this outcome has no per-file `processed` list, only a count, so
        // the usual "N filed · M answered" cannot be rebuilt from it.
        summary: outcome.sentence,
        runId: outcome.runId,
        ...(outcome.state === 'failed' ? { reason: outcome.reason } : {}),
      };
      const message =
        outcome.state === 'done'
          ? outcome.sentence
          : failureCopy(outcome.reason).sentence;
      return { phase: outcome.state, run, message, ...sheet };
    }
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
 * Count of files waiting to be processed, the way a person would count
 * them (#529): `run-progress.ts#visiblePendingCount`, the same rule
 * Home and the working sheet use, so the Add hint and the "Is that
 * everything?" confirmation never run one ahead of them over Add's own
 * "What is this?" context note (#506) — it is the batch's own scratch
 * note, not a thing waiting to be filed. Used to be its own, separately
 * maintained rule here; kept as `pendingCount` since every caller
 * (`layout.tsx`, `switcher.tsx`, `add.tsx`, `tidyUp`/`doItNow` below)
 * already imports it by that name.
 */
export const pendingCount = visiblePendingCount;

/**
 * What the inbox holds, for the confirmation's second line (R-CONF-4): files,
 * links and requests, counted with the same rule as `inboxCount`, so the
 * three add up to the number the dialog shows.
 */
export function inboxBreakdown(files: readonly DriveFile[]): ConfirmBreakdown {
  const breakdown: ConfirmBreakdown = { files: 0, links: 0, requests: 0 };
  for (const file of files) {
    if (visiblePendingCount([file]) !== 1) continue;
    if (processedKind(file.path, undefined) === 'request') {
      breakdown.requests += 1;
    } else if (linkTitleFromFileName(file.name) !== null) {
      breakdown.links += 1;
    } else {
      breakdown.files += 1;
    }
  }
  return breakdown;
}

export interface RunStore extends RunState {
  /** Starts a run: a whole tidy-up, or `instructions` only (`startProcess`). */
  process: (scope?: RunScope) => Promise<boolean>;
  /**
   * What every Tidy up control calls (the Inbox card, Add's hint, the
   * switcher command, #320). Opens the "Is that everything?" confirmation
   * (#337) first, counting the inbox's pending files; only the sheet's
   * "Yes, tidy up" (`confirmTidyUp`) starts the run, a whole tidy-up.
   */
  tidyUp: () => void;
  /**
   * A waiting request's "Do it now" (#344, handover D.2): the same
   * confirmation, counting `count` requests instead of files, and its
   * "Yes, tidy up" starts an instructions-only run.
   */
  doItNow: (count: number) => void;
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
  /**
   * Whether `lastFinished`'s result has been seen on this device (its sheet
   * opened, `bower:run-seen:<runKey>`): the tidy-up chip hides once true.
   */
  resultSeen: boolean;
  /** Closes the working sheet; a `done` run goes back to `idle` with it. */
  dismissSheet: () => void;
  /** Whether the "Is that everything?" confirmation is open. */
  confirmOpen: boolean;
  /** The count the confirmation shows (see `tidyUp`). */
  confirmCount: number;
  /** The inbox listing has not resolved yet: the dialog shows a skeleton,
   * never 0 (R-CONF-3). Always false for a request's own "Do it now". */
  confirmLoading: boolean;
  /** Files, links and requests behind `confirmCount` (tidy-up only). */
  confirmBreakdown: ConfirmBreakdown | undefined;
  /**
   * `'all'` for `tidyUp()`'s whole-inbox confirmation, `'instructions'` for
   * `doItNow()`'s (#501): which copy `TidyConfirmSheet` shows
   * (`run-sheets.tsx` maps this to its `kind` prop).
   */
  confirmScope: RunScope;
  /** The confirmation's "Yes, tidy up": closes it and starts the run. */
  confirmTidyUp: () => void;
  /** The confirmation's "Add more first": closes it, no run starts. */
  dismissConfirm: () => void;
  /**
   * One shared clock (#513), ticking every minute: Home's Inbox card, the
   * Last tidy-up card and the working sheet all read elapsed time off this
   * same value now, rather than each keeping its own — that used to drift
   * a minute apart at the boundary ("started 3 min ago" on the card,
   * "Started 4 min ago" on the sheet at the same moment).
   */
  now: number;
}

const RunContext = createContext<RunStore | undefined>(undefined);

interface RunProviderProps {
  children: ComponentChildren;
}

export function RunProvider({ children }: RunProviderProps) {
  const { me } = useSession();
  const { files, refresh, keepRule, status: vaultStatus } = useVault();
  const hasVault = me?.vault != null;
  const folderId = me?.vault?.folderId ?? null;

  // #497: seeded from `sessionStorage` so a run already seen (its sheet
  // opened, dismissed or not) does not read as new to a provider that
  // just mounted — a reload chief among them — and reopen the sheet for
  // it. `sheetOpen` itself always starts closed either way: only a fresh
  // `status`/`process-started` for that same key can reopen it, and
  // `sheetForActive` already keeps it closed once the key matches.
  const [state, setState] = useState<RunState>(() => ({
    ...IDLE_STATE,
    sheetRunId:
      typeof sessionStorage === 'undefined'
        ? null
        : readSeenRunKey(sessionStorage),
  }));
  const stateRef = useRef(state);
  stateRef.current = state;

  const apply = useCallback((event: RunEvent): void => {
    setState((prev) => reduce(prev, event));
  }, []);

  // Keeps `sessionStorage` in step, so the next mount (a reload) starts
  // already knowing this run's sheet has been seen.
  useEffect(() => {
    if (typeof sessionStorage === 'undefined') return;
    writeSeenRunKey(sessionStorage, state.sheetRunId);
  }, [state.sheetRunId]);

  // #513: one shared clock for every surface that shows elapsed time off a
  // run (Home's Inbox card, the Last tidy-up card, the working sheet),
  // instead of each keeping its own `now`/tick state on its own interval —
  // those used to disagree by a minute right at the boundary, since they
  // advanced at different moments.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
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
    if (
      state.phase !== 'done' &&
      state.phase !== 'failed' &&
      state.phase !== 'stale'
    ) {
      return;
    }
    void invalidateAfterRun().then(() => refresh());
  }, [state.phase, state.run, refresh]);

  // On `stale` (#564): the Worker lost track, but the runner may have
  // written its own outcome straight into the vault before it stopped
  // answering (`.bower/last-run.json`, `write_outcome` in `agent/run.sh`).
  // Fetched once per `stale` entry — the ref resets the moment the phase
  // moves on, so a run that goes `stale` again later (another run,
  // another timeout) is fetched again fresh.
  const staleFetchedRef = useRef(false);
  useEffect(() => {
    if (state.phase !== 'stale') {
      staleFetchedRef.current = false;
      return;
    }
    if (staleFetchedRef.current || folderId === null) return;
    staleFetchedRef.current = true;
    void readLastRunOutcome(folderId).then((outcome) => {
      apply({ type: 'last-run', outcome });
    });
  }, [state.phase, folderId, apply]);

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

  const process = useCallback(
    async (scope?: RunScope): Promise<boolean> => {
      try {
        const { run } = await startProcess(scope);
        apply({ type: 'process-started', run });
        return true;
      } catch (err) {
        if (err instanceof ApiError && err.code === 'quota') {
          const retryAfter = err.retryAfter ?? 0;
          apply({
            type: 'process-quota',
            retryAfter,
            message: quotaMessage(retryAfter),
          });
          return false;
        }
        console.error(err);
        apply({
          type: 'process-failed',
          message: 'Could not start. Try again.',
        });
        return false;
      }
    },
    [apply],
  );

  const [sheetReopenKey, setSheetReopenKey] = useState(0);

  const [lastFinished, setLastFinished] = useState<Run | null>(null);
  useEffect(() => {
    setLastFinished((previous) => lastFinishedRun(previous, state.run));
  }, [state.run]);

  // The result counts as seen once the sheet is open on a finished run: the
  // chip's only job is to lead there (R-CHIP, D24).
  const [seenTick, setSeenTick] = useState(0);
  useEffect(() => {
    if (!state.sheetOpen || lastFinished === null || isActive(state.phase)) {
      return;
    }
    if (state.phase === 'starting') return;
    if (typeof localStorage === 'undefined') return;
    writeRunSeen(localStorage, runKey(lastFinished));
    setSeenTick((tick) => tick + 1);
  }, [state.sheetOpen, state.phase, lastFinished]);
  const resultSeen =
    seenTick >= 0 &&
    lastFinished !== null &&
    typeof localStorage !== 'undefined' &&
    readRunSeen(localStorage, runKey(lastFinished));

  const openSheet = useCallback((): void => {
    apply({ type: 'sheet-opened' });
    setSheetReopenKey((key) => key + 1);
  }, [apply]);

  const dismissSheet = useCallback((): void => {
    apply({ type: 'sheet-dismissed' });
  }, [apply]);

  // The "Is that everything?" confirmation (#337): every `tidyUp()` opens
  // this first, showing the inbox's pending files, and `doItNow(count)`
  // with its count of requests (#344); only `confirmTidyUp` (the sheet's
  // "Yes, tidy up") goes on to open the working sheet and start the run,
  // with the scope the sheet was opened for.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [requestCount, setRequestCount] = useState(0);
  const [confirmScope, setConfirmScope] = useState<RunScope>('all');

  // A tidy-up's count reads the listing as it is now, so it fills in when
  // the listing resolves while the dialog is open (R-CONF-2, R-CONF-3).
  const inbox: InboxCount = inboxCount(files, vaultStatus === 'loading');
  const confirmCount =
    confirmScope === 'instructions' ? requestCount : inboxTotal(inbox);
  const confirmLoading = confirmScope === 'all' && inbox.status === 'loading';
  const confirmBreakdown =
    confirmScope === 'all' && inbox.status === 'ready'
      ? inboxBreakdown(files)
      : undefined;

  const tidyUp = useCallback((): void => {
    setConfirmScope('all');
    setConfirmOpen(true);
  }, []);

  const doItNow = useCallback((count: number): void => {
    setRequestCount(count);
    setConfirmScope('instructions');
    setConfirmOpen(true);
  }, []);

  // Opening the working sheet first means a run that cannot start (the
  // day's limit, an error) still shows its reason in the sheet. `starting`
  // (#505) moves the phase and opens the sheet in the very same tick, so
  // there is something on screen at once — the `POST /process` answer that
  // moves it on to `queued`/`running` (or `failed`) can take four seconds
  // or more on the real instance.
  // Add's "What is this?" note (#335) lands in the inbox before the run
  // starts, so the run sees it, and a rule sentence in it is already in
  // `Rules.md` (#435); `writeContextNote` never rejects and does
  // nothing when the box is empty.
  const inboxFolderId = me?.vault?.inboxFolderId ?? null;
  const confirmTidyUp = useCallback((): void => {
    setConfirmOpen(false);
    apply({ type: 'starting' });
    setSheetReopenKey((key) => key + 1);
    void writeContextNote(inboxFolderId, keepRule).then(() =>
      process(confirmScope === 'instructions' ? confirmScope : undefined),
    );
  }, [apply, process, inboxFolderId, keepRule, confirmScope]);

  const dismissConfirm = useCallback((): void => {
    setConfirmOpen(false);
  }, []);

  const value: RunStore = {
    ...state,
    process,
    tidyUp,
    doItNow,
    openSheet,
    sheetReopenKey,
    lastFinished,
    resultSeen,
    dismissSheet,
    confirmOpen,
    confirmCount,
    confirmLoading,
    confirmBreakdown,
    confirmScope,
    confirmTidyUp,
    dismissConfirm,
    now,
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
