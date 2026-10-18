/**
 * Bower's motion engine: springs on each part of the v10 rig, a queue of
 * actions (fly, hop, peck, show off) and an idle mind that snaps the head,
 * flicks the tail and watches the pointer. Pure DOM, no React: a component
 * hands it the rig's parts and a function that says where "home" is.
 *
 * Coordinates are in the layer's own pixels, Bower's feet at (x, y).
 * Targets are functions, read again every frame, so Bower follows a thing
 * even when the layout moves under it.
 */

import type { Reaction, ReactionKind } from './react';

interface ReactionRequest {
  kind: ReactionKind;
  at?: Point;
  ended: boolean;
  endedAt?: number;
  started: number;
}

export interface Point {
  x: number;
  y: number;
}
export interface Target extends Point {
  /** Landing here counts as being home (Bower stays and idles). */
  perch?: boolean;
}
export type TargetFn = () => Target;

export interface RigParts {
  bird: HTMLElement;
  rig: SVGGElement;
  head: SVGGElement;
  tail: SVGGElement;
  wing: SVGGElement;
  legs: SVGGElement;
  jaw: SVGGElement;
  tuft: SVGGElement;
  eye: SVGGElement;
  iris: SVGGElement;
  /**
   * The label chip that hangs from the beak in a flight (a layer's `carryLabel`
   * or the caller's own thing), positioned by the engine. d-v2-06 changes what
   * it shows; there is no third carry.
   */
  carry?: HTMLElement | null;
  /**
   * The drawing's own thing in the beak (Rig's `carry` part). `holding()` is
   * the one home for what Bower holds: it shows this when there is no chip.
   */
  glyph?: SVGGElement | null;
  /** A burst of sparkles, restarted by `sparkle()`. */
  spark?: HTMLElement | null;
}

interface Spring {
  v: number;
  vel: number;
  t: number;
  k: number;
  c: number;
}
type SpringName =
  | 'tail'
  | 'wing'
  | 'squash'
  | 'pitch'
  | 'legs'
  | 'jaw'
  | 'tuft'
  | 'face'
  | 'ix'
  | 'iy';

/**
 * The head's one motion profile (TL-P4-25 addendum 7): the online trapezoid of
 * robot motion control (Lynch and Park, Modern Robotics, 9.2.2). Its state is
 * the drawn angle `v` and its velocity `vel` (degrees a second); its target is
 * the act channel's `t` plus the gaze channel's `gaze`. Each frame the velocity
 * moves toward the target under the move's speed and acceleration caps, so a
 * target change never touches the drawn angle. A snap owns its target through
 * its hard stop; later moves use the return profile.
 */
interface HeadProfile {
  v: number;
  vel: number;
  /** The act channel's head angle: the pose script, the act or the startle. */
  t: number;
  /** The gaze channel's head offset, added to `t`. */
  gaze: number;
  /** Target channels last followed, and the class of that target change. */
  actTarget: number;
  gazeTarget: number;
  snapTarget: number | null;
}
/**
 * Time-based caps (TL-P4-25 addendum 8), in degrees/second and degrees/second².
 * Keep the existing 60 fps rounding reserve as rates. Four decimal places on
 * the drawn head preserve that reserve when measuring 120 fps or jittered frames.
 */
const FRAME = 1 / 60;
const DRAWN = 0.02;
const HEAD_MOVES = {
  glide: { speed: 360 - DRAWN / FRAME, accel: 5400 - DRAWN / (FRAME * FRAME) },
  snap: { speed: 360 - DRAWN / FRAME, accel: Infinity },
} as const;
/** One frame of the head's profile, `dt` seconds long. */
const follow = (
  h: HeadProfile,
  dt: number,
  move: (typeof HEAD_MOVES)[keyof typeof HEAD_MOVES],
): void => {
  if (dt <= 0) return;
  const top = move.speed * dt;
  const d = (h.snapTarget ?? h.t + h.gaze) - h.v;
  // A snap has no acceleration cap: run at the speed cap, then stop on target.
  if (h.snapTarget !== null) {
    const s = Math.sign(d) * Math.min(top, Math.abs(d));
    h.v += s;
    h.vel = s === d ? 0 : s / dt;
    return;
  }
  // Express the acceleration-limited velocity change as this frame's displacement.
  const a = move.accel * dt * dt;
  const was = h.vel * dt;
  // The fastest step that still brakes onto the target, each later step `braking` smaller: s + (s - a) + ... + (s - n a) = |d|.
  const braking = a;
  const n = Math.floor((Math.sqrt(1 + (8 * Math.abs(d)) / braking) - 1) / 2);
  const brake = (Math.abs(d) + (braking * n * (n + 1)) / 2) / (n + 1);
  let s = clamp(Math.sign(d) * Math.min(top, brake), was - a, was + a);
  // Lands on the target when the last step is within the cap; a target that jumped closer is passed and come back to.
  if (Math.sign(s) === Math.sign(d) && Math.abs(s) > Math.abs(d) && Math.abs(d - was) <= a) s = d;
  h.v += s;
  h.vel = s / dt;
};

type Channel = SpringName | 'head' | 'gazeHead' | 'hop';

interface Action {
  channels?: readonly Channel[];
  el?: number;
  start?(): void;
  /** Returns true when done. */
  update(el: number, dt: number): boolean;
  end?(): void;
}

const spring = (v: number, k: number, c: number): Spring => ({ v, vel: 0, t: v, k, c });
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
/** Holds a spring at `v`, at rest there, so a keyed act draws exactly its keys and lets go smoothly. */
const pin = (c: Spring, v: number): void => {
  c.v = v;
  c.t = v;
  c.vel = 0;
};

/**
 * Every value apply() draws, as drawn: each number already rounded to the
 * precision it is written with. The moves-off settle blends this one vector
 * (the standard pose blend: snapshot the drawn pose, interpolate it to the
 * target pose), so what it draws is exactly what the reader measures.
 */
interface Drawing {
  /** The square wrapper's width and height, frozen with the rest of the drawing. */
  size: number;
  /** The bird's place and facing (the wrapper's translate and scaleX), and its opacity. */
  x: number;
  y: number;
  face: number;
  opacity: number;
  pitch: number;
  sx: number;
  sy: number;
  head: number;
  headY: number;
  tail: number;
  wing: number;
  ws: number;
  legs: number;
  jaw: number;
  tuft: number;
  tuftY: number;
  eye: number;
  ix: number;
  iy: number;
  /** A layer's label chip; null where there is none. */
  chip: { opacity: number; x: number; y: number; r: number } | null;
  /** The Rig's thing in the beak: shown or not (a categorical value, never eased). */
  glyph: boolean;
}
const DRAWN_NUMBERS = ['size', 'x', 'y', 'face', 'opacity', 'pitch', 'sx', 'sy', 'head', 'headY', 'tail', 'wing', 'ws',
  'legs', 'jaw', 'tuft', 'tuftY', 'eye', 'ix', 'iy'] as const;
/** A value as `toFixed(digits)` writes it. */
const fixed = (v: number, digits: number): number => Number(v.toFixed(digits));
/** An unrounded offset, written without exponent notation. */
const offset = (v: number): string => (Math.abs(v) < 1e-6 ? '0' : String(v));
/** The moves-off settle: 0.6 s, cubic ease-out (the packet's ease). */
const SETTLE = 0.6;
const settleEase = (u: number): number => 1 - (1 - u) ** 3;

/** The engine owns transforms until release; retain each last rendered value. */
const drawnTransforms = new WeakMap<SVGGElement, string>();
const transform = (part: SVGGElement, value: string): void => {
  if (drawnTransforms.get(part) === value) return;
  part.setAttribute('transform', value);
  drawnTransforms.set(part, value);
};

/** The poses a perched Bower plays in place (the same names as the still frames). */
export const POSE_NAMES = ['idle', 'wait', 'read', 'write', 'carry', 'proud', 'sleep', 'alarm', 'land'] as const;
export type PoseName = (typeof POSE_NAMES)[number];

/**
 * Where frames and chance come from. Defaults: requestAnimationFrame and
 * Math.random; tests inject fake frames and a seeded source.
 */
export interface EngineOptions {
  frame?: (cb: (ts: number) => void) => number;
  cancelFrame?: (id: number) => void;
  random?: () => number;
  /** The mind may fall asleep after 60 s with no input (perched birds; never a layer's). */
  sleeps?: boolean;
  /** `false` pauses the mind's act scheduling (a test seam). */
  acts?: boolean;
  /** The mount owns lifetime; the engine reports settlement after drawing its last frame. */
  onStill?: () => void;
  /** Settings alone holds a closed-eye still frame. */
  settings?: boolean;
  /** Motion-setting transitions also apply to a mounted sleep pose; ordinary reactions still hear nothing. */
  motionChange?: () => boolean;
}

/** The mind's idle acts (TL-P4-25); `look` is wait's own. */
export const ACT_NAMES = ['snap', 'flick', 'chirp', 'wing', 'preen', 'pause', 'look'] as const;
export type ActName = (typeof ACT_NAMES)[number];

/** Where an input came from: a pointer moving, a touch or press, or the focused control. */
export type LookSource = 'pointer' | 'touch' | 'focus';

/** Who the mind is minding: a perched idle or wait, or a layer's bird between flights. */
type Minded = 'idle' | 'wait' | 'layer';

