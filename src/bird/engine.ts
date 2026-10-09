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
  | 'head'
  | 'tail'
  | 'wing'
  | 'squash'
  | 'pitch'
  | 'legs'
  | 'jaw'
  | 'tuft'
  | 'face'
  | 'ix'
  | 'iy'
  /** The gaze channel's head offset, added to the head after the act channel. */
  | 'gaze';

interface Action {
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
 * The one startle step, on waking or a nudge: the tuft and the head ease to
 * `tuft` and `head` degrees in `rise` seconds, hold for `seconds`, and ease
 * back to rest in `fall` (TL-P4-22 addendum 20, TL-P4-26 addendum 1).
 */
const STARTLE = { tuft: 18, head: -10, rise: 0.15, seconds: 0.6, fall: 0.4 } as const;
const STARTLE_TOTAL = STARTLE.rise + STARTLE.seconds + STARTLE.fall;
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
  private C: Record<SpringName, Spring> = {
    head: spring(0, 900, 38),
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
    gaze: spring(0, 900, 38),
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
    /** The startle's seconds left, and the tuft's and head's angles when it began. */
    startleT: 0,
    startleFrom: { tuft: 0, head: 0 },
    /** The gaze's ease back after the startle (TL-P4-25 addendum 5): its seconds left, and the offsets it eases from and to. */
    settleT: 0,
    settleFrom: 0,
    settleTo: 0,
    /** The head offset the gaze wants this frame, before its snap guard (the settle's target). */
    gazeWant: 0,
    sleepT0: 0,
    /** The latest tap on a layer bird in flight or carrying, played when it lands. */
    tap: false,
    lastSnap: 0,
    nextIdle: 1.2,
    nextBlink: 2,
    blinkT: -1,
    blink: 0,
    blinkDouble: false,
    chirpT: 0,
    behindT: 0,
  };
  private raf = 0;
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
    const h = home();
    this.B.x = h.x;
    this.B.y = h.y;
    this.apply();
  }

  /** Starts the frame loop. Call `stop()` when the bird leaves the page. */
  start(): void {
    if (this.running) return;
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
   */
  release(): void {
    this.stop();
    const P = this.parts;
    for (const g of [P.rig, P.head, P.tail, P.wing, P.legs, P.jaw, P.tuft, P.eye, P.iris]) g.removeAttribute('transform');
    P.glyph?.setAttribute('display', 'none');
    for (const k of ['transform', 'width', 'height', 'opacity'] as const) P.bird.style[k] = '';
  }
  /**
   * Plays a pose in place, looping its fixed script, and never flies home or
   * idles at random; `null` gives the bird back to its layer's idle mind.
   */
  setPose(pose: PoseName | null): void {
    this.interrupt();
    this.endAct();
    this.pose = pose;
    this.asleep = pose === 'sleep';
    this.S.quietT = this.S.t;
    this.S.startleT = 0;
    this.S.settleT = 0;
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
    this.apply();
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
   * @public d-v2-24's `react()` calls it; nothing in the app does yet.
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
    if (this.pose === 'sleep') return false;
    this.S.inputT = this.S.t;
    this.S.quietT = this.S.t;
    if (this.asleep) this.wake();
    if (this.doing === 'snap' || this.doing === 'preen') this.interrupt({ now: true });
    return true;
  }
  /**
   * Starts the one startle step from where the tuft and head are now. The step
   * owns the head while it plays (TL-P4-25 addendum 4): the gaze's head offset
   * folds into its start, so nothing jumps, and the gaze moves only the iris.
   */
  private startle(): void {
    const C = this.C;
    this.S.startleT = STARTLE_TOTAL;
    this.S.settleT = 0;
    this.S.startleFrom = { tuft: C.tuft.v, head: C.head.v + C.gaze.v };
    pin(C.gaze, 0);
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
   * The mind draws them; d-v2-24's `react()` fires them too. Only a bird whose
   * act channel the mind owns (idle, wait, a layer's) and that is awake acts.
   */
  act(name: ActName): void {
    if (!this.minded() || this.asleep) return;
    this.endAct();
    const a = this.makeAct(name);
    a.el = 0;
    this.S.doing = a;
    this.doing = name;
  }
  private endAct(): void {
    const a = this.S.doing;
    this.S.doing = null;
    this.doing = null;
    a?.end?.();
  }
  /** The act table (TL-P4-25): each act writes its part; `rest()` puts the parts back each frame. */
  private makeAct(name: ActName): Action {
    const C = this.C;
    switch (name) {
      case 'snap': {
        const to = this.random() < 0.5 ? -12 : 7;
        return {
          update: (el) => {
            C.head.t = to;
            return el >= 0.6;
          },
        };
      }
      case 'flick':
        return {
          update: (el) => {
            pin(C.tail, keyed(el, [[0, 0], [0.12, -14], [0.3, 4], [0.48, 0]], true));
            return el >= 0.48;
          },
        };
      case 'chirp':
        return {
          update: (el) => {
            C.jaw.t = el < 0.16 ? 14 : 0;
            return el >= 0.3;
          },
        };
      case 'wing':
        // The wing's target held at -10 for 0.22 s.
        return {
          update: (el) => {
            pin(C.wing, keyed(el, [[0, 0], [0.05, -10], [0.27, -10], [0.35, 0]], true));
            return el >= 0.35;
          },
        };
      case 'preen':
        // Head to the wing, 38 -> 42 -> 38 twice, the iris down; never the body's girth.
        return {
          update: (el) => {
            pin(C.head, keyed(el, [[0, 0], [0.15, 38], [0.3, 42], [0.45, 38], [0.6, 42], [0.75, 38], [0.9, 0]], true));
            C.iy.t = el < 0.75 ? 1.2 : 0;
            return el >= 0.9;
          },
        };
      case 'look':
        return {
          update: (el) => {
            C.ix.t = el < 0.4 ? -2.2 : 1;
            return el >= 0.8;
          },
        };
      case 'pause':
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
      S.tap = false;
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
    this.S.chirpT = d;
    this.C.tuft.vel -= 120;
  }
  private turn(): void {
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
          C.head.t = head;
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
          C.head.t = upHead;
          C.legs.t = 1;
        }
        return el > end;
      },
      end: () => {
        C.pitch.t = 0;
        C.head.t = 0;
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
        C.head.t = angles[i] ?? 0;
        C.tuft.t = i % 2 ? 8 : 0;
        return el >= seconds;
      },
      end: () => {
        C.head.t = 0;
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
        C.head.t = 20 + 7 * Math.sin(el * 26);
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
        C.head.t = 0;
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
    return this.enqueue({
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
        C.head.t = head * q;
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
        C.head.t = 0;
        C.pitch.t = 0;
        C.squash.t = 1;
        C.squash.vel += kick;
      },
    });
  }

  /**
   * A tap: a hop in place and a chirp, cutting the act or loop cycle under way.
   * A layer bird in flight or carrying keeps the latest tap and plays it when
   * it lands. A bird in the sleep pose stays asleep.
   */
  poke(): void {
    if (!this.heard()) return;
    if (!this.pose && (this.busy || this.B.carrying)) {
      this.S.tap = true;
      return;
    }
    this.interrupt({ now: true });
    this.hello();
  }
  private hello(): void {
    this.chirp(0.5);
    this.C.tuft.vel -= 200;
    this.B.hopKick = 0.16;
    this.C.squash.vel += 2;
    this.C.tail.vel += 260;
  }

  private sparkle(): void {
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
    const dt = Math.min(0.033, (ts - (this.last || ts)) / 1000);
    this.last = ts;
    this.S.t += dt;
    this.think(dt);
    this.step(dt);
    this.apply();
    this.raf = this.frame(this.loop);
  };

  private think(dt: number): void {
    const S = this.S;
    const B = this.B;
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
      if (S.action.update(S.action.el, dt)) {
        S.action.end?.();
        S.action = null;
        // A layer's tap plays when the action under way ends, before the next one.
        if (S.tap && !this.pose) {
          S.tap = false;
          this.hello();
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
    if (S.tap) {
      S.tap = false;
      this.interrupt({ now: true });
      this.hello();
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
        C.head.t = held(nod, [[0, 16], [0.12, 22], [0.23, 16], [0.47, 21], [0.58, 16]]);
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
        C.head.t = held(p, [[0, 0], [0.11, -10], [0.61, 0]]);
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
        C.head.t = held(p, [[0, 0], [0.445, -12], [0.625, 8], [0.805, 0]]);
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
    C.head.t = 20;
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
  private rest(who: Minded): void {
    const C = this.C;
    C.head.t = 0;
    C.tail.t = 0;
    C.wing.t = 0;
    C.tuft.t = who === 'wait' ? 8 : 0;
    if (this.S.chirpT <= 0) C.jaw.t = 0;
    C.ix.t = who === 'wait' ? 0 : IRIS_REST.x;
    C.iy.t = IRIS_REST.y;
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
      S.startleT = 0;
      S.settleT = 0;
      this.endAct();
      this.C.gaze.t = 0;
    }
    if (this.asleep) {
      const el = (S.t - S.sleepT0) / POSE_PERIOD.sleep;
      this.sleepFrame(el - Math.floor(el));
      return;
    }
    this.rest(who);
    if (this.acts) {
      S.nextIdle -= dt;
      if (S.nextIdle <= 0) {
        S.nextIdle = this.rand(0.8, 2);
        this.act(this.draw(who));
      }
    }
    const a = S.doing;
    if (a) {
      a.el = (a.el ?? 0) + dt;
      if (a.update(a.el, dt)) this.endAct();
    }
    const stepping = S.startleT > 0;
    if (stepping) {
      // Keyed and eased as the acts are, back to the rest `rest()` just set: no spring overshoot.
      S.startleT = Math.max(0, S.startleT - dt);
      const { rise, seconds } = STARTLE;
      for (const part of ['tuft', 'head'] as const) {
        const to = STARTLE[part];
        const c = this.C[part];
        pin(c, keyed(STARTLE_TOTAL - S.startleT, [[0, S.startleFrom[part]], [rise, to], [rise + seconds, to], [STARTLE_TOTAL, c.t]], true));
      }
    }
    const gazing = this.gaze(dt, who === 'layer' ? LAYER_HEAD : PERCHED_HEAD);
    // The step owns the head: the gaze's offset waits at 0 and eases back after it (TL-P4-25 addendum 4), a return
    // keyed ease-in-out over the step's own fall, so its speed starts and ends at 0 (TL-P4-25 addendum 5).
    if (S.startleT > 0) this.C.gaze.t = 0;
    else if (stepping) this.easeGaze(0);
    // A return whose gaze ends, or whose target moves past the gaze's own snap threshold, eases on from where it is.
    else if (S.settleT > 0 && S.gazeWant !== S.settleTo && (!gazing || Math.abs(S.gazeWant - S.settleTo) > GAZE_SNAP)) {
      this.easeGaze(this.C.gaze.v);
    }
    if (S.settleT > 0) {
      S.settleT = Math.max(0, S.settleT - dt);
      pin(this.C.gaze, keyed(STARTLE.fall - S.settleT, [[0, S.settleFrom], [STARTLE.fall, S.settleTo]], true));
    }
  }

  /** Starts the gaze's eased return from `from` to the offset the gaze wants now, over the startle's fall. */
  private easeGaze(from: number): void {
    const S = this.S;
    S.settleT = STARTLE.fall;
    S.settleFrom = from;
    S.settleTo = S.gazeWant;
  }

  /**
   * The gaze channel: the iris follows the input (a pointer or touch for
   * 2.5 s, the focused control while focus stays), the head follows a little
   * within `head` (none in a working pose), and an input behind the bird for
   * 0.5 s turns it with a hop. Returns whether a gaze is live.
   */
  private gaze(dt: number, head: readonly [number, number] | null): boolean {
    const S = this.S;
    const B = this.B;
    const C = this.C;
    const p = typeof S.ptr === 'function' ? S.ptr() : S.ptr;
    if (!p) S.ptr = null;
    S.gazeWant = 0;
    if (!p || (S.ptrSrc !== 'focus' && S.t - S.ptrT >= RECENT)) {
      C.gaze.t = 0;
      S.behindT = 0;
      // A working pose never rests its parts (`rest()`), so the iris goes back to its rest here.
      if (!head) {
        C.ix.t = IRIS_REST.x;
        C.iy.t = IRIS_REST.y;
      }
      return false;
    }
    const Z = this.size;
    const eye = { x: B.x + (C.face.v * 20 * Z) / 100, y: B.y - (58 * Z) / 100 };
    const dx = (p.x - eye.x) * B.face;
    const dy = p.y - eye.y;
    if (dx < -30) {
      S.behindT += dt;
      if (S.behindT > 0.5) {
        S.behindT = 0;
        this.turn();
      }
    } else S.behindT = 0;
    if (head) {
      const ang = (Math.atan2(dy, Math.max(20, dx)) * 180) / Math.PI;
      const want = clamp(ang * 0.7, head[0], head[1]);
      S.gazeWant = want;
      if (S.t - S.lastSnap > this.rand(0.14, 0.4) && Math.abs(want - C.gaze.t) > GAZE_SNAP) {
        C.gaze.t = want;
        S.lastSnap = S.t;
      }
    } else C.gaze.t = 0;
    const m = Math.hypot(dx, dy) || 1;
    C.ix.t = 0.3 + (1.3 * dx) / m;
    C.iy.t = (1.4 * dy) / m;
    return true;
  }

  private step(dt: number): void {
    const C = this.C;
    const B = this.B;
    const S = this.S;
    C.face.t = B.face;
    if (B.hopKick > 0) {
      B.hopKick -= dt;
      B.hopY = -9 * Math.sin(Math.PI * (1 - Math.max(0, B.hopKick) / 0.16));
      if (B.hopKick <= 0) B.hopY = 0;
    }
    if (S.chirpT > 0) {
      S.chirpT -= dt;
      C.jaw.t = 18 * Math.abs(Math.sin(S.chirpT * Math.PI * 6));
      if (S.chirpT <= 0) C.jaw.t = 0;
    }
    for (const c of Object.values(C)) {
      const a = c.k * (c.t - c.v) - c.c * c.vel;
      c.vel += a * dt;
      c.v += c.vel * dt;
    }
    if (B.flying) {
      B.ph += dt * Math.PI * 2 * (B.flare ? 6 : 10);
      const s = Math.sin(B.ph);
      C.wing.v = B.flare ? 62 + 18 * s : 26 + 46 * s;
      B.ws = 0.8 + 0.25 * Math.cos(B.ph);
      B.bob = -2.5 * s;
      C.tail.t = B.flare ? 26 : -6 + 4 * s;
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
    let a = ((C.head.v + C.gaze.v) * Math.PI) / 180;
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

  private apply(): void {
    const P = this.parts;
    const B = this.B;
    const C = this.C;
    const Z = this.size;
    P.bird.style.width = `${Z}px`;
    P.bird.style.height = `${Z}px`;
    let f = C.face.v;
    if (Math.abs(f) < 0.06) f = f < 0 ? -0.06 : 0.06;
    P.bird.style.transform = `translate(${(B.x - Z / 2).toFixed(1)}px,${(B.y + B.hopY + B.bob - 0.92 * Z).toFixed(1)}px) scaleX(${f.toFixed(3)})`;
    if (this.pose === 'land') P.bird.style.opacity = B.opacity.toFixed(2);
    // A flier breathes on its own; a perched pose breathes only in its script (sleep).
    const sy = C.squash.v * (this.pose ? 1 : 1 + 0.014 * Math.sin(this.S.t * 2.6));
    const sx = 1 + (sy - 1) * B.girth;
    P.rig.setAttribute(
      'transform',
      `rotate(${C.pitch.v.toFixed(2)} 50 92) translate(50 92) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(-50 -92)`,
    );
    P.head.setAttribute('transform', `rotate(${(C.head.v + C.gaze.v).toFixed(2)} 60 50)${B.headY ? ` translate(0 ${B.headY})` : ''}`);
    P.tail.setAttribute('transform', `rotate(${C.tail.v.toFixed(2)} 32 70)`);
    P.wing.setAttribute(
      'transform',
      `rotate(${C.wing.v.toFixed(2)} 56 55) translate(56 55) scale(1 ${B.ws.toFixed(3)}) translate(-56 -55)`,
    );
    P.legs.setAttribute(
      'transform',
      `translate(50 82) scale(1 ${Math.max(0.2, C.legs.v).toFixed(3)}) translate(-50 -82)`,
    );
    P.jaw.setAttribute('transform', `rotate(${Math.max(0, C.jaw.v).toFixed(2)} 78 38)`);
    P.tuft.setAttribute('transform', `rotate(${C.tuft.v.toFixed(2)} 61 23)${B.tuftY ? ` translate(0 ${B.tuftY})` : ''}`);
    // Asleep, the eyes stay shut through the blink.
    const open = this.asleep ? 0.08 : 1 - 0.92 * this.S.blink;
    P.eye.setAttribute('transform', `translate(70 34) scale(1 ${open.toFixed(3)}) translate(-70 -34)`);
    P.iris.setAttribute('transform', `translate(${C.ix.v.toFixed(2)} ${C.iy.v.toFixed(2)})`);
    if (P.carry) {
      if (B.carrying) {
        const p = this.beak();
        P.carry.style.opacity = '1';
        // Hang the thing from the beak: its top edge a little above the tip.
        const w = P.carry.offsetWidth || 26;
        const h = P.carry.offsetHeight || 16;
        P.carry.style.transform = `translate(${(p.x - w * 0.35 + C.face.v * w * 0.25).toFixed(1)}px,${(p.y - h * 0.3).toFixed(1)}px) rotate(${(C.pitch.v * C.face.v * 0.5).toFixed(1)}deg)`;
      } else P.carry.style.opacity = '0';
    }
    P.glyph?.setAttribute('display', B.carrying && !P.carry ? 'inline' : 'none');
  }
}
