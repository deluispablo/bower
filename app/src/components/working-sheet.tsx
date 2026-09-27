/**
 * The sheet that holds the processing animation (#38, redesigned in #147): a
 * bottom sheet on mobile, a card under the header on desktop
 * (`styles/bower-working.css`). It shows while a run is queued or running
 * and for 3 s after it ends (also for a failure, a stale run, or the day's
 * quota running out), unless the user closed it (× or Escape). A non-modal
 * dialog: no focus trap, the rest of the app stays usable.
 *
 * While a run is queued or running it also shows "n of m filed" with a bar
 * (`progressFor`, indeterminate when the run hasn't reported both counts —
 * which is always, today), how long ago it started, a reassurance line, and
 * the names it has filed so far (`run.processed`; a destination folder only
 * once the runner reports one, which it does not yet — see the PR).
 *
 * The caller (`process-button.tsx`) owns `open`: it opens the sheet when a
 * run starts and when the header button is tapped during a run, and closes
 * it on dismiss.
 */

import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

import type { Run } from '../api.js';
import type { RunPhase } from '../run-store.js';
import { progressFor } from '../run-progress.js';
import { BowerWorking, workingLabel } from './bower-working.js';
import type { WorkingState } from './bower-working.js';

/** How long the sheet stays up after a run ends. */
export const SHEET_LINGER_MS = 3_000;

/**
 * Whether the sheet shows: always while queued/running, for
 * `SHEET_LINGER_MS` after done/failed/stale/quota, never once dismissed and
 * never for idle. `sinceMs` is the time since the phase began.
 */
export function sheetVisible(
  phase: RunPhase,
  sinceMs: number,
  dismissed: boolean,
): boolean {
  if (dismissed) return false;
  switch (phase) {
    case 'queued':
    case 'running':
      return true;
    case 'done':
    case 'failed':
    case 'stale':
    case 'quota':
      return sinceMs < SHEET_LINGER_MS;
    case 'idle':
      return false;
  }
}

/** The animation state for a run phase, or `null` when there is none. */
export function workingStateFor(phase: RunPhase): WorkingState | null {
  switch (phase) {
    case 'queued':
    case 'running':
    case 'done':
      return phase;
    case 'failed':
    case 'stale':
      return 'failed';
    case 'quota':
      return 'quota';
    case 'idle':
      return null;
  }
}

/** "Started n min ago" ("Started just now" under a minute). */
export function startedAgo(requestedAt: string, nowMs: number): string {
  const minutes = Math.max(
    0,
    Math.floor((nowMs - Date.parse(requestedAt)) / 60_000),
  );
  return minutes === 0 ? 'Started just now' : `Started ${minutes} min ago`;
}

export interface WorkingSheetProps {
  phase: RunPhase;
  /** The current run, for its start time and the names it has filed. */
  run: Run | null;
  /** The run store's message ("3 files processed", an error, …). */
  message?: string;
  open: boolean;
  onDismiss: () => void;
  /**
   * Bumped by the caller each time the button is tapped to bring the sheet
   * back during `done` / `failed` / `stale` / `quota`. Without this, a tap
   * after the linger has already elapsed would compute `sinceMs` from the
   * same old phase change and find it already expired, opening nothing.
   */
  reopenKey?: number;
}

const REASSURANCE =
  "Usually takes three to five minutes. You can close this; I'll ping you when I'm done.";

export function WorkingSheet({
  phase,
  run,
  message,
  open,
  onDismiss,
  reopenKey = 0,
}: WorkingSheetProps): JSX.Element | null {
  // When the sheet should measure the linger window from, updated during
  // render so the first render after a phase change (or a deliberate
  // reopen) already measures from the right moment.
  const phaseRef = useRef(phase);
  const reopenKeyRef = useRef(reopenKey);
  const sinceRef = useRef(Date.now());
  if (phaseRef.current !== phase || reopenKeyRef.current !== reopenKey) {
    phaseRef.current = phase;
    reopenKeyRef.current = reopenKey;
    sinceRef.current = Date.now();
  }

  // Re-render once the linger time is up so the sheet can go away.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (
      phase !== 'done' &&
      phase !== 'failed' &&
      phase !== 'stale' &&
      phase !== 'quota'
    ) {
      return;
    }
    const timer = setTimeout(() => {
      setTick((tick) => tick + 1);
    }, SHEET_LINGER_MS);
    return () => clearTimeout(timer);
  }, [phase, reopenKey]);

  // Re-render once a minute so "Started n min ago" keeps up while a run goes.
  useEffect(() => {
    if (phase !== 'queued' && phase !== 'running') return;
    const timer = setInterval(() => {
      setTick((tick) => tick + 1);
    }, 60_000);
    return () => clearInterval(timer);
  }, [phase]);

  const state = workingStateFor(phase);
  const visible =
    state !== null && sheetVisible(phase, Date.now() - sinceRef.current, !open);

  useEffect(() => {
    if (!visible) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onDismiss();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [visible, onDismiss]);

  if (!visible || state === null) return null;

  // The run store's message, unless it only repeats the label under the bird.
  const detail =
    message !== undefined && message !== workingLabel(state)
      ? message
      : undefined;

  const active = state === 'queued' || state === 'running';
  const filed = run?.processed;
  const progress = active ? progressFor({ processed: filed?.length }) : null;
  const started =
    active && run?.requestedAt !== undefined
      ? startedAgo(run.requestedAt, Date.now())
      : undefined;

  return (
    <div class="working-sheet" role="dialog" aria-label="Tidying up status">
      <div class="working-sheet-head">
        <h2 class="working-sheet-title">Tidying up</h2>
        <button
          type="button"
          class="working-sheet-close"
          aria-label="Close"
          onClick={onDismiss}
        >
          ×
        </button>
      </div>
      <BowerWorking state={state} />
      {detail !== undefined && <p class="working-sheet-detail">{detail}</p>}
      {active && (
        <div class="working-sheet-progress">
          <div class="working-sheet-progress-row">
            {progress !== null && (
              <span>{`${progress.filed} of ${progress.total} filed`}</span>
            )}
            {started !== undefined && (
              <span class="working-sheet-started">{started}</span>
            )}
          </div>
          <div
            class="working-sheet-bar"
            data-indeterminate={progress === null ? '' : undefined}
          >
            {progress !== null && (
              <div
                class="working-sheet-bar-fill"
                style={{ width: `${progress.ratio * 100}%` }}
              />
            )}
          </div>
          <p class="working-sheet-reassurance">{REASSURANCE}</p>
        </div>
      )}
      {filed !== undefined && filed.length > 0 && (
        <ul class="working-sheet-files">
          {filed.map((name) => (
            <li key={name} class="working-sheet-file">
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