/** How long an input counts as recent (no snap or preen, and a pointer's gaze holds), in seconds. */
const RECENT = 2.5;
/** Seconds of engine time with no input before the mind sleeps. */
const DOZE = 60;
/**
 * The one startle step, on waking or a nudge: the tuft eases to `tuft` degrees
 * in `rise` seconds and the head rises to `head` as a snap, both hold for
 * `seconds`, and they return to rest, the tuft eased over `fall` and the head
 * by its profile (TL-P4-22 addendum 20, TL-P4-26 addendum 1, TL-P4-25 addendum 7).
 */
const STARTLE = { tuft: 18, head: -10, rise: 0.15, seconds: 0.6, fall: 0.4 } as const;
/** The iris at rest, where no act or input moves it (wait looks straight ahead instead). */
const IRIS_REST = { x: 0.4, y: 0 } as const;
/** The draw's weights (TL-P4-25 act table); wait adds `look`. */
const WEIGHTS: ReadonlyArray<readonly [ActName, number]> = [
  ['snap', 40],
  ['flick', 20],
  ['chirp', 12],
  ['wing', 10],
  ['preen', 8],
  ['pause', 10],
];
/** The head's range in idle and wait (the CSS snaps), which clamps the gaze's head offset. */
/** How far, in degrees, the gaze's wanted head offset moves before the head snaps to it. */
const GAZE_SNAP = 6;
const PERCHED_HEAD: readonly [number, number] = [-12, 7];
const LAYER_HEAD: readonly [number, number] = [-32, 30];

export interface PeckOptions {
  /** How far the body leans in, the head's angle and the open beak while down. */
  depth?: number;
  head?: number;
  jaw?: number;
  /** Body and head on the way back up. */
  upPitch?: number;
  upHead?: number;
  /** Seconds: down until `lean`, the bite until `bite`, done at `end`. */
  lean?: number;
  bite?: number;
  end?: number;
  /** The body's bob at the bite. */
  kick?: number;
}

export interface ShowOffOptions {
  tail?: number;
  wing?: number;
  tuft?: number;
  head?: number;
  /** A held lean; without it the body bounces. */
  pitch?: number;
  /** Chest out: the body's vertical scale while showing off. */
  swell?: number;
  /** The body's width at the swell (without it the body narrows as it grows tall). */
  wide?: number;
  seconds?: number;
  /** Seconds to grow into the display (0: at once). */
  rise?: number;
  /** Seconds to ease back to rest after `seconds` (0: let go at once). */
  fall?: number;
  turn?: boolean;
  chirp?: boolean;
  sparkle?: boolean;
  /** The settle at the end. */
  kick?: number;
}

/** Seconds per loop of each perched pose (poses.css as it was). */
const POSE_PERIOD: Record<PoseName, number> = {
  idle: 6,
  wait: 4,
  read: 2.2,
  write: 2.8,
  carry: 1.3,
  proud: 3,
  sleep: 3.6,
  alarm: 4,
  land: 6,
};

/** The value of the last step at or before phase `p`. */
const held = (p: number, steps: ReadonlyArray<readonly [number, number]>): number => {
  let v = steps[0]?.[1] ?? 0;
  for (const [at, value] of steps) if (p >= at) v = value;
  return v;
};
/** An eased step from 0 to 1 (smoothstep), clamped. */
const smooth = (u: number): number => {
  const x = clamp(u, 0, 1);
  return x * x * (3 - 2 * x);
};
/** Straight lines between keyframes, as CSS plays them; `eased` eases in and out of each key instead. */
const keyed = (p: number, keys: ReadonlyArray<readonly [number, number]>, eased = false): number => {
  for (let i = 1; i < keys.length; i++) {
    const [a, va] = keys[i - 1] ?? [0, 0];
    const [b, vb] = keys[i] ?? [1, 0];
    if (p <= b) return b === a ? vb : va + (vb - va) * (eased ? smooth((p - a) / (b - a)) : (p - a) / (b - a));
  }
  return keys[keys.length - 1]?.[1] ?? 0;
};
/** A wing beat as keyframes: `up` at `ups`, `down` at `downs`, then `rest` from `end` on. */
const beat = (ups: number[], downs: number[], up: number, down: number, end: number, rest: number) =>
  [...ups.map((p) => [p, up] as const), ...downs.map((p) => [p, down] as const), [end, rest] as const, [1, rest] as const].sort(
    (a, b) => a[0] - b[0],
  );

export class BirdEngine {
  /** Claims survive action completion until this frame has been drawn. */
  private owners = new Map<Channel, Action>();
  private writer: Action | null = null;
  private chirpOwner: Action | null = null;
  private hopOwner: Action | null = null;
  /** The one ownership check for every mind write, including delegated hop/chirp steps. */
  private mayWrite(channel: Channel, writer: Action | null = null): boolean {
    const owner = this.owners.get(channel);
    return !owner || owner === writer;
  }
  private claim(a: Action): void {
    for (const channel of a.channels ?? []) this.owners.set(channel, a);
  }
  private updateAction(a: Action, el: number, dt: number): boolean {
    this.claim(a);
    const previous = this.writer;
    this.writer = a;
    try { return a.update(el, dt); }
    finally { this.writer = previous; }
  }
  private C: Record<SpringName, Spring> = {
    tail: spring(0, 420, 14),
    wing: spring(0, 520, 22),
    squash: spring(1, 700, 16),
    pitch: spring(0, 380, 24),
    legs: spring(1, 500, 28),
    jaw: spring(0, 1400, 46),
    tuft: spring(0, 300, 12),
    face: spring(1, 700, 34),
    ix: spring(IRIS_REST.x, 600, 40),
    iy: spring(IRIS_REST.y, 600, 40),
  };
  /** The head, the one part that moves by its motion profile instead of a spring. */
  private H: HeadProfile = {
    v: 0,
    vel: 0,
    t: 0,
    gaze: 0,
    actTarget: 0,
    gazeTarget: 0,
    snapTarget: null,
  };
  private B = {
    x: 0,
    y: 0,
    face: 1,
    hopY: 0,
    hopKick: 0,
    bob: 0,
    flying: false,
    flare: false,
    ph: 0,
    ws: 1,
    home: true,
    carrying: false,
    ruleCarry: false,
    headY: 0,
    tuftY: 0,
    opacity: 1,
    /** How the body's width follows its height: -0.7 keeps its volume. */
    girth: -0.7,
  };
  private S = {
    t: 0,
    queue: [] as Action[],
    action: null as Action | null,
    /** Where the input is: a point, or one read each frame (a focused control, which may scroll or leave). */
    ptr: null as Point | (() => Point | null) | null,
    ptrT: -10,
    ptrSrc: 'pointer' as LookSource,
    /** The last input, in engine time (recency). */
    inputT: -10,
    /** Since when the bird has been without input for sleep: the last input, mount or the pose's start. */
    quietT: 0,
    /** The act under way on the act channel (idle, wait, a layer's bird between flights). */
    doing: null as Action | null,
    /** The shared startle step owns the snap until its stationary landing frame. */
    startleRising: false,
    sleepT0: 0,
    /** One latest input, played on landing (tap and reactions share it). */
    pending: null as ReactionRequest | null,
    lastSnap: 0,
    nextIdle: 1.2,
    nextBlink: 2,
    blinkT: -1,
    blink: 0,
    blinkDouble: false,
    chirpT: 0,
    chirpLength: 0,
    behindT: 0,
  };
  private reaction: ReactionRequest | null = null;
  /**
   * The one gate: only a live engine runs its motion sources (the mind, acts,
   * chirp, breathing, gaze, the pose script, CSS decoration). While it settles,
   * the loop draws only the blend; once still, nothing.
   */
  private motion: 'live' | 'settling' | 'still' = 'live';
  /** The moves-off blend: the drawn pose at react() time, its still frame, and when it began. */
  private blend: { from: Drawing; to: Drawing; t0: number } | null = null;
  /** A pose change that arrives during the settle, applied after it. */
  private queuedPose: { pose: PoseName | null } | null = null;
  private notifyStill = false;
  /** What apply() drew last. */
  private drawn: Drawing | null = null;
  private onStill?: () => void;
  private settings: boolean;
  private settingChanges: () => boolean;
  private raf = 0;
  private drawnSize: number | null = null;
  private drawnPlace: string | null = null;
  private drawnGlyph: boolean | null = null;
  private drawnOpacity: string | null = null;
  private drawnChip: string | null = null;
  private last = 0;
  private running = false;
  private idleWaiters: Array<() => void> = [];
  /** Plays actions faster (a replay) or slower; springs keep their own pace. */
  speed = 1;
  /** The perched pose, or null for a bird that flies about its layer. */
  private pose: PoseName | null = null;
  private poseT0 = 0;
  private poseCycle = -1;
  private poseActed = false;
  private frame: (cb: (ts: number) => void) => number;
  private cancelFrame: (id: number) => void;
  private random: () => number;
  private sleeps: boolean;
  private acts: boolean;
  /** Asleep: set by the sleep pose, or by the mind after 60 s with no input. */
  private asleep = false;
  /** The name of the act under way (`S.doing`), so input can cut a snap or preen. */
  private doing: ActName | null = null;

  constructor(
    private parts: RigParts,
    private home: TargetFn,
    private size = 96,
    options: EngineOptions = {},
  ) {
    this.frame = options.frame ?? ((cb) => requestAnimationFrame(cb));
    this.cancelFrame = options.cancelFrame ?? ((id) => cancelAnimationFrame(id));
    this.random = options.random ?? Math.random;
    this.sleeps = options.sleeps ?? false;
    this.acts = options.acts ?? true;
    this.onStill = options.onStill;
    this.settings = options.settings ?? false;
    this.settingChanges = options.motionChange ?? (() => false);
    const h = home();
    this.B.x = h.x;
    this.B.y = h.y;
    this.drawFrame();
  }

