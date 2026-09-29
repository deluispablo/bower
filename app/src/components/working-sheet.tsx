/**
 * The tidy-up sheet (#38, #147, rebuilt on Overlay in #752, spec 6.3
 * R-SHEET, boards `RunSheet-*`): an Overlay `sheet` (a bottom sheet on
 * phones, a 440 px panel from 900 px up) with a scrim, the page behind
 * inert and no scroll behind it. It shows while a run is queued or running,
 * through done and partly done until closed (never on a timer, #506, so
 * there is time to read what went where), after a failure or a stale run
 * until closed, and for 3 s when the day's limit is reached.
 *
 * Four states, each built from the run's `RunOutcome` (`run-outcome.ts`):
 * running (the Tidying bird on its stage, the steps from `phase`, the last
 * two rows), done (the four stat tiles, the bird's quote, the rows with
 * Needs you first), partly done (the tiles, what happened, the steps with
 * the stopped one marked, Finish the tidy-up) and did not finish (the
 * reason and Tidy up again). "Finish the tidy-up" and "Tidy up again" go
 * straight to the confirmation, two steps and not three (`onTryAgain`).
 * A run whose reason is `vault_missing` shows no sheet at all: the recovery
 * screen takes over (R-VAULT).
 *
 * The run store (`run-store.tsx`, #304) owns `open`: the sheet opens by
 * itself once per run, never because a screen mounted again, and when the
 * chip is tapped; it closes on dismiss.
 */

import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

import type { Run, RunPhase as StepPhase } from '../api.js';
import { isDemo } from '../api.js';
import { linkTitleFromFileName } from '../add.js';
import { sinceLabel } from '../bower-tab.js';
import { doneNotes, things } from '../home.js';
import { JUST_FILED_PATH } from '../just-filed.js';
import { displayPath, folderHref, paraKindOf } from '../navigation.js';
import { failureCopy, failureReason } from '../run-failure.js';
import { outcomeFromRun, runSentence } from '../run-outcome.js';
import type { OutcomeAction, OutcomeItem, RunOutcome } from '../run-outcome.js';
import {
  destinationsLabel,
  keptNote,
  readingLine,
  runRows,
  waitingPaths,
} from '../run-progress.js';
import type { RowTone } from '../run-progress.js';
import { runKey } from '../run-store.js';
import type { RunPhase } from '../run-store.js';
import { useMediaQuery } from '../use-media-query.js';
import { useVault } from '../vault-store.js';
import { Bird } from './bird.js';
import {
  BowerWorking,
  WORKING_STAGE_HEIGHT,
  workingLabel,
} from './bower-working.js';
import type { WorkingState } from './bower-working.js';
import { FolderMark } from './folder-mark.js';
import type { ParaKind } from './folder-mark.js';
import {
  IconCheck,
  IconClose,
  IconDoc,
  IconImage,
  IconNote,
  IconPdf,
} from './icons.js';
import { OVERLAY_PRIORITY } from '../overlay-queue.js';
import { Overlay } from './overlay.js';
import { Queued } from './queued-overlay.js';
import { RunSummary, summaryTiles } from './run-summary.js';
import '../styles/tidy-confirm-sheet.css';

