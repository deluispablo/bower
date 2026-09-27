/**
 * Pure helpers for the Home screen (spec §6, Home row): the time-of-day
 * greeting, the bird's speech bubble text and which pose the bird holds.
 * No Preact, no Drive: unit-tested directly (`home.test.ts`).
 */

import type { BirdState } from './components/bird-classes.js';

/** The folder Bower writes answers to (spec §6, Home and Tell Bower rows). */
export const ANSWERS_FOLDER = 'Answers';

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

/** How a finished run is reported in the bubble: how many things it filed,
 * set aside or had refused. */
export interface DoneResult {
  /** `run.processed?.length` (run-store.tsx): items the run picked up. */
  processed: number;
  /** `run.quarantined?.length`: files the pre-scan set aside this run. */
  quarantined?: number;
  /** `run.refused?.length`: changes the post-run audit refused this run. */
  refused?: number;
}

/**
 * What `bubbleFor` needs to pick one sentence: pending count, offline flag,
 * load error flag, a just-finished run's result, and whether the health
 * report is new since it was last opened.
 */
export interface BubbleState {
  /** No network right now (`useOnline()`). */
  offline: boolean;
  /** The vault listing failed to load and there is nothing cached to show. */
  error: boolean;
  /** Set only right after a run finishes; cleared once the button settles. */
  done?: DoneResult;
  /** The health report changed since Health was last opened (`isReportNew`). */
  newHealthReport: boolean;
  /**
   * Open suggestions from Bower (#199) in a proposals file that changed
   * since Health last showed them; 0 (or absent) when there are none new.
   */
  newProposals?: number;
  /** Files waiting in the inbox (`pendingCount`). */
  pending: number;
}

function plural(n: number, singular: string, plural_ = `${singular}s`): string {
  return n === 1 ? singular : plural_;
}

function doneMessage(result: DoneResult): string {
  const { processed } = result;
  if (processed === 0) return 'All tidy. Nothing new this time.';
  return `All tidy. ${processed} ${plural(processed, 'thing')} filed.`;
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

/** "I have 2 suggestions for your rules. They are in Health." (#199) */
export function proposalsMessage(n: number): string {
  return `I have ${n} ${plural(n, 'suggestion')} for your rules. They are in Health.`;
}

/**
 * The bird's speech bubble on Home (spec §6, Home row): one sentence for
 * whatever is most worth saying right now, highest precedence first:
 *
 * 1. `offline` — no signal, nothing else below applies.
 * 2. `error` — the listing failed to load (and there was nothing cached).
 * 3. `done.quarantined` — files the pre-scan set aside this run.
 * 4. `done.refused` — changes the post-run audit refused this run.
 * 5. `done` — a run just finished; report what it did.
 * 6. `newHealthReport` — a fresh health report hasn't been opened yet.
 * 7. `newProposals > 0` — Bower has new suggestions waiting in Health.
 * 8. `pending > 0` — n things waiting in the inbox.
 * 9. otherwise — nothing waiting, nothing new: "All tidy."
 */
export function bubbleFor(state: BubbleState): string {
  if (state.offline) return "No signal here. I'll keep an eye out.";
  if (state.error) return 'Could not load your notes.';
  if (state.done !== undefined) {
    const { quarantined, refused } = state.done;
    if (quarantined !== undefined && quarantined > 0) {
      return quarantinedMessage(quarantined);
    }
    if (refused !== undefined && refused > 0) {
      return refusedMessage(refused);
    }
    return doneMessage(state.done);
  }
  if (state.newHealthReport) {
    return "Sunday's health check is ready. Want to see it?";
  }
  if (state.newProposals !== undefined && state.newProposals > 0) {
    return proposalsMessage(state.newProposals);
  }
  if (state.pending > 0) {
    return `${state.pending} new ${plural(state.pending, 'thing')} in your inbox. Shall I tidy up?`;
  }
  return 'All tidy.';
}

/** What `birdStateFor` needs: the same signals `bubbleFor` uses, minus `error`. */
export interface BirdStateInput {
  offline: boolean;
  /** A run just finished: show off before settling back down. */
  justDone: boolean;
  pending: number;
  newHealthReport: boolean;
  /** Same as `BubbleState.newProposals`. */
  newProposals?: number;
}

/**
 * The bird's pose on Home (spec §6, Home row): `offline` first (no signal
 * beats everything), then `showoff` right after a run, `asleep` once
 * nothing is pending and nothing is new, `looking` otherwise (the default).
 * `showoff` plays once; the caller (`routes/home.tsx`) falls back to this
 * function again with `justDone: false` once it ends.
 */
export function birdStateFor(input: BirdStateInput): BirdState {
  if (input.offline) return 'offline';
  if (input.justDone) return 'showoff';
  const proposals = input.newProposals ?? 0;
  if (input.pending === 0 && !input.newHealthReport && proposals === 0) {
    return 'asleep';
  }
  return 'looking';
}
