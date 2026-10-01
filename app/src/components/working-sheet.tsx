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
import { durationWords } from '../activity.js';
import { linkTitleFromFileName } from '../add.js';
import { sinceLabel } from '../bower-tab.js';
import { doneNotes, things } from '../home.js';
import { JUST_FILED_PATH } from '../just-filed.js';
import {
  displayName,
  displayPath,
  folderHref,
  paraKindOf,
} from '../navigation.js';
import { failureCopy, failureReason } from '../run-failure.js';
import { groupByOrigin, pileOriginOf } from '../pile-groups.js';
import { outcomeFromRun, runSentence } from '../run-outcome.js';
import type { OutcomeAction, OutcomeItem, RunOutcome } from '../run-outcome.js';
import {
  keptNote,
  readingLine,
  runRows,
  waitingPaths,
} from '../run-progress.js';
import type { RowTone } from '../run-progress.js';
import { runKey } from '../run-store.js';
import type { RunPhase } from '../run-store.js';
import { useMediaQuery } from '../use-media-query.js';
import { useTitlesAt } from './use-note-titles.js';
import { useVault } from '../vault-store.js';
import { BowerWorking, workingLabel } from './bower-working.js';
import type { WorkingState } from './bower-working.js';
import { Badge } from './badge.js';
import type { BadgeTone } from './badge.js';
import type { ParaKind } from './folder-mark.js';
import { IconCheck, IconClose } from './icons.js';
import { ListRow } from './list-row.js';
import { kindLabel } from '../meta-line.js';
import { startedLine } from '../run-progress.js';
import { OVERLAY_PRIORITY } from '../overlay-queue.js';
import { Overlay } from './overlay.js';
import { Queued } from './queued-overlay.js';
import { RunMeaning } from './run-meaning.js';
import { RunSummary, summaryTiles, tileLabel } from './run-summary.js';
import { StatTile } from './card.js';
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
  'takes a few minutes.';

/** The time line's label while a run goes in the demo: the recording always
 * plays back the same twenty seconds, so "Started n min ago" has no meaning. */
export const DEMO_PLAYING_BACK = 'Playing back';

/**
 * The running title's count (R-AD-8): the count the run store kept when
 * this browser confirmed the tidy-up (the sticky's and the confirm's), else
 * the run's own total, else the inbox paths as the run began.
 */
export function runningTotal(
  startCount: number,
  outcomeTotal: number | undefined,
  waitingPaths = 0,
): number | undefined {
  if (startCount > 0) return startCount;
  if (outcomeTotal !== undefined) return outcomeTotal;
  return waitingPaths > 0 ? waitingPaths : undefined;
}

/** The link to Just filed, on the running and the Done sheet (K-30). */
export const SEE_WHAT_CHANGED = 'See what changed';

/** The running sheet's three steps (AD-Running): the stage's two ends and
 * the group over the thing being read. */
export const RUNNING_STEPS = [
  'Inbox',
  'Your folders',
  'Working on it',
] as const;

/** The running sheet's last line, around its "See what changed" link. */
export const RUNNING_NOTE_LEAD = 'You can close this: the tidy-up carries on.';
export const RUNNING_NOTE_TAIL = 'when it is done.';

/** The running sheet's stage and bird (AD-Running: 118 high, bird 70). */
export const RUNNING_STAGE_HEIGHT = 118;
export const RUNNING_BIRD_SIZE = 70;

/** The ✕'s name: the result's own on the Done sheet (AR-Run). */
export function closeLabelFor(
  state: SheetState,
): 'Close the tidy-up' | 'Close the tidy-up result' {
  return state === 'done' ? 'Close the tidy-up result' : 'Close the tidy-up';
}

/** How many rows the sheet lists before "See everything": 4 on a phone, 8
 * from 900 px up (R-SHEET edge cases). */
export const SHEET_ROWS_PHONE = 4;
export const SHEET_ROWS_DESKTOP = 8;

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
  // The words Just filed and Activity use for the same run (#950 T950-6).
  const length = durationWords(
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
  answered: 'Answered',
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
  /** "From your pile: “…”" when the item came out of a pile (R-PILE-5). */
  origin?: string;
  /** The root whose colour the glyph takes when it is not the folder's
   * (the thing being read is still in the inbox). */
  iconRoot?: ParaKind | null;
  /** The file name with its extension, for the kind in words and the icon
   * (the title drops it, K-17). */
  name?: string;
  /** Where the item is now (a Bower answer's note, for its title). */
  path?: string;
}

