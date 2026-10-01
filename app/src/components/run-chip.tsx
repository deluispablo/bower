/**
 * The tidy-up bar and chip (R-CHIP, D5, D24, D31): one component in four
 * states (running, done, partly done, did not finish). On a phone it is the
 * docked row above the tab bar, from 900 px a pill in the top bar; both are
 * the shell's `tidyBar` slot (#741), so placement is the layout's job and
 * this file only fills the slot. `RunChipFiller` does that, once, for the whole
 * app: it hides on Home (the greeting carries the run there), on the routes
 * with no shell, and on a phone while a text field has focus (the on-screen
 * keyboard is open, R-CHIP-6).
 *
 * The chip is `role="status"`. What the live region says is a fixed sentence
 * that changes only when the state does, never on the minute tick, so a
 * state change is announced once. The button inside carries the full
 * sentence as its accessible name. There is no dismiss: opening the sheet
 * is the acknowledgement (`run-store.tsx` keeps the seen flag).
 */

import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';

import { isDemo } from '../api.js';
import { JUST_FILED_PATH } from '../just-filed.js';
import type { Run } from '../api.js';
import { outcomeCounts, outcomeFromRun } from '../run-outcome.js';
import { RUN_CHIP_LIFETIME_MS, runningCount, useRun } from '../run-store.js';
import type { RunPhase } from '../run-store.js';
import { usesShell } from '../shell-routes.js';
import { mediaMatches, useMediaQuery } from '../use-media-query.js';
import { Bird } from './bird.js';
import type { BirdState } from './bird.js';
import { useBirdRoom } from './bower-ledge.js';
import { useShellSlot } from './shell-slots.js';

import '../styles/run-chip.css';

export type ChipState = 'running' | 'done' | 'partial' | 'failed';

export interface ChipModel {
  state: ChipState;
  /** The bold words. */
  title: string;
  /** The muted words after (or under) it. */
  detail: string;
  /** The button's accessible name. */
  name: string;
  /** What the live region says: fixed while the state stands. */
  announce: string;
  /** Changes when anything visible does; keeps the slot content stable. */
  signature: string;
}

export interface ChipInput {
  phase: RunPhase;
  run: Run | null;
  lastFinished: Run | null;
  resultSeen: boolean;
  now: number;
  desktop: boolean;
  /** The run store's kept, confirmed count (R-AD-8). */
  count?: number | null;
}

function plural(n: number, one: string): string {
  return `${n} ${one}${n === 1 ? '' : 's'}`;
}

function minutesSince(startedAt: string, now: number): number | null {
  const start = Date.parse(startedAt);
  if (Number.isNaN(start)) return null;
  return Math.max(1, Math.floor((now - start) / 60_000));
}

function finish(model: Omit<ChipModel, 'signature'>): ChipModel {
  return {
    ...model,
    signature: `${model.state}|${model.title}|${model.detail}|${model.name}`,
  };
}

function runningModel(input: ChipInput): ChipModel {
  const active = input.run;
  const total = runningCount(input.count ?? null, active?.total);
  const things = total === undefined ? '' : plural(total, 'thing');
  const started = active?.startedAt ?? active?.requestedAt;
  const minutes =
    started === undefined ? null : minutesSince(started, input.now);
  const time = minutes === null ? '' : `${minutes} min`;
  const soFar = minutes === null ? '' : `, ${plural(minutes, 'minute')} so far`;
  const lead = things === '' ? 'Tidying up' : `Tidying up ${things}`;
  const join = (parts: string[]): string => parts.filter(Boolean).join(' · ');
  return finish({
    state: 'running',
    title: input.desktop ? 'Tidying up' : lead,
    detail: input.desktop ? join([things, time]) : time,
    name: `${lead}${soFar}. Show progress`,
    announce: lead,
  });
}

/**
 * The phone's partial meta line leads with what is left, so the count that
 * matters is never the part a narrow bar cuts (#847): "1 still in your
 * inbox · 1 filed · 1 new".
 */
export function phonePartialDetail(left: number, counts: string): string {
  if (left <= 0) return counts;
  const tail = `${left} still in your inbox`;
  const rest = counts.split(' · ').filter((part) => part !== tail);
  return [tail, ...rest].join(' · ');
}

