/**
 * The bird's classes (spec §4.3): which pose a state plays, which still face
 * it holds when motion is off, and whether it is turned round. Pure, no
 * Preact, so it is unit-tested on its own; `bird.tsx` only renders what this
 * returns and `styles/bird.css` does all the moving.
 */

export type BirdState =
  | 'idle'
  | 'looking'
  | 'hello'
  | 'shiny'
  | 'singing'
  | 'tidying'
  | 'flying'
  | 'showoff'
  | 'confused'
  | 'building'
  | 'asleep'
  | 'peeking'
  | 'offline'
  | 'done'
  | 'listening'
  | 'pointing'
  | 'reading'
  | 'perched';

/**
 * A still face (`e-*` in `styles/bird.css`). Since drawing v8.2 the lids carry
 * the mood: happy and proud raise the lower lid, worried lowers the upper
 * lid, sleepy closes both over the eye; curious widens the eye itself. The
 * head, jaw, wing and tail add the rest.
 */
export type BirdFace = 'happy' | 'curious' | 'worried' | 'sleepy' | 'proud';

/** The pose class of each state; the names match the approved design canvas. */
const POSES: Record<BirdState, string> = {
  idle: 'p-idle',
  looking: 'p-look',
  hello: 'p-hello',
  shiny: 'p-shiny',
  singing: 'p-sing',
  tidying: 'p-tidy',
  // Carrying a note across: the intro's sort strip and Drive window (#328).
  flying: 'p-fly',
  showoff: 'p-dance',
  confused: 'p-confused',
  building: 'p-build',
  asleep: 'p-sleep',
  peeking: 'p-peek',
  offline: 'p-offline',
  done: 'p-done',
  // Round 7 poses (spec §6.21, R-BIRD-1).
  listening: 'p-listen',
  pointing: 'p-point',
  reading: 'p-read',
  perched: 'p-perch',
};

/** The face a state holds instead of its pose when motion is off. */
const STILL_FACES: Partial<Record<BirdState, BirdFace>> = {
  hello: 'happy',
  shiny: 'curious',
  confused: 'worried',
  asleep: 'sleepy',
  showoff: 'proud',
  listening: 'curious',
};

/**
 * The still class of a held pose (`s-*` in `styles/bird.css`): with motion
 * off, the wing or the page stays where the pose puts it. A state that has
 * one uses it instead of a face.
 */
const STILL_CLASSES: Partial<Record<BirdState, string>> = {
  pointing: 's-point',
  reading: 's-read',
  perched: 's-perch',
};

/**
 * Every state: the spec's table (§4.3), plus `idle` (§14 finding 13) — the
 * same breathe and blink as `looking`, without the loop that turns the
 * whole bird round and hunts with the head. Bars and cards use it; `looking`
 * stays for Home and the sign-in.
 */
export const BIRD_STATES: readonly BirdState[] = Object.keys(
  POSES,
) as BirdState[];

/** States that play once and then report `onDone` (the caller goes back to `looking`). */
export const ONCE_STATES: readonly BirdState[] = ['hello', 'showoff', 'done'];

/**
 * The class list for the bird's `<svg>`: `b`, then the state's pose (with
 * `reducedMotion` its still class, if it has one, instead), then `pd` for a
 * pointing bird that points down, then a face (`face`, or with
 * `reducedMotion` the state's still face), then `flip`.
 */
export function birdClasses(
  state: BirdState,
  face: BirdFace | undefined,
  flip: boolean,
  reducedMotion: boolean,
  down = false,
): string {
  const classes = ['b'];
  if (!reducedMotion) classes.push(POSES[state]);
  else {
    const held = STILL_CLASSES[state];
    if (held !== undefined) classes.push(held);
  }
  if (down && state === 'pointing') classes.push('pd');
  const shown = face ?? (reducedMotion ? STILL_FACES[state] : undefined);
  if (shown !== undefined) classes.push(`e-${shown}`);
  if (flip) classes.push('flip');
  return classes.join(' ');
}
