/**
 * Test-only. The CSS loops of `poses.css` as they were before the engine took
 * them over (claude/p3 52dac43e), copied as numbers so the engine's poses can
 * be checked against them after the keyframes are gone.
 *
 * Units are the drawing's (a 100 × 100 grid): angles in degrees, offsets in
 * grid units, scales as factors. For each part: `peak` is the value at its
 * largest excursion from `rest`, and `restAt` is a phase of the loop (0..1)
 * at which the keyframes hold it at rest. A part whose peak equals its rest is
 * a still part of the pose (a tuft held up, eyes shut).
 *
 * The rig's scale is read on both axes: `squash` is its vertical factor and
 * `stretch` its horizontal one. `range` is the lowest and highest value the
 * keyframes give the part over a loop (several cross rest by design), and
 * `hold` is the phase window through which the keyframes hold the peak.
 * Blink (5.2 s) is left out.
 */
import type { Pose } from './Bower';
import { REACTIONS, type ReactionKind } from './react';
import { ACT_NAMES, POSE_NAMES, type ActName, type BirdEngine } from './engine';

export type PartKey =
  | 'dx'
  | 'dy'
  | 'pitch'
  | 'squash'
  | 'stretch'
  | 'head'
  | 'headY'
  | 'tail'
  | 'wing'
  | 'wingScale'
  | 'legs'
  | 'jaw'
  | 'tuft'
  | 'tuftY'
  | 'eye'
  | 'iris';

export type PartKind = 'angle' | 'offset' | 'scale';

export const PART_KIND: Record<PartKey, PartKind> = {
  dx: 'offset',
  dy: 'offset',
  pitch: 'angle',
  squash: 'scale',
  stretch: 'scale',
  head: 'angle',
  headY: 'offset',
  tail: 'angle',
  wing: 'angle',
  wingScale: 'scale',
  legs: 'scale',
  jaw: 'angle',
  tuft: 'angle',
  tuftY: 'offset',
  eye: 'scale',
  iris: 'offset',
};

/** Where each part rests when no pose moves it. */
export const NEUTRAL: Record<PartKey, number> = {
  dx: 0,
  dy: 0,
  pitch: 0,
  squash: 1,
  stretch: 1,
  head: 0,
  headY: 0,
  tail: 0,
  wing: 0,
  wingScale: 1,
  legs: 1,
  jaw: 0,
  tuft: 0,
  tuftY: 0,
  eye: 1,
  iris: 0,
};

export interface PartRef {
  peak: number;
  rest: number;
  restAt: number;
  /** The lowest and highest value over a loop. */
  range: [number, number];
  /** The phases (0..1) between which the peak is held. */
  hold?: [number, number];
}

export interface PoseRef {
  /** Seconds per loop. */
  period: number;
  parts: Partial<Record<PartKey, PartRef>>;
}

