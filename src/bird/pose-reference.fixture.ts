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
 * The rig's scale is read on its vertical factor; blink (5.2 s) is left out.
 */
import type { Pose } from './Bower';

export type PartKey =
  | 'dx'
  | 'dy'
  | 'pitch'
  | 'squash'
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
}

export interface PoseRef {
  /** Seconds per loop. */
  period: number;
  parts: Partial<Record<PartKey, PartRef>>;
}

export const POSE_REFERENCE: Record<Pose, PoseRef> = {
  // snaps 6s (head 0 → -12 → 7 → 0), flick 6s (tail -14 at 74%, 4 at 77%)
  idle: {
    period: 6,
    parts: { head: { peak: -12, rest: 0, restAt: 0.1 }, tail: { peak: -14, rest: 0, restAt: 0.5 } },
  },
  // snaps 4s, tuft held at 8deg, iris look 4s (-2.2px at 42–70%, 1px at 72–100%)
  wait: {
    period: 4,
    parts: {
      head: { peak: -12, rest: 0, restAt: 0.1 },
      tuft: { peak: 8, rest: 8, restAt: 0.5 },
      iris: { peak: -2.2, rest: 0, restAt: 0.2 },
    },
  },
  // peck 2.2s (rig 24–25deg at 40–64%), peckhead (14deg, then -10deg at 76–88%), pecktail (-18deg at 44%)
  read: {
    period: 2.2,
    parts: {
      pitch: { peak: 25, rest: 0, restAt: 0.15 },
      head: { peak: 14, rest: 0, restAt: 0.15 },
      tail: { peak: -18, rest: 0, restAt: 0.15 },
    },
  },
  // nod 1.4s around 16deg (22 at 20%, 21 at 55%), chirp 2.8s (jaw 14deg at 84–90%)
  write: {
    period: 2.8,
    parts: { head: { peak: 22, rest: 16, restAt: 0.95 }, jaw: { peak: 14, rest: 0, restAt: 0.5 } },
  },
  // hop 1.3s (-16px and -6deg at 35%; scaleY .92/1.06/.9), beat (-38deg scaleY .7), tuck (.55), flick2 (-16deg at 64%)
  carry: {
    period: 1.3,
    parts: {
      dy: { peak: -16, rest: 0, restAt: 0.8 },
      pitch: { peak: -6, rest: 0, restAt: 0.8 },
      squash: { peak: 0.9, rest: 1, restAt: 0.72 },
      wing: { peak: -38, rest: 0, restAt: 0.8 },
      wingScale: { peak: 0.7, rest: 1, restAt: 0.8 },
      legs: { peak: 0.55, rest: 1, restAt: 0.8 },
      tail: { peak: -16, rest: 0, restAt: 0.3 },
    },
  },
  // proud 3s (scale 1.05,1.03 rotate -4deg at 20–50%), fan (-22deg), tuftup (16deg)
  proud: {
    period: 3,
    parts: {
      squash: { peak: 1.03, rest: 1, restAt: 0 },
      pitch: { peak: -4, rest: 0, restAt: 0 },
      tail: { peak: -22, rest: 0, restAt: 0 },
      tuft: { peak: 16, rest: 0, restAt: 0 },
    },
  },
  // eyes shut (.08), head 20deg and 3px down, tuft -26deg, breathe 3.6s (scale 1.035,.97 at 50%)
  sleep: {
    period: 3.6,
    parts: {
      squash: { peak: 0.97, rest: 1, restAt: 0 },
      eye: { peak: 0.08, rest: 0.08, restAt: 0.5 },
      head: { peak: 20, rest: 20, restAt: 0.5 },
      headY: { peak: 3, rest: 3, restAt: 0.5 },
      tuft: { peak: -26, rest: -26, restAt: 0.5 },
    },
  },
  // tuft 18deg and 2px up, startle 4s (head -10deg at 12–60%)
  alarm: {
    period: 4,
    parts: {
      head: { peak: -10, rest: 0, restAt: 0.05 },
      tuft: { peak: 18, rest: 18, restAt: 0.5 },
      tuftY: { peak: -2, rest: -2, restAt: 0.5 },
    },
  },
  // landin 6s (from translate(-120px,-150px) rotate(-18deg); scale 1.12,.86 at 26%), landwing (-46deg scaleY .6),
  // landlegs (.5), landtail (-18deg at 33%), landhead (-12deg at 45–62%, 8deg at 63–80%)
  land: {
    period: 6,
    parts: {
      dx: { peak: -120, rest: 0, restAt: 0.5 },
      dy: { peak: -150, rest: 0, restAt: 0.5 },
      pitch: { peak: -18, rest: 0, restAt: 0.5 },
      squash: { peak: 0.86, rest: 1, restAt: 0.5 },
      wing: { peak: -46, rest: 0, restAt: 0.5 },
      wingScale: { peak: 0.6, rest: 1, restAt: 0.5 },
      legs: { peak: 0.5, rest: 1, restAt: 0.5 },
      tail: { peak: -18, rest: 0, restAt: 0.5 },
      head: { peak: -12, rest: 0, restAt: 0.3 },
    },
  },
};

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
