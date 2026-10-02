/**
 * Pure helpers for the Home screen (#321, handover C.4 and the Phone-Home
 * boards): which of its states Home is in, the time-of-day greeting, the
 * bird's speech bubble, which pose the bird holds, and the two cards' text.
 * No Preact, no Drive: unit-tested directly (`home.test.ts`).
 */

import type { Run } from './api.js';
import { CONTEXT_TITLE, sinceLabel } from './bower-tab.js';
import type { BirdState } from './components/bird-classes.js';
import { outcomeCounts, outcomeFromRun, runSentence } from './run-outcome.js';
import { isContextNote, processedKind } from './run-progress.js';
import type { RunPhase } from './run-store.js';
import { failureCopy } from './run-failure.js';
import { requestRowText } from './move-request.js';
import { firstLine, instructionBody } from './tell.js';

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
  loading: boolean; /** `false` while there is no index at all: a finished run then does not
   * leave Loading (the inbox count is not known). Left out, as before. */
  indexReady?: boolean;
  /** The listing is being read again after a run (`refreshingAfterRun`,
   * #1001): what it lists as waiting may already be gone. */
  refreshing?: boolean;
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
/**
 * Home is still loading while the listing is (`status` 'loading'), and also
 * while a person with a Bower folder has no index yet: the provider can sit
 * at 'idle' for a moment before its first read starts, and nothing it says
 * then may read as an empty folder ("Nothing yet", "0 · Nothing waiting").
 */
export function isHomeLoading(input: {
  status: string;
  indexReady: boolean;
  hasFolder: boolean;
}): boolean {
  if (input.status === 'loading') return true;
  if (input.indexReady || !input.hasFolder) return false;
  return input.status !== 'error' && input.status !== 'offline';
}

export function homeStateFor(input: HomeStateInput): HomeState {
  const { phase, pending, lastFinished, loading } = input;
  if (phase === 'queued' || phase === 'running') return 'running';
  const outcome = lastFinished === null ? null : outcomeFromRun(lastFinished);
  if (phase === 'failed' || phase === 'stale') {
    return outcome?.state === 'partial' ? 'partial' : 'failed';
  }
  if (phase === 'done') return 'done';
  if (loading && input.indexReady === false) return 'loading';
  // #1001: right after a run the listing still shows what it moved away,
  // so the run's own result speaks until the fresh listing is in, never
  // "N things in your inbox" with a live Tidy up.
  if (input.refreshing === true && outcome !== null) {
    if (outcome.state === 'partial') return 'partial';
    return outcome.state === 'failed' ? 'failed' : 'done';
  }
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

/**
 * The run Home speaks about (bubble, cards, state). The run store keeps its
 * `lastFinished` in an effect, so on the first render after a run that
 * ended is read (a reload, a held demo run) it is still `null`: the run
 * itself stands in, so a partly done run never shows the failed state for
 * a moment, and every surface reads the same `RunOutcome`.
 */
export function finishedRunFor(
  phase: RunPhase,
  run: Run | null,
  lastFinished: Run | null,
): Run | null {
  if (lastFinished !== null) return lastFinished;
  const ended = phase === 'failed' || phase === 'stale' || phase === 'done';
  return ended && run !== null && run.state !== 'running' ? run : null;
}

/**
 * "G'day, Alex" (S-HM-1): the first word of the account's name, or "G'day"
 * alone when there is none — the Worker's `/me` may not return a name
 * (`Me.name` is optional); never invented here or anywhere else.
 */
export function greetingFor(name?: string): string {
  const first = name?.trim().split(/\s+/)[0] ?? '';
  return first === '' ? "G'day" : `G'day, ${first}`;
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
// TODO(#1011): read `filed` from `outcomeFromRun(run).filed` once #1011 makes it "has a `to` outside 0-Inbox".
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
  /** Desktop says "click", the phone "tap" (K-27). */
  desktop?: boolean;
  /** The listing is being read again after a run (#1001): no Tidy up link
   * may start a run on things that are gone; its words stay as text. */
  updating?: boolean;
}

/**
 * What a finished run filed, in the Last tidy-up tile's words: "1 filed",
 * "2 new · 1 updated", "Nothing new". A run recovered from
 * `.bower/last-run.json` keeps its own sentence (`lastTidyUpOverride`).
 */
export function lastTidyUpNote(run: Run): string {
  const own = lastTidyUpOverride(run);
  if (own !== null) return own;
  const counts = outcomeCounts(outcomeFromRun(run), { short: true });
  return counts === '' ? 'Nothing new' : counts;
}

/**
 * The bubble's line for a done run (S-HM-3): "Done 21 h ago: 1 filed." The
 * time and the counts are the Last tidy-up tile's own values (K-16), so
 * the two never disagree.
 */
function runLine(run: Run, now: number): string {
  const ago = tidyUpAgo(run.finishedAt ?? run.requestedAt, now);
  const note = lastTidyUpNote(run);
  const line = `Done ${ago}: ${note === 'Nothing new' ? 'nothing new' : note}.`;
  // What Bower added stays a second sentence (R-RUN-3; `cleanQuote` already
  // dropped its full stop).
  const { quote } = outcomeFromRun(run);
  return quote === undefined ? line : `${line} ${quote}.`;
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
  const parts = bubbleParts(input);
  if (input.updating !== true) return parts;
  return parts.map((part) =>
    typeof part !== 'string' && part.link === 'tidy-up' ? part.text : part,
  );
}

function bubbleParts(input: BubbleInput): BubblePart[] {
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
        `Hi, I'm Bower. Add a few things and ${input.desktop === true ? 'click' : 'tap'} Tidy up; I'll file them into your folders.`,
      ];
    case 'running':
      return [
        pending > 0
          ? `Tidying up ${things(pending)}. It takes a few minutes; you can keep adding.`
          : 'Tidying up. It takes a few minutes; you can keep adding.',
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
        `${runLine(lastFinished, now)} `,
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
    case 'failed':
      // S-HM-7 and S-HM-4 (spec 4.2): never a step name or a reason code.
      return [
        'The last tidy-up did not finish. Nothing was lost; your things are still in the inbox. ',
        { link: 'just-filed', text: 'See what changed' },
      ];
  }
}

