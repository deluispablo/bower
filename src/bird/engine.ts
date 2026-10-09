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
  | 'iy';

interface Action {
  el?: number;
  start?(): void;
  /** Returns true when done. */
  update(el: number, dt: number): boolean;
  end?(): void;
}

const spring = (v: number, k: number, c: number): Spring => ({ v, vel: 0, t: v, k, c });
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** The poses a perched Bower plays in place (the same names as the still frames). */
export type PoseName = 'idle' | 'wait' | 'read' | 'write' | 'carry' | 'proud' | 'sleep' | 'alarm' | 'land';

/**
 * Where frames and chance come from. Defaults: requestAnimationFrame and
 * Math.random; tests inject fake frames and a seeded source.
 */
export interface EngineOptions {
  frame?: (cb: (ts: number) => void) => number;
  cancelFrame?: (id: number) => void;
  random?: () => number;
}

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
    ix: spring(0.4, 600, 40),
    iy: spring(0, 600, 40),
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
    ptr: null as Point | null,
    ptrT: -10,
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

  constructor(
    private parts: RigParts,
    private home: TargetFn,
    private size = 96,
    options: EngineOptions = {},
  ) {
    this.frame = options.frame ?? ((cb) => requestAnimationFrame(cb));
    this.cancelFrame = options.cancelFrame ?? ((id) => cancelAnimationFrame(id));
    this.random = options.random ?? Math.random;
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
    this.pose = pose;
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
  /** Where the pointer is, in layer pixels; Bower looks at it for a while. */
  look(p: Point): void {
    this.S.ptr = p;
    this.S.ptrT = this.S.t;
  }
  get busy(): boolean {
    return !!this.S.action || this.S.queue.length > 0;
  }
  /** Resolves when every queued action is done. */
  settled(): Promise<void> {
    if (!this.busy) return Promise.resolve();
    return new Promise((r) => this.idleWaiters.push(r));
  }
  /** Queues an action; it runs after the ones before it. */
  private act(a: Action): this {
    this.S.queue.push(a);
    return this;
  }
  /** Drops what is queued (the action under way finishes, so nothing jumps). */
  interrupt(): void {
    this.S.queue = [];
    this.B.carrying = false;
  }

  /** Runs a callback in the queue, between moves. */
  then(fn: () => void): this {
    return this.act({
      update: () => {
        fn();
        return true;
      },
    });
  }
  wait(seconds: number): this {
    return this.act({ update: (el) => el >= seconds });
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
    return this.act({
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
    return this.act({
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
    return this.act({
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
    return this.act({
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
    return this.act({
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
    return this.act({
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
    return this.act({
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

  /** A hello when tapped: a hop in place and a chirp. */
  poke(): void {
    if (this.busy) return;
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
        if (!S.queue.length) {
          const w = this.idleWaiters;
          this.idleWaiters = [];
          w.forEach((f) => f());
        }
      }
      if (!this.pose) return;
    }
    if (this.pose) {
      this.perch(this.pose);
      return;
    }
    if (!B.home) {
      this.flyTo(() => ({ ...this.home(), perch: true }));
      return;
    }
    const h = this.home();
    B.x = h.x;
    B.y = h.y;
    this.idle(dt);
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
    const snaps = (q: number): number => held(q, [[0, 0], [0.225, -12], [0.465, 7], [0.705, 0]]);
    switch (pose) {
      case 'idle':
        C.head.t = snaps(p);
        C.tail.v = keyed(p, [[0, 0], [0.72, 0], [0.74, -14], [0.77, 4], [0.8, 0], [1, 0]], true);
        C.tail.vel = 0;
        break;
      case 'wait':
        C.head.t = snaps(p);
        C.tuft.t = 8;
        C.ix.t = held(p, [[0, 0], [0.41, -2.2], [0.71, 1]]);
        C.iy.t = 0;
        break;
      case 'read':
        C.tail.t = keyed(p, [[0, 0], [0.3, 0], [0.44, -18], [0.74, 0], [1, 0]]);
        if (p >= 0.3 && !this.poseActed) {
          this.poseActed = true;
          this.peck(undefined, { depth: 24, head: 14, jaw: 0, upPitch: 0, upHead: -10, lean: 0.5, bite: 0.75, end: 1.28, kick: 0 });
        }
        break;
      case 'write': {
        const nod = (el % 1.4) / 1.4;
        C.head.t = held(nod, [[0, 16], [0.12, 22], [0.23, 16], [0.47, 21], [0.58, 16]]);
        C.jaw.t = held(p, [[0, 0], [0.82, 14], [0.9, 0]]);
        break;
      }
      case 'carry':
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
        // breathe: scale(1.035, .97), so the body widens 7/6 of what it sinks.
        B.girth = -7 / 6;
        C.head.t = 20;
        B.headY = 3;
        C.tuft.t = -26;
        C.squash.t = 1 - 0.015 * (1 - Math.cos(2 * Math.PI * p));
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

  private idle(dt: number): void {
    const S = this.S;
    const B = this.B;
    const C = this.C;
    const looking = S.ptr && S.t - S.ptrT < 2.5;
    if (looking && S.ptr) {
      const Z = this.size;
      const eye = { x: B.x + (C.face.v * 20 * Z) / 100, y: B.y - (58 * Z) / 100 };
      const dx = (S.ptr.x - eye.x) * B.face;
      const dy = S.ptr.y - eye.y;
      if (dx < -30) {
        S.behindT += dt;
        if (S.behindT > 0.5) {
          S.behindT = 0;
          this.turn();
        }
      } else S.behindT = 0;
      const ang = (Math.atan2(dy, Math.max(20, dx)) * 180) / Math.PI;
      const want = clamp(ang * 0.7, -32, 30);
      if (S.t - S.lastSnap > this.rand(0.14, 0.4) && Math.abs(want - C.head.t) > 6) {
        C.head.t = want;
        S.lastSnap = S.t;
      }
      const m = Math.hypot(dx, dy) || 1;
      C.ix.t = 0.3 + (1.3 * dx) / m;
      C.iy.t = (1.4 * dy) / m;
    } else {
      C.ix.t = 0.4;
      C.iy.t = 0;
    }
    S.nextIdle -= dt;
    if (S.nextIdle <= 0) {
      S.nextIdle = this.rand(0.8, 2);
      const r = this.random();
      if (!looking && r < 0.4) C.head.t = this.rand(-26, 22);
      else if (r < 0.6) C.tail.vel += 300;
      else if (r < 0.72) this.chirp(0.35);
      else if (r < 0.82) C.wing.vel += 260;
      else if (!looking && r < 0.9) this.turn();
    }
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
    if (S.nextBlink <= 0) {
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
    let a = (C.head.v * Math.PI) / 180;
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
    P.head.setAttribute('transform', `rotate(${C.head.v.toFixed(2)} 60 50)${B.headY ? ` translate(0 ${B.headY})` : ''}`);
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
    const open = this.pose === 'sleep' ? 0.08 : 1 - 0.92 * this.S.blink;
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
