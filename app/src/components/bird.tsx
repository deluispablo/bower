/**
 * The bird (spec §4): one drawing, every state. The markup is the design
 * canvas's (`BIRD_CORE` and `SCENE`) with its class
 * names; `birdClasses` (`bird-classes.ts`) picks the pose and face classes and
 * `styles/bird.css` does all the moving, so no JavaScript timer runs.
 *
 * The drawing is v9 (D29, spec §6.21 and Appendix A): the v8.2 rig (round
 * body and belly, a head on a neck, one eye with an upper and a lower lid that
 * carry the mood, a pill beak with a jaw, one wing hinged at the shoulder,
 * three tail feathers and two feet) with a bigger head and eye, a blush, a
 * violet iris ring, a shorter beak and bigger props. Every part is always in
 * the markup, props included (the sound arcs, the page and the pointer dots of
 * the round 7 poses too); CSS hides the ones a state does not show. `scene`
 * adds the inbox tray and nest of `tidying`, the twig pile and growing nest of
 * `building`, the sleeping nest of `asleep` and the sparkles of `shiny`
 * (partly drawn outside the 100 x 100 box, so leave room around the bird);
 * the blue bottle cap `shiny` reaches for sits in the beak, always drawn.
 *
 * `hello`, `showoff` and `done` play once: when the `rig`'s own animation
 * ends the component calls `onDone`, and the caller switches to `looking`.
 * With reduced motion nothing plays, so `onDone` is called right away.
 *
 * The bird is decoration (`aria-hidden`); the text next to it carries the
 * meaning.
 */

import type { ComponentChildren, JSX, Ref, RefObject } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

import {
  NAP_CYCLE_MS,
  SETTLE_MS,
  retainWakeListeners,
  toggleNap,
  useNapping,
  useWakeCount,
} from '../bird-events.js';
import { registerBird, useOverlayBird } from '../bird-presence.js';

import { ONCE_STATES, birdClasses, birdSize } from './bird-classes.js';
import type { BirdFace, BirdSizeValue, BirdState } from './bird-classes.js';

import '../styles/bird.css';

export type {
  BirdFace,
  BirdSize,
  BirdSizeValue,
  BirdState,
} from './bird-classes.js';
export { BIRD_SIZE } from './bird-classes.js';

export interface BirdProps {
  state: BirdState;
  /** A still face on top of the state (or instead of it, with reduced motion). */
  face?: BirdFace;
  /**
   * Width and height: a name from the size scale (`BIRD_SIZE`, read from
   * the `--bird-*` tokens) or px; 40 or more (smaller, use `BowerMark`).
   */
  size?: BirdSizeValue;
  /** Faces left instead of right. */
  flip?: boolean;
  /** For `pointing`: the wing points down (`pd`) instead of up and out. */
  down?: boolean;
  /** Forces the still bird; `prefers-reduced-motion: reduce` does too. */
  reducedMotion?: boolean;
  /** Draws the scene: tray, nests, twig pile and sparkles (see above). */
  scene?: boolean;
  /** This bird is the one an overlay shows: the others hold still meanwhile. */
  overlay?: boolean;
  /** Called once when a plays-once state (`hello`, `showoff`, `done`) ends. */
  onDone?: () => void;
}

/** Under this size (px) the moving bird is unreadable: use `BowerMark`. */
export const MARK_BELOW = 40;

/** Whether the system asks for reduced motion; false where `matchMedia` is missing. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * The scene of `tidying`, `building` and `shiny`: the inbox tray and its
 * paper, the nest and its pile, the twig pile and the growing nest, the sparkles.
 * Drawn outside the bird's rig, so it stays put while the bird moves.
 */
