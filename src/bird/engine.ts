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
  /** Whatever Bower carries in its beak, positioned by the engine. */
  carry?: HTMLElement | null;
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
const rand = (a: number, b: number): number => a + (b - a) * Math.random();
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

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

  constructor(
    private parts: RigParts,
    private home: TargetFn,
    private size = 96,
  ) {
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
    this.raf = requestAnimationFrame(this.loop);
  }
  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
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
  peck(onBite?: () => void): this {
    const C = this.C;
    let bit = false;
    return this.act({
      update: (el) => {
        if (el < 0.16) {
          C.pitch.t = 34;
          C.head.t = 24;
          C.jaw.t = 20;
        } else if (el < 0.3) {
          C.jaw.t = 0;
          if (!bit) {
            bit = true;
            C.squash.vel -= 1.2;
            onBite?.();
          }
        } else {
          C.pitch.t = -8;
          C.head.t = -10;
          C.legs.t = 1;
        }
        return el > 0.55;
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
  showOff(): this {
    const B = this.B;
    const C = this.C;
    let c1 = false,
      c2 = false,
      c3 = false;
    return this.act({
      start: () => {
        B.face = 1;
      },
      update: (el) => {
        C.tail.t = 32;
        C.wing.t = 42;
        C.tuft.t = -26;
        C.head.t = -18;
        C.pitch.t = 14 * Math.max(0, Math.sin(el * Math.PI * 1.4));
        if (el > 0.2 && !c1) {
          c1 = true;
          this.chirp(0.5);
          this.sparkle();
        }
        if (el > 1.5 && !c2) {
          c2 = true;
          this.chirp(0.5);
          this.sparkle();
          B.face = -1;
        }
        if (el > 2.1 && !c3) {
          c3 = true;
          B.face = 1;
        }
        return el > 2.8;
      },
      end: () => {
        C.tail.t = 0;
        C.wing.t = 0;
        C.tuft.t = 0;
        C.head.t = 0;
        C.pitch.t = 0;
        C.squash.vel += 2;
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
    this.raf = requestAnimationFrame(this.loop);
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
      if (S.t - S.lastSnap > rand(0.14, 0.4) && Math.abs(want - C.head.t) > 6) {
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
      S.nextIdle = rand(0.8, 2);
      const r = Math.random();
      if (!looking && r < 0.4) C.head.t = rand(-26, 22);
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
      B.ws += (1 - B.ws) * 0.2;
      B.bob = 0;
    }
    S.nextBlink -= dt;
    if (S.nextBlink <= 0) {
      S.blinkT = 0;
      S.nextBlink = 1.6 + Math.random() * 3.6;
      S.blinkDouble = Math.random() < 0.25;
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
    const sx = 1 + (1 - sy) * 0.7;
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
    const sy = C.squash.v * (1 + 0.014 * Math.sin(this.S.t * 2.6));
    const sx = 1 + (1 - sy) * 0.7;
    P.rig.setAttribute(
      'transform',
      `rotate(${C.pitch.v.toFixed(2)} 50 92) translate(50 92) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(-50 -92)`,
    );
    P.head.setAttribute('transform', `rotate(${C.head.v.toFixed(2)} 60 50)`);
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
    P.tuft.setAttribute('transform', `rotate(${C.tuft.v.toFixed(2)} 61 23)`);
    P.eye.setAttribute(
      'transform',
      `translate(70 34) scale(1 ${(1 - 0.92 * this.S.blink).toFixed(3)}) translate(-70 -34)`,
    );
    P.iris.setAttribute('transform', `translate(${C.ix.v.toFixed(2)} ${C.iy.v.toFixed(2)})`);
    if (P.carry) {
      if (B.carrying) {
        const p = this.beak();
        P.carry.style.opacity = '1';
        P.carry.style.transform = `translate(${(p.x - 13 + C.face.v * 6).toFixed(1)}px,${(p.y - 8).toFixed(1)}px) rotate(${(C.pitch.v * C.face.v * 0.5).toFixed(1)}deg)`;
      } else P.carry.style.opacity = '0';
    }
  }
}