  /** Starts the frame loop. Call `stop()` when the bird leaves the page. */
  start(): void {
    if (this.running) return;
    // A retained layer can regain its turn after releasing its drawing.
    if (this.motion === 'still') this.motion = 'live';
    this.running = true;
    this.last = 0;
    this.raf = this.frame(this.loop);
  }
  stop(): void {
    this.running = false;
    this.cancelFrame(this.raf);
  }
  /**
   * Stops and gives the drawing back: every attribute the engine wrote is
   * cleared, so the still frame's CSS shows again (the bird lost its turn).
   * A layer keeps its wrapper's home placement and size; CSS owns its parts.
   */
  release(): void {
    this.stop();
    this.clearCssMotion();
    const P = this.parts;
    this.drawFrame(true);
    for (const g of [P.rig, P.head, P.tail, P.wing, P.legs, P.jaw, P.tuft, P.eye, P.iris]) {
      g.removeAttribute('transform');
      drawnTransforms.delete(g);
    }
    P.glyph?.setAttribute('display', 'none');
    P.bird.style.opacity = '';
    if (!P.carry) for (const k of ['transform', 'width', 'height'] as const) P.bird.style[k] = '';
    this.drawnSize = null;
    this.drawnPlace = null;
    this.drawnGlyph = null;
    this.drawnOpacity = null;
  }
  /**
   * Plays a pose in place, looping its fixed script, and never flies home or
   * idles at random; `null` gives the bird back to its layer's idle mind.
   */
  setPose(pose: PoseName | null): void {
    // A pose change during the settle waits for its release: the blend's target never moves.
    if (this.motion === 'settling') { this.queuedPose = { pose }; return; }
    this.interrupt();
    this.endAct();
    this.pose = pose;
    this.asleep = pose === 'sleep';
    this.S.quietT = this.S.t;
    this.S.startleRising = false;
    this.poseT0 = this.S.t;
    this.poseCycle = -1;
    this.B.headY = 0;
    this.B.tuftY = 0;
    this.B.opacity = 1;
    this.B.girth = -0.7;
    if (pose === 'carry') this.holding(true);
  }
  private rand(a: number, b: number): number {
    return a + (b - a) * this.random();
  }
  setSize(size: number): void {
    this.size = size;
  }
  setHome(home: TargetFn): void {
    this.home = home;
  }
  /** Jumps home without flying (used when motion is off). */
  snapHome(): void {
    const h = this.home();
    this.B.x = h.x;
    this.B.y = h.y;
    this.B.home = true;
    this.drawFrame();
  }
  /**
   * Where an input is, in layer pixels: Bower looks at it, for 2.5 s after a
   * pointer or a touch, and for as long as focus stays on a control. A focused
   * control's place is read each frame, and its gaze ends when that read gives
   * null (focus left it). `null` is an input with no place (a key with nothing
   * focused): it counts as input and leaves the gaze as it is, so a live
   * pointer gaze holds.
   */
  look(p: Point | (() => Point | null) | null, source: LookSource): void {
    if (!this.heard() || !p) return;
    this.S.ptr = p;
    this.S.ptrT = this.S.t;
    this.S.ptrSrc = source;
  }
  /**
   * An input with no place: wakes the bird with a startle (tuft up 18 degrees, head -10,
   * for 0.6 s), or startles it where the mind owns its acts.
   */
  nudge(): void {
    if (!this.heard()) return;
    if (this.minded()) this.startle();
  }
  /**
   * Marks an input in engine time, wakes a dozing bird and cuts a snap or
   * preen under way (none while input is recent); false for a bird in the
   * sleep pose, which hears nothing.
   */
  private heard(): boolean {
    if (this.pose === 'sleep' || this.motion !== 'live') return false;
    this.S.inputT = this.S.t;
    this.S.quietT = this.S.t;
    if (this.asleep) this.wake();
    if (this.doing === 'snap' || this.doing === 'preen') this.interrupt({ now: true });
    return true;
  }
  /**
   * Starts the one startle step from where the tuft is now. The step owns the
   * head while it plays (TL-P4-25 addendum 4): the gaze's head offset goes to
   * 0, and the gaze moves only the iris. The head's profile carries it there.
   */
  private startle(): void {
    this.endAct();
    this.doNow(this.makeStartle());
    this.H.gaze = 0;
  }
  /**
   * Puts an act on the act channel and claims its channels at once, so no write
   * between now and its first frame (a chirp, the mind) can reach them.
   */
  private doNow(a: Action): void {
    a.el = 0;
    this.S.doing = a;
    this.claim(a);
  }
  /** One arrival-based step; an alarm keeps the reached values instead of returning through rest. */
  private makeStartle(holdAlarm = false): Action {
    const from = this.C.tuft.v;
    const restTuft = this.pose === 'wait' ? 8 : 0;
    let hold = -1;
    let fall = 0;
    this.S.startleRising = true;
    return {
      channels: ['head', 'gazeHead', 'tuft', 'face', 'hop'],
      update: (el, dt) => {
        if (hold < 0 && el >= STARTLE.rise && !this.S.startleRising) hold = 0;
        else if (hold >= 0) hold += dt;
        if (hold < STARTLE.seconds || holdAlarm) {
          this.H.t = STARTLE.head;
          pin(this.C.tuft, from + (STARTLE.tuft - from) * smooth(el / STARTLE.rise));
          return holdAlarm && hold >= STARTLE.seconds;
        }
        fall += dt;
        this.H.t = 0;
        pin(this.C.tuft, STARTLE.tuft + (restTuft - STARTLE.tuft) * smooth(fall / STARTLE.fall));
        return fall >= STARTLE.fall;
      },
      end: () => { this.S.startleRising = false; },
    };
  }
  /** Whether the mind owns the act channel: idle, wait, or a layer's bird. */
  private minded(): boolean {
    return this.pose === null || this.pose === 'idle' || this.pose === 'wait';
  }
  get busy(): boolean {
    return !!this.S.action || this.S.queue.length > 0;
  }
  /** Resolves when every queued action is done. */
  settled(): Promise<void> {
    if (!this.busy) return Promise.resolve();
    return new Promise((r) => this.idleWaiters.push(r));
  }
  /**
   * Fires one named idle act on the act channel, cutting the one under way.
   * The mind draws them. Only a bird whose
   * act channel the mind owns (idle, wait, a layer's) and that is awake acts.
   */
  act(name: ActName): void {
    if (!this.minded() || this.asleep || this.motion !== 'live') return;
    this.endAct();
    this.doNow(this.makeAct(name));
    this.doing = name;
  }
  private endAct(): void {
    const a = this.S.doing;
    this.S.doing = null;
    this.doing = null;
    this.reaction = null;
    a?.end?.();
  }
  /** The only reaction dispatcher; a return handle ends this particular input. */
  play(kind: ReactionKind, at?: Point): Reaction {
    const request: ReactionRequest = { kind, at, ended: false, started: this.S.t };
    if (this.pose === 'sleep' && kind !== 'error' && kind !== 'offline' &&
      !((kind === 'moves-off' || kind === 'moves-on') && this.settingChanges())) return { end() {} };
    if (this.motion !== 'live' && kind !== 'moves-on') return { end() {} };
    if (kind === 'moves-off') {
      this.beginSettle();
      return { end() {} };
    }
    this.S.inputT = this.S.t;
    this.S.quietT = this.S.t;
    if (kind !== 'moves-on' && !this.pose && !this.reaction && (this.busy || this.B.carrying)) this.S.pending = request;
    else this.beginReaction(request);
    return { end: () => { request.ended = true; request.endedAt ??= this.S.t; } };
  }
  private beginReaction(request: ReactionRequest): void {
    if (request.ended) return;
    this.motion = 'live';
    this.blend = null;
    this.applyQueuedPose();
    const waking = this.asleep || request.kind === 'moves-on';
    this.interrupt({ now: true });
    this.B.headY = 0;
    this.B.tuftY = 0;
    this.B.girth = -0.7;
    this.B.hopY = 0;
    this.B.hopKick = 0;
    this.S.chirpT = 0;
    this.H.gaze = 0;
    this.reaction = request;
    this.doNow(this.makeAct(request.kind, request, waking));
    this.asleep = false;
  }
  /**
   * Moves off: snapshot the whole drawn pose and blend it to the still frame
   * (TL-P4-26 addendum 7). Every other motion source waits at the gate, so the
   * drawing at release is the still frame by construction.
   */
  private beginSettle(): void {
    this.clearCssMotion();
    this.interrupt({ now: true });
    this.S.pending = null;
    const from = this.drawn ?? this.drawing();
    this.blend = { from, to: this.stillDrawing(from), t0: this.S.t };
    this.motion = 'settling';
  }
  /** The still frame the drawing settles to: poses.css's still pose, Settings' closed eyes, at home. */
  private stillDrawing(from: Drawing): Drawing {
    const pose = this.pose ?? 'idle';
    const h = this.home();
    const Z = from.size;
    const sleep = pose === 'sleep' && !this.settings;
    return {
      size: Z,
      x: fixed(h.x - Z / 2, 1), y: fixed(h.y - 0.92 * Z, 1), face: 1, opacity: 1,
      pitch: 0, sx: 1, sy: 1,
      head: this.settings ? 8 : sleep ? 20 : 0, headY: sleep ? 3 : 0,
      tail: 0, wing: 0, ws: 1, legs: 1, jaw: 0,
      tuft: pose === 'sleep' ? -26 : pose === 'alarm' ? 18 : pose === 'wait' ? 8 : 0,
      tuftY: pose === 'alarm' ? -2 : 0,
      eye: this.settings ? 0.08 : 1, ix: 0, iy: 0,
      chip: from.chip && { ...from.chip, opacity: 0 },
      glyph: pose === 'carry',
    };
  }
  /** The blend at engine time: each drawn value eased from its snapshot; the still frame itself at the end. */
  private blendDrawing(blend: { from: Drawing; to: Drawing; t0: number }): Drawing {
    const el = this.S.t - blend.t0;
    if (el >= SETTLE - 1e-9) return blend.to;
    // Summed frame times carry float noise; a 1e-9 grid keeps whole frames exact (0.75 is 0.75).
    const q = settleEase(Math.round(clamp(el / SETTLE, 0, 1) * 1e9) / 1e9);
    const { from, to } = blend;
    const out = { ...from };
    for (const key of DRAWN_NUMBERS) out[key] = from[key] + (to[key] - from[key]) * q;
    if (from.chip && to.chip) out.chip = { opacity: from.chip.opacity + (to.chip.opacity - from.chip.opacity) * q,
      x: from.chip.x, y: from.chip.y, r: from.chip.r };
    return out;
  }
  /** The blend has ended: the state is the still frame it drew, and a queued pose applies. */
  private endSettle(): void {
    const C = this.C;
    const B = this.B;
    const H = this.H;
    const to = this.blend?.to;
    this.blend = null;
    this.motion = 'still';
    this.notifyStill = true;
    if (!to) return;
    for (const name of ['pitch', 'tail', 'wing', 'jaw', 'ix', 'iy'] as const) pin(C[name], 0);
    for (const name of ['squash', 'legs', 'face'] as const) pin(C[name], 1);
    pin(C.tuft, to.tuft);
    Object.assign(H, { v: to.head, vel: 0, t: to.head, gaze: 0, actTarget: to.head, gazeTarget: 0, snapTarget: null });
    const h = this.home();
    Object.assign(B, { x: h.x, y: h.y, face: 1, hopY: 0, hopKick: 0, bob: 0, ws: 1, headY: to.headY, tuftY: to.tuftY,
      opacity: 1, girth: -0.7, flying: false, flare: false, ruleCarry: false });
    Object.assign(this.S, { chirpT: 0, blink: 0, blinkT: -1, startleRising: false });
    this.drawn = to;
    this.applyQueuedPose();
  }
  /** The same deferred pose handover after completion or a moves-on interruption. */
  private applyQueuedPose(): void {
    const queued = this.queuedPose;
    this.queuedPose = null;
    if (queued) this.setPose(queued.pose);
  }
  private updateReaction(dt: number): void {
    const a = this.S.doing;
    if (!a) return;
    this.rest(this.pose === 'wait' ? 'wait' : 'idle', a);
    if (this.mayWrite('pitch', a)) this.C.pitch.t = 0;
    if (this.mayWrite('squash', a)) this.C.squash.t = 1;
    if (this.mayWrite('legs', a)) this.C.legs.t = 1;
    this.H.gaze = 0;
    this.gaze(dt, null);
    a.el = (a.el ?? 0) + dt;
    if (this.updateAction(a, a.el, dt)) {
      this.endAct();
      this.poseT0 = this.S.t;
      this.poseCycle = -1;
      if (this.pose === 'sleep') this.asleep = true;
    }
  }
  /** One composite act and keyed timeline per kind; substeps never enter the layer queue. */
  private makeReaction(request: ReactionRequest, waking: boolean): Action {
    const { kind, at } = request;
    const C = this.C;
    const B = this.B;
    const needsStartle = waking || kind === 'bin' || kind === 'error' || kind === 'offline';
    const holdAlarm = kind === 'offline' || (kind === 'error' && this.pose === 'sleep');
    const startle = needsStartle ? this.makeStartle(holdAlarm) : null;
    let startleDone = !startle;
    let startleClock = 0;
    let clock = 0;
    let ending = -1;
    let chirped = false;
    const partStarts: Partial<Record<SpringName, number>> = {};
    const partEnds: Partial<Record<SpringName, number>> = {};
    const heldCarry = B.carrying;
    const fromX = B.x;
    const proud = kind === 'done' ? this.makeShowOff({ tail: -22, wing: 0, tuft: 16, head: 0,
      pitch: -4, swell: 1.03, wide: 1.05, seconds: 1.5, rise: 0.6, fall: 1.4,
      turn: false, chirp: false, sparkle: false, kick: 0 }) : null;
    proud?.start?.();
    const angle = (keys: ReadonlyArray<readonly [number, number]>): number => keyed(clock, keys, true);
    const starting = (name: SpringName): number => partStarts[name] ??= C[name].v;
    const part = (name: SpringName, keys: ReadonlyArray<readonly [number, number]>): void => {
      pin(C[name], angle([[0, starting(name)], ...keys.slice(1)]));
    };
    // The composite writes the rest baseline as well as its keyed parts.
    const channels: Channel[] = ['head', 'gazeHead', 'hop',
      ...(Object.keys(C) as SpringName[]).filter((name) => name !== 'ix' && name !== 'iy')];
    if (at && (kind === 'duplicate' || kind === 'link-open' || kind === 'bin' || kind === 'error')) channels.push('ix', 'iy');
    return {
      channels,
      update: (_el, dt) => {
        if (!startleDone && startle) {
          startleClock += dt;
          // The composite owns its substep; it never enters the layer queue.
          startleDone = startle.update(startleClock, dt);
          if (startleDone) startle.end?.();
          return false;
        }
        clock += dt;
        switch (kind) {
          case 'yes':
          case 'send':
            this.H.t = angle([[0, 0], [0.08, 18], [0.16, 18], [0.24, 0], [0.32, 18], [0.40, 18], [0.48, 0]]);
            if (kind === 'send' && clock >= 0.48 && !chirped) {
              chirped = true;
              this.chirp(0.3);
            }
            return clock >= (kind === 'send' ? 0.8 : 0.48);
          case 'no':
            this.H.t = angle([[0, 0], [0.07, -14], [0.14, -14], [0.24, 10], [0.31, 10], [0.42, 0]]);
            return clock >= 0.42;
          case 'duplicate':
            this.H.t = angle([[0, 0], [0.2, -14], [0.8, -14], [1, 0]]);
            this.actionLook(at);
            return clock >= 1;
          case 'point-tidy':
          case 'drag-over': {
            if ((request.ended || this.S.t - request.started >= 10) && ending < 0) {
              ending = clock - (this.S.t - Math.min(request.endedAt ?? Infinity, request.started + 10));
              for (const name of ['pitch', 'tuft', 'jaw'] as const) partEnds[name] = C[name].v;
            }
            const q = ending < 0 ? smooth(clock / 0.2) : 1 - smooth((clock - ending) / 0.25);
            const targets = { pitch: kind === 'point-tidy' ? 10 : 6,
              tuft: kind === 'point-tidy' ? 16 : 8, jaw: kind === 'point-tidy' ? 0 : 14 };
            for (const name of ['pitch', 'tuft', 'jaw'] as const) {
              pin(C[name], ending < 0 ? starting(name) + (targets[name] - starting(name)) * q :
                (partEnds[name] ?? 0) * q);
            }
            return ending >= 0 && clock - ending >= 0.25;
          }
          case 'task-done':
            if (!chirped) { chirped = true; this.chirp(0.3); }
            return clock >= 0.4;
          case 'link-open':
            this.actionLook(at);
            return request.ended || clock >= 1.5;
          case 'bin':
          case 'error':
            if (this.pose === 'sleep') {
              this.H.t = -10;
              pin(C.tuft, 18);
              this.actionLook(at);
              return request.ended;
            }
            this.actionLook(at);
            return request.ended || clock >= 1.5;
          case 'offline':
            this.H.t = -10;
            pin(C.tuft, 18);
            return request.ended;
          case 'moves-on':
            part('pitch', [[0, 0], [0.05, 4], [0.1, -4], [0.15, 4], [0.2, -4],
              [0.25, 4], [0.3, -4], [0.35, 4], [0.4, 0]]);
            part('tuft', [[0, 0], [0.05, 8], [0.15, 6], [0.25, 4], [0.35, 2], [0.4, 0]]);
            return clock >= 0.4;
          case 'hide':
            part('wing', [[0, 0], [0.2, -38], [0.3, -38], [0.5, 0]]);
            return clock >= 0.5;
          case 'done':
            return proud?.update(clock, dt) ?? true;
          case 'tap':
          case 'drop-folder':
          case 'online':
          case 'rule':
            if (clock <= dt + 1e-9) {
              B.hopKick = 0.16;
              this.hopOwner = this.writer;
              if (kind === 'tap') {
                this.chirp(0.3);
                C.squash.vel += 2;
                C.tail.vel += 260;
              }
            }
            if (kind === 'rule') {
              // A rule uses the Rig glyph, even when a layer has its own carry chip.
              B.ruleCarry = clock < 1;
              part('jaw', [[0, 0], [0.9, 0], [0.98, 14], [1.04, 14], [1.18, 0]]);
              if (at) B.x = fromX + clamp(at.x - fromX, -9, 9) * smooth(clock / 0.16);
            }
            return clock >= (kind === 'rule' ? 1.18 : kind === 'tap' ? 0.6 : 0.3);
          case 'moves-off':
            // Never an act: the settle is the one blend (beginSettle).
            return true;
        }
      },
      end: () => {
        startle?.end?.();
        proud?.end?.();
        if (kind === 'rule') {
          B.carrying = heldCarry;
          B.ruleCarry = false;
          B.x = this.home().x;
        }
      },
    };
  }
  /** An action's target uses the gaze's own eye geometry, and never moves the head. */
  private actionLook(at?: Point): void {
    if (!at) return;
    this.pointEyes(at);
  }

