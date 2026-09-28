/**
 * Pure helpers for the Home screen (#321, handover C.4 and the Phone-Home
 * boards): which of its states Home is in, the time-of-day greeting, the
 * bird's speech bubble, which pose the bird holds, and the two cards' text.
 * No Preact, no Drive: unit-tested directly (`home.test.ts`).
 */

import type { Run } from './api.js';
import type { BirdState } from './components/bird-classes.js';
import { relativeTime } from './navigation.js';
import type { RunPhase } from './run-store.js';

/** The folder Bower writes answers to (spec §6, Home and Tell Bower rows). */
export const ANSWERS_FOLDER = 'Answers';

/**
 * Home's states (C.4): things waiting, the first day (nothing waiting and
 * no tidy-up yet), a run in flight, a run that finished, a run that did
 * not. Editing pins is a flag on top of these (`BubbleInput.editingPins`),
 * not a state of its own: the cards stay as they are. `loading` (#322, C.2)
 * is not on that table: it is what Home shows instead of Empty while the
 * folder index has not resolved yet, so a first day is never reported as
 * fact before we know it is one.
 */
export type HomeState =
  'waiting' | 'empty' | 'running' | 'done' | 'failed' | 'loading';

export interface HomeStateInput {
  /** The run store's phase (`run-store.tsx`). */
  phase: RunPhase;
  /** Files waiting in the inbox (`pendingCount`). */
  pending: number;
  /** The last run that finished (`RunStore.lastFinished`), or `null`. */
  lastFinished: Run | null;
  /** The folder index has not resolved yet (`VaultStatus === 'loading'`). */
  loading: boolean;
}

/**
 * The state, highest precedence first: a run in flight; a run that stopped
 * without finishing (it stays until the next run); a run that just
 * finished (the run store's `done`, which lasts a few seconds); things in
 * the inbox; a run that finished before (Done, from the run store's own
 * `lastFinished` — already known, whether or not the folder index has
 * loaded); the index still loading (#322, only once nothing above already
 * answers the question); nothing waiting and never tidied (the first day).
 */
export function homeStateFor(input: HomeStateInput): HomeState {
  const { phase, pending, lastFinished, loading } = input;
  if (phase === 'queued' || phase === 'running') return 'running';
  if (phase === 'failed' || phase === 'stale') return 'failed';
  if (phase === 'done') return 'done';
  if (pending > 0) return 'waiting';
  if (lastFinished !== null) return 'done';
  return loading ? 'loading' : 'empty';
}

type DayPart = 'morning' | 'afternoon' | 'evening';

