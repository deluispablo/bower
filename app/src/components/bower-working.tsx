/**
 * The processing animation (#38): the bird flies to the inbox tray, picks a
 * paper, carries it to the nest, drops it and flies back, while the papers
 * in the nest pile up. One inline SVG scene, animated with CSS keyframes on
 * `transform` and `opacity` only (see `styles/bower-working.css`), so it
 * needs no asset request and stays on the compositor.
 *
 * The bird is the logo's shapes (`public/logo.svg`) without its twig: in
 * the animation it carries a paper instead. Its local origin is the point
 * between its feet, so it can be placed, turned round (`scaleX(-1)`) and
 * bobbed without knowing its size.
 *
 * Under `prefers-reduced-motion: reduce` (or `reducedMotion`) nothing
 * moves: the scene is static and a single dot pulses (opacity only) while a
 * run is queued or running.
 */

import type { JSX } from 'preact';

import '../styles/bower-working.css';

export type WorkingState = 'queued' | 'running' | 'done' | 'failed';

export interface BowerWorkingProps {
  state: WorkingState;
  /** 0 to 1 when known: the nest fills proportionally. */
  progress?: number;
  /** Forces the static variant; the CSS media query covers the system setting. */
  reducedMotion?: boolean;
}

export interface Scene {
  /** Classes for the root element. */
  className: string;
  /** The text under the scene. */
  label: string;
  /** How full the nest is, 0 to 1; the static level when `indeterminate`. */
  fill: number;
  /** True when the nest fills on its own, slowly, because progress is unknown. */
  indeterminate: boolean;
}

/** How far (in scene units) the pile in the nest sinks when the nest is empty. */
export const NEST_DEPTH = 22;

/** Nest level shown while progress is unknown and motion is off. */
export const INDETERMINATE_FILL = 0.5;

const LABELS: Record<WorkingState, string> = {
  queued: 'Queued…',
  running: 'Working…',
  done: 'Done',
  failed: 'Something went wrong',
};

/** Clamps a progress value to 0..1; anything that isn't a number is 0. */
export function nestFill(progress: number): number {
  if (Number.isNaN(progress)) return 0;
  return Math.min(1, Math.max(0, progress));
}

/** Everything the scene needs for a state, pure so it is unit-testable. */
export function sceneFor(
  state: WorkingState,
  progress?: number,
  reducedMotion = false,
): Scene {
  const known = progress !== undefined;
  let fill: number;
  let indeterminate = false;
  switch (state) {
    case 'queued':
    case 'failed':
      fill = known ? nestFill(progress) : 0;
      break;
    case 'running':
      if (known) {
        fill = nestFill(progress);
      } else {
        fill = INDETERMINATE_FILL;
        indeterminate = !reducedMotion;
      }
      break;
    case 'done':
      fill = 1;
      break;
  }
  const classes = ['bw', `bw--${state}`];
  if (indeterminate) classes.push('bw--indeterminate');
  if (reducedMotion) classes.push('bw--still');
  return {
    className: classes.join(' '),
    label: LABELS[state],
    fill,
    indeterminate,
  };
}

/** A paper: white sheet, slate outline, two text lines. */
function Paper({
  x,
  y,
  angle,
}: {
  x: number;
  y: number;
  angle: number;
}): JSX.Element {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <rect class="bw-paper" x="-20" y="-12" width="40" height="24" rx="2" />
      <path class="bw-paper-line" d="M-13 -5h26M-13 1h18" />
    </g>
  );
}

export function BowerWorking({
  state,
  progress,
  reducedMotion = false,
}: BowerWorkingProps): JSX.Element {
  const scene = sceneFor(state, progress, reducedMotion);
  const sink = (1 - scene.fill) * NEST_DEPTH;

  return (
    <figure class={scene.className}>
      <svg
        class="bw-scene"
        viewBox="0 0 320 160"
        width="320"
        height="160"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <clipPath id="bw-nest-clip">
            <rect x="196" y="40" width="108" height="76" />
          </clipPath>
        </defs>

        <path class="bw-ground" d="M12 140H308" />

        {/* The inbox tray, papers peeking out */}
        <Paper x={55} y={112} angle={-5} />
        <Paper x={61} y={110} angle={4} />
        <path class="bw-tray" d="M22 116H98L92 138H28Z" />

        {/* The nest: the pile rises behind the front of the bowl */}
        <g clip-path="url(#bw-nest-clip)">
          <g class="bw-pile" style={{ transform: `translateY(${sink}px)` }}>
            <Paper x={238} y={112} angle={-8} />
            <Paper x={260} y={110} angle={6} />
            <Paper x={249} y={108} angle={-2} />
          </g>
        </g>
        <path class="bw-nest" d="M204 114C206 140 294 140 296 114Z" />
        <path
          class="bw-twig"
          d="M210 118L292 121M214 125L286 131M222 133L290 117"
        />

        {/* The paper let go over the nest */}
        <rect
          class="bw-paper bw-drop"
          x="265"
          y="80"
          width="11"
          height="14"
          rx="1"
        />

        {/* The bird: logo shapes, feet at the local origin */}
        <g class="bw-pos">
          <g class="bw-turn">
            <g class="bw-bob">
              <g transform="scale(0.8) translate(-34 -52)">
                <path
                  class="bw-body"
                  d="M51.6 18A10 10 0 0 0 32.4 18C31.5 22.5 28 25.5 23 27.5L10.5 21.5Q6.5 20 6.5 24L7.5 27Q10.5 31 15.5 33.5C14.5 44.5 22.5 52 34 52C45 52 51.5 45.5 52 37.5C52.3 33 51.3 29.5 50 27.5L51.4 24.4Z"
                />
                <path
                  class="bw-wing"
                  d="M44 35C41 29.5 30 28.5 18.5 32.5C25 41 37 42 44 35Z"
                />
                <circle class="bw-eye" cx="45" cy="19.5" r="2.4" />
                <path class="bw-beak" d="M51 16.5L60.5 21L51 24.5Z" />
              </g>
              <rect
                class="bw-paper bw-carry"
                x="15"
                y="-22"
                width="11"
                height="14"
                rx="1"
              />
            </g>
          </g>
        </g>

        <text class="bw-question" x="74" y="60">
          ?
        </text>
        <circle class="bw-dot" cx="160" cy="124" r="4" />
      </svg>
      <figcaption class="bw-label">{scene.label}</figcaption>
    </figure>
  );
}
