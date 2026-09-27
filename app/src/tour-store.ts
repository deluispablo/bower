/**
 * The first-run tour's in-memory state (spec §7, #149), a plain pub/sub
 * store like `switcher-store.ts` so Settings, onboarding and Home can reach
 * it without a provider. Nothing here is persisted: whether the tour was
 * seen lives on the Worker (`tourSeenAt`), and a reload starts clean.
 *
 * - `replay`: Settings › Show me around again asked for the tour once more.
 *   Consumed when the tour ends; never a pref.
 * - `dismissed`: the tour was finished or skipped in this session, so Home
 *   does not show it again even if saving `tourSeenAt` failed.
 * - `showoff`: the tour was finished with "Let's go"; Home plays the bird's
 *   show-off once and calls `showoffPlayed()`.
 */

import { useEffect, useState } from 'preact/hooks';

import { updateSettings } from './api.js';
import type { Me } from './api.js';

export interface TourState {
  replay: boolean;
  dismissed: boolean;
  showoff: boolean;
}

const INITIAL: TourState = { replay: false, dismissed: false, showoff: false };

let state: TourState = INITIAL;
/** `tourSeenAt` was saved in this session; `me` is not refetched after it. */
let savedThisSession = false;
const listeners = new Set<(state: TourState) => void>();

function set(next: TourState): void {
  state = next;
  for (const listener of listeners) listener(state);
}

/** The current state, outside a component (tests, one-off reads). */
export function getTourState(): TourState {
  return state;
}

/** Settings › Show me around again: show the tour on Home once more. */
export function replayTour(): void {
  set({ replay: true, dismissed: false, showoff: false });
}

/**
 * The tour ended: `finished` for "Let's go", false for any skip (including
 * "Skip the tour" on the Welcome screen, before Home was ever shown).
 */
export function endTour(finished: boolean): void {
  set({ replay: false, dismissed: true, showoff: finished });
}

/** Home's show-off has played. */
export function showoffPlayed(): void {
  if (state.showoff) set({ ...state, showoff: false });
}

/** Back to a fresh session; for tests. */
export function resetTourStore(): void {
  savedThisSession = false;
  set(INITIAL);
}

/** The tour state; re-renders the subscriber when it changes. */
export function useTour(): TourState {
  const [value, setValue] = useState(state);
  useEffect(() => {
    listeners.add(setValue);
    // The state may have changed between the first render and this effect.
    setValue(state);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

/**
 * Records on the Worker that `me` has seen the tour, unless it already has
 * (a replay never touches the flag). A failure is logged and not retried:
 * `dismissed` already keeps the tour away for the rest of this session, and
 * the next sign-in simply offers it again.
 */
export async function markTourSeen(me: Me, now = new Date()): Promise<void> {
  if (me.tourSeenAt !== undefined || savedThisSession) return;
  try {
    await updateSettings({ tourSeenAt: now.toISOString() });
    savedThisSession = true;
  } catch (err) {
    console.error('Could not save that the tour was seen.', err);
  }
}