/** How long the sheet stays up after the day's limit is reached. */
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
 * `starting` (#505) has no run yet, so it reuses `queued`'s bird and label.
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
 * shows off, so Home's Inbox card and anything else can never disagree at
 * the same moment.
 */
export function startedAgo(requestedAt: string, nowMs: number): string {
  return `Started ${sinceLabel(requestedAt, nowMs)}`;
}

/** The extra lines under the Done summary (spec A.3/A.5), shared with Home. */
export { doneNotes };

/** "Nothing was lost: your 3 things are still in the inbox, untouched." */
export function nothingLost(n: number): string {
  const are = n === 1 ? 'is' : 'are';
  return `Nothing was lost: your ${things(n)} ${are} still in the inbox, untouched.`;
}

/**
 * The demo's sentence under the steps (#363, `Demo-Working` board, handover
 * C.10): tidy up in the demo never runs the model, so this replaces the
 * usual note there. `lead` is set in amber, as the board draws it;
 * `demo/server.ts`'s scripted run is unchanged, this is copy only.
 */
export const DEMO_REASSURANCE_LEAD = 'A recording.';
export const DEMO_REASSURANCE_REST =
  'In the demo the bird plays back a real run in twenty seconds; nothing ' +
  'is sent to Claude, nothing costs anything. In your own Bower this ' +
  'takes three to five minutes.';

/** The time line's label while a run goes in the demo: the recording always
 * plays back the same twenty seconds, so "Started n min ago" has no meaning. */
export const DEMO_PLAYING_BACK = 'Playing back';

/** The stage's right-hand label before any destination is known. */
export const FOLDERS_FALLBACK = 'Your folders';

/** The note under a running run (R-SHEET element 11): the chip is "the
 * tidy-up bar", above the tabs on a phone and at the top on desktop. */
export function runningNote(desktop: boolean): string {
  return `You can close this. Bower carries on; the tidy-up bar ${
    desktop ? 'at the top' : 'above the tabs'
  } shows how it goes.`;
}

/** How many rows the sheet lists before "See everything": 4 on a phone, 8
 * from 900 px up (R-SHEET edge cases). */
export const SHEET_ROWS_PHONE = 4;
export const SHEET_ROWS_DESKTOP = 8;

/** While a run goes the sheet shows only the last of its rows. */
export const SHEET_LIVE_ROWS = 2;

export type SheetState = 'running' | 'done' | 'partial' | 'failed' | 'quota';

/**
 * Which of the four states the sheet draws (or `quota`), or `null` for none.
 * A finished run reads through its outcome: one that wrote or filed something
 * before it stopped is partly done. A stale run that never said why is "Did
 * not finish".
 */
export function sheetStateOf(
  phase: RunPhase,
  outcome: RunOutcome | null,
): SheetState | null {
  switch (phase) {
    case 'idle':
      return null;
    case 'quota':
      return 'quota';
    case 'starting':
    case 'queued':
    case 'running':
      return 'running';
    case 'done':
      return outcome?.state === 'partial' ? 'partial' : 'done';
    case 'failed':
    case 'stale':
      return outcome?.state === 'partial' ? 'partial' : 'failed';
  }
}

/** The dialog's name for a state (board aria-labels). */
export function sheetLabel(state: SheetState): string {
  switch (state) {
    case 'running':
      return 'Tidying up';
    case 'done':
      return 'Tidy-up done';
    case 'partial':
      return 'Tidy-up partly done';
    case 'failed':
      return 'Tidy-up did not finish';
    case 'quota':
      return 'Limit reached';
  }
}

function plural(n: number, one: string): string {
  return `${n} ${n === 1 ? one : `${one}s`}`;
}

/** The h2: "Tidying up 6 things", "Done", "Partly done", "Did not finish". */
export function sheetTitle(state: SheetState, total?: number): string {
  switch (state) {
    case 'running':
      return total === undefined
        ? 'Tidying up'
        : `Tidying up ${plural(total, 'thing')}`;
    case 'done':
      return 'Done';
    case 'partial':
      return 'Partly done';
    case 'failed':
      return 'Did not finish';
    case 'quota':
      return 'Limit reached';
  }
}

/** "13:52", the local time of an ISO stamp; empty when it does not parse. */
export function clockTime(iso: string | undefined): string {
  if (iso === undefined) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** "5 min", or "under a minute". */
export function minutesLabel(ms: number): string {
  const minutes = Math.round(Math.max(0, ms) / 60_000);
  return minutes < 1 ? 'under a minute' : `${minutes} min`;
}

/**
 * The line under the title: "Started 13:52 · 2 min so far · usually 3 to 6
 * min" while it goes, "13:52 to 13:57 · 5 min" when done, "13:44 to 13:51 ·
 * stopped after 7 min" when it stopped.
 */
export function sheetTimeLine(
  state: SheetState,
  outcome: RunOutcome | null,
  nowMs: number,
  demo = false,
): string {
  if (state === 'quota') return '';
  if (state === 'running') {
    if (demo) return DEMO_PLAYING_BACK;
    const started = clockTime(outcome?.startedAt);
    const startMs = Date.parse(outcome?.startedAt ?? '');
    if (started === '' || Number.isNaN(startMs)) {
      return 'Started just now · usually 3 to 6 min';
    }
    return `Started ${started} · ${minutesLabel(nowMs - startMs)} so far · usually 3 to 6 min`;
  }
  if (outcome === null) return '';
  const from = clockTime(outcome.startedAt);
  const to = clockTime(outcome.finishedAt);
  if (from === '' || to === '') return from === '' ? '' : `Started ${from}`;
  const length = minutesLabel(
    Date.parse(outcome.finishedAt ?? '') - Date.parse(outcome.startedAt),
  );
  return `${from} to ${to} · ${state === 'done' ? length : `stopped after ${length}`}`;
}

export type StepStatus = 'done' | 'active' | 'todo' | 'stopped';

export interface SheetStep {
  key: 'inbox' | 'read' | 'write' | 'file' | 'working';
  name: string;
  /** "2 of 5" on the writing step, "stopped" on the one that stopped. */
  detail?: string;
  status: StepStatus;
}

/** What a screen reader hears after a step's name. */
export const STEP_STATUS_TEXT: Record<StepStatus, string> = {
  done: 'done',
  active: 'in progress',
  todo: 'not started',
  stopped: 'stopped',
};

const STEP_PHASE_INDEX: Record<StepPhase, number> = {
  queued: 0,
  reading: 1,
  writing: 2,
  saving: 3,
};

/**
 * The steps (R-SHEET-5): four rows read off the run's `phase` while it goes,
 * or one indeterminate "Working on it" when it reports none. A partly done
 * run lists them all, with the last, "Filing and saving to Drive", stopped.
 * Done and failed runs list none.
 */
export function sheetSteps(
  state: SheetState,
  outcome: RunOutcome | null,
  done?: number,
): SheetStep[] {
  if (state !== 'running' && state !== 'partial') return [];
  const total = outcome?.total;
  const names = [
    'Got your inbox',
    total === undefined ? 'Read your things' : `Read ${plural(total, 'thing')}`,
    'Writing notes',
    'Filing and saving to Drive',
  ];
  const keys = ['inbox', 'read', 'write', 'file'] as const;
  if (state === 'partial') {
    return keys.map((key, index) => {
      const stopped = index === keys.length - 1;
      const step: SheetStep = {
        key,
        name: names[index] ?? '',
        status: stopped ? 'stopped' : 'done',
      };
      if (stopped) step.detail = 'stopped';
      return step;
    });
  }
  const phase = outcome?.phase;
  if (phase === undefined) {
    return [{ key: 'working', name: 'Working on it', status: 'active' }];
  }
  const at = STEP_PHASE_INDEX[phase];
  return keys.map((key, index) => {
    const step: SheetStep = {
      key,
      name: names[index] ?? '',
      status: index < at ? 'done' : index === at ? 'active' : 'todo',
    };
    if (key === 'write' && step.status === 'active') {
      if (done !== undefined && total !== undefined) {
        step.detail = `${done} of ${total}`;
      }
    }
    return step;
  });
}

/** The tag on a row. */
export const ACTION_TAG: Record<OutcomeAction, string> = {
  new: 'New note',
  updated: 'Updated',
  filed: 'Filed',
  needs: 'Needs you',
};

export interface SheetRow {
  key: string;
  title: string;
  tone: RowTone;
  /** The tag: New note, Updated, Filed, Needs you; none on a row being read. */
  action: OutcomeAction | null;
  /** The PARA landmark of the folder, or `null`. */
  para: ParaKind | null;
  /** "Projects › Flat hunt › Riverside", or a plain line when there is no
   * folder (a thing still in the inbox, one being read). */
  where: string;
  /** After the path: "was IMG_4471.jpg", what changed, why it needs you. */
  note: string | null;
}

const ACTION_ORDER: Record<OutcomeAction, number> = {
  needs: 0,
  new: 1,
  updated: 2,
  filed: 3,
};

/** The items with what needs the person first, then the rest in the order
 * the run reported them (R-SHEET element 9). */
export function needsFirst(items: readonly OutcomeItem[]): OutcomeItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        ACTION_ORDER[a.item.action] - ACTION_ORDER[b.item.action] ||
        a.index - b.index,
    )
    .map(({ item }) => item);
}