export const POSE_REFERENCE: Record<Pose, PoseRef> = {
  // idle and wait keep only their rest frames: the mind's acts (ACT_REFERENCE) replaced their CSS loops (TL-P4-25).
  idle: { period: 6, parts: {} },
  // tuft held at 8deg
  wait: { period: 4, parts: { tuft: { peak: 8, rest: 8, restAt: 0.5, range: [8, 8] } } },
  // peck 2.2s (rig 24–25deg at 40–64%), peckhead (14deg, then -10deg at 76–88%), pecktail (-18deg at 44%)
  read: {
    period: 2.2,
    parts: {
      pitch: { peak: 25, rest: 0, restAt: 0.15, range: [0, 25] },
      head: { peak: 14, rest: 0, restAt: 0.15, range: [-10, 14] },
      tail: { peak: -18, rest: 0, restAt: 0.15, range: [-18, 0] },
    },
  },
  // nod 1.4s around 16deg (22 at 20%, 21 at 55%), chirp 2.8s (jaw 14deg at 84–90%)
  write: {
    period: 2.8,
    parts: { head: { peak: 22, rest: 16, restAt: 0.95, range: [16, 22] }, jaw: { peak: 14, rest: 0, restAt: 0.5, range: [0, 14] } },
  },
  // hop 1.3s (-16px and -6deg at 35%; scaleY .92/1.06/.9), beat (-38deg scaleY .7), tuck (.55), flick2 (-16deg at 64%)
  carry: {
    period: 1.3,
    parts: {
      dy: { peak: -16, rest: 0, restAt: 0.8, range: [-16, 0] },
      pitch: { peak: -6, rest: 0, restAt: 0.8, range: [-6, 0] },
      squash: { peak: 0.9, rest: 1, restAt: 0.72, range: [0.9, 1.06] },
      stretch: { peak: 1.08, rest: 1, restAt: 0.72, range: [0.96, 1.08] },
      wing: { peak: -38, rest: 0, restAt: 0.8, range: [-38, 18] },
      wingScale: { peak: 0.7, rest: 1, restAt: 0.8, range: [0.7, 1] },
      legs: { peak: 0.55, rest: 1, restAt: 0.8, range: [0.55, 1], hold: [0.22, 0.48] },
      tail: { peak: -16, rest: 0, restAt: 0.3, range: [-16, 0] },
    },
  },
  // proud 3s (scale 1.05,1.03 rotate -4deg held at 20–50%), fan (-22deg), tuftup (16deg), each eased back to rest
  proud: {
    period: 3,
    parts: {
      squash: { peak: 1.03, rest: 1, restAt: 0, range: [1, 1.03], hold: [0.2, 0.5] },
      stretch: { peak: 1.05, rest: 1, restAt: 0, range: [1, 1.05], hold: [0.2, 0.5] },
      pitch: { peak: -4, rest: 0, restAt: 0, range: [-4, 0], hold: [0.2, 0.5] },
      tail: { peak: -22, rest: 0, restAt: 0, range: [-22, 0], hold: [0.2, 0.5] },
      tuft: { peak: 16, rest: 0, restAt: 0, range: [0, 16], hold: [0.2, 0.5] },
    },
  },
  // eyes shut (.08), head 20deg and 3px down, tuft -26deg, breathe 3.6s (scale 1.035,.97 at 50%)
  sleep: {
    period: 3.6,
    parts: {
      squash: { peak: 0.97, rest: 1, restAt: 0, range: [0.97, 1] },
      stretch: { peak: 1.035, rest: 1, restAt: 0, range: [1, 1.035] },
      eye: { peak: 0.08, rest: 0.08, restAt: 0.5, range: [0.08, 0.08] },
      head: { peak: 20, rest: 20, restAt: 0.5, range: [20, 20] },
      headY: { peak: 3, rest: 3, restAt: 0.5, range: [3, 3] },
      tuft: { peak: -26, rest: -26, restAt: 0.5, range: [-26, -26] },
    },
  },
  // tuft 18deg and 2px up, startle 4s (head -10deg at 12–60%)
  alarm: {
    period: 4,
    parts: {
      head: { peak: -10, rest: 0, restAt: 0.05, range: [-10, 0] },
      tuft: { peak: 18, rest: 18, restAt: 0.5, range: [18, 18] },
      tuftY: { peak: -2, rest: -2, restAt: 0.5, range: [-2, -2] },
    },
  },
  // landin 6s (from translate(-120px,-150px) rotate(-18deg); scale 1.12,.86 at 26%), landwing (-46deg scaleY .6),
  // landlegs (.5), landtail (-18deg at 33%), landhead (-12deg at 45–62%, 8deg at 63–80%)
  land: {
    period: 6,
    parts: {
      dx: { peak: -120, rest: 0, restAt: 0.5, range: [-120, 0] },
      dy: { peak: -150, rest: 0, restAt: 0.5, range: [-150, 0] },
      pitch: { peak: -18, rest: 0, restAt: 0.5, range: [-18, 0] },
      squash: { peak: 0.86, rest: 1, restAt: 0.5, range: [0.86, 1.04] },
      stretch: { peak: 1.12, rest: 1, restAt: 0.5, range: [0.97, 1.12] },
      wing: { peak: -46, rest: 0, restAt: 0.5, range: [-46, 22] },
      wingScale: { peak: 0.6, rest: 1, restAt: 0.5, range: [0.6, 1] },
      legs: { peak: 0.5, rest: 1, restAt: 0.5, range: [0.5, 1] },
      tail: { peak: -18, rest: 0, restAt: 0.5, range: [-18, 5] },
      head: { peak: -12, rest: 0, restAt: 0.3, range: [-12, 8] },
    },
  },
};

