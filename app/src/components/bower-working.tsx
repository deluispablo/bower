/**
 * The tidy-up animation (#38, rebuilt on the bird in #137): while a run is
 * queued or running the bird ferries a paper and a twig from the inbox tray
 * to the nest (`tidying` with its scene); when it is done the bird shows off
 * once and then looks around; when it fails it is confused. All motion is
 * the bird's own CSS (`styles/bird.css`), so there is no asset request and
 * no timer.
 *
 * Under `prefers-reduced-motion: reduce` (or `reducedMotion`) the bird holds
 * still and a single dot pulses (opacity only) while a run is queued or
 * running.
 */

import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { ONCE_STATES } from './bird.js';
import type { BirdState } from './bird.js';
import { Bird } from './bird.tsx';

import '../styles/bower-working.css';

export type WorkingState = 'queued' | 'running' | 'done' | 'failed';

export interface BowerWorkingProps {
  state: WorkingState;
  /**
   * 0 to 1 when known. Accepted so callers need not change; the bird's
   * scene fills the nest on its own loop and does not show it.
   */
  progress?: number;
  /** Forces the still variant; the CSS media query covers the system setting. */
  reducedMotion?: boolean;
}

/** Bird size in the sheet, px. */
export const WORKING_BIRD_SIZE = 104;

const LABELS: Record<WorkingState, string> = {
  queued: 'Tidying up…',
  running: 'Tidying up…',
  done: 'Done',
  failed: 'Something went wrong',
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
}: BowerWorkingProps): JSX.Element {
  // Show-off plays once; then the bird goes back to looking around until
  // the run state changes again.
  const [rested, setRested] = useState(false);
  useEffect(() => {
    setRested(false);
  }, [state]);

  const played = workingBird(state);
  const bird: BirdState =
    rested && ONCE_STATES.includes(played) ? 'looking' : played;

  return (
    <figure class={workingClasses(state, reducedMotion)}>
      <div class="bw-stage">
        <Bird
          state={bird}
          size={WORKING_BIRD_SIZE}
          scene={bird === 'tidying'}
          reducedMotion={reducedMotion}
          onDone={() => setRested(true)}
        />
      </div>
      <span class="bw-dot" aria-hidden="true" />
      <figcaption class="bw-label">{workingLabel(state)}</figcaption>
    </figure>
  );
}
