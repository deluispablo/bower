/**
 * The sheet that holds the processing animation (#38, redesigned in #147): a
 * bottom sheet on mobile, a card under the header on desktop
 * (`styles/bower-working.css`). It shows while a run is queued or running,
 * through `done` until closed (× or Escape, #506: never on a timer, so
 * there is time to read what went where), and for 3 s after a failure, a
 * stale run, or the day's quota running out, unless the user closed it
 * first. A non-modal dialog: no focus trap, the rest of the app stays
 * usable.
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
 * After a failure or a stale run it shows the failure (Phone-Working-Failed,
 * #316): the confused bird, the reason's sentence (`run-failure.ts`, never a
 * step name), that nothing was lost and how many things are still in the
 * inbox, a hint, and Try again (a new run, through the usual confirmation)
 * or Not now. It stays until one of those, or the ×, is tapped.
 *
 * The run store (`run-store.tsx`, #304) owns `open`: the sheet opens by
 * itself once per run, never because a screen mounted again, and when the
 * Tidy up button is tapped during a run; it closes on dismiss.
 */

import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

import type { Run } from '../api.js';
import { isDemo } from '../api.js';
import { sinceLabel } from '../bower-tab.js';
import { findCompanion } from '../companion.js';
import { doneNotes, things } from '../home.js';
import { failureCopy } from '../run-failure.js';
import { JUST_FILED_PATH, JUST_SEE_WHERE } from '../just-filed.js';
import { runKey } from '../run-store.js';
import type { RunPhase } from '../run-store.js';
import {
  destinationsLabel,
  progressFor,
  readingLine,
  readLabels,
  runCounts,
  runRows,
  waitingPaths,
} from '../run-progress.js';
import type { RunRow } from '../run-progress.js';
import { useVault } from '../vault-store.js';
import { BowerWorking, workingLabel } from './bower-working.js';
import type { WorkingState } from './bower-working.js';
import { FolderMark } from './folder-mark.js';
import { IconClose, IconDoc, IconImage, IconNote, IconPdf } from './icons.js';
import '../styles/tidy-confirm-sheet.css';

/** How long the sheet stays up after a run stops without finishing. */
export const SHEET_LINGER_MS = 3_000;

/**
 * Whether the sheet shows: always while queued/running/done (the run store
 * ends `done` itself) and after a failure or a stale run (it asks what to
 * do, #316), for `SHEET_LINGER_MS` over quota, never once dismissed and
 * never for idle. `sinceMs` is the time since the phase began.
 */
export function sheetVisible(
  phase: RunPhase,
  sinceMs: number,
  dismissed: boolean,
): boolean {
  if (dismissed) return false;
  switch (phase) {
    case 'starting':
    case 'queued':
    case 'running':
    case 'done':
    case 'failed':
    case 'stale':
      return true;
    case 'quota':
      return sinceMs < SHEET_LINGER_MS;
    case 'idle':
      return false;
  }
}

/**
 * The animation state for a run phase, or `null` when there is none.
 * `starting` (#505) has no run yet, so it reuses `queued`'s bird and label
 * — the sheet's own `starting` detail line (`STARTING_MESSAGE`,
 * `run-store.tsx`) is what actually tells the two apart.
 */