/** Morning before noon, afternoon before 6 pm, evening after. */
function dayPart(date: Date): DayPart {
  const hour = date.getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/**
 * "Good morning, Alex" / "Good evening" alone when there is no name — the
 * Worker's `/me` may not return one (`Me.name` is optional); never invented
 * here or anywhere else.
 */
export function greetingFor(date: Date, name?: string): string {
  const greeting = `Good ${dayPart(date)}`;
  return name === undefined || name.trim() === ''
    ? greeting
    : `${greeting}, ${name}`;
}

function plural(n: number, singular: string, plural_ = `${singular}s`): string {
  return n === 1 ? singular : plural_;
}

/** "3 things" / "1 thing". */
function things(n: number): string {
  return `${n} ${plural(n, 'thing')}`;
}

/** What a run did: the things it filed and the questions it answered. */
export interface RunCounts {
  filed: number;
  answered: number;
}

/** The name the app gives a message to Bower (`tell.ts#instructionFileName`). */
const MESSAGE_PREFIX = 'Bower - ';

/**
 * A run's counts from `run.processed`: a message the app wrote for Bower
 * (a file named "Bower - …", `tell.ts`) counts as answered, everything
 * else as filed. The runner reports no finer split yet.
 */
export function runCounts(run: Run): RunCounts {
  let answered = 0;
  let filed = 0;
  for (const path of run.processed ?? []) {
    const name = path.slice(path.lastIndexOf('/') + 1);
    if (name.startsWith(MESSAGE_PREFIX)) answered += 1;
    else filed += 1;
  }
  return { filed, answered };
}

/** The Last tidy-up card's line: "4 filed · 1 answered" (either half left
 * out at zero), "Nothing new" when both are, "Failed" for a failed run. */
export function lastTidyUpLine(run: Run): string {
  if (run.state === 'failed') return 'Failed';
  const { filed, answered } = runCounts(run);
  const parts: string[] = [];
  if (filed > 0) parts.push(`${filed} filed`);
  if (answered > 0) parts.push(`${answered} answered`);
  return parts.length === 0 ? 'Nothing new' : parts.join(' · ');
}

/**
 * When a run finished, for the Last tidy-up card: "just now", "12 min ago",
 * "2 h ago", then "yesterday", "3 days ago" (`relativeTime`).
 */
export function tidyUpAgo(iso: string, now: number): string {
  const diffMs = Math.max(0, now - Date.parse(iso));
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return relativeTime(iso, now);
}

/**
 * "Bower set aside 2 files that contained instructions…" (spec A.5):
 * files the pre-scan moved to `0-Inbox/Quarantine/` this run.
 */
export function quarantinedMessage(n: number): string {
  return (
    `Bower set aside ${n} ${plural(n, 'file')} that contained instructions. ` +
    'Look at them in Drive and move them back if they are fine.'
  );
}

/**
 * "1 change was refused; nothing was lost." (spec A.3): changes the
 * post-run audit reverted this run.
 */
export function refusedMessage(n: number): string {
  const was = n === 1 ? 'was' : 'were';
  return `${n} ${plural(n, 'change')} ${was} refused; nothing was lost.`;
}

/**
 * A piece of the bubble: plain text, or a link the screen wires up —
 * Tidy up (the run store's `tidyUp`), See what I did (the Bower tab), or
 * the failure (the working sheet, which says what happened).
 */
export type BubblePart =
  string | { link: 'tidy-up' | 'activity' | 'failure'; text: string };

export interface BubbleInput {
  state: HomeState;
  /** Files waiting in the inbox (`pendingCount`). */
  pending: number;
  /** No network right now (`useOnline()`). */
  offline: boolean;
  /** The listing failed to load and there is nothing cached to show. */
  error: boolean;
  /** The Pinned grid is in its edit mode (Phone-Home-Pins board). */
  editingPins: boolean;
  /** The last finished run, for Done's counts (`RunStore.lastFinished`). */
  lastFinished: Run | null;
}

/** "3 things filed and 1 question answered", either half left out at 0. */
function doneCounts(run: Run | null): string {
  const { filed, answered } =
    run === null ? { filed: 0, answered: 0 } : runCounts(run);
  const parts: string[] = [];
  if (filed > 0) parts.push(`${things(filed)} filed`);
  if (answered > 0) {
    parts.push(`${answered} ${plural(answered, 'question')} answered`);
  }
  return parts.length === 0 ? 'Nothing new this time' : parts.join(' and ');
}

/**
 * What the run set aside or had refused (spec A.3/A.5), after Done: the
 * pre-scan's count first, then the post-run audit's. Both show when both
 * are present; neither when both are absent or zero. The working sheet
 * shows the same lines.
 */
export function doneNotes(run: Run | null): string[] {
  const notes: string[] = [];
  const quarantined = run?.quarantined?.length ?? 0;
  if (quarantined > 0) notes.push(quarantinedMessage(quarantined));
  const refused = run?.refused?.length ?? 0;
  if (refused > 0) notes.push(refusedMessage(refused));
  return notes;
}

/**
 * The bird's speech bubble on Home, as the boards write it (Phone-Home,
 * -Empty, -Running, -Done, -Failed, -Pins). No signal and a listing that
 * failed to load come first: nothing else can be said with confidence.
 */
export function bubbleFor(input: BubbleInput): BubblePart[] {
  const { state, pending, offline, error, editingPins, lastFinished } = input;
  if (offline) return ["No signal here. I'll keep an eye out."];
  if (error) return ['Could not load your notes.'];
  switch (state) {
    case 'loading':
      return ['Looking for what is waiting for you.'];
    case 'waiting':
      if (editingPins) return [`${things(pending)} in your inbox.`];
      return [
        `${things(pending)} in your inbox. `,
        { link: 'tidy-up', text: 'Tidy up' },
        ' when you have added everything.',
      ];
    case 'empty':
      return [
        'Welcome. Add a few things from your phone or your Drive, then tap Tidy up once. I file them where they belong; you can always ask me for more.',
      ];
    case 'running':
      return [
        `Tidying up ${things(pending)}. Takes a few minutes; I'll say when I'm done. You can keep adding.`,
      ];
    case 'done': {
      const notes = doneNotes(lastFinished);
      return [
        `All tidy. ${doneCounts(lastFinished)}. `,
        { link: 'activity', text: 'See what I did' },
        '.',
        ...notes.map((note) => ` ${note}`),
      ];
    }
    case 'failed': {
      const are = pending === 1 ? 'is' : 'are';
      return [
        `I couldn't finish. Nothing was lost; your ${things(pending)} ${are} still in the inbox. `,
        { link: 'failure', text: 'Try again' },
        '.',
      ];
    }
  }
}

/** What `birdStateFor` needs: the state, the network, a run just done. */
export interface BirdStateInput {
  state: HomeState;
  offline: boolean;
  /** The run store is at `done`: the dance, once. */
  justDone: boolean;
}

/**
 * The bird's pose on Home, as the boards draw it: Looking while things
 * wait (and while editing pins, and while the index is still loading,
 * #322), Hello on the first day, Tidying during a run, the dance once
 * right after one, Confused after a failure; offline beats everything.
 * `hello` and `showoff` play once; the screen then holds `restingBird` of
 * the same pose.
 */
export function birdStateFor(input: BirdStateInput): BirdState {
  if (input.offline) return 'offline';
  switch (input.state) {
    case 'waiting':
    case 'loading':
      return 'looking';
    case 'empty':
      return 'hello';
    case 'running':
      return 'tidying';
    case 'done':
      return input.justDone ? 'showoff' : 'looking';
    case 'failed':
      return 'confused';
  }
}

/** The pose a play-once pose settles into once it has played. */
export function restingBird(state: BirdState): BirdState {
  return state === 'hello' || state === 'showoff' || state === 'done'
    ? 'looking'
    : state;
}

/** The Inbox card's line under the count, per state (C.4 and the boards). */
export function inboxLine(state: HomeState, pending: number): string {
  if (state === 'running') return 'Tidying up…';
  if (state === 'failed') return 'still waiting';
  return pending > 0
    ? 'waiting to be filed'
    : 'Nothing waiting. Add something.';
}