/** The mind's acts in idle and wait (TL-P4-25): which part each one moves and the values it reaches. */

export interface ActRef {
  /** The pose the act is played in (look is wait's own). */
  pose: 'idle' | 'wait';
  /** The part the act moves and the values it reaches (snap reaches one of its two); none for a pause. */
  part?: PartKey;
  values: number[];
}

export const ACT_REFERENCE: Record<ActName, ActRef> = {
  // the CSS snaps: head to -12deg or 7deg
  snap: { pose: 'idle', part: 'head', values: [-12, 7] },
  // the CSS flick: tail to -14deg, then 4deg
  flick: { pose: 'idle', part: 'tail', values: [-14, 4] },
  chirp: { pose: 'idle', part: 'jaw', values: [14] },
  wing: { pose: 'idle', part: 'wing', values: [-10] },
  // head to the wing: 38 -> 42 -> 38deg, twice
  preen: { pose: 'idle', part: 'head', values: [38, 42] },
  pause: { pose: 'idle', values: [] },
  // wait's CSS iris loop: -2.2px, then 1px
  look: { pose: 'wait', part: 'iris', values: [-2.2, 1] },
};

/**
 * What is wrong with one act, sampled from before it starts until after it
 * ends: its part reaches one of its values (within 2 degrees or units) and
 * never goes more than 2 past them; every other part stays at its rest.
 */
export function actProblems(name: ActName, samples: ReadonlyArray<Record<PartKey, number>>, rest: Record<PartKey, number>): string[] {
  const ref = ACT_REFERENCE[name];
  const problems: string[] = [];
  for (const k of Object.keys(NEUTRAL) as PartKey[]) {
    if (k === 'eye') continue;
    const values = samples.map((s) => s[k]);
    if (k !== ref.part) {
      const off = Math.max(...values.map((v) => Math.abs(v - rest[k])));
      if (off > (PART_KIND[k] === 'scale' ? 0.02 : 1)) problems.push(`${name}: ${k} moves ${off.toFixed(3)} but the act leaves it still`);
      continue;
    }
    const peak = values.reduce((a, v) => (Math.abs(v - rest[k]) > Math.abs(a - rest[k]) ? v : a), rest[k]);
    if (!ref.values.some((v) => Math.abs(peak - v) <= 2)) problems.push(`${name}: ${k} peaks at ${peak.toFixed(2)}, reference ${ref.values.join(' or ')}`);
    const lo = Math.min(rest[k], ...ref.values) - 2;
    const hi = Math.max(rest[k], ...ref.values) + 2;
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min < lo || max > hi) problems.push(`${name}: ${k} spans ${min.toFixed(2)}..${max.toFixed(2)}, range ${lo}..${hi}`);
  }
  return problems;
}

/** Designer-signed reaction values. Angle/offset ranges are each value ±2. */
export interface ReactionRef {
  seconds: number;
  parts: Partial<Record<PartKey, number[]>>;
}
export const REACTION_REFERENCE: Record<ReactionKind, ReactionRef> = {
  yes: { seconds: 0.48, parts: { head: [18] } },
  send: { seconds: 0.8, parts: { head: [18], jaw: [14] } },
  no: { seconds: 0.42, parts: { head: [-14, 10] } },
  duplicate: { seconds: 1, parts: { head: [-14], iris: [1.6] } },
  'point-tidy': { seconds: 0.5, parts: { pitch: [10], tuft: [16], jaw: [0] } },
  'drag-over': { seconds: 0.5, parts: { pitch: [6], tuft: [8], jaw: [14] } },
  'moves-on': { seconds: 1.7, parts: { pitch: [-4, 4], tuft: [18, 8], head: [-10] } },
  'moves-off': { seconds: 0.6, parts: { head: [0], eye: [1] } },
  hide: { seconds: 0.5, parts: { wing: [-38] } },
  done: { seconds: 3, parts: { pitch: [-4], tail: [-22], tuft: [16] } },
  rule: { seconds: 1.2, parts: { dy: [-9] } },
  bin: { seconds: 2.9, parts: { head: [-10], tuft: [18], iris: [1.6] } },
  error: { seconds: 2.9, parts: { head: [-10], tuft: [18], iris: [1.6] } },
  offline: { seconds: 1.5, parts: { head: [-10], tuft: [18] } },
  'link-open': { seconds: 1.5, parts: { iris: [1.6] } },
  'drop-folder': { seconds: 0.3, parts: { dy: [-9] } },
  online: { seconds: 0.3, parts: { dy: [-9] } },
  tap: { seconds: 0.6, parts: { dy: [-9], jaw: [14] } },
  'task-done': { seconds: 0.4, parts: { jaw: [14] } },
};