const ACTION_ORDER: Record<OutcomeAction, number> = {
  needs: 0,
  new: 1,
  answered: 2,
  updated: 3,
  filed: 4,
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
  // The pile is looked up by the name the file had in the inbox.
  const origin =
    item.action === 'filed' || item.action === 'needs'
      ? pileOriginOf(
          item.from ?? item.path.slice(item.path.lastIndexOf('/') + 1),
        )
      : undefined;
  return {
    key: `${item.action}:${item.path}`,
    path: at,
    title,
    name: (at ?? item.path).slice((at ?? item.path).lastIndexOf('/') + 1),
    tone: toneOfName(title),
    action: item.action,
    para,
    where,
    note: notes.length === 0 ? null : notes.join(' · '),
    ...(origin === undefined ? {} : { origin }),
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
  'Finishing the tidy-up files them, without writing the notes again.';

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
          aria-label={`${tile.value} ${tile.label}`}
        >
          <StatTile label={tileLabel(tile.key)} value={tile.value} />
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
  /** The confirmed count of a run this browser started (R-AD-8, the run
   * store's `keptCount`); `null` falls back to the run's own total. */
  count?: number | null;
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

/** Rows under "From your pile: …" headings when any came from a pile
 * (R-PILE-5); the rest sit under "Added from elsewhere". */
function Rows({ rows }: { rows: readonly SheetRow[] }): JSX.Element | null {
  if (rows.length === 0) return null;
  const groups = groupByOrigin(rows, (row) => row.origin);
  if (groups.length === 1 && groups[0]?.origin === undefined) {
    return <RowList rows={rows} />;
  }
  return (
    <>
      {groups.map((group) => (
        <section key={group.origin ?? 'elsewhere'} class="working-sheet-pile">
          <h3 class="working-sheet-pile-heading">
            {group.origin ?? 'Added from elsewhere'}
          </h3>
          <RowList rows={group.rows} />
        </section>
      ))}
    </>
  );
}

/** Whether `path` is a saved link's note (Add's `Link - host …` name). */
function isLinkPath(path: string | undefined): boolean {
  if (path === undefined) return false;
  return linkTitleFromFileName(path.slice(path.lastIndexOf('/') + 1)) !== null;
}

/** The Badge tone of each row tag (AR-Run: "Filed"). */
const ACTION_TONE: Record<OutcomeAction, BadgeTone> = {
  new: 'new',
  answered: 'filed',
  updated: 'done',
  filed: 'filed',
  needs: 'check',
};

/** One row as the boards draw it (AR-Run, AD-Running): a ListRow with the
 * kind in words, the folder after its root dot, and the tag as a Badge. */
function SheetListRow({ row }: { row: SheetRow }): JSX.Element {
  const name = row.name ?? row.title;
  // A Bower answer reads as on Home (#920): the bird, "Bower answer".
  const answer = row.action === 'answered';
  const kind = kindLabel({ name, mimeType: '', bowerWritten: answer, answer });
  const title =
    linkTitleFromFileName(name) === null ? displayName(row.title) : row.title;
  const meta = [kind, row.note]
    .filter((bit): bit is string => bit !== null && bit !== '')
    .join(' · ');
  return (
    <li class="working-sheet-row" data-action={row.action}>
      <ListRow
        item={{
          id: row.key,
          title,
          name,
          mimeType: '',
          root: row.iconRoot ?? row.para,
          bowerWritten: answer,
        }}
        meta={meta}
        {...(row.where === ''
          ? {}
          : { where: { name: row.where, root: row.para } })}
        badge={
          row.action === null ? undefined : (
            <Badge tone={ACTION_TONE[row.action]}>
              {ACTION_TAG[row.action]}
            </Badge>
          )
        }
      />
    </li>
  );
}

function RowList({ rows }: { rows: readonly SheetRow[] }): JSX.Element {
  return (
    <ul class="working-sheet-rows" aria-label="What Bower did">
      {rows.map((row) => (
        <SheetListRow key={row.key} row={row} />
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
  count = null,
}: WorkingSheetProps): JSX.Element | null {
  const { files } = useVault();
  const desktop = useMediaQuery('(min-width: 900px)');

  // The inbox as the run began: the listing the first time the sheet sees
  // this run (and has a listing at all), kept until the next run.
  const waitingRef = useRef<{
    key: string;
    paths: string[];
  } | null>(null);
  if (run !== null && files.length > 0) {
    const key = runKey(run);
    if (waitingRef.current?.key !== key) {
      waitingRef.current = {
        key,
        paths: waitingPaths(files),
      };
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

  // A Bower answer takes the title every list gives it (#920). A hook, so
  // before the early return.
  // A filed link likewise takes the tree's and the note's title, never
  // the host alone its file name holds (#950 T950-5).
  const answerTitles = useTitlesAt(
    (outcome?.items ?? [])
      .map((item) =>
        item.action === 'filed' ? (item.to ?? item.path) : item.path,
      )
      .filter(
        (path, at) =>
          outcome?.items[at]?.action === 'answered' || isLinkPath(path),
      ),
    files,
  );

  if (!visible || state === null || vaultMissing) return null;

  const total = runningTotal(count ?? 0, outcome?.total, waiting.length);
  const heading = sheetTitle(state, state === 'running' ? total : undefined);
  const timeLine =
    state === 'running'
      ? startedLine(run)
      : sheetTimeLine(state, outcome, now, isDemo());
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
  const sheet =
    outcome !== null && (state === 'done' || state === 'partial')
      ? sheetRows(outcome, limit, asideNotes)
      : null;
  const finished =
    sheet === null
      ? null
      : {
          ...sheet,
          rows: sheet.rows.map((row) => {
            const title =
              row.path === undefined ? undefined : answerTitles.get(row.path);
            return title !== undefined &&
              (row.action === 'answered' || isLinkPath(row.path))
              ? { ...row, title }
              : row;
          }),
        };

  // The thing the run is on now (AD-Running "Working on it"): the last row
  // the run reports as being read, when it reports one.
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
  const reading = [...liveSource]
    .reverse()
    .find((row) => row.status === 'reading');
  const currentRow: SheetRow | null =
    reading === undefined
      ? null
      : {
          key: `reading:${reading.path}`,
          title: reading.title,
          name: reading.path.slice(reading.path.lastIndexOf('/') + 1),
          tone: reading.tone,
          action: null,
          para: null,
          // Still in the inbox: its glyph in the Inbox colour, as the pile
          // rows draw it (AD-Running).
          iconRoot: 'inbox',
          where: '',
          note: readingLine(reading.path).toLowerCase(),
        };

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
  const changedHref = `${JUST_FILED_PATH}${
    run === null ? '' : `?run=${encodeURIComponent(runKey(run))}`
  }`;
  const seeWhatChanged = (
    <a class="working-sheet-link" href={changedHref} onClick={onDismiss}>
      {SEE_WHAT_CHANGED}
    </a>
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
            {state !== 'running' && <StatusIcon state={state} />}
            <div class="working-sheet-heading">
              <h2 class="working-sheet-title">{heading}</h2>
              {timeLine !== '' && (
                <p class="working-sheet-subline">{timeLine}</p>
              )}
            </div>
            <button
              type="button"
              class="icon-button working-sheet-close"
              aria-label={closeLabelFor(state)}
              onClick={onDismiss}
            >
              <IconClose />
            </button>
          </div>

          {state === 'running' && (
            <>
              <div
                class="working-sheet-stage"
                style={{ height: `${RUNNING_STAGE_HEIGHT}px` }}
              >
                <span class="working-sheet-stage-line" aria-hidden="true" />
                <span class="working-sheet-stage-from">{RUNNING_STEPS[0]}</span>
                <span class="working-sheet-stage-to">{RUNNING_STEPS[1]}</span>
                <BowerWorking
                  state={
                    phase === 'starting' || phase === 'queued'
                      ? 'queued'
                      : 'running'
                  }
                  size={RUNNING_BIRD_SIZE}
                  overlay
                />
              </div>
              {currentRow !== null && (
                <h3 class="working-sheet-group">{RUNNING_STEPS[2]}</h3>
              )}
              {currentRow !== null && (
                <ul class="working-sheet-rows" aria-label="Working on it">
                  <SheetListRow row={currentRow} />
                </ul>
              )}
              <p class="working-sheet-note">
                {RUNNING_NOTE_LEAD} {seeWhatChanged} {RUNNING_NOTE_TAIL}
              </p>
              {isDemo() && (
                <p class="working-sheet-note">
                  <b class="working-sheet-note-lead">{DEMO_REASSURANCE_LEAD}</b>{' '}
                  {DEMO_REASSURANCE_REST}
                </p>
              )}
            </>
          )}

          {(state === 'done' || state === 'partial') && outcome !== null && (
            <>
              {state === 'partial' ? (
                <PartialTiles outcome={outcome} />
              ) : (
                <RunSummary outcome={outcome} size="stats" />
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
              {state === 'done' && (
                <RunMeaning outcome={outcome} onNavigate={onDismiss} />
              )}
              <Steps steps={steps} />
              {finished !== null && <Rows rows={finished.rows} />}
              {state === 'done' ? (
                <div class="working-sheet-actions">
                  <a
                    class="tidy-confirm-button working-sheet-see"
                    href={changedHref}
                    onClick={onDismiss}
                  >
                    {SEE_WHAT_CHANGED}
                  </a>
                </div>
              ) : (
                <div class="working-sheet-actions">
                  {again('Finish the tidy-up')}
                  {notNow}
                </div>
              )}
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
            <p class="working-sheet-detail">
              {message ?? workingLabel('quota')}
            </p>
          )}
        </div>
      </Overlay>
    </Queued>
  );
}