  /** The act table (TL-P4-25): each act writes its part; `rest()` puts the parts back each frame. */
  private makeAct(name: ActName | ReactionKind, request?: ReactionRequest, waking = false): Action {
    const C = this.C;
    if (request) return this.makeReaction(request, waking);
    switch (name) {
      case 'snap': {
        const to = this.random() < 0.5 ? -12 : 7;
        return {
          channels: ['head'],
          update: (el) => {
            this.H.t = to;
            return el >= 0.6;
          },
        };
      }
      case 'flick':
        return {
          channels: ['tail'],
          update: (el) => {
            pin(C.tail, keyed(el, [[0, 0], [0.12, -14], [0.3, 4], [0.48, 0]], true));
            return el >= 0.48;
          },
        };
      case 'chirp':
        return {
          channels: ['jaw'],
          update: (el) => {
            C.jaw.t = el < 0.16 ? 14 : 0;
            return el >= 0.3;
          },
        };
      case 'wing':
        // The wing's target held at -10 for 0.22 s.
        return {
          channels: ['wing'],
          update: (el) => {
            pin(C.wing, keyed(el, [[0, 0], [0.05, -10], [0.27, -10], [0.35, 0]], true));
            return el >= 0.35;
          },
        };
      case 'preen':
        // Head to the wing, 38 -> 42 -> 38 twice, the iris down; never the body's girth.
        return {
          channels: ['head', 'iy'],
          update: (el) => {
            this.H.t = keyed(el, [[0, 0], [0.15, 38], [0.3, 42], [0.45, 38], [0.6, 42], [0.75, 38], [0.9, 0]], true);
            C.iy.t = el < 0.75 ? 1.2 : 0;
            return el >= 0.9;
          },
        };
      case 'look':
        return {
          channels: ['ix'],
          update: (el) => {
            C.ix.t = el < 0.4 ? -2.2 : 1;
            return el >= 0.8;
          },
        };
      case 'pause':
        return { update: () => true };
      default:
        return { update: () => true };
    }
  }
  /** Queues an action; it runs after the ones before it. */
  private enqueue(a: Action): this {
    this.S.queue.push(a);
    return this;
  }
  /**
   * Drops what is queued and the tap kept for later (the action under way
   * finishes, so nothing jumps). `now` instead cuts only the action and the
   * act under way, at once: it keeps the queued script, the kept tap and what
   * the bird holds, and leaves the springs where they are, so a tap starts at
   * the next frame, a layer's script goes on and a perched pose's loop picks up
   * at its next cycle (TL-P4-25 addendum 3 (4)).
   */
  interrupt({ now = false }: { now?: boolean } = {}): void {
    const S = this.S;
    if (!now) {
      S.queue = [];
      S.pending = null;
      this.B.carrying = false;
      return;
    }
    const a = S.action;
    S.action = null;
    a?.end?.();
    this.endAct();
    if (this.pose) this.poseActed = true;
    this.settle();
  }
  private settle(): void {
    if (this.busy) return;
    const w = this.idleWaiters;
    this.idleWaiters = [];
    w.forEach((f) => f());
  }