function Scene(): JSX.Element {
  return (
    <g>
      <path class="x tray" d="M-46 78H-6L-10 92H-42Z" />
      <rect class="x traypaper" x="-36" y="70" width="18" height="12" rx="1" />
      <path
        class="x nest"
        d="M104 84C108 96 140 96 144 84M108 90L140 86M112 94L136 90M110 86L142 92M106 88L120 84M128 84L142 88"
      />
      <rect
        class="x nestpile np1"
        x="112"
        y="76"
        width="16"
        height="10"
        rx="1"
      />
      <path class="x tw np2" d="M116 82L134 72" />
      <path class="x bp bp1" d="M6 92L28 86" />
      <path class="x bp bp2" d="M10 94L30 90" />
      <path class="x bp bp3" d="M14 90L34 88" />
      <path class="x bn" d="M64 84C68 96 102 96 106 84M70 90L100 86" />
      <path class="x bn bt1" d="M72 87L98 91" />
      <path class="x bn bt2" d="M68 83L90 87" />
      <path class="x bn bt3" d="M80 82L104 88" />
      <path
        class="x sp sspark"
        d="M120 14l1.6 3.4 3.4 1.6-3.4 1.6-1.6 3.4-1.6-3.4-3.4-1.6 3.4-1.6z"
      />
      <path
        class="x sp sspark s2"
        d="M98 44l1.2 2.6 2.6 1.2-2.6 1.2-1.2 2.6-1.2-2.6-2.6-1.2 2.6-1.2z"
      />
    </g>
  );
}

/**
 * The drawing itself: the rig with every part, props included. `Bird` and
 * `BowerMark` share it, so the mark can never drift from the bird.
 */
function BirdRig({
  scene,
  rigRef,
}: {
  scene: boolean;
  rigRef?: Ref<SVGGElement>;
}): JSX.Element {
  return (
    <g class="rig" ref={rigRef}>
      <g class="turn">
        <g class="tl">
          <rect
            class="tf"
            x="6"
            y="71"
            width="24"
            height="5.5"
            rx="2.75"
            transform="rotate(-54 30 74)"
          />
          <rect
            class="tf"
            x="4"
            y="73"
            width="26"
            height="5.5"
            rx="2.75"
            transform="rotate(-36 30 76)"
          />
          <rect
            class="tf"
            x="6"
            y="75"
            width="24"
            height="5.5"
            rx="2.75"
            transform="rotate(-18 30 78)"
          />
        </g>
        <g class="ft">
          <path class="lg" d="M40 84V91" />
          <rect class="fo" x="34" y="89" width="13" height="4.5" rx="2.25" />
          <path class="lg" d="M53 85V91" />
          <rect class="fo" x="47" y="89" width="13" height="4.5" rx="2.25" />
        </g>
        <circle class="bd" cx="46" cy="62" r="24" />
        <ellipse class="ch" cx="52" cy="72" rx="13" ry="10" />
        <g class="hd">
          <rect class="nk" x="52" y="34" width="16" height="38" rx="8" />
          <circle class="hc" cx="62" cy="39" r="21" />
          <g class="ey">
            <circle class="ec" cx="69" cy="37" r="6.3" />
            <circle class="ir" cx="69" cy="37" r="5.6" />
            <circle class="eh" cx="71.4" cy="34.6" r="2.3" />
            <circle class="eh" cx="66.8" cy="39.6" r="1.1" />
          </g>
          <circle class="ld" cx="69" cy="23.2" r="7.6" />
          <circle class="lb" cx="69" cy="51" r="7.6" />
          <ellipse class="bl" cx="78" cy="49" rx="3.4" ry="2.3" />
          <rect class="bk" x="80" y="35" width="11" height="6" rx="3" />
          <g class="jw">
            <rect class="bj" x="80" y="40" width="8.5" height="4.5" rx="2.25" />
          </g>
          <path class="x ctwig tw" d="M86 39L100 24M96 28L103 27" />
          <rect
            class="x cpaper pp"
            x="86"
            y="34"
            width="13"
            height="17"
            rx="1"
            transform="rotate(14 92 42)"
          />
          <g class="x bcap">
            <circle cx="97" cy="47" r="5.2" />
            <circle class="bci" cx="97" cy="47" r="3.1" />
          </g>
          <text class="x ex" x="74" y="16">
            !
          </text>
        </g>
        <g class="wg">
          <path
            class="wp"
            d="M54 56C64 58 65 68 58 74C44 78 28 78 18 72C28 64 42 56 54 56Z"
          />
        </g>
        {/* The round 7 props: sound arcs, the page and the pointer dots. */}
        <g class="x wv w1">
          <path d="M95 14q4 6 0 12" />
        </g>
        <g class="x wv w2">
          <path d="M100 11q6 9 0 18" />
        </g>
        <g class="x wv w3">
          <path d="M105 8q8 12 0 24" />
        </g>
        <g class="x rd">
          <g transform="rotate(-6 80 62)">
            <rect class="rdp" x="70" y="50" width="20" height="24" rx="2" />
            <path class="rdl rl1" d="M73 57H87" />
            <path class="rdl rl2" d="M73 62H86" />
            <path class="rdl rl3" d="M73 67H82" />
          </g>
        </g>
        <circle class="x pdot p1" cx="101" cy="66" r="2.6" />
        <circle class="x pdot p2" cx="92" cy="87" r="2.6" />
        <circle class="x dd d1" cx="50" cy="20" r="1.6" />
        <circle class="x dd d2" cx="56" cy="16" r="1.6" />
        <circle class="x dd d3" cx="62" cy="14" r="1.6" />
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
          d="M8 26l1.4 3 3 1.4-3 1.4L8 35l-1.4-3-3-1.4 3-1.4z"
        />
        <path
          class="x cl"
          d="M50 6h18a5 5 0 0 0-.6-10 7 7 0 0 0-13 2A4 4 0 0 0 50 6z"
        />
        <path class="x rn r1" d="M52 9v5" />
        <path class="x rn r2" d="M58 10v5" />
        <path class="x rn r3" d="M64 9v5" />
        <path class="x rn r4" d="M70 10v5" />
        {/* The sleeping nest is part of the scene, but it sits in the rig
            (as in the canvas) so it breathes with the bird. */}
        {scene && (
          <path
            class="x nest2"
            d="M22 82C26 94 68 94 72 82M26 88L68 84M30 92L64 88M28 84L70 90M24 86L40 82M54 82L70 86"
          />
        )}
      </g>
    </g>
  );
}

