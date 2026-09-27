/**
 * The bird (spec §4): one drawing, every state. The markup is the design
 * canvas's (`docs/design/gen.py`, `BIRD_CORE` and `SCENE`) with its class
 * names; `birdClasses` (`bird-classes.ts`) picks the pose and face classes and
 * `styles/bird.css` does all the moving, so no JavaScript timer runs.
 *
 * Every part is always in the markup, props included; CSS hides the ones a
 * state does not show. `scene` adds the inbox tray, the nest and the walls
 * that `tidying` and `building` use (drawn outside the 100 x 100 box, so
 * leave room around the bird).
 *
 * `hello`, `showoff` and `done` play once: when the `rig`'s own animation
 * ends the component calls `onDone`, and the caller switches to `looking`.
 *
 * The bird is decoration (`aria-hidden`); the text next to it carries the
 * meaning.
 */

import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

import { ONCE_STATES, birdClasses } from './bird-classes.js';
import type { BirdFace, BirdState } from './bird-classes.js';

import '../styles/bird.css';

export type { BirdFace, BirdState } from './bird-classes.js';

export interface BirdProps {
  state: BirdState;
  /** A still face on top of the state (or instead of it, with reduced motion). */
  face?: BirdFace;
  /** Width and height in px. */
  size?: number;
  /** Faces left instead of right. */
  flip?: boolean;
  /** Forces the still bird; `prefers-reduced-motion: reduce` does too. */
  reducedMotion?: boolean;
  /** Draws the tray, nest and walls of `tidying` and `building`. */
  scene?: boolean;
  /** Called once when a plays-once state (`hello`, `showoff`, `done`) ends. */
  onDone?: () => void;
}

/** Whether the system asks for reduced motion; false where `matchMedia` is missing. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** The inbox tray and paper, the nest and its pile, the walls, the gem. */
function Scene(): JSX.Element {
  return (
    <g>
      <path class="x tray" d="M-46 78H-6L-10 92H-42Z" />
      <rect class="x traypaper" x="-36" y="70" width="18" height="12" rx="1" />
      <path class="x nest" d="M104 84C106 96 142 96 144 84Z" />
      <rect
        class="x nestpile np1"
        x="112"
        y="76"
        width="16"
        height="10"
        rx="1"
      />
      <path class="x tw np2" d="M116 82L134 72" />
      <path class="x wall" d="M8 92l2-18" />
      <path class="x wall w2" d="M16 92l1-19" />
      <path class="x wall w3" d="M24 92l-1-18" />
      <path class="x wall w4" d="M76 92l2-18" />
      <path class="x wall w5" d="M84 92l1-19" />
      <path class="x wall w6" d="M92 92l-1-18" />
      <circle class="x sgem" cx="118" cy="26" r="7" />
      <circle class="x sgemhl" cx="115.5" cy="23.5" r="2.2" />
      <path
        class="x sp sspark"
        d="M130 10l1.6 3.4 3.4 1.6-3.4 1.6-1.6 3.4-1.6-3.4-3.4-1.6 3.4-1.6z"
      />
    </g>
  );
}

export function Bird({
  state,
  face,
  size = 32,
  flip = false,
  reducedMotion = false,
  scene = false,
  onDone,
}: BirdProps): JSX.Element {
  const still = reducedMotion || prefersReducedMotion();
  const playsOnce = !still && ONCE_STATES.includes(state);

  // `animationend` is attached by hand rather than through `onAnimationEnd`,
  // so it is the same event name wherever the element lacks the handler
  // property (jsdom in the tests).
  const rig = useRef<SVGGElement>(null);
  useEffect(() => {
    const element = rig.current;
    if (element === null || !playsOnce || onDone === undefined) return;
    const done = onDone;
    function onAnimationEnd(event: Event): void {
      // Only the rig's own animation ends a play; the parts inside it
      // bubble their own `animationend` events up here too.
      if (event.target === event.currentTarget) done();
    }
    element.addEventListener('animationend', onAnimationEnd);
    return () => element.removeEventListener('animationend', onAnimationEnd);
  }, [playsOnce, onDone]);

  return (
    <svg
      class={birdClasses(state, face, flip, still)}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      {scene && <Scene />}
      <g class="rig" ref={rig}>
        <g class="turn">
          <g class="tl">
            <path class="tf" d="M29 56C21 47 14 40 6 35C11 43 18 52 31 62Z" />
          </g>
          <g class="ft">
            <path class="lg" d="M40 84L39 91M35 91h8" />
            <path class="lg" d="M53 85L53 91M49 91h8" />
          </g>
          <circle class="bd" cx="46" cy="62" r="24" />
          <g class="wg">
            <path class="wp" d="M44 50C57 49 65 59 60 72C49 72 39 64 44 50Z" />
          </g>
          <g class="hd">
            <circle class="hc" cx="62" cy="40" r="19" />
            <circle class="ch" cx="72" cy="46" r="3.2" />
            <g class="ey">
              <circle class="ec" cx="68" cy="37" r="5.2" />
              <circle class="eh" cx="70" cy="35" r="1.9" />
              <circle class="eh" cx="66.4" cy="39.2" r=".9" />
            </g>
            <path class="bk" d="M80 38L92 42L80 45Z" />
            <g class="jw">
              <path class="bj" d="M80 43.5L90 42.5L80 47.5Z" />
            </g>
            <path class="x ctwig tw" d="M86 42L100 26M96 32L102 30" />
            <rect
              class="x cpaper pp"
              x="86"
              y="36"
              width="14"
              height="18"
              rx="1"
              transform="rotate(14 93 45)"
            />
          </g>
          <text class="x nt" x="82" y="22">
            ♪
          </text>
          <text class="x nt n2" x="90" y="14">
            ♪
          </text>
          <text class="x nt n3" x="76" y="8">
            ♪
          </text>
          <text class="x qm" x="80" y="18">
            ?
          </text>
          <text class="x zz" x="74" y="22">
            z
          </text>
          <text class="x zz z2" x="82" y="12">
            z
          </text>
          <path
            class="x sp"
            d="M90 8l1.8 3.8 3.8 1.8-3.8 1.8L90 19l-1.8-3.8-3.8-1.8 3.8-1.8z"
          />
          <path
            class="x sp sp2"
            d="M10 24l1.4 3 3 1.4-3 1.4L10 33l-1.4-3-3-1.4 3-1.4z"
          />
          <path
            class="x cl"
            d="M24 18h16a5 5 0 0 0-.6-10 7 7 0 0 0-13 2A4 4 0 0 0 24 18z"
          />
        </g>
      </g>
    </svg>
  );
}