/** The stat tiles Home shows (spec §4.2 item 3): Inbox and Last tidy-up;
 * desktop adds Health check (E-8, as on HM-Main-1280). */
export function homeTiles(desktop: boolean): string[] {
  return desktop
    ? ['Inbox', 'Last tidy-up', 'Health check']
    : ['Inbox', 'Last tidy-up'];
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

/** What the Inbox tile shows (#1001). */
export interface InboxView {
  /** The count on the tile. */
  pending: number;
  /** The listing is being read again after a run: the tile says
   * "Updating…" and offers no Tidy up. */
  updating: boolean;
}

/** The Inbox tile's line while the listing is read again after a run. */
export const INBOX_UPDATING = 'Updating…';

/**
 * The Inbox tile's count and whether it is updating (#1001). While the
 * listing is read again after a run, the things the run reports it took
 * (`run.processed`) that the old listing still shows as waiting are taken
 * off the count, so the tile never reads the inbox as it was before the
 * run. Add's "What is this?" note never counted, so it is never taken off.
 */
export function inboxViewFor(input: {
  pending: number;
  refreshing: boolean;
  /** The run that just ended, or `null`. */
  run: Run | null;
  /** The paths the listing shows as waiting (`run-progress.ts#waitingPaths`). */
  waiting: readonly string[];
}): InboxView {
  const { pending, refreshing, run, waiting } = input;
  if (!refreshing) return { pending, updating: false };
  const listed = new Set(waiting);
  const moved = (run?.processed ?? []).filter(
    (path) => listed.has(path) && !isContextNote(path),
  ).length;
  return { pending: Math.max(0, pending - moved), updating: true };
}

/** An instruction note's file name: `Bower - YYYY-MM-DD HHmm[-ss] ….md`. */
const REQUEST_NOTE_NAME =
  /^Bower - \d{4}-\d{2}-\d{2} \d{4}(?:-\d{2})? .*\.md$/i;

/** What Recent calls a request note whose words are not on this device. */
export const REQUEST_FALLBACK = 'Your request to Bower';

/**
 * The title Recent gives a request note (#1001): its words, never its
 * dated file name, which lost every slash of a path it quoted ("Move
 * “x.png” (2-AreasImmigrationx.png) to …"). Add's "What is this?" note
 * and a pile's note read "About the files you added", as on the Bower
 * tab; a move or rename reads as the Requests row does
 * (`requestRowText`). `text` is the note's content when it has been read,
 * else the plain fallback. `null` for any other note, which keeps its own
 * title.
 *
 * A small local helper: #997 words Requests the same way and may land a
 * shared one later.
 */
export function recentRequestTitle(
  name: string,
  text: string | undefined,
): string | null {
  if (!REQUEST_NOTE_NAME.test(name)) return null;
  if (isContextNote(name)) return CONTEXT_TITLE;
  if (text === undefined) return REQUEST_FALLBACK;
  const line = firstLine(
    instructionBody(text)
      .split('\n')
      .map((part) => part.trim())
      .filter((part) => part !== '')
      .join('\n'),
  );
  return line === '' ? REQUEST_FALLBACK : requestRowText(line);
}
