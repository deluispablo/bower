/**
 * The sheet that holds the processing animation (#38, redesigned in #147): a
 * bottom sheet on mobile, a card under the header on desktop
 * (`styles/bower-working.css`). It shows while a run is queued or running,
 * through `done` until the run store goes back to idle (8 s, or sooner when
 * closed), and for 3 s after a failure, a stale run, or the day's quota
 * running out, unless the user closed it (× or Escape). A non-modal
 * dialog: no focus trap, the rest of the app stays usable.
 *
 * While a run is queued or running it shows the board's scene (Phone-Working,
 * spec C.6, #338): the bird tidying between "Inbox" and the folders things
 * went to, "n of m filed" with a bar, how long ago the run started, one
 * sentence on how long it takes, and a row per item as it is filed, then the
 * one it is reading (`run-progress.ts`). The counts and rows need the run
 * to report what it has filed (`run.processed`); until it does, the bar is
 * indeterminate and there are no rows. The inbox the run started from is
 * the listing as the sheet first saw the run, kept for the whole run.
 *
 * Once done, it shows the bird and the run store's message as before, the
 * rows with the folders the re-read listing found them in, and what the run
 * set aside or refused (`doneNotes`,
 * spec A.3/A.5), under the summary: `run.quarantined` and `run.refused`,
 * either, both or neither.
 *
 * The run store (`run-store.tsx`, #304) owns `open`: the sheet opens by
 * itself once per run, never because a screen mounted again, and when the
 * Tidy up button is tapped during a run; it closes on dismiss.
 */

import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

import type { Run } from '../api.js';
import { isDemo } from '../api.js';
import { doneNotes } from '../home.js';
import { runKey } from '../run-store.js';
import type { RunPhase } from '../run-store.js';
import {
  destinationsLabel,
  progressFor,
  runCounts,
  runRows,
  waitingPaths,
} from '../run-progress.js';
import type { RunRow } from '../run-progress.js';
import { useVault } from '../vault-store.js';
import { BowerWorking, workingLabel } from './bower-working.js';
import type { WorkingState } from './bower-working.js';
import { IconClose, IconDoc, IconImage, IconNote, IconPdf } from './icons.js';

/** How long the sheet stays up after a run stops without finishing. */
export const SHEET_LINGER_MS = 3_000;

/**
 * Whether the sheet shows: always while queued/running/done (the run store
 * ends `done` itself), for `SHEET_LINGER_MS` after failed/stale/quota, never
 * once dismissed and never for idle. `sinceMs` is the time since the phase
 * began.
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
    case 'done':
      return true;
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

/** The extra lines under the Done summary (spec A.3/A.5), shared with Home. */
export { doneNotes };

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

/** The sentence under the bar while a run goes (spec C.6). */
export const REASSURANCE =
  'Usually three to five minutes. Close this and keep going; Home will say when it is done.';

/**
 * The demo's sentence in the same place (#363, `Demo-Working` board,
 * handover C.10): tidy up in the demo never runs the model, so this
 * replaces `REASSURANCE` there. `lead` is set in amber, as the board draws
 * it; `demo/server.ts`'s scripted run is unchanged, this is copy only.
 */
export const DEMO_REASSURANCE_LEAD = 'A recording.';
export const DEMO_REASSURANCE_REST =
  'In the demo the bird plays back a real run in twenty seconds; nothing ' +
  'is sent to Claude, nothing costs anything. In your own Bower this ' +
  'takes three to five minutes.';

/** The progress row's right-hand label while a run goes: the demo always
 * plays back the same twenty-second recording, so "Started n min ago"
 * (meant for a real run that can run long) is replaced with a plain
 * "Playing back" (`Demo-Working` board). */
export const DEMO_PLAYING_BACK = 'Playing back';

/** The scene's right-hand label before any destination is known. */
export const FOLDERS_FALLBACK = 'Your folders';

function RowIcon({ tone }: { tone: RunRow['tone'] }): JSX.Element {
  const icon =
    tone === 'pdf' ? (
      <IconPdf />
    ) : tone === 'image' ? (
      <IconImage />
    ) : tone === 'note' ? (
      <IconNote />
    ) : (
      <IconDoc />
    );
  return <span class={`working-sheet-row-icon tone-${tone}`}>{icon}</span>;
}

/** What a row says after the title: where it went, or that it is being read. */
function rowWhere(row: RunRow): string {
  if (row.status === 'reading') return 'reading…';
  return row.destination === null ? 'filed' : `→ ${row.destination}`;
}

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
  const { files } = useVault();

  // The inbox as the run began: the listing the first time the sheet sees
  // this run (and has a listing at all), kept until the next run.
  const waitingRef = useRef<{ key: string; paths: string[] } | null>(null);
  if (run !== null && files.length > 0) {
    const key = runKey(run);
    if (waitingRef.current?.key !== key) {
      waitingRef.current = { key, paths: waitingPaths(files) };
    }
  }
  const waiting = waitingRef.current?.paths ?? [];

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
    if (phase !== 'failed' && phase !== 'stale' && phase !== 'quota') {
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
  const notes = state === 'done' ? doneNotes(run) : [];
  const processed = run?.processed;
  const progress = active ? progressFor(runCounts(processed, waiting)) : null;
  const rows = runRows({ processed, waiting, files, active });
  const started = !active
    ? undefined
    : isDemo()
      ? DEMO_PLAYING_BACK
      : run?.requestedAt !== undefined
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
          <IconClose />
        </button>
      </div>
      {active ? (
        <div class="working-sheet-stage">
          <span class="working-sheet-stage-line" aria-hidden="true" />
          <span class="working-sheet-stage-from">Inbox</span>
          <span class="working-sheet-stage-to">
            {destinationsLabel(rows) ?? FOLDERS_FALLBACK}
          </span>
          <BowerWorking state={state} />
        </div>
      ) : (
        <BowerWorking state={state} />
      )}
      {detail !== undefined && <p class="working-sheet-detail">{detail}</p>}
      {notes.map((note) => (
        <p key={note} class="working-sheet-detail">
          {note}
        </p>
      ))}
      {active && (
        <div class="working-sheet-progress">
          <div class="working-sheet-progress-row">
            <span>
              {progress !== null
                ? `${progress.filed} of ${progress.total} filed`
                : ''}
            </span>
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
          <p class="working-sheet-reassurance">
            {isDemo() ? (
              <>
                <b class="working-sheet-reassurance-lead">
                  {DEMO_REASSURANCE_LEAD}
                </b>{' '}
                {DEMO_REASSURANCE_REST}
              </>
            ) : (
              REASSURANCE
            )}
          </p>
        </div>
      )}
      {rows.length > 0 && (
        <ul class="working-sheet-rows">
          {rows.map((row) => (
            <li
              key={row.path}
              class="working-sheet-row"
              data-status={row.status}
            >
              <RowIcon tone={row.tone} />
              <span class="working-sheet-row-title">{row.title}</span>
              <span class="working-sheet-row-where">{rowWhere(row)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