function finishedModel(run: Run, input: ChipInput): ChipModel | null {
  const outcome = outcomeFromRun(run);
  if (outcome.state === 'running') return null;
  const counts = outcomeCounts(outcome, { short: true });
  const spoken = outcomeCounts(outcome).split(' · ').join(', ');
  if (outcome.state === 'done') {
    // E-9 (lead ruling): no "Done · N filed" pill on desktop; the Home
    // bubble and "See what changed" are the way in. The phone keeps it.
    if (input.desktop) return null;
    const name = `Tidy-up done: ${spoken === '' ? 'nothing new' : spoken}. See what changed`;
    return finish({
      state: 'done',
      title: 'Done',
      detail: counts === '' ? 'nothing new' : counts,
      name,
      announce: name,
    });
  }
  if (outcome.state === 'partial') {
    const inbox =
      outcome.left > 0 ? `${outcome.left} still in your inbox` : counts;
    const said =
      outcome.left > 0
        ? `Tidy-up partly done, ${plural(outcome.left, 'thing')} still in your inbox.`
        : 'Tidy-up partly done.';
    const name = `${said} ${input.desktop ? 'Finish it' : 'See what happened'}`;
    return finish({
      state: 'partial',
      title: 'Partly done',
      detail: input.desktop ? inbox : phonePartialDetail(outcome.left, counts),
      name,
      announce: name,
    });
  }
  const name = 'Tidy-up did not finish. Nothing changed. Show why';
  return finish({
    state: 'failed',
    title: 'Did not finish',
    detail: 'nothing changed',
    name,
    announce: name,
  });
}

/**
 * What the chip shows, or `null` for no chip. Running shows while a run is
 * starting, queued or running; a result stays until the sheet has been opened
 * or for 24 hours.
 */
export function chipModel(input: ChipInput): ChipModel | null {
  if (
    input.phase === 'starting' ||
    input.phase === 'queued' ||
    input.phase === 'running'
  ) {
    return runningModel(input);
  }
  const run = input.lastFinished;
  if (run === null || input.resultSeen) return null;
  const ended = Date.parse(run.finishedAt ?? run.requestedAt);
  if (Number.isNaN(ended) || input.now - ended >= RUN_CHIP_LIFETIME_MS) {
    return null;
  }
  return finishedModel(run, input);
}

const NON_TEXT_INPUTS = [
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
];

/** Whether `target` is somewhere the on-screen keyboard opens for. */
export function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) {
    return !NON_TEXT_INPUTS.includes(target.type);
  }
  const editable = target.getAttribute('contenteditable');
  return (
    target.isContentEditable ||
    editable === '' ||
    editable === 'true' ||
    editable === 'plaintext-only'
  );
}

/** Whether a text field has focus right now (R-CHIP-6). */
export function useTextFieldFocus(): boolean {
  const [typing, setTyping] = useState(
    () =>
      typeof document !== 'undefined' && isTextField(document.activeElement),
  );
  useEffect(() => {
    const onIn = (event: FocusEvent): void => {
      setTyping(isTextField(event.target));
    };
    const onOut = (event: FocusEvent): void => {
      setTyping(isTextField(event.relatedTarget));
    };
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    // #927: a field focused between the first render and this post-paint
    // effect sent its focusin before anyone listened; read it once now.
    setTyping(isTextField(document.activeElement));
    return () => {
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
    };
  }, []);
  return typing;
}

function Spinner(): JSX.Element {
  return (
    <svg
      class="run-chip-icon run-chip-spin"
      viewBox="0 0 20 20"
      width="20"
      height="20"
      aria-hidden="true"
    >
      <circle class="run-chip-track" cx="10" cy="10" r="7.5" />
      <path class="run-chip-arc" d="M10 2.5a7.5 7.5 0 0 1 7.5 7.5" />
    </svg>
  );
}