  /** Runs a callback in the queue, between moves. */
  then(fn: () => void): this {
    return this.enqueue({
      update: () => {
        fn();
        return true;
      },
    });
  }
  wait(seconds: number): this {
    return this.enqueue({ update: (el) => el >= seconds });
  }
  chirp(d = 0.4): void {
    if (this.motion !== 'live') return;
    this.chirpOwner = this.writer;
    if (this.writer) {
      this.writer.channels = [...this.writer.channels ?? [], 'jaw', 'tuft'];
      this.claim(this.writer);
    }
    this.S.chirpT = d;
    this.S.chirpLength = d;
    if (this.mayWrite('tuft', this.writer)) this.C.tuft.vel -= 120;
  }
  private turn(): void {
    if (!this.mayWrite('face') || !this.mayWrite('hop')) return;
    this.hopOwner = null;
    this.B.face *= -1;
    this.C.squash.vel += 1.6;
    this.B.hopKick = 0.16;
    this.C.tail.vel += 200;
  }

  // ---------- actions ----------

  /** A flight on a curve: crouch, beat the wings, flare, land with a squash. */
  flyTo(get: TargetFn): this {
    const B = this.B;
    const C = this.C;
    let x0 = 0,
      y0 = 0,
      dur = 1,
      pre = 0,
      go = false;
    return this.enqueue({
      start: () => {
        const T = get();
        x0 = B.x;
        y0 = B.y;
        const dist = Math.hypot(T.x - x0, T.y - y0);
        dur = clamp(dist / 600, 0.55, 1.3);
        if (Math.abs(T.x - x0) > 6) B.face = Math.sign(T.x - x0);
        pre = B.flying ? 0 : 0.12;
        if (pre) {
          C.squash.t = 0.8;
          C.pitch.t = 10;
        }
        B.home = false;
      },
      update: (el) => {
        if (el < pre) return false;
        if (!go) {
          go = true;
          C.squash.t = 1;
          C.squash.vel += 4;
          B.flying = true;
          C.legs.t = 0.3;
          C.tuft.t = 6;
        }
        const T = get();
        const dist = Math.hypot(T.x - x0, T.y - y0);
        const cx = (x0 + T.x) / 2;
        const cy = Math.min(y0, T.y) - 40 - Math.min(dist, 700) * 0.18;
        const q = Math.min(1, (el - pre) / dur);
        const e = q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
        const u = 1 - e;
        const nx = u * u * x0 + 2 * u * e * cx + e * e * T.x;
        const ny = u * u * y0 + 2 * u * e * cy + e * e * T.y;
        const vy = ny - B.y;
        if (Math.abs(nx - B.x) > 0.5) B.face = Math.sign(nx - B.x);
        B.x = nx;
        B.y = ny;
        C.pitch.t = clamp(vy * 3, -24, 22);
        B.flare = q > 0.8;
        if (B.flare) {
          C.legs.t = 1;
          C.pitch.t = -14;
        }
        if (q >= 1) {
          B.flying = false;
          B.flare = false;
          C.squash.v = 0.74;
          C.squash.vel = 0;
          C.squash.t = 1;
          C.tail.vel += 340;
          C.pitch.t = 0;
          C.wing.v = 10;
          C.wing.t = 0;
          C.legs.t = 1;
          C.tuft.t = 0;
          B.home = !!T.perch;
          return true;
        }
        return false;
      },
    });
  }

  /** Short distances are hops: crouch, arc, land, flick. */
  hopTo(get: TargetFn): this {
    const B = this.B;
    const C = this.C;
    let x0 = 0,
      n = 1,
      dur = 0.26,
      landed = -1;
    const hd = 0.26;
    return this.enqueue({
      start: () => {
        const T = get();
        x0 = B.x;
        const dx = T.x - B.x;
        n = Math.max(1, Math.ceil(Math.abs(dx) / 40));
        dur = n * hd;
        if (Math.abs(dx) > 2) B.face = Math.sign(dx);
        B.home = false;
      },
      update: (el) => {
        const T = get();
        const i = Math.min(n - 1, Math.floor(el / hd));
        const u = (el - i * hd) / hd;
        B.y = T.y;
        if (u < 0.3) {
          C.squash.t = 0.82;
          C.pitch.t = 8;
          B.hopY = 0;
          B.x = x0 + ((T.x - x0) * i) / n;
          C.legs.t = 1;
        } else {
          const s = (u - 0.3) / 0.7;
          C.squash.t = 1.06;
          C.pitch.t = -6;
          C.legs.t = 0.75;
          B.hopY = -20 * 4 * s * (1 - s);
          B.x = x0 + ((T.x - x0) * (i + s)) / n;
          if (s > 0.92 && landed !== i) {
            landed = i;
            C.squash.v = 0.84;
            C.tail.vel += 240;
            C.wing.vel += 120;
          }
        }
        if (el >= dur) {
          B.x = T.x;
          B.hopY = 0;
          C.squash.t = 1;
          C.pitch.t = 0;
          C.legs.t = 1;
          B.home = !!T.perch;
          return true;
        }
        return false;
      },
    });
  }

  /** Leans in and pecks. `onBite` runs when the beak closes (pick up, drop). */
  peck(onBite?: () => void, o: PeckOptions = {}): this {
    const C = this.C;
    const { depth = 34, head = 24, jaw = 20, upPitch = -8, upHead = -10, lean = 0.16, bite = 0.3, end = 0.55, kick = 1.2 } = o;
    let bit = false;
    return this.enqueue({
      update: (el) => {
        if (el < lean) {
          C.pitch.t = depth;
          this.H.t = head;
          C.jaw.t = jaw;
        } else if (el < bite) {
          C.jaw.t = 0;
          if (!bit) {
            bit = true;
            C.squash.vel -= kick;
            onBite?.();
          }
        } else {
          C.pitch.t = upPitch;
          this.H.t = upHead;
          C.legs.t = 1;
        }
        return el > end;
      },
      end: () => {
        C.pitch.t = 0;
        this.H.t = 0;
      },
    });
  }

