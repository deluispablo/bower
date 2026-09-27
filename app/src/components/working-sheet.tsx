/**
 * The sheet that holds the processing animation (#38): a bottom sheet on
 * mobile, a card under the header on desktop (`styles/bower-working.css`).
 * It shows while a run is queued or running and for 3 s after it ends,
 * unless the user closed it (× or Escape). A non-modal dialog: no focus
 * trap, the rest of the app stays usable.
 *
 * The caller (`process-button.tsx`) owns `open`: it opens the sheet when a
 * run starts and when the header button is tapped during a run, and closes
 * it on dismiss.
 */

import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

import type { RunPhase } from '../run-store.js';
import { BowerWorking, sceneFor } from './bower-working.js';
import type { WorkingState } from './bower-working.js';

/** How long the sheet stays up after a run ends. */
export const SHEET_LINGER_MS = 3_000;

/**
 * Whether the sheet shows: always while queued/running, for
 * `SHEET_LINGER_MS` after done/failed/stale, never once dismissed and never
 * for idle or quota. `sinceMs` is the time since the phase began.
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
      return sinceMs < SHEET_LINGER_MS;
    case 'idle':
    case 'quota':
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
    case 'idle':
    case 'quota':
      return null;
  }
}

export interface WorkingSheetProps {
  phase: RunPhase;
  /** The run store's message ("3 files processed", an error, …). */
  message?: string;
  open: boolean;
  onDismiss: () => void;
  progress?: number;
  /**
   * Bumped by the caller each time the button is tapped to bring the sheet
   * back during `done` / `failed` / `stale`. Without this, a tap after the
   * linger has already elapsed would compute `sinceMs` from the same old
   * phase change and find it already expired, opening nothing.
   */
  reopenKey?: number;
}

export function WorkingSheet({
  phase,
  message,
  open,
  onDismiss,
  progress,
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
    if (phase !== 'done' && phase !== 'failed' && phase !== 'stale') return;
    const timer = setTimeout(() => {
      setTick((tick) => tick + 1);
    }, SHEET_LINGER_MS);
    return () => clearTimeout(timer);
  }, [phase, reopenKey]);

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

  // The run store's message, unless it only repeats the scene's label.
  const detail =
    message !== undefined && message !== sceneFor(state).label
      ? message
      : undefined;

  return (
    <div class="working-sheet" role="dialog" aria-label="Tidying up status">
      <button
        type="button"
        class="working-sheet-close"
        aria-label="Close"
        onClick={onDismiss}
      >
        ×
      </button>
      <BowerWorking state={state} progress={progress} />
      {detail !== undefined && <p class="working-sheet-detail">{detail}</p>}
    </div>
  );
}