function toneOfName(name: string): RowTone {
  if (/\.md$/i.test(name)) return 'note';
  if (/\.pdf$/i.test(name)) return 'pdf';
  return /\.(jpe?g|png|gif|webp|heic|heif|avif)$/i.test(name)
    ? 'image'
    : 'file';
}

/** The folder a path sits in, as the row shows it, with its PARA mark. */
function whereOf(path: string | undefined): {
  para: ParaKind | null;
  where: string;
} {
  if (path === undefined) return { para: null, where: '' };
  const folders = path.split('/').slice(0, -1);
  if (folders.length === 0) return { para: null, where: '' };
  const top = folders[0] ?? '';
  return {
    para: paraKindOf(top),
    where: displayPath(folders.join('/'), ' › '),
  };
}

/** One outcome item as a row. `asideNotes` says why a set-aside item needs you. */
export function rowFor(
  item: OutcomeItem,
  asideNotes: ReadonlyMap<string, string | null> = new Map(),
): SheetRow {
  const at = item.action === 'filed' ? (item.to ?? item.path) : item.path;
  const { para, where } =
    item.action === 'needs' ? { para: null, where: '' } : whereOf(at);
  const notes: string[] = [];
  if (item.action === 'needs') {
    notes.push(asideNotes.get(item.path) ?? 'Still in your inbox');
  }
  if (item.from !== undefined && item.from !== item.title) {
    notes.push(`was ${item.from}`);
  }
  if (item.note !== undefined) notes.push(item.note);
  // A filed link reads by its host, never by its generated file name (#557).
  const title = linkTitleFromFileName(item.title) ?? item.title;
  return {
    key: `${item.action}:${item.path}`,
    title,
    tone: toneOfName(title),
    action: item.action,
    para,
    where,
    note: notes.length === 0 ? null : notes.join(' · '),
  };
}