  /** Turns to face right (1) or left (-1) with a small hop, if it is not already. */
  face(dir: 1 | -1): this {
    return this.enqueue({
      update: () => {
        if (this.B.face !== dir) this.turn();
        return true;
      },
    });
  }

  /** Holds something up and studies it: the head snaps from angle to angle. */
  study(seconds = 1.1): this {
    const C = this.C;
    const angles = [-18, 6, -10, 12];
    return this.enqueue({
      update: (el) => {
        const i = Math.min(angles.length - 1, Math.floor((el / seconds) * angles.length));
        this.H.t = angles[i] ?? 0;
        C.tuft.t = i % 2 ? 8 : 0;
        return el >= seconds;
      },
      end: () => {
        this.H.t = 0;
        C.tuft.t = 0;
      },
    });
  }

  /**
   * Writes with the beak: leans in, the head works in quick small strokes,
   * and `onStroke` runs at the start of each stroke (the caller draws a line).
   */
  scribble(seconds: number, onStroke?: () => void, every = 0.45): this {
    const C = this.C;
    let next = 0;
    return this.enqueue({
      update: (el) => {
        C.pitch.t = 14;
        this.H.t = 20 + 7 * Math.sin(el * 26);
        C.jaw.t = 0;
        if (el >= next) {
          next += every;
          C.squash.vel -= 0.6;
          onStroke?.();
        }
        return el >= seconds;
      },
      end: () => {
        C.pitch.t = 0;
        this.H.t = 0;
      },
    });
  }

  /** Shows the thing in the beak (`true`) or lets it go (`false`). */
  holding(on: boolean): this {
    return this.then(() => {
      this.B.carrying = on;
    });
  }

  /** The satin bowerbird's display: tail fanned, wings out, chirps. */
  showOff(o: ShowOffOptions = {}): this {
    return this.enqueue(this.makeShowOff(o));
  }
  private makeShowOff(o: ShowOffOptions): Action {
    const B = this.B;
    const C = this.C;
    const { tail = 32, wing = 42, tuft = -26, head = -18, pitch, swell, wide, seconds = 2.8, rise = 0, fall = 0, turn = true, chirp = true, sparkle = true, kick = 2 } = o;
    const hello = (): void => {
      if (chirp) this.chirp(0.5);
      if (sparkle) this.sparkle();
    };
    let c1 = false,
      c2 = false,
      c3 = false;
    return {
      start: () => {
        if (turn) B.face = 1;
        if (swell !== undefined && wide !== undefined && swell !== 1) B.girth = (wide - 1) / (swell - 1);
      },
      update: (el) => {
        const back = fall > 0 && el > seconds ? smooth((el - seconds) / fall) : 0;
        const q = (rise > 0 ? Math.min(1, el / rise) : 1) * (1 - back);
        C.tail.t = tail * q;
        C.wing.t = wing * q;
        C.tuft.t = tuft * q;
        this.H.t = head * q;
        C.pitch.t = pitch === undefined ? 14 * Math.max(0, Math.sin(el * Math.PI * 1.4)) : pitch * q;
        if (swell !== undefined) C.squash.t = 1 + (swell - 1) * q;
        if (el > 0.2 && !c1) {
          c1 = true;
          hello();
        }
        if (el > 1.5 && !c2) {
          c2 = true;
          hello();
          if (turn) B.face = -1;
        }
        if (el > 2.1 && !c3) {
          c3 = true;
          if (turn) B.face = 1;
        }
        return el > seconds + fall;
      },
      end: () => {
        B.girth = -0.7;
        C.tail.t = 0;
        C.wing.t = 0;
        C.tuft.t = 0;
        this.H.t = 0;
        C.pitch.t = 0;
        C.squash.t = 1;
        C.squash.vel += kick;
      },
    };
  }

  /**
   * A tap: a hop in place and a chirp, cutting the act or loop cycle under way.
   * A layer bird in flight or carrying keeps the latest tap and plays it when
   * it lands. A bird in the sleep pose stays asleep.
   */
  poke(): void {
    this.play('tap');
  }
  /** Decoration has no pose to blend: closing the gate hides it immediately. */
  private clearCssMotion(): void {
    this.parts.spark?.classList.remove('go');
  }
  private sparkle(): void {
    if (this.motion !== 'live') return;
    const el = this.parts.spark;
    if (!el) return;
    el.style.transform = `translate(${this.B.x}px,${this.B.y - this.size * 0.7}px)`;
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
  }

  // ---------- the loop ----------

  private loop = (ts: number): void => {
    if (!this.running) return;
    const elapsed = (ts - (this.last || ts)) / 1000;
    const dt = Math.min(0.033, elapsed);
    this.last = ts;
    this.owners.clear();
    if (this.S.doing) this.claim(this.S.doing);
    if (this.S.action) this.claim(this.S.action);
    this.S.t += dt;
    // While it settles, no motion source runs; the draw gate chooses the blend alone.
    if (this.motion === 'live') {
      this.think(dt);
      this.step(dt, elapsed);
    }
    this.drawFrame();
    if (this.blend && this.S.t - this.blend.t0 >= SETTLE - 1e-9) this.endSettle();
    if (this.notifyStill) {
      this.notifyStill = false;
      this.onStill?.();
    }
    if (this.running) this.raf = this.frame(this.loop);
  };

  private think(dt: number): void {
    const S = this.S;
    const B = this.B;
    if (this.reaction) {
      this.updateReaction(dt);
      return;
    }
    if (!S.action && S.queue.length) {
      S.action = S.queue.shift() ?? null;
      // A layer's script step owns its bird: the idle act under way stops.
      if (S.action && !this.pose) this.endAct();
      if (S.action) {
        S.action.el = 0;
        S.action.start?.();
      }
    }
    if (S.action) {
      S.action.el = (S.action.el ?? 0) + dt * this.speed;
      if (this.updateAction(S.action, S.action.el, dt)) {
        S.action.end?.();
        S.action = null;
        // A pending reaction owns the next frame before the script continues.
        if (S.pending && !this.pose && !B.flying) {
          const pending = S.pending;
          S.pending = null;
          this.beginReaction(pending);
        }
        this.settle();
      }
      if (!this.pose) return;
    }
    if (this.pose) {
      this.perch(this.pose);
      if (this.pose === 'idle' || this.pose === 'wait') this.idle(dt, this.pose);
      else if (this.pose !== 'sleep') this.gaze(dt, null);
      return;
    }
    if (!B.home) {
      this.flyTo(() => ({ ...this.home(), perch: true }));
      return;
    }
    const h = this.home();
    B.x = h.x;
    B.y = h.y;
    if (S.pending) {
      const pending = S.pending;
      S.pending = null;
      this.beginReaction(pending);
      this.updateReaction(dt);
      return;
    }
    if (B.carrying) return;
    this.idle(dt, 'layer');
  }

  /**
   * One frame of a perched pose's fixed script: the loops of poses.css, played
   * on the springs and the existing actions (peck, holding, showOff). Runs
   * every frame, beside a queued action, and only touches its pose's parts.
   */
  private perch(pose: PoseName): void {
    const B = this.B;
    const C = this.C;
    const Z = this.size;
    const h = this.home();
    const period = POSE_PERIOD[pose];
    const el = this.S.t - this.poseT0;
    const cycle = Math.floor(el / period + 1e-9);
    const p = el / period - cycle;
    if (cycle !== this.poseCycle) {
      this.poseCycle = cycle;
      this.poseActed = false;
    }
    B.x = h.x;
    B.y = h.y;
    B.hopY = 0;
    switch (pose) {
      case 'idle':
      case 'wait':
        // The mind plays their acts on their rest frames (`idle`, `rest`).
        break;
      case 'read':
        C.tail.t = keyed(p, [[0, 0], [0.3, 0], [0.44, -18], [0.74, 0], [1, 0]]);
        if (p >= 0.3 && !this.poseActed) {
          this.poseActed = true;
          this.peck(undefined, { depth: 24, head: 14, jaw: 0, upPitch: 0, upHead: -10, lean: 0.5, bite: 0.75, end: 1.28, kick: 0 });
        }
        break;
      case 'write': {
        // Cut by a tap (`interrupt({ now: true })`): the springs carry on until the next cycle.
        if (this.poseActed) break;
        const nod = (el % 1.4) / 1.4;
        this.H.t = held(nod, [[0, 16], [0.12, 22], [0.23, 16], [0.47, 21], [0.58, 16]]);
        C.jaw.t = held(p, [[0, 0], [0.82, 14], [0.9, 0]]);
        break;
      }
      case 'carry':
        if (this.poseActed) {
          B.ws = 1;
          break;
        }
        B.hopY = (keyed(p, [[0, 0], [0.12, 0], [0.35, -16], [0.58, 0], [1, 0]]) * Z) / 100;
        C.pitch.t = keyed(p, [[0, 0], [0.12, 0], [0.35, -6], [0.58, 0], [1, 0]]);
        C.squash.t = keyed(p, [[0, 0.92], [0.12, 1.06], [0.35, 1], [0.58, 0.9], [0.72, 1], [1, 0.92]]);
        C.wing.v = keyed(p, [[0, 0], [0.12, 0], ...beat([0.2, 0.36], [0.28, 0.44], -38, 18, 0.6, 0)]);
        C.wing.vel = 0;
        B.ws = keyed(p, [[0, 1], [0.12, 1], [0.2, 0.7], [0.28, 1], [0.36, 0.7], [0.44, 1], [1, 1]]);
        C.legs.v = keyed(p, [[0, 1], [0.12, 1], [0.22, 0.55], [0.48, 0.55], [0.58, 1], [1, 1]], true);
        C.legs.vel = 0;
        C.tail.v = keyed(p, [[0, 0], [0.58, 0], [0.64, -16], [1, 0]], true);
        C.tail.vel = 0;
        break;
      case 'proud':
        if (!this.poseActed) {
          this.poseActed = true;
          this.showOff({ tail: -22, wing: 0, tuft: 16, head: 0, pitch: -4, swell: 1.03, wide: 1.05, seconds: 1.5, rise: 0.6, fall: 1.4, turn: false, chirp: false, sparkle: false, kick: 0 });
        }
        break;
      case 'sleep':
        this.sleepFrame(p);
        break;
      case 'alarm':
        C.tuft.t = 18;
        B.tuftY = -2;
        this.H.t = held(p, [[0, 0], [0.11, -10], [0.61, 0]]);
        break;
      case 'land': {
        B.x = h.x + (keyed(p, [[0, -120], [0.22, 0], [1, 0]]) * Z) / 100;
        B.hopY = (keyed(p, [[0, -150], [0.22, -6], [0.26, 0], [1, 0]]) * Z) / 100;
        B.opacity = Math.min(1, p / 0.04);
        C.pitch.t = keyed(p, [[0, -18], [0.22, -6], [0.26, 0], [1, 0]]);
        C.squash.t = keyed(p, [[0, 1], [0.22, 1], [0.26, 0.86], [0.31, 1.04], [0.35, 1], [1, 1]]);
        const ups = [0, 0.02, 0.06, 0.1, 0.14, 0.18];
        const downs = [0.04, 0.08, 0.12, 0.16, 0.2];
        C.wing.v = keyed(p, beat(ups, downs, -46, 22, 0.24, 0));
        C.wing.vel = 0;
        B.ws = keyed(p, beat(ups, downs, 0.6, 1, 0.24, 1));
        C.legs.t = keyed(p, [[0, 0.5], [0.19, 0.5], [0.24, 1], [1, 1]]);
        C.tail.v = keyed(p, [[0, 0], [0.3, 0], [0.33, -18], [0.36, 5], [0.4, 0], [1, 0]], true);
        C.tail.vel = 0;
        this.H.t = held(p, [[0, 0], [0.445, -12], [0.625, 8], [0.805, 0]]);
        break;
      }
    }
  }

