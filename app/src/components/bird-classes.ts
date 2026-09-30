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
 * What a settled bird holds (D30, spec Appendix B): a still class (`s-*`) or a
 * still face (`e-*`) per looping pose. The tidying and flying paper is hidden
 * by a still face rather than the reading page.
 */
const SETTLED_CLASSES: Partial<Record<BirdState, string>> = {
  looking: 's-perch',
  perched: 's-perch',
  pointing: 's-point',
  reading: 's-read',
  listening: 'e-curious',
  singing: 'e-happy',
  shiny: 'e-happy',
  tidying: 'e-happy',
  flying: 'e-happy',
  building: 'e-happy',
  peeking: 'e-curious',
  confused: 'e-worried',
  offline: 'e-worried',
  asleep: 'e-sleepy',
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

/**
 * The bird's size scale (spec §2.4, R-TOK-63 to 71, R-BIRD-1), mirrored from
 * the `--bird-*` tokens in `styles/tokens.css` (keep both in sync). `hero`
 * is 84 on the phone and 96 from 900 px; the number here is the phone's.
 * Under 40 (`inline` to `box`) the bird is the still `BowerMark`.
 */
export const BIRD_SIZE = {
  inline: 16,
  icon: 20,
  tip: 28,
  box: 32,
  drop: 44,
  sheet: 52,
  confirm: 56,
  running: 70,
  tab: 72,
  tour: 80,
  hero: 84,
} as const;

export type BirdSize = keyof typeof BIRD_SIZE;

/** A size in px, or a name from the scale. */
export type BirdSizeValue = number | BirdSize;

/** The px size and, for a named size, the CSS length that reads its token. */
export function birdSize(size: BirdSizeValue): { px: number; css?: string } {
  if (typeof size === 'number') return { px: size };
  return { px: BIRD_SIZE[size], css: `var(--bird-${size})` };
}

/** States that play once and then report `onDone` (the caller goes back to `looking`). */
export const ONCE_STATES: readonly BirdState[] = ['hello', 'showoff', 'done'];

/**
 * The class list for the bird's `<svg>`: `b`, then the state's pose (with
 * `reducedMotion` its still class, if it has one, instead), then `pd` for a
 * pointing bird that points down, then a face (`face`, or with
 * `reducedMotion` the state's still face), then `settled`, then `flip`. A
 * `settled` bird (D30) holds the still class or face of its pose instead of
 * playing it and gets `settled`, which stops every animation; Asleep keeps
 * its pose (the nest, the resting height) and only stops.
 */
export function birdClasses(
  state: BirdState,
  face: BirdFace | undefined,
  flip: boolean,
  reducedMotion: boolean,
  down = false,
  settled = false,
): string {
  const classes = ['b'];
  const holds = settled && !reducedMotion;
  const still = holds ? SETTLED_CLASSES[state] : undefined;
  if (!reducedMotion && (!holds || state === 'asleep')) {
    classes.push(POSES[state]);
  } else {
    const held = holds ? still : STILL_CLASSES[state];
    if (held !== undefined && !held.startsWith('e-')) classes.push(held);
  }
  if (down && state === 'pointing') classes.push('pd');
  let shown = face ?? (reducedMotion ? STILL_FACES[state] : undefined);
  if (shown === undefined && still?.startsWith('e-') === true) {
    shown = still.slice(2) as BirdFace;
  }
  if (shown !== undefined) classes.push(`e-${shown}`);
  if (holds) classes.push('settled');
  if (flip) classes.push('flip');
  return classes.join(' ');
}