/**
 * The rows a finished run lists: what needs you first, at most `limit`, and
 * how many more there are ("See everything" has them all).
 */
export function sheetRows(
  outcome: RunOutcome,
  limit: number,
  asideNotes: ReadonlyMap<string, string | null> = new Map(),
): { rows: SheetRow[]; more: number } {
  const ordered = needsFirst(outcome.items);
  return {
    rows: ordered.slice(0, limit).map((item) => rowFor(item, asideNotes)),
    more: Math.max(0, ordered.length - limit),
  };
}

/** The partial run's warn text (RUN-S3): what Bower did, where the notes are,
 * and what Finish the tidy-up does. */
export function partialFolder(outcome: RunOutcome): string | null {
  const note = outcome.items.find((item) => item.action === 'new');
  if (note === undefined) return null;
  const folder = note.path.split('/').slice(0, -1).join('/');
  return folder === '' ? null : folder;
}

export const FINISH_LINE =
  'Finish the tidy-up files them without writing the notes again.';

/**
 * A partly done run's two tiles, as the board draws them (RunSheet-Partial):
 * the new notes it wrote and what is still in the inbox. The filed and
 * updated counts are the bubble's and the rows' to tell.
 */
function PartialTiles({ outcome }: { outcome: RunOutcome }): JSX.Element {
  const tiles = summaryTiles(outcome).filter(
    (tile) => tile.key === 'new' || tile.key === 'left',
  );
  return (
    <ul
      class="run-summary-stats working-sheet-tiles"
      aria-label="What this tidy-up did"
    >
      {tiles.map((tile) => (
        <li
          key={tile.key}
          class={`run-summary-tile${tile.value === 0 ? ' run-summary-zero' : ''}${tile.warn ? ' run-summary-warn' : ''}`}
        >
          <span class="run-summary-value">{tile.value}</span>{' '}
          <span class="run-summary-label">{tile.label}</span>
        </li>
      ))}
    </ul>
  );
}

export interface WorkingSheetProps {
  phase: RunPhase;
  /** The current run, for its outcome. */
  run: Run | null;
  /** The run store's message (the day's limit, an error, …). */
  message?: string;
  /** The run store's shared clock (#513): "2 min so far" reads off this, not
   * its own timer, so it never disagrees with Home's own "started 2 min ago". */
  now: number;
  open: boolean;
  onDismiss: () => void;
  /**
   * Bumped by the caller each time the chip is tapped to bring the sheet
   * back during `done` / `failed` / `stale` / `quota`. Without this, a tap
   * after the linger has already elapsed would compute `sinceMs` from the
   * same old phase change and find it already expired, opening nothing.
   */
  reopenKey?: number;
  /** "Finish the tidy-up" and "Tidy up again": straight to the confirmation. */
  onTryAgain?: () => void;
}

function StatusIcon({ state }: { state: SheetState }): JSX.Element {
  return (
    <span
      class={`working-sheet-status working-sheet-status-${state}`}
      aria-hidden="true"
    >
      {state === 'running' ? (
        <span class="working-sheet-spinner" />
      ) : state === 'done' ? (
        <IconCheck />
      ) : state === 'partial' || state === 'quota' ? (
        <svg
          viewBox="0 0 24 24"
          class="icon"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 3l10 18H2L12 3z" />
          <path d="M12 10v5M12 18v.5" />
        </svg>
      ) : (
        <IconClose />
      )}
    </span>
  );
}