/** The engine's named actions outside the act table, each with its reference row (TL-P4-22 addendum 20). */
export type ActionName = 'startle';

export interface ActionRef {
  /** Each part the action moves, and the value it eases to and holds (within 2). */
  parts: Partial<Record<PartKey, number>>;
  /** Seconds every part holds its value (within 2). */
  hold: number;
}

/**
 * The bound, as for the acts: once a part reaches its value it stays within 2
 * of the span from its rest to that value until it is back at rest.
 */
export const ACTION_REFERENCE: Partial<Record<ActionName, ActionRef>> = {
  // TL-P4-25 addendum 1 (6), TL-P4-26 addendum 1: on waking or a nudge one step eases the tuft to 18deg and the head
  // to -10deg, holds them 0.6 s and eases back (idle's range: tuft -2..20, head -12..2; TL-P4-22 addendum 20)
  startle: { parts: { tuft: 18, head: -10 }, hold: 0.6 },
};

/**
 * Every public member of the engine, and how its motion is checked. `acts`
 * and `poses` are checked name by name (ACT_REFERENCE, POSE_REFERENCE);
 * `reactions` dispatches every REACTIONS kind through REACTION_REFERENCE; an
 * `action` names its ACTION_REFERENCE row; `script` is a layer script step
 * (the court's flights, pecks and displays), and `control` moves nothing.
 * A new public member fails to compile until it is listed here. A `script` or
 * `control` label is not an exemption: the member must also be on
 * EXEMPT_MEMBERS (TL-P4-22 addendum 21).
 */
export type EngineMember = 'control' | 'script' | 'acts' | 'poses' | 'reactions' | { action: ActionName };

export const ENGINE_MEMBERS: Record<keyof BirdEngine, EngineMember> = {
  speed: 'control',
  start: 'control',
  stop: 'control',
  release: 'control',
  setPose: 'poses',
  setSize: 'control',
  setHome: 'control',
  snapHome: 'control',
  look: 'control',
  nudge: { action: 'startle' },
  busy: 'control',
  settled: 'control',
  act: 'acts',
  play: 'reactions',
  interrupt: 'control',
  then: 'control',
  wait: 'control',
  chirp: 'script',
  flyTo: 'script',
  hopTo: 'script',
  peck: 'script',
  face: 'script',
  study: 'script',
  scribble: 'script',
  holding: 'script',
  showOff: 'script',
  poke: 'script',
};

/**
 * The closed allowlist of engine members with no reference row, each with its
 * reason (TL-P4-22 addendum 21). It only shrinks: engine.test.ts fails if it grows.
 */
export const EXEMPT_MEMBERS: Readonly<Partial<Record<keyof BirdEngine, string>>> = {
  speed: 'control: sets the pace of every motion, moves no part itself',
  start: 'control: starts the frame loop, moves no part itself',
  stop: 'control: stops the frame loop, moves no part itself',
  release: 'control: frees the engine, moves no part itself',
  setSize: 'control: sets the drawing box, moves no part itself',
  setHome: 'control: sets the home point the steps fly back to',
  snapHome: 'control: places the bird at home with no motion',
  look: 'control: sets where the eyes point, read by the poses',
  busy: 'control: reports whether a step runs, moves nothing',
  settled: 'control: reports when the queue is empty, moves nothing',
  interrupt: 'control: clears the queue, moves nothing',
  then: 'control: queues a callback, moves nothing',
  wait: 'control: queues a pause, moves nothing',
  chirp: 'script: pre-V2 layer step, no reference',
  flyTo: 'script: pre-V2 layer step, no reference',
  hopTo: 'script: pre-V2 layer step, no reference',
  peck: 'script: pre-V2 layer step, no reference',
  face: 'script: pre-V2 layer step, no reference',
  study: 'script: pre-V2 layer step, no reference',
  scribble: 'script: pre-V2 layer step, no reference',
  holding: 'script: pre-V2 layer step, no reference',
  showOff: 'script: pre-V2 layer step, no reference',
  poke: 'script: pre-V2 layer step, no reference',
};