  /** The sleep pose's frame, for the sleep pose and for the mind asleep: one sleep, one look. */
  private sleepFrame(p: number): void {
    const B = this.B;
    const C = this.C;
    // breathe: scale(1.035, .97), so the body widens 7/6 of what it sinks.
    B.girth = -7 / 6;
    this.H.t = 20;
    B.headY = 3;
    C.tuft.t = -26;
    C.squash.t = 1 - 0.015 * (1 - Math.cos(2 * Math.PI * p));
  }
  private wake(): void {
    const B = this.B;
    this.asleep = false;
    B.girth = -0.7;
    B.headY = 0;
    this.C.squash.t = 1;
    if (this.minded()) this.startle();
  }

  /** The rest frame the mind's acts play on: idle's, wait's (tuft up, iris centred) or a layer bird's. */
  private rest(who: Minded, writer: Action | null = null): void {
    const C = this.C;
    if (this.mayWrite('head', writer)) this.H.t = 0;
    if (this.mayWrite('tail', writer)) C.tail.t = 0;
    if (this.mayWrite('wing', writer)) C.wing.t = 0;
    if (this.mayWrite('tuft', writer)) C.tuft.t = who === 'wait' ? 8 : 0;
    if (this.mayWrite('jaw', writer) && this.S.chirpT <= 0) C.jaw.t = 0;
    if (this.mayWrite('ix', writer)) C.ix.t = who === 'wait' ? 0 : IRIS_REST.x;
    if (this.mayWrite('iy', writer)) C.iy.t = IRIS_REST.y;
  }

  /** One draw of the act table by weight; no snap or preen while input is recent. */
  private draw(who: Minded): ActName {
    const recent = this.S.t - this.S.inputT < RECENT;
    const table = [...WEIGHTS, ...(who === 'wait' ? ([['look', 10]] as const) : [])].filter(
      ([name]) => !recent || (name !== 'snap' && name !== 'preen'),
    );
    let r = this.random() * table.reduce((sum, [, w]) => sum + w, 0);
    for (const [name, w] of table) {
      r -= w;
      if (r < 0) return name;
    }
    return 'pause';
  }

  /**
   * The one mind (TL-P4-25), for idle, wait and a layer's bird between
   * flights: the act channel (an act every 0.8 to 2 s, or a pause), the
   * startle, sleep after 60 s with no input, and the gaze channel.
   */
  private idle(dt: number, who: Minded): void {
    const S = this.S;
    if (this.sleeps && who !== 'layer' && !this.asleep && S.t - S.quietT >= DOZE) {
      this.asleep = true;
      S.sleepT0 = S.t;
      S.startleRising = false;
      this.endAct();
      this.H.gaze = 0;
    }
    if (this.asleep) {
      const el = (S.t - S.sleepT0) / POSE_PERIOD.sleep;
      this.sleepFrame(el - Math.floor(el));
      return;
    }
    this.rest(who, S.doing);
    if (this.acts && this.mayWrite('gazeHead')) {
      S.nextIdle -= dt;
      if (S.nextIdle <= 0) {
        S.nextIdle = this.rand(0.8, 2);
        this.act(this.draw(who));
      }
    }
    const a = S.doing;
    if (a) {
      a.el = (a.el ?? 0) + dt;
      if (this.updateAction(a, a.el, dt)) this.endAct();
    }
    this.gaze(dt, this.mayWrite('gazeHead') ? who === 'layer' ? LAYER_HEAD : PERCHED_HEAD : null);

  }

  /**
   * The gaze channel: the iris follows the input (a pointer or touch for
   * 2.5 s, the focused control while focus stays), the head follows a little
   * within `head` (none in a working pose), and an input behind the bird for
   * 0.5 s turns it with a hop.
   */
  private gaze(dt: number, head: readonly [number, number] | null): void {
    const S = this.S;
    const B = this.B;
    const C = this.C;
    const p = typeof S.ptr === 'function' ? S.ptr() : S.ptr;
    if (!p) S.ptr = null;
    if (!p || (S.ptrSrc !== 'focus' && S.t - S.ptrT >= RECENT)) {
      this.H.gaze = 0;
      S.behindT = 0;
      // A working pose never rests its parts (`rest()`), so the iris goes back to its rest here.
      if (!head) {
        if (this.mayWrite('ix')) C.ix.t = IRIS_REST.x;
        if (this.mayWrite('iy')) C.iy.t = IRIS_REST.y;
      }
      return;
    }
    const Z = this.size;
    const eye = { x: B.x + (C.face.v * 20 * Z) / 100, y: B.y - (58 * Z) / 100 };
    const dx = (p.x - eye.x) * B.face;
    const dy = p.y - eye.y;
    if (dx < -30 && this.mayWrite('face') && this.mayWrite('hop')) {
      S.behindT += dt;
      if (S.behindT > 0.5) {
        S.behindT = 0;
        this.turn();
      }
    } else S.behindT = 0;
    if (head) {
      const ang = (Math.atan2(dy, Math.max(20, dx)) * 180) / Math.PI;
      const want = clamp(ang * 0.7, head[0], head[1]);
      if (S.t - S.lastSnap > this.rand(0.14, 0.4) && Math.abs(want - this.H.gaze) > GAZE_SNAP) {
        this.H.gaze = want;
        S.lastSnap = S.t;
      }
    } else this.H.gaze = 0;
    this.pointEyes(p);
  }
  private pointEyes(p: Point): void {
    const B = this.B;
    const C = this.C;
    const eye = { x: B.x + C.face.v * 20 * this.size / 100, y: B.y - 58 * this.size / 100 };
    const dx = (p.x - eye.x) * B.face;
    const dy = p.y - eye.y;
    const m = Math.hypot(dx, dy) || 1;
    if (this.mayWrite('ix', this.writer)) C.ix.t = 0.3 + 1.3 * dx / m;
    if (this.mayWrite('iy', this.writer)) C.iy.t = 1.4 * dy / m;
  }