function RowIcon({ tone }: { tone: RowTone }): JSX.Element {
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

function Rows({ rows }: { rows: readonly SheetRow[] }): JSX.Element | null {
  if (rows.length === 0) return null;
  return (
    <ul class="working-sheet-rows" aria-label="What Bower did">
      {rows.map((row) => (
        <li key={row.key} class="working-sheet-row" data-action={row.action}>
          <RowIcon tone={row.tone} />
          <span class="working-sheet-row-body">
            <span class="working-sheet-row-title">{row.title}</span>
            <span class="working-sheet-row-where">
              {row.para !== null && <FolderMark kind={row.para} size={18} />}
              {row.para !== null && ' '}
              {[row.where, row.note]
                .filter((bit) => bit !== null && bit !== '')
                .join(' · ')}
            </span>
          </span>
          {row.action !== null && (
            <span class={`working-sheet-tag working-sheet-tag-${row.action}`}>
              {ACTION_TAG[row.action]}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Steps({ steps }: { steps: readonly SheetStep[] }): JSX.Element | null {
  if (steps.length === 0) return null;
  return (
    <ol class="working-sheet-steps" aria-label="Steps">
      {steps.map((step) => (
        <li
          key={step.key}
          class={`working-sheet-step working-sheet-step-${step.status}`}
        >
          <span class="working-sheet-step-mark" aria-hidden="true" />
          <span class="working-sheet-step-name">{step.name}</span>
          {step.detail !== undefined && (
            <span class="working-sheet-step-detail">{step.detail}</span>
          )}
          <span class="working-sheet-sr">{STEP_STATUS_TEXT[step.status]}</span>
        </li>
      ))}
    </ol>
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
  const { files } = useVault();
  const desktop = useMediaQuery('(min-width: 900px)');

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
    if (phase !== 'quota') return;
    const timer = setTimeout(() => {
      setTick((tick) => tick + 1);
    }, SHEET_LINGER_MS);
    return () => clearTimeout(timer);
  }, [phase, reopenKey]);

  const outcome = run === null ? null : outcomeFromRun(run);
  const state = sheetStateOf(phase, outcome);
  const visible =
    state !== null && sheetVisible(phase, Date.now() - sinceRef.current, !open);

  // A vanished folder is the recovery screen's to explain (R-VAULT).
  const vaultMissing =
    phase === 'failed' && failureReason(run?.reason) === 'vault_missing';

  if (!visible || state === null || vaultMissing) return null;

  const total =
    outcome?.total ?? (waiting.length > 0 ? waiting.length : undefined);
  const heading = sheetTitle(state, state === 'running' ? total : undefined);
  const timeLine = sheetTimeLine(state, outcome, now, isDemo());
  const steps = sheetSteps(
    state,
    outcome === null
      ? null
      : { ...outcome, ...(total === undefined ? {} : { total }) },
    run?.done,
  );
  const asideNotes = new Map(
    (run?.setAside ?? []).map((aside) => [aside.path, keptNote(aside)]),
  );
  const limit = desktop ? SHEET_ROWS_DESKTOP : SHEET_ROWS_PHONE;
  const finished =
    outcome !== null && (state === 'done' || state === 'partial')
      ? sheetRows(outcome, limit, asideNotes)
      : null;

  // The rows a run has filed so far, as they arrive: the last two.
  const liveSource =
    state === 'running'
      ? runRows({
          processed: run?.processed,
          waiting,
          files,
          active: true,
          items: run?.items,
          setAside: run?.setAside,
        })
      : [];
  const liveRows: SheetRow[] = liveSource
    .slice(-SHEET_LIVE_ROWS)
    .map((row) => ({
      key: `${row.status}:${row.path}`,
      title: row.title,
      tone: row.tone,
      action: row.status === 'filed' ? 'filed' : null,
      para: row.para,
      where:
        row.status === 'reading'
          ? readingLine(row.path)
          : (row.folderPath ?? row.destination ?? ''),
      note: row.status === 'filed' ? row.keptNote : null,
    }));

  const close = (
    <button
      type="button"
      class="tidy-confirm-button tidy-confirm-button-secondary"
      onClick={onDismiss}
    >
      Close
    </button>
  );
  const notNow = (
    <button
      type="button"
      class="tidy-confirm-button tidy-confirm-button-secondary"
      onClick={onDismiss}
    >
      Not now
    </button>
  );
  const again = (label: string): JSX.Element => (
    <button
      type="button"
      class="tidy-confirm-button"
      onClick={() => {
        onDismiss();
        onTryAgain?.();
      }}
    >
      {label}
    </button>
  );

  const reason = failureCopy(phase === 'failed' ? run?.reason : undefined);
  const stillIn =
    outcome !== null && outcome.left > 0 ? outcome.left : waiting.length;
  const folder = outcome === null ? null : partialFolder(outcome);

  return (
    <Queued id="working-sheet" priority={OVERLAY_PRIORITY.run}>
      <Overlay kind="sheet" label={sheetLabel(state)} onClose={onDismiss}>
        <div class={`working-sheet working-sheet-${state}`}>
          <div class="working-sheet-head">
            <StatusIcon state={state} />
            <div class="working-sheet-heading">
              <h2 class="working-sheet-title">{heading}</h2>
              {timeLine !== '' && (
                <p class="working-sheet-subline">{timeLine}</p>
              )}
            </div>
            <button
              type="button"
              class="working-sheet-close"
              aria-label="Close"
              onClick={onDismiss}
            >
              <IconClose />
            </button>
          </div>

          {state === 'running' && (
            <>
              <div
                class="working-sheet-stage"
                style={{ height: `${WORKING_STAGE_HEIGHT}px` }}
              >
                <span class="working-sheet-stage-line" aria-hidden="true" />
                <span class="working-sheet-stage-from">Inbox</span>
                <span class="working-sheet-stage-to">
                  {destinationsLabel(liveSource) ?? FOLDERS_FALLBACK}
                </span>
                <BowerWorking
                  state={
                    phase === 'starting' || phase === 'queued'
                      ? 'queued'
                      : 'running'
                  }
                  overlay
                />
              </div>
              <Steps steps={steps} />
              <Rows rows={liveRows} />
              <p class="working-sheet-note">
                {isDemo() ? (
                  <>
                    <b class="working-sheet-note-lead">
                      {DEMO_REASSURANCE_LEAD}
                    </b>{' '}
                    {DEMO_REASSURANCE_REST}
                  </>
                ) : (
                  runningNote(desktop)
                )}
              </p>
              <div class="working-sheet-actions">{close}</div>
            </>
          )}

          {(state === 'done' || state === 'partial') && outcome !== null && (
            <>
              {state === 'partial' ? (
                <PartialTiles outcome={outcome} />
              ) : (
                <RunSummary outcome={outcome} size="stats" />
              )}
              {state === 'done' && outcome.quote !== undefined && (
                <div class="working-sheet-say">
                  <Bird state="done" size={44} overlay />
                  <p class="working-sheet-say-text">{`${outcome.quote}.`}</p>
                </div>
              )}
              {state === 'done' &&
                doneNotes(run).map((note) => (
                  <p key={note} class="working-sheet-detail">
                    {note}
                  </p>
                ))}
              {state === 'partial' && (
                <div class="working-sheet-warn" role="note">
                  <p>{runSentence(outcome, { voice: 'third' })}</p>
                  {folder !== null && (
                    <p>
                      {'The new notes are in '}
                      <a href={folderHref(folder)} onClick={onDismiss}>
                        {displayPath(folder, ' › ')}
                      </a>
                      {'; your things are still in the inbox. '}
                      {FINISH_LINE}
                    </p>
                  )}
                  {folder === null && <p>{FINISH_LINE}</p>}
                </div>
              )}
              <Steps steps={steps} />
              {finished !== null && <Rows rows={finished.rows} />}
              <div class="working-sheet-actions">
                {state === 'done' ? (
                  <>
                    <a
                      class="tidy-confirm-button"
                      href={`${JUST_FILED_PATH}?run=${encodeURIComponent(run === null ? '' : runKey(run))}`}
                      onClick={onDismiss}
                    >
                      See everything
                    </a>
                    {close}
                  </>
                ) : (
                  <>
                    {again('Finish the tidy-up')}
                    {notNow}
                  </>
                )}
              </div>
            </>
          )}

          {state === 'failed' && (
            <>
              <p class="working-sheet-detail">{reason.sentence}</p>
              <p class="working-sheet-detail">
                {stillIn > 0 ? nothingLost(stillIn) : 'Nothing changed.'}
              </p>
              <p class="working-sheet-note">{reason.hint}</p>
              <div class="working-sheet-actions">
                {again('Tidy up again')}
                {notNow}
              </div>
            </>
          )}

          {state === 'quota' && (
            <>
              <p class="working-sheet-detail">
                {message ?? workingLabel('quota')}
              </p>
              <div class="working-sheet-actions">{close}</div>
            </>
          )}
        </div>
      </Overlay>
    </Queued>
  );
}