/** The allowlist's exact names, own keys only, so an inherited name such as `toString` is never listed. */
export const EXEMPT_NAMES: ReadonlySet<string> = new Set(Object.keys(EXEMPT_MEMBERS));

/** Every engine member whose motion has no reference row, named as `member('name')` or `member: action`. */
export function unreferencedMembers(
  members: Readonly<Record<string, EngineMember>>,
  exempt: ReadonlySet<string> = EXEMPT_NAMES,
): string[] {
  const missing: string[] = [];
  for (const [member, kind] of Object.entries(members)) {
    if (kind === 'script' || kind === 'control') {
      if (!exempt.has(member)) missing.push(`${member}: not referenced and not on the allowlist`);
    } else if (kind === 'acts' || kind === 'poses') {
      // Only the one dispatcher of a table reaches its rows (act(name), setPose(name)); any other member needs its own.
      const [dispatcher, names, rows] = kind === 'acts' ? (['act', ACT_NAMES, ACT_REFERENCE] as const) : (['setPose', POSE_NAMES, POSE_REFERENCE] as const);
      if (member !== dispatcher) missing.push(`${member}: ${kind}, but not the ${kind === 'acts' ? 'act' : 'pose'} dispatcher, so no reference row`);
      else missing.push(...names.filter((n) => !Object.hasOwn(rows, n)).map((n) => `${member}('${n}')`));
    } else if (kind === 'reactions') {
      if (member !== 'play') missing.push(`${member}: reactions, but not the reaction dispatcher, so no reference row`);
      else missing.push(...Object.keys(REACTIONS).filter((n) => !Object.hasOwn(REACTION_REFERENCE, n)).map((n) => `${member}('${n}')`));
    }
    else if (typeof kind === 'object' && !ACTION_REFERENCE[kind.action]) missing.push(`${member}: ${kind.action}`);
  }
  return missing;
}

const nums = (s: string | null | undefined): number[] => (s ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];

/** Reads every part the engine moves, in the drawing's units (`size`: the bird's box in pixels). */
export function readRig(bird: HTMLElement, part: (name: 'rig' | 'head' | 'tail' | 'wing' | 'legs' | 'jaw' | 'tuft' | 'eye' | 'iris') => Element | null | undefined, size = 100) {
  const at = (name: Parameters<typeof part>[0]): number[] => nums(part(name)?.getAttribute('transform'));
  return (): Record<PartKey, number> => {
    const [tx = 0, ty = 0] = nums(bird.style.transform);
    const rig = at('rig');
    const head = at('head');
    const wing = at('wing');
    const tuft = at('tuft');
    return {
      dx: (tx * 100) / size,
      dy: (ty * 100) / size,
      pitch: rig[0] ?? 0,
      squash: rig[6] ?? 1,
      stretch: rig[5] ?? 1,
      head: head[0] ?? 0,
      headY: head[4] ?? 0,
      tail: at('tail')[0] ?? 0,
      wing: wing[0] ?? 0,
      wingScale: wing[6] ?? 1,
      legs: at('legs')[3] ?? 1,
      jaw: at('jaw')[0] ?? 0,
      tuft: tuft[0] ?? 0,
      tuftY: tuft[4] ?? 0,
      eye: at('eye')[3] ?? 1,
      iris: at('iris')[0] ?? 0,
    };
  };
}

export const FPS = 60;

/** A seeded random source (mulberry32), so a test's blinks fall the same way every run. */
export function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fake animation frames: the engine asks, the test plays them at 60 fps. */
export function fakeFrames(seed = 7) {
  let queue: Array<(ts: number) => void> = [];
  let ts = 0;
  let asked = 0;
  return {
    options: {
      frame: (cb: (ts: number) => void): number => {
        asked += 1;
        queue.push(cb);
        return asked;
      },
      cancelFrame: (): void => {
        queue = [];
      },
      random: seeded(seed),
    },
    run(n: number): void {
      for (let i = 0; i < n; i++) {
        const q = queue;
        queue = [];
        ts += 1000 / FPS;
        q.forEach((cb) => cb(ts));
      }
    },
    get asked(): number {
      return asked;
    },
  };
}