/**
 * True while the tab is hidden or the element is off screen (an
 * IntersectionObserver, where there is one); the bird pauses then.
 */
function useOffScreen(ref: RefObject<SVGSVGElement>): boolean {
  const [hidden, setHidden] = useState(
    () => typeof document !== 'undefined' && document.hidden,
  );
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    function onVisibility(): void {
      setHidden(document.hidden);
    }
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  useEffect(() => {
    const element = ref.current;
    if (element === null || typeof IntersectionObserver !== 'function') return;
    const observer = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last !== undefined) setVisible(last.isIntersecting);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return hidden || !visible;
}

export function Bird({
  state,
  face,
  size: sizeValue = 40,
  flip = false,
  down = false,
  reducedMotion = false,
  scene = false,
  overlay = false,
  onDone,
}: BirdProps): JSX.Element {
  const { px: size, css: sizeCss } = birdSize(sizeValue);
  if (import.meta.env.DEV && size < MARK_BELOW) {
    console.error(
      `Bird: size ${size} is under ${MARK_BELOW} px; use BowerMark (spec 6.21 rule 2).`,
    );
  }
  // Presence (spec 6.21 rule 1): while an overlay shows Bower, every other
  // bird holds its still pose.
  const otherOverlay = useOverlayBird();
  const still =
    reducedMotion || prefersReducedMotion() || (otherOverlay && !overlay);
  const once = ONCE_STATES.includes(state);
  const playsOnce = !still && once;

  // D30: a looping pose settles after SETTLE_MS and an event wakes it for one
  // more cycle; a nap plays Asleep for one cycle, then holds it still.
  useEffect(() => retainWakeListeners(), []);
  const wake = useWakeCount();
  const napping = useNapping();
  const [settled, setSettled] = useState(false);
  const loops = !still && (napping || !once);
  // While napping the wake events change nothing: he sleeps until the next tap.
  const cycle = napping ? -1 : wake;
  useLayoutEffect(() => {
    setSettled(false);
    if (!loops) return;
    const timer = setTimeout(
      () => setSettled(true),
      napping ? NAP_CYCLE_MS : SETTLE_MS,
    );
    return () => clearTimeout(timer);
  }, [state, cycle, loops, napping]);
  const shownState: BirdState = napping ? 'asleep' : state;
  const shownFace = napping ? undefined : face;

  // The latest `onDone`, so a new callback on every render does not count
  // as a new play.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // With motion off nothing plays, so a plays-once state is over at once:
  // report it as soon as the state is shown (once per state change).
  const endsAtOnce = still && once;
  useEffect(() => {
    if (endsAtOnce) onDoneRef.current?.();
  }, [endsAtOnce, state]);

  // `animationend` is attached by hand rather than through `onAnimationEnd`,
  // so it is the same event name wherever the element lacks the handler
  // property (jsdom in the tests).
  const rig = useRef<SVGGElement>(null);

  // Counts as a bird on screen when it is drawn at 40 px or more and is not
  // the perch; layout effect, so the perch never flashes for a frame.
  const counts = state !== 'perched' && size >= MARK_BELOW;
  useLayoutEffect(() => {
    if (!counts) return;
    return registerBird(overlay);
  }, [counts, overlay]);

  // Animations pause while the tab is hidden or the bird is off screen.
  const svg = useRef<SVGSVGElement>(null);
  const paused = useOffScreen(svg);

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
      ref={svg}
      class={
        birdClasses(shownState, shownFace, flip, still, down, settled) +
        (paused ? ' paused' : '')
      }
      viewBox="0 0 100 100"
      width={size}
      height={size}
      style={
        sizeCss === undefined ? undefined : { width: sizeCss, height: sizeCss }
      }
      aria-hidden="true"
      focusable="false"
    >
      {scene && <Scene />}
      <BirdRig scene={scene} rigRef={rig} />
    </svg>
  );
}