export function workingStateFor(phase: RunPhase): WorkingState | null {
  switch (phase) {
    case 'starting':
      return 'queued';
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

/**
 * "Started n min ago" ("Started just now" under a minute): `sinceLabel`
 * (`bower-tab.ts`, #513) is the one helper behind every "ago" text a run
 * shows off — the Inbox card's own "started n min ago" (`routes/home.tsx`)
 * included — so this sheet and that card can never disagree at the same
 * moment the way two separate implementations used to.
 */
export function startedAgo(requestedAt: string, nowMs: number): string {
  return `Started ${sinceLabel(requestedAt, nowMs)}`;
}

/** The extra lines under the Done summary (spec A.3/A.5), shared with Home. */
export { doneNotes };

export interface WorkingSheetProps {
  phase: RunPhase;
  /** The current run, for its start time and the names it has filed. */
  run: Run | null;
  /** The run store's message ("3 files processed", an error, …). */
  message?: string;
  /** The run store's shared clock (#513): "Started N min ago" reads off
   * this, not its own timer, so it never disagrees with the Inbox card's
   * own "started N min ago" at the same moment. */
  now: number;
  open: boolean;
  onDismiss: () => void;
  /**
   * Bumped by the caller each time the button is tapped to bring the sheet
   * back during `done` / `failed` / `stale` / `quota`. Without this, a tap
   * after the linger has already elapsed would compute `sinceMs` from the
   * same old phase change and find it already expired, opening nothing.
   */
  reopenKey?: number;
  /** Try again on the failure (#316): starts a new run. */
  onTryAgain?: () => void;
}

/** "Nothing was lost: your 3 things are still in the inbox, untouched." */
export function nothingLost(n: number): string {
  const are = n === 1 ? 'is' : 'are';
  return `Nothing was lost: your ${things(n)} ${are} still in the inbox, untouched.`;
}

/** The sentence under the bar while a run goes (spec C.6). */
export const REASSURANCE =
  'You can close this; Bower carries on and tells you when it is done.';

/** The header's second line while a run goes ("4 of 5 · started a minute
 * ago", board `Flow-04-Working`): the count when the run reports one, then
 * when it started. */
export function headerSubline(
  progress: { filed: number; total: number } | null,
  started: string | undefined,
): string {
  const parts: string[] = [];
  if (progress !== null) parts.push(`${progress.filed} of ${progress.total}`);
  if (started !== undefined && started !== '') {
    parts.push(started.charAt(0).toLowerCase() + started.slice(1));
  }
  return parts.join(' · ');
}

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

/** What a row says after the title (board `Flow-04-Working`): the mark and
 * folder, then "· read: rent, rooms, dates", "· read" and "· was IMG_4471.jpg";
 * a kept item says so instead; the item in progress says what it is doing. */
function RowWhere({ row }: { row: RunRow }): JSX.Element {
  if (row.status === 'reading') {
    return <span class="working-sheet-row-where">{readingLine(row.path)}</span>;
  }
  const bits: string[] = [];
  if (row.read === 'facts') bits.push(`read: ${row.readLabels.join(', ')}`);
  else if (row.read === 'plain') bits.push('read');
  if (row.was !== null) bits.push(`was ${row.was}`);
  return (
    <span class="working-sheet-row-where">
      {row.keptNote !== null ? (
        row.keptNote
      ) : (
        <>
          {row.folderPath === null ? (
            row.destination === null ? (
              'filed'
            ) : (
              `→ ${row.destination}`
            )
          ) : (
            <>
              {row.para !== null && <FolderMark kind={row.para} size={18} />}{' '}
              {row.folderPath}
            </>
          )}
          {bits.map((bit) => ` · ${bit}`).join('')}
        </>
      )}
    </span>
  );
}

export function WorkingSheet({
  phase,
  run,
  message,
  now,
  open,
  onDismiss,
  reopenKey = 0,
  onTryAgain,
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

  // The kind of each filed item's companion note, read once per note
  // (`loadNoteMeta` is cached): "read: rent, rooms, dates" on the row.
  const [companionLabels, setCompanionLabels] = useState<
    ReadonlyMap<string, string[]>
  >(new Map());
  const filedItems = run?.items;
  const byPath = useMemo(
    () => new Map(files.map((file) => [file.path, file])),
    [files],
  );
  useEffect(() => {
    let cancelled = false;
    const notes = files.filter((file) => /\.md$/i.test(file.name));
    for (const item of filedItems ?? []) {
      const moved = item.to === undefined ? undefined : byPath.get(item.to);
      if (item.to === undefined || moved === undefined) continue;
      const companion = findCompanion(moved, {
        notes,
        byPath,
        originals: new Map(),
        catalogue: new Map(),
      });
      if (companion === undefined) continue;
      const key = item.to;
      // Loaded on demand: the kinds table and the note reader are not
      // needed to start the app.
      Promise.all([import('../note-meta.js'), import('../kinds.js')])
        .then(async ([noteMeta, kinds]) => {
          const meta = await noteMeta.loadNoteMeta(companion);
          const labels = readLabels(
            meta.kind === undefined ? undefined : kinds.kindById(meta.kind),
          );
          if (cancelled) return;
          setCompanionLabels((previous) => new Map(previous).set(key, labels));
        })
        .catch((error: unknown) => {
          console.error('Could not read a note for the working sheet', error);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [filedItems, files, byPath]);

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
    if (phase !== 'quota') return;
    const timer = setTimeout(() => {
      setTick((tick) => tick + 1);
    }, SHEET_LINGER_MS);
    return () => clearTimeout(timer);
  }, [phase, reopenKey]);

  // "Started n min ago" keeps up on its own now (#513): `now` is a prop
  // from the run store's own shared clock, so a change to it re-renders
  // this component without a timer of its own.

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

  if (state === 'failed') {
    // A stale run never said why: it reads as `unknown`.
    const copy = failureCopy(phase === 'failed' ? run?.reason : undefined);
    return (
      <div
        class="working-sheet working-sheet-failed"
        role="dialog"
        aria-label="Tidying up did not finish"
      >
        <div class="working-sheet-head">
          <h2 class="working-sheet-title">It didn't finish</h2>
          <button
            type="button"
            class="working-sheet-close"
            aria-label="Close"
            onClick={onDismiss}
          >
            <IconClose />
          </button>
        </div>
        <BowerWorking state="failed" />
        <p class="working-sheet-detail">{copy.sentence}</p>
        <p class="working-sheet-detail">{nothingLost(waiting.length)}</p>
        <p class="working-sheet-reassurance">{copy.hint}</p>
        <div class="working-sheet-actions">
          <button
            type="button"
            class="tidy-confirm-button"
            onClick={() => {
              onDismiss();
              onTryAgain?.();
            }}
          >
            Try again
          </button>
          <button
            type="button"
            class="tidy-confirm-button tidy-confirm-button-secondary"
            onClick={onDismiss}
          >
            Not now
          </button>
        </div>
      </div>
    );
  }

  // The run store's message, unless it only repeats the label under the bird.
  const detail =
    message !== undefined && message !== workingLabel(state)
      ? message
      : undefined;

  // Keyed on `phase`, not the mapped `state`: `starting` (#505) borrows
  // `queued`'s bird and label but has no run yet, so it must not pull in
  // the run-data-dependent stage/progress/rows below.
  const active = phase === 'queued' || phase === 'running';
  const notes = state === 'done' ? doneNotes(run) : [];
  const processed = run?.processed;
  const items = run?.items;
  const progress = active
    ? progressFor(runCounts(processed, waiting, items))
    : null;
  const rows = runRows({
    processed,
    waiting,
    files,
    active,
    items,
    setAside: run?.setAside,
    companionLabels,
  });
  const started = !active
    ? undefined
    : isDemo()
      ? DEMO_PLAYING_BACK
      : run?.requestedAt !== undefined
        ? startedAgo(run.requestedAt, now)
        : undefined;

  return (
    <div class="working-sheet" role="dialog" aria-label="Tidying up status">
      <div class="working-sheet-head">
        <h2 class="working-sheet-title">Tidying up</h2>
        {active && headerSubline(progress, started) !== '' && (
          <span class="working-sheet-subline">
            {headerSubline(progress, started)}
          </span>
        )}
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
      {state === 'done' && (
        <a class="working-sheet-see" href={JUST_FILED_PATH} onClick={onDismiss}>
          {JUST_SEE_WHERE}
        </a>
      )}
      {active && (
        <div class="working-sheet-progress">
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
              <RowWhere row={row} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