function StateIcon({ state }: { state: ChipState }): JSX.Element {
  if (state === 'running') return <Spinner />;
  const path =
    state === 'done'
      ? 'M4 10.5l4 4 8-9'
      : state === 'partial'
        ? 'M10 3l8 14H2zM10 8v4M10 14.5v.01'
        : 'M5 5l10 10M15 5L5 15';
  return (
    <svg
      class="run-chip-icon"
      viewBox="0 0 20 20"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

function Chevron({ up }: { up: boolean }): JSX.Element {
  return (
    <svg
      class="run-chip-chevron"
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={up ? 'M5 12.5l5-5 5 5' : 'M5 7.5l5 5 5-5'} />
    </svg>
  );
}

/** The bar bird's pose per chip state; none for "did not finish". */
export function barBirdState(state: ChipState): BirdState | null {
  switch (state) {
    case 'running':
      return 'flying';
    case 'done':
      return 'done';
    case 'partial':
      return 'confused';
    case 'failed':
      return null;
  }
}

export interface RunChipProps {
  model: ChipModel;
  desktop: boolean;
  onOpen: () => void;
}

export function RunChip({ model, desktop, onOpen }: RunChipProps): JSX.Element {
  // Set after mount, so a chip that appears is announced like one that changes.
  const [said, setSaid] = useState('');
  useEffect(() => {
    setSaid(model.announce);
  }, [model.announce]);
  const seeLink =
    !desktop && model.state !== 'running' && model.state !== 'failed';
  // The phone bar's bird (R-BIRD-5): only below 900 px (`desktop` comes from
  // `use-media-query.ts`, so a hidden bird is never rendered), not under
  // reduced motion, and only while no other bird is on screen.
  const barBird = barBirdState(model.state);
  const room = useBirdRoom(
    !desktop &&
      barBird !== null &&
      !mediaMatches('(prefers-reduced-motion: reduce)'),
    true,
  );
  return (
    <div
      class={`run-chip run-chip--${model.state} run-chip--${desktop ? 'desktop' : 'phone'}`}
      role="status"
      aria-live="polite"
    >
      <span class="run-chip-announce">{said}</span>
      <button
        type="button"
        class="run-chip-button"
        aria-label={model.name}
        onClick={onOpen}
      >
        <span key={model.state} class="run-chip-face" aria-hidden="true">
          {room && barBird !== null ? (
            <span class="run-chip-bird">
              <Bird state={barBird} size={40} />
            </span>
          ) : (
            <StateIcon state={model.state} />
          )}
          <span class="run-chip-text">
            <strong class="run-chip-title">{model.title}</strong>
            {model.detail !== '' && (
              <span class="run-chip-detail">{model.detail}</span>
            )}
          </span>
          {seeLink && <span class="run-chip-see">See</span>}
          {(desktop || model.state === 'running') && <Chevron up={!desktop} />}
        </span>
      </button>
    </div>
  );
}

/**
 * Fills the shell's `tidyBar` slot; renders nothing itself. Mounted once,
 * inside the shell slots provider, by `RunChipHost` (`run-chip-host.tsx`),
 * which loads this module after start so the chip stays out of the startup
 * budget (#41).
 */
/** The room the phone chip takes: its 52 px bar and the 8 px around it. */
export const RUN_CHIP_SPACE = '68px';

export function RunChipFiller(): null {
  const { phase, run, lastFinished, resultSeen, now, openSheet, keptCount } =
    useRun();
  const { path } = useLocation();
  const desktop = useMediaQuery('(min-width: 900px)');
  const typing = useTextFieldFocus();

  const model = chipModel({
    phase,
    run,
    lastFinished,
    resultSeen,
    now,
    desktop,
    count: keptCount,
  });
  // Home's greeting carries the run there (D31); the routes with no shell
  // (onboarding, the intro) have no slot to fill (R-CHIP-5).
  const hidden =
    model === null ||
    path === '/' ||
    // Just filed is where the finished chip leads: there it would only
    // repeat the page (DB-7). Running, partly done and failed still show.
    (path === JUST_FILED_PATH && model.state === 'done') ||
    !usesShell(path, isDemo()) ||
    (!desktop && typing);
  const signature = model === null || hidden ? '' : model.signature;
  const content = useMemo(
    () =>
      model === null || hidden ? null : (
        <RunChip model={model} desktop={desktop} onOpen={openSheet} />
      ),
    // `model` is rebuilt every tick; `signature` says when it really changed.
    [signature, desktop, openSheet],
  );
  useShellSlot('tidyBar', content);
  // The phone chip sits over the page above the tab bar: while it shows, the
  // page keeps room for it at its end (`--run-chip-space`, `layout.css`),
  // so it never covers the last of the content (#936 gate).
  const reserve = !desktop && content !== null;
  useEffect(() => {
    const root = document.documentElement;
    if (reserve) root.style.setProperty('--run-chip-space', RUN_CHIP_SPACE);
    else root.style.removeProperty('--run-chip-space');
    return () => root.style.removeProperty('--run-chip-space');
  }, [reserve]);
  return null;
}