export interface BirdNapButtonProps {
  children: ComponentChildren;
  /** False where the button sits inside an `aria-hidden` slot (the ledge). */
  tabbable?: boolean;
}

/**
 * The nap button (D30): the greeting's and the perch's bird is a `button`
 * named "Bower". A tap plays Asleep and pauses every animation until the next
 * tap or the next page load.
 */
export function BirdNapButton({
  children,
  tabbable = true,
}: BirdNapButtonProps): JSX.Element {
  const napping = useNapping();
  return (
    <button
      type="button"
      class="bird-nap"
      aria-label="Bower"
      aria-pressed={napping}
      tabIndex={tabbable ? undefined : -1}
      onClick={toggleNap}
    >
      {children}
    </button>
  );
}

export interface BowerMarkProps {
  /** Width and height: `inline`, `icon`, `tip`, `box` from the size scale, or px. */
  size?: BirdSizeValue;
}

/**
 * The still mark (spec 6.21 rule 2): the same drawing with no pose and no
 * small details (`.b.mark` in `styles/bird.css` hides the highlights, blush,
 * iris ring, lids, jaw and props). For anything under 40 px. It never moves
 * and never counts as a bird on screen.
 */
export function BowerMark({
  size: sizeValue = 24,
}: BowerMarkProps): JSX.Element {
  const { px: size, css: sizeCss } = birdSize(sizeValue);
  return (
    <svg
      class="b mark"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      style={
        sizeCss === undefined ? undefined : { width: sizeCss, height: sizeCss }
      }
      aria-hidden="true"
      focusable="false"
    >
      <BirdRig scene={false} />
    </svg>
  );
}
