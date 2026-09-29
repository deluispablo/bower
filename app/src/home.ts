/**
 * Pure helpers for the Home screen (#321, handover C.4 and the Phone-Home
 * boards): which of its states Home is in, the time-of-day greeting, the
 * bird's speech bubble, which pose the bird holds, and the two cards' text.
 * No Preact, no Drive: unit-tested directly (`home.test.ts`).
 */

import type { Run } from './api.js';
import { sinceLabel } from './bower-tab.js';
import type { BirdState } from './components/bird-classes.js';
import { outcomeCounts, outcomeFromRun, runSentence } from './run-outcome.js';
import type { RunOutcome } from './run-outcome.js';
import { processedKind } from './run-progress.js';
import type { RunPhase } from './run-store.js';
import { failureCopy } from './run-failure.js';

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
  'waiting' | 'empty' | 'running' | 'done' | 'partial' | 'failed' | 'loading';

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
  const outcome = lastFinished === null ? null : outcomeFromRun(lastFinished);
  if (phase === 'failed' || phase === 'stale') {
    return outcome?.state === 'partial' ? 'partial' : 'failed';
  }
  if (phase === 'done') return 'done';
  if (pending > 0) {
    // D31: with no bar on Home, the greeting keeps telling the result while
    // the only things waiting are the ones the run left for the person.
    if (
      outcome !== null &&
      outcome.needsYou > 0 &&
      pending <= outcome.needsYou
    ) {
      if (outcome.state === 'done') return 'done';
      if (outcome.state === 'partial') return 'partial';
    }
    return 'waiting';
  }
  if (lastFinished !== null) {
    return outcome?.state === 'partial' ? 'partial' : 'done';
  }
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
export function things(n: number): string {
  return `${n} ${plural(n, 'thing')}`;
}

/** What a run did: the things it filed and the questions it answered. */
export interface RunCounts {
  filed: number;
  answered: number;
}

/**
 * A run's counts from `run.processed`, by each item's kind
 * (`processedKind`, `run-progress.ts`, #345): a file counts as filed, a
 * request, question or rule as answered, and the "What is this?" context
 * note (#444) as neither. The working sheet reads the same kinds, so the
 * two never drift apart.
 */
export function runCounts(run: Run): RunCounts {
  let answered = 0;
  let filed = 0;
  for (const path of run.processed ?? []) {
    const kind = processedKind(path, run.items);
    if (kind === 'context') continue;
    if (kind === 'file') filed += 1;
    else answered += 1;
  }
  return { filed, answered };
}

/**
 * The Last tidy-up card's line when it is not the run's counts: "Failed ·
 * Drive did not answer" for a failed run (its reason's short words, #316), or
 * the sentence of a run recovered from `.bower/last-run.json` after the
 * Worker lost track (#564), which has no per-file `processed` list to count.
 * `null` for every other run: the card then shows `run-summary inline`.
 */
export function lastTidyUpOverride(run: Run): string | null {
  if (run.state === 'failed' && outcomeFromRun(run).state === 'failed') {
    return `Failed · ${failureCopy(run.reason).short}`;
  }
  if (run.processed === undefined && run.summary !== undefined) {
    return run.summary;
  }
  return null;
}

/** The card's counts as text: "2 filed · 3 new · 2 updated · 1 needs you". */
export function lastTidyUpCounts(run: Run): string {
  return outcomeCounts(outcomeFromRun(run), { short: true });
}

/**
 * When a run finished, for the Last tidy-up card: "just now", "12 min ago",
 * "2 h ago", then "yesterday", "3 days ago". A thin wrapper over
 * `sinceLabel` (`bower-tab.ts`, #513) — the one helper behind every "ago"
 * text a run shows off, so this card, the Inbox card and the working
 * sheet always read the same elapsed time the same way.
 */
export function tidyUpAgo(iso: string, now: number): string {
  return sinceLabel(iso, now);
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
  | string
  | { link: 'tidy-up' | 'activity' | 'just-filed' | 'failure'; text: string };

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
  /** The clock, for "Done 4 min ago" (the run store's `now`). */
  now: number;
}

/**
 * The bubble's line for a run (R-HOME-1): `runSentence` in the bird's own
 * voice, then what Bower added as a second sentence (R-RUN-3; `cleanQuote`
 * already dropped its full stop, so there is exactly one here). A run
 * recovered from `.bower/last-run.json` has no items to count and keeps its
 * own sentence.
 */
function runLine(run: Run, outcome: RunOutcome, now: number): string {
  const own = lastTidyUpOverride(run);
  if (own !== null) return own;
  const sentence = runSentence(outcome, { now, voice: 'first' });
  return outcome.state === 'done' && outcome.quote !== undefined
    ? `${sentence} ${outcome.quote}.`
    : sentence;
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
  const { state, pending, offline, error, editingPins, lastFinished, now } =
    input;
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
        runSentence(
          {
            state: 'running',
            startedAt: '',
            filed: 0,
            created: 0,
            updated: 0,
            needsYou: 0,
            left: 0,
            items: [],
            ...(pending > 0 && { total: pending }),
          },
          { voice: 'first' },
        ),
      ];
    case 'done': {
      if (lastFinished === null) return ['Done.'];
      const outcome = outcomeFromRun(lastFinished);
      // Just filed says where things went; a run with nothing to list keeps
      // the Bower tab's history.
      const where =
        outcome.items.length > 0
          ? ({ link: 'just-filed', text: 'See what changed' } as const)
          : ({ link: 'activity', text: 'See what I did' } as const);
      return [
        `${runLine(lastFinished, outcome, now)} `,
        where,
        ...doneNotes(lastFinished).map((note) => ` ${note}`),
      ];
    }
    case 'partial': {
      if (lastFinished === null) return ['I stopped part way.'];
      const outcome = outcomeFromRun(lastFinished);
      const tail =
        outcome.left > 0
          ? ' and I file them without writing the notes again.'
          : '.';
      return [
        `${runSentence(outcome, { now, voice: 'first' })} `,
        { link: 'tidy-up', text: 'Finish the tidy-up' },
        tail,
      ];
    }
    case 'failed': {
      const are = pending === 1 ? 'is' : 'are';
      return [
        // The reason's sentence (#316, Phone-Home-Failed), never a step name.
        `${failureCopy(lastFinished?.reason).sentence} Nothing was lost; your ${things(pending)} ${are} still in the inbox. `,
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
      return input.justDone ? 'showoff' : 'done';
    case 'partial':
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

/**
 * The Inbox card's line under the count, per state (C.4 and the boards):
 * "Being tidied up" while it runs, "Needs you" after a done run that left
 * things for the person (Home-Done, the board wins over the spec's "Nothing
 * waiting"), "Still waiting" after a partly done one.
 */
export function inboxLine(state: HomeState, pending: number): string {
  if (state === 'running') return 'Being tidied up';
  if (state === 'partial') return 'Still waiting';
  if (state === 'failed') return 'still waiting';
  if (state === 'done' && pending > 0) return 'Needs you';
  return pending > 0
    ? 'waiting to be filed'
    : 'Nothing waiting. Add something.';
}
