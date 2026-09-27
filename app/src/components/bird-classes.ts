/**
 * The bird's classes (spec §4.3): which pose a state plays, which still face
 * it holds when motion is off, and whether it is turned round. Pure, no
 * Preact, so it is unit-tested on its own; `bird.tsx` only renders what this
 * returns and `styles/bird.css` does all the moving.
 */

export type BirdState =
  | 'looking'
  | 'hello'
  | 'shiny'
  | 'singing'
  | 'tidying'
  | 'showoff'
  | 'confused'
  | 'building'
  | 'asleep'
  | 'peeking'
  | 'offline'
  | 'done';

export type BirdFace = 'happy' | 'curious' | 'worried' | 'sleepy' | 'proud';

/** The pose class of each state; the names match `docs/design/gen.py`. */
const POSES: Record<BirdState, string> = {
  looking: 'p-look',
  hello: 'p-hello',
  shiny: 'p-shiny',
  singing: 'p-sing',
  tidying: 'p-tidy',
  showoff: 'p-dance',
  confused: 'p-confused',
  building: 'p-build',
  asleep: 'p-sleep',
  peeking: 'p-peek',
  offline: 'p-offline',
  done: 'p-done',
};

/** The face a state holds instead of its pose when motion is off. */
const STILL_FACES: Partial<Record<BirdState, BirdFace>> = {
  hello: 'happy',
  shiny: 'curious',
  confused: 'worried',
  asleep: 'sleepy',
  showoff: 'proud',
};

/** Every state, in the order of the spec's table. */
export const BIRD_STATES: readonly BirdState[] = Object.keys(
  POSES,
) as BirdState[];

/** States that play once and then report `onDone` (the caller goes back to `looking`). */
export const ONCE_STATES: readonly BirdState[] = ['hello', 'showoff', 'done'];

/**
 * The class list for the bird's `<svg>`: `b`, then the state's pose (none
 * when `reducedMotion`), then a face (`face`, or with `reducedMotion` the
 * state's still face), then `flip`.
 */
export function birdClasses(
  state: BirdState,
  face: BirdFace | undefined,
  flip: boolean,
  reducedMotion: boolean,
): string {
  const classes = ['b'];
  if (!reducedMotion) classes.push(POSES[state]);
  const shown = face ?? (reducedMotion ? STILL_FACES[state] : undefined);
  if (shown !== undefined) classes.push(`e-${shown}`);
  if (flip) classes.push('flip');
  return classes.join(' ');
}