  private step(dt: number, headDt: number): void {
    const C = this.C;
    const B = this.B;
    const S = this.S;
    if (this.mayWrite('face')) C.face.t = B.face;
    if (B.hopKick > 0) {
      B.hopKick -= dt;
      if (this.mayWrite('hop', this.hopOwner)) {
        B.hopY = -9 * Math.sin(Math.PI * (1 - Math.max(0, B.hopKick) / 0.16));
        if (B.hopKick <= 0) B.hopY = 0;
      }
    }
    if (S.chirpT > 0) {
      S.chirpT -= dt;
      const p = 1 - S.chirpT / S.chirpLength;
      if (this.mayWrite('jaw', this.chirpOwner)) {
        pin(C.jaw, keyed(p, [[0, 0], [0.2, 14], [0.53, 14], [1, 0]], true));
        if (S.chirpT <= 0) C.jaw.t = 0;
      }
    }
    for (const name in C) {
      const c = C[name as SpringName];
      if (c.vel === 0 && c.v === c.t) continue;
      // The jaw spring is unstable above ~29.9 ms; dt is capped at 33 ms.
      const steps = dt > 0.025 ? 2 : 1;
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        const a = c.k * (c.t - c.v) - c.c * c.vel;
        c.vel += a * h;
        c.v += c.vel * h;
      }
    }
    const h = this.H;
    const rising = S.startleRising;
    if (rising) h.snapTarget = STARTLE.head;
    if (h.snapTarget === null) {
      // Gaze changes start returns; an act snap freezes its combined target
      // until the measured head has stopped, even if either channel retargets.
      if (h.t !== h.actTarget && this.doing === 'snap' && h.gaze === h.gazeTarget) {
        h.snapTarget = h.t + h.gaze;
      }
      h.actTarget = h.t;
      h.gazeTarget = h.gaze;
    }
    const before = h.v;
    follow(h, headDt, h.snapTarget !== null ? HEAD_MOVES.snap : HEAD_MOVES.glide);
    // The stationary frame completes the segment, including its uncapped stop.
    if (
      headDt > 0 &&
      h.snapTarget !== null &&
      h.v === before &&
      h.vel === 0 &&
      Math.abs(h.v - h.snapTarget) <= 2
    ) {
      h.snapTarget = null;
      if (rising) S.startleRising = false;
    }
    if (B.flying) {
      B.ph += dt * Math.PI * 2 * (B.flare ? 6 : 10);
      const s = Math.sin(B.ph);
      if (this.mayWrite('wing')) C.wing.v = B.flare ? 62 + 18 * s : 26 + 46 * s;
      B.ws = 0.8 + 0.25 * Math.cos(B.ph);
      B.bob = -2.5 * s;
      if (this.mayWrite('tail')) C.tail.t = B.flare ? 26 : -6 + 4 * s;
    } else {
      // A perched pose draws its own wing beat.
      if (!this.pose) B.ws += (1 - B.ws) * 0.2;
      B.bob = 0;
    }
    S.nextBlink -= dt;
    if (this.asleep) {
      // Asleep, the eyes stay shut: no blink.
      S.blinkT = -1;
      S.blink = 0;
      S.nextBlink = Math.max(S.nextBlink, 0.5);
    } else if (S.nextBlink <= 0) {
      S.blinkT = 0;
      S.nextBlink = 1.6 + this.random() * 3.6;
      S.blinkDouble = this.random() < 0.25;
    }
    if (S.blinkT >= 0) {
      S.blinkT += dt;
      const d = S.blinkDouble ? 0.26 : 0.12;
      S.blink = S.blinkT < d ? Math.abs(Math.sin((S.blinkT / 0.12) * Math.PI)) : 0;
      if (S.blinkT >= d) S.blinkT = -1;
    } else S.blink = 0;
  }

  /** The tip of the beak in layer pixels (where a carried thing hangs). */
  private beak(): Point {
    const C = this.C;
    const B = this.B;
    const Z = this.size;
    let a = (this.H.v * Math.PI) / 180;
    let dx = 91 - 60,
      dy = 38 - 50;
    let px = 60 + dx * Math.cos(a) - dy * Math.sin(a);
    let py = 50 + dx * Math.sin(a) + dy * Math.cos(a);
    const sy = C.squash.v;
    const sx = 1 + (sy - 1) * B.girth;
    px = 50 + (px - 50) * sx;
    py = 92 + (py - 92) * sy;
    a = (C.pitch.v * Math.PI) / 180;
    dx = px - 50;
    dy = py - 92;
    px = 50 + dx * Math.cos(a) - dy * Math.sin(a);
    py = 92 + dx * Math.sin(a) + dy * Math.cos(a);
    return {
      x: B.x + (C.face.v * (px - 50) * Z) / 100,
      y: B.y + B.hopY + B.bob + ((py - 92) * Z) / 100,
    };
  }

  /** The drawn pose from the state: every value apply() writes, at the precision it writes it. */
  private drawing(): Drawing {
    const P = this.parts;
    const B = this.B;
    const C = this.C;
    const Z = this.size;
    let f = C.face.v;
    if (Math.abs(f) < 0.06) f = f < 0 ? -0.06 : 0.06;
    // A flier breathes on its own; a perched pose breathes only in its script (sleep).
    const sy = C.squash.v * (this.pose ? 1 : 1 + 0.014 * Math.sin(this.S.t * 2.6));
    const sx = 1 + (sy - 1) * B.girth;
    let chip: Drawing['chip'] = null;
    if (P.carry) {
      const last = this.drawn?.chip ?? { x: 0, y: 0, r: 0 };
      if (B.carrying) {
        const p = this.beak();
        // Hang the thing from the beak: its top edge a little above the tip.
        const w = P.carry.offsetWidth || 26;
        const h = P.carry.offsetHeight || 16;
        chip = { opacity: 1, x: fixed(p.x - w * 0.35 + C.face.v * w * 0.25, 1), y: fixed(p.y - h * 0.3, 1),
          r: fixed(C.pitch.v * C.face.v * 0.5, 1) };
      } else chip = { opacity: 0, x: last.x, y: last.y, r: last.r };
    }
    return {
      size: Z,
      x: fixed(B.x - Z / 2, 1),
      y: fixed(B.y + B.hopY + B.bob - 0.92 * Z, 1),
      face: fixed(f, 3),
      opacity: fixed(this.pose === 'land' ? B.opacity : 1, 2),
      pitch: fixed(C.pitch.v, 2),
      sx: fixed(sx, 3),
      sy: fixed(sy, 3),
      head: fixed(this.H.v, 4),
      headY: B.headY,
      tail: fixed(C.tail.v, 2),
      wing: fixed(C.wing.v, 2),
      ws: fixed(B.ws, 3),
      legs: fixed(Math.max(0.2, C.legs.v), 3),
      jaw: fixed(Math.max(0, C.jaw.v), 2),
      tuft: fixed(C.tuft.v, 2),
      tuftY: B.tuftY,
      // Asleep, the eyes stay shut through the blink.
      eye: fixed(this.asleep ? 0.08 : 1 - 0.92 * this.S.blink, 3),
      ix: fixed(C.ix.v, 2),
      iy: fixed(C.iy.v, 2),
      chip,
      glyph: B.ruleCarry || (B.carrying && !P.carry),
    };
  }

  /**
   * The only draw path, including mount, resize and release. Still engines
   * leave the CSS drawing alone. An immediate release draws the still target
   * once for the layer's placement, discards any unfinished blend and closes
   * the gate before giving the parts back to CSS.
   */
  private drawFrame(releasing = false): void {
    if (this.motion === 'still') return;
    const d = releasing ? this.stillDrawing(this.drawn ?? this.drawing()) :
      this.motion === 'settling' && this.blend ? this.blendDrawing(this.blend) : this.drawing();
    this.apply(d);
    if (releasing) {
      this.blend = null;
      this.motion = 'still';
    }
  }

  /** Writes the drawing selected by the private motion gate. */
  private apply(d: Drawing): void {
    this.drawn = d;
    const P = this.parts;
    const Z = d.size;
    if (this.drawnSize !== Z) {
      P.bird.style.width = `${Z}px`;
      P.bird.style.height = `${Z}px`;
      this.drawnSize = Z;
    }
    const place = `translate(${d.x.toFixed(1)}px,${d.y.toFixed(1)}px) scaleX(${d.face.toFixed(3)})`;
    if (this.drawnPlace !== place) {
      P.bird.style.transform = place;
      this.drawnPlace = place;
    }
    const opacity = d.opacity.toFixed(2);
    if (this.drawnOpacity !== opacity) {
      P.bird.style.opacity = opacity;
      this.drawnOpacity = opacity;
    }
    transform(
      P.rig,
      `rotate(${d.pitch.toFixed(2)} 50 92) translate(50 92) scale(${d.sx.toFixed(3)} ${d.sy.toFixed(3)}) translate(-50 -92)`,
    );
    transform(P.head, `rotate(${d.head.toFixed(4)} 60 50)${d.headY ? ` translate(0 ${offset(d.headY)})` : ''}`);
    transform(P.tail, `rotate(${d.tail.toFixed(2)} 32 70)`);
    transform(
      P.wing,
      `rotate(${d.wing.toFixed(2)} 56 55) translate(56 55) scale(1 ${d.ws.toFixed(3)}) translate(-56 -55)`,
    );
    transform(P.legs, `translate(50 82) scale(1 ${d.legs.toFixed(3)}) translate(-50 -82)`);
    transform(P.jaw, `rotate(${d.jaw.toFixed(2)} 78 38)`);
    transform(P.tuft, `rotate(${d.tuft.toFixed(2)} 61 23)${d.tuftY ? ` translate(0 ${offset(d.tuftY)})` : ''}`);
    transform(P.eye, `translate(70 34) scale(1 ${d.eye.toFixed(3)}) translate(-70 -34)`);
    transform(P.iris, `translate(${d.ix.toFixed(2)} ${d.iy.toFixed(2)})`);
    if (P.carry && d.chip) {
      P.carry.style.opacity = String(fixed(d.chip.opacity, 1));
      const chip = `translate(${d.chip.x.toFixed(1)}px,${d.chip.y.toFixed(1)}px) rotate(${d.chip.r.toFixed(1)}deg)`;
      // An unplaced chip (never carried) keeps the stylesheet's place.
      if (this.drawnChip !== chip && (this.drawnChip !== null || d.chip.x || d.chip.y || d.chip.r)) {
        P.carry.style.transform = chip;
        this.drawnChip = chip;
      }
    }
    if (this.drawnGlyph !== d.glyph) {
      P.glyph?.setAttribute('display', d.glyph ? 'inline' : 'none');
      this.drawnGlyph = d.glyph;
    }
  }
}
