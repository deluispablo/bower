/**
 * The tidy-up animation (#38, rebuilt on the bird in #137): while a run is
 * queued or running the bird ferries a paper and a twig from the inbox tray
 * to the nest (`tidying` with its scene); when it is done the bird shows off
 * once and then looks around; when it fails, or the day's quota is used up,
 * it is confused (#147). All motion is the bird's own CSS
 * (`styles/bird.css`), so there is no asset request and no timer.
 *
 * Under `prefers-reduced-motion: reduce` (or `reducedMotion`) the bird holds
 * still and a single dot pulses (opacity only) while a run is queued or
 * running.
 */

import type { JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';

import { ONCE_STATES } from './bird-classes.js';
import type { BirdState } from './bird-classes.js';
import { Bird } from './bird.js';

import '../styles/bower-working.css';

export type WorkingState = 'queued' | 'running' | 'done' | 'failed' | 'quota';

export interface BowerWorkingProps {
  state: WorkingState;
  /** Forces the still variant; the CSS media query covers the system setting. */
  reducedMotion?: boolean;
  /** The bird is the one an overlay shows (spec 6.21 rule 1): the sheet's stage. */
  overlay?: boolean;
}

/** Bird size in the sheet, px. */
export const WORKING_BIRD_SIZE = 104;

/** Height of the tidy-up sheet's stage while a run goes, px (R-BIRD-8: it
 * was 150 before the bird got its 166 px stage on the Tidying pose). */
export const WORKING_STAGE_HEIGHT = 166;

const LABELS: Record<WorkingState, string> = {
  queued: 'Tidying up…',
  running: 'Tidying up…',
  done: 'Done',
  failed: 'Something went wrong',
  quota: 'Limit reached',
};

/** The text under the bird for a state. */
export function workingLabel(state: WorkingState): string {
  return LABELS[state];
}

/** The bird's state for a run state. */
export function workingBird(state: WorkingState): BirdState {
  switch (state) {
    case 'queued':
    case 'running':
      return 'tidying';
    case 'done':
      return 'showoff';
    case 'failed':
    case 'quota':
      return 'confused';
  }
}

/** Classes for the root element: the state, and `bw--still` when motion is off. */
export function workingClasses(
  state: WorkingState,
  reducedMotion: boolean,
): string {
  const classes = ['bw', `bw--${state}`];
  if (reducedMotion) classes.push('bw--still');
  return classes.join(' ');
}

export function BowerWorking({
  state,
  reducedMotion = false,
  overlay = false,
}: BowerWorkingProps): JSX.Element {
  // Show-off plays once; then the bird goes back to looking around until
  // the run state changes again. Each state change is a new play, counted
  // during render so a play that ends at once (reduced motion) is not
  // undone by a later reset.
  const play = useRef({ state, id: 0 });
  if (play.current.state !== state) {
    play.current = { state, id: play.current.id + 1 };
  }
  const playId = play.current.id;
  const [restedPlay, setRestedPlay] = useState(-1);

  const played = workingBird(state);
  const bird: BirdState =
    restedPlay === playId && ONCE_STATES.includes(played) ? 'looking' : played;

  return (
    <figure class={workingClasses(state, reducedMotion)}>
      <div class="bw-stage">
        <Bird
          state={bird}
          size={WORKING_BIRD_SIZE}
          scene={bird === 'tidying'}
          reducedMotion={reducedMotion}
          overlay={overlay}
          onDone={() => setRestedPlay(playId)}
        />
      </div>
      <span class="bw-dot" aria-hidden="true" />
      <figcaption class="bw-label">{workingLabel(state)}</figcaption>
    </figure>
  );
}
