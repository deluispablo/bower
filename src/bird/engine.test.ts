import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { BirdEngine, type ActName, type EngineOptions } from './engine';
import { Rig, type RigPart } from './Rig';
import type { Pose } from './Bower';
import {
  ACTION_REFERENCE,
  ACT_REFERENCE,
  ENGINE_MEMBERS,
  EXEMPT_NAMES,
  FPS,
  NEUTRAL,
  PART_KIND,
  POSE_REFERENCE,
  actProblems,
  fakeFrames,
  readRig,
  unreferencedMembers,
  type PartKey,
} from './pose-reference.fixture';

const Z = 100;
const POSES = Object.keys(POSE_REFERENCE) as Pose[];
const KEYS = Object.keys(NEUTRAL) as PartKey[];
const ACTS = Object.keys(ACT_REFERENCE) as ActName[];

afterEach(cleanup);

/** One engine on a drawn rig. The mind is on, with no input; `acts: false` unless the test asks for acts. */
function mount(pose: Pose | null, options: EngineOptions = {}, seed = 11) {
  const g: Partial<Record<RigPart, SVGGElement | null>> = {};
  render(createElement(Rig, { onPart: (part: RigPart, el: SVGGElement | null) => void (g[part] = el) }));
  const bird = document.createElement('div');
  const frames = fakeFrames(seed);
  const need = (part: RigPart): SVGGElement => {
    const el = g[part];
    if (!el) throw new Error(`no ${part}`);
    return el;
  };
  const engine = new BirdEngine(
    {
      bird,
      rig: need('rig'),
      head: need('head'),
      tail: need('tail'),
      wing: need('wing'),
      legs: need('legs'),
      jaw: need('jaw'),
      tuft: need('tuft'),
      eye: need('eye'),
      iris: need('iris'),
      glyph: g.carry ?? null,
    },
    () => ({ x: Z / 2, y: 0.92 * Z }),
    Z,
    { ...frames.options, sleeps: true, acts: false, ...options },
  );
  if (pose) engine.setPose(pose);
  engine.start();
  return { engine, frames, read: readRig(bird, (part) => g[part], Z), glyph: g.carry ?? null, headPart: need('head') };
}

const tolerance = (key: PartKey, excursion: number): number =>
  PART_KIND[key] === 'offset' ? 2 : Math.max(PART_KIND[key] === 'scale' ? 0.004 : 1, 0.2 * excursion);
const restTolerance = (key: PartKey): number => (PART_KIND[key] === 'scale' ? 0.02 : 1);
/** How far a part may go past its reference range: 2 degrees, 2 grid units, or a scale of 2 units on the 100-unit body. */
const beyond = (key: PartKey): number => (PART_KIND[key] === 'scale' ? 0.02 : 2);

describe('the engine plays the perched poses', () => {
  it.each(POSES)('each pose loop matches its CSS reference: %s', (pose) => {
    const ref = POSE_REFERENCE[pose];
    const per = Math.round(ref.period * FPS);
    const { frames, read, glyph } = mount(pose);
    frames.run(per * 2);
    const samples: Array<Record<PartKey, number>> = [];
    for (let i = 0; i < per * 4; i++) {
      frames.run(1);
      samples.push(read());
    }
    const problems: string[] = [];
    const moving = (Object.keys(ref.parts) as PartKey[]).filter((k) => k !== 'eye');

    // The period: the lag at which the loop best repeats itself (blink left out).
    const signal = (i: number, k: PartKey): number => {
      const r = ref.parts[k];
      const ex = r ? Math.abs(r.peak - r.rest) : 0;
      return ex ? ((samples[i]?.[k] ?? 0) - (r?.rest ?? 0)) / ex : 0;
    };
    let best = 0;
    let bestErr = Infinity;
    for (let lag = Math.round(per * 0.55); lag <= Math.round(per * 1.5); lag++) {
      let err = 0;
      const n = samples.length - lag;
      for (let i = 0; i < n; i++) for (const k of moving) err += Math.abs(signal(i, k) - signal(i + lag, k));
      err /= n;
      if (err < bestErr - 1e-9) {
        bestErr = err;
        best = lag;
      }
    }
    // idle and wait hold still between acts: no loop, so no period to find.
    if (moving.some((k) => ref.parts[k]?.peak !== ref.parts[k]?.rest) && Math.abs(best - per) > per * 0.1) problems.push(`period ${(best / FPS).toFixed(2)}s, reference ${ref.period}s`);

    // Each part's peak and rest, over one loop.
    const loop = samples.slice(0, per);
    for (const k of KEYS) {
      if (k === 'eye' && !ref.parts.eye) continue;
      const r = ref.parts[k];
      const rest = r?.rest ?? NEUTRAL[k];
      const want = r ? Math.abs(r.peak - r.rest) : 0;
      const got = Math.max(...loop.map((s) => Math.abs(s[k] - rest)));
      if (!r) {
        // No pose borrows another's act: what the reference leaves still stays still.
        if (got > restTolerance(k)) problems.push(`${k} moves ${got.toFixed(3)} but ${pose} leaves it still`);
        continue;
      }
      const tol = want === 0 ? restTolerance(k) : tolerance(k, want);
      if (Math.abs(got - want) > tol) problems.push(`${k} peak ${got.toFixed(3)}, reference ${want} ± ${tol.toFixed(3)}`);
      const at = loop[Math.round(r.restAt * per) % per];
      if (at && Math.abs(at[k] - r.rest) > restTolerance(k)) problems.push(`${k} at rest ${at[k].toFixed(3)}, reference ${r.rest}`);

      // The bound: never more than a little past the reference's own range (crossing rest is allowed when it does).
      const [lo, hi] = r.range;
      const min = Math.min(...loop.map((s) => s[k]));
      const max = Math.max(...loop.map((s) => s[k]));
      if (min < lo - beyond(k)) problems.push(`${k} goes to ${min.toFixed(3)}, reference range ${lo}..${hi}`);
      if (max > hi + beyond(k)) problems.push(`${k} goes to ${max.toFixed(3)}, reference range ${lo}..${hi}`);

      // A held peak stays at the peak through the reference's hold window.
      if (r.hold) {
        const [from, to] = r.hold;
        const off = loop
          .slice(Math.round(from * per), Math.round(to * per) + 1)
          .map((s) => Math.abs(s[k] - r.peak))
          .reduce((a, b) => Math.max(a, b), 0);
        if (off > tol) problems.push(`${k} strays ${off.toFixed(3)} from its held peak ${r.peak} at ${from}..${to}`);
      }
    }

    // idle and wait: each of the mind's acts, fired on its own, against its reference (TL-P4-25).
    for (const name of ACTS.filter((a) => ACT_REFERENCE[a].pose === pose)) {
      const one = mount(pose);
      one.frames.run(FPS);
      const rest = one.read();
      const seen: Array<Record<PartKey, number>> = [];
      one.engine.act(name);
      for (let i = 0; i < 1.5 * FPS; i++) {
        one.frames.run(1);
        seen.push(one.read());
      }
      problems.push(...actProblems(name, seen, rest));
    }

    // Only carry holds the thing in the beak, through holding().
    expect(glyph?.getAttribute('display')).toBe(pose === 'carry' ? 'inline' : 'none');
    expect(problems).toEqual([]);
  });
});

describe("the engine's idle mind", () => {
  /** The engine time of each act the mind fires, over `seconds`. */
  function draws(engine: BirdEngine, frames: ReturnType<typeof fakeFrames>, seconds: number, each?: (t: number) => void) {
    const fired: Array<{ t: number; name: ActName }> = [];
    let t = 0;
    const spy = vi.spyOn(engine, 'act').mockImplementation(function (this: BirdEngine, name: ActName) {
      fired.push({ t, name });
    });
    for (let i = 0; i < seconds * FPS; i++) {
      t = i / FPS;
      each?.(t);
      frames.run(1);
    }
    spy.mockRestore();
    return fired;
  }

  it('the idle timer fires every 0.8 to 2 s and blinks every 1.6 to 5.2 s', () => {
    // 80 s with no input: kept awake so the blinks are counted throughout.
    const { engine, frames, read } = mount('idle', { acts: true, sleeps: false });
    const fired = draws(engine, frames, 40);
    const gaps = fired.slice(1).map((f, i) => f.t - (fired[i]?.t ?? 0));
    expect(gaps.length).toBeGreaterThan(15);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(0.8 - 1 / FPS);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(2 + 1 / FPS);
    // One draw in ten (by weight) is a pause.
    expect(fired.some((f) => f.name === 'pause')).toBe(true);

    const starts: number[] = [];
    let shut = false;
    for (let i = 0; i < 40 * FPS; i++) {
      frames.run(1);
      const closing = read().eye < 0.9;
      // A double blink is one blink: a new one starts at least a second after the last.
      if (closing && !shut && (starts.length === 0 || i / FPS - (starts[starts.length - 1] ?? 0) > 1)) starts.push(i / FPS);
      shut = closing;
    }
    const blinkGaps = starts.slice(1).map((s, i) => s - (starts[i] ?? 0));
    expect(blinkGaps.length).toBeGreaterThan(6);
    expect(Math.min(...blinkGaps)).toBeGreaterThanOrEqual(1.6 - 2 / FPS);
    expect(Math.max(...blinkGaps)).toBeLessThanOrEqual(5.2 + 2 / FPS);
  });

  it('preen and snap never run while input is recent', () => {
    const { engine, frames } = mount('idle', { acts: true });
    // The pointer moves in front of the bird every 2 s, so input is always within 2.5 s.
    const fired = draws(engine, frames, 40, (t) => {
      if (Math.abs(t % 2) < 1e-9 || t === 0) engine.look({ x: 300, y: 30 }, 'pointer');
    });
    expect(fired.length).toBeGreaterThan(15);
    expect(fired.filter((f) => f.name === 'preen' || f.name === 'snap')).toEqual([]);
  });

  it('with the same seed and no input the bird preens and snaps', () => {
    const { engine, frames } = mount('idle', { acts: true });
    const fired = draws(engine, frames, 40);
    expect(fired.some((f) => f.name === 'preen')).toBe(true);
    expect(fired.some((f) => f.name === 'snap')).toBe(true);
  });

  it('a sleeping bird does not blink', () => {
    for (const pose of ['idle', 'sleep'] as const) {
      const { frames, read } = mount(pose);
      // The mind sleeps 60 s after mount with no input; the sleep pose is asleep from the start.
      frames.run(61 * FPS);
      const eyes: number[] = [];
      for (let i = 0; i < 12 * FPS; i++) {
        frames.run(1);
        eyes.push(read().eye);
      }
      expect(Math.max(...eyes), pose).toBeCloseTo(0.08, 2);
      expect(Math.min(...eyes), pose).toBeCloseTo(0.08, 2);
    }
  });
});

describe("the engine's named actions", () => {
  it('every engine act has a reference row', () => {
    expect(unreferencedMembers(ENGINE_MEMBERS)).toEqual([]);
  });

  it('a new engine name tagged script but not on the allowlist fails the meta-test', () => {
    expect(unreferencedMembers({ ...ENGINE_MEMBERS, glide: 'script', preen: 'control' })).toEqual([
      'glide: not referenced and not on the allowlist',
      'preen: not referenced and not on the allowlist',
    ]);
  });

  it('a new member tagged acts without a row fails the meta-test', () => {
    // The review scenario: `stretch()` registered as `acts` reaches no reference row of its own.
    expect(unreferencedMembers({ ...ENGINE_MEMBERS, stretch: 'acts', curl: 'poses' })).toEqual([
      'stretch: acts, but not the act dispatcher, so no reference row',
      'curl: poses, but not the pose dispatcher, so no reference row',
    ]);
  });

  it('an inherited name like toString is not on the allowlist', () => {
    expect(unreferencedMembers({ ...ENGINE_MEMBERS, toString: 'script' as const, constructor: 'control' as const })).toEqual([
      'toString: not referenced and not on the allowlist',
      'constructor: not referenced and not on the allowlist',
    ]);
  });

  it('the allowlist only shrinks and names only unreferenced members', () => {
    // Frozen at TL-P4-22 addendum 21: a name may leave this list, never join it.
    const atAddendum21 = [
      'speed', 'start', 'stop', 'release', 'setSize', 'setHome', 'snapHome', 'look', 'busy', 'settled', 'interrupt',
      'then', 'wait', 'chirp', 'flyTo', 'hopTo', 'peck', 'face', 'study', 'scribble', 'holding', 'showOff', 'poke',
    ];
    const listed = [...EXEMPT_NAMES];
    expect(listed.filter((n) => !atAddendum21.includes(n)), 'names added to the allowlist').toEqual([]);
    const labelled = Object.entries(ENGINE_MEMBERS).filter(([, k]) => k === 'script' || k === 'control').map(([n]) => n);
    expect(listed.filter((n) => !labelled.includes(n)), 'allowlisted names that have a reference').toEqual([]);
  });

  it('a wake startle with a focus gaze holds the head at −10 ±2', () => {
    // TL-P4-25 addendum 4: the step owns the head while it plays; the gaze moves only the iris, then eases back.
    for (const at of [{ x: 200, y: -100 }, { x: 200, y: 250 }]) {
      const cell = `(${at.x}, ${at.y})`;
      const { engine, frames, read } = mount('idle');
      frames.run(61 * FPS);
      expect(read().tuft, cell).toBeCloseTo(-26, 0);
      const before = read().head;
      engine.look(at, 'focus');
      const heads: number[] = [];
      const irises: number[] = [];
      for (let i = 0; i < 3 * FPS; i++) {
        frames.run(1);
        heads.push(read().head);
        irises.push(read().iris);
      }
      // The hold: from the end of the rise (0.15 s) to the start of the fall (0.75 s).
      const hold = heads.slice(Math.ceil(0.15 * FPS), Math.floor(0.75 * FPS));
      expect(Math.min(...hold), cell).toBeGreaterThanOrEqual(-12);
      expect(Math.max(...hold), cell).toBeLessThanOrEqual(-8);
      // The gaze still moves the iris toward the focused control.
      expect(irises[Math.floor(0.75 * FPS)] ?? 0, cell).toBeGreaterThan(0.8);
      // TL-P4-25 addendum 5, two rules by move class. Speed is the head's change per frame, in degrees.
      const speeds = heads.map((h, i) => h - (i === 0 ? before : (heads[i - 1] ?? h)));
      // The startle's rise is a snap: exempt from the ramp, at most 6 degrees a frame, no overshoot past 2 degrees.
      const rise = speeds.slice(0, Math.ceil(0.15 * FPS));
      expect(Math.max(...rise.map(Math.abs)), `${cell} rise speed`).toBeLessThanOrEqual(6);
      expect(Math.min(...heads.slice(0, Math.floor(0.75 * FPS))), `${cell} rise overshoot`).toBeGreaterThanOrEqual(-12);
      // The returns (the step's head easing back, then the gaze settling) are ease-in-out: the speed starts and ends
      // near 0 (within one 1.5 step of it), changes by at most 1.5 a frame, and never goes above 6.
      const from = Math.floor(0.75 * FPS);
      const back = speeds.slice(from);
      const ramp = back.map((v, i) => Math.abs(v - (speeds[from + i - 1] ?? v)));
      expect(Math.abs(back[0] ?? 0), `${cell} return starts`).toBeLessThanOrEqual(1.5);
      expect(Math.abs(back[back.length - 1] ?? 0), `${cell} return ends`).toBeLessThanOrEqual(1.5);
      expect(Math.max(...ramp), `${cell} return speed change`).toBeLessThanOrEqual(1.5);
      expect(Math.max(...back.map(Math.abs)), `${cell} return speed`).toBeLessThanOrEqual(6);
    }
  });

  it('a gaze return keeps its speed bounds when focus disappears mid-return', () => {
    // TL-P4-25 addendum 5, the review scenario: wake at (200, -100), then focus goes away after 80 frames.
    const { engine, frames, read } = mount('idle');
    frames.run(61 * FPS);
    let target: { x: number; y: number } | null = { x: 200, y: -100 };
    engine.look(() => target, 'focus');
    let before = read().head;
    const speeds: number[] = [];
    for (let i = 0; i < 4 * FPS; i++) {
      if (i === 80) target = null;
      frames.run(1);
      const head = read().head;
      speeds.push(head - before);
      before = head;
    }
    const from = Math.floor(0.75 * FPS);
    const back = speeds.slice(from);
    const ramp = back.map((v, i) => Math.abs(v - (speeds[from + i - 1] ?? v)));
    expect(Math.max(...ramp), 'return speed change').toBeLessThanOrEqual(1.5);
    expect(Math.max(...back.map(Math.abs)), 'return speed').toBeLessThanOrEqual(6);
    expect(Math.abs(back[back.length - 1] ?? 0), 'return ends').toBeLessThanOrEqual(1.5);
  });

  it('gaze after a snap stays within 5400 degrees per second squared', () => {
    const { engine, frames, read } = mount('idle', { random: () => 0.5 });
    let target = { x: 200, y: -100 };
    engine.look(() => target, 'focus');
    frames.run(180);
    engine.act('snap');
    frames.run(4);
    const before = read().head;
    frames.run(1);
    let head = read().head;
    let speed = (head - before) * FPS;
    expect(head).toBeCloseTo(-5, 4);
    target = { x: 200, y: 250 };
    for (let i = 0; i < FPS; i++) {
      frames.run(1);
      const now = read().head;
      const nextSpeed = (now - head) * FPS;
      expect(Math.abs(nextSpeed - speed) * FPS, `gaze frame ${i + 1}`).toBeLessThanOrEqual(5400);
      head = now;
      speed = nextSpeed;
    }
  });

  it('a nudge during a preen lands the startle within 2 degrees', () => {
    const { engine, frames, read } = mount('idle');
    frames.run(1);
    engine.act('preen');
    frames.run(36);
    expect(read().head).toBeCloseTo(42, 0);
    engine.nudge();
    const heads: number[] = [];
    for (let i = 0; i < Math.floor(0.75 * FPS); i++) {
      frames.run(1);
      heads.push(read().head);
    }
    expect(Math.min(...heads), 'startle overshoot').toBeGreaterThanOrEqual(-12);
    expect(heads[heads.length - 1], 'startle lands').toBeLessThanOrEqual(-8);
  });

  describe('the startle settles within 2° and at rest before any handover from every pose and holds 0.6 s from landing', () => {
    // Settling-based transitions: TL-P4-25 addendum 14. Reuse the fixture's domain, not idle's angle limits.
    const preen = ACT_REFERENCE.preen;
    it('every pose and preen endpoint meets the geometry bound', () => {
      const ranges = POSES.map((pose) => ({ pose, range: POSE_REFERENCE[pose].parts.head?.range ?? [0, 0] }));
      ranges.push({ pose: 'idle', range: [Math.min(...preen.values), Math.max(...preen.values)] });
      for (const { pose, range } of ranges) {
        for (const angle of range) {
          expect(Math.abs(angle + 10) / 360, `${pose} at ${angle}°: geometry alone`).toBeLessThanOrEqual(0.2);
        }
      }
    });
    const schedules = [
      { name: '30 fps', dt: [1 / 30] },
      { name: '60 fps', dt: [1 / 60] },
      { name: '120 fps', dt: [1 / 120] },
      { name: 'jittered', dt: [1 / 120, 1 / 30, 1 / 90, 1 / 60, 0.025] },
    ];
    // A throwaway copy probes the selected profile with an opposing velocity. A snap can reverse immediately;
    // a return capped at 5400°/s² cannot. This observes the class without copying its timer/arrival predicate.
    type ProfileProbe = {
      H: { v: number; vel: number; t: number; gaze: number; actTarget: number; gazeTarget: number; snap: boolean };
      S: Record<string, unknown>;
      B: Record<string, unknown>;
      C: Record<string, Record<string, number>>;
      heard(): boolean;
      minded(): boolean;
      asleep: boolean;
      startle(): void;
      step(dt: number, headDt: number): void;
    };
    const entries = [...POSES, 'preen phase', 'preen at 0.6 s', 'minded doze', 'error while asleep', 'offline while asleep'];
    const batches = schedules.flatMap((schedule) => entries.map((name, entryIndex) => ({ schedule, name, entryIndex })));
    // 960 existing cases + two reactions × four cadences × 20 phases = 1120, exactly once.
    expect(batches.length * 20).toBe(1120);
    it.each(batches)('$schedule.name: $name', ({ schedule, entryIndex }) => {
      let runs = 0;
      fc.assert(
        fc.property(fc.noBias(fc.integer({ min: 0, max: 10_000 })), fc.integer({ min: 0, max: 4 }), (phaseTick, offset) => {
          runs++;
          const phase = phaseTick / 10_000;
          const problems: string[] = [];
          const cases = [
            ...POSES.map((pose) => ({ pose, act: false, seconds: POSE_REFERENCE[pose].period * (1 + phase) })),
            { pose: 'idle' as const, act: true, seconds: 0.75 * phase },
            { pose: 'idle' as const, act: true, seconds: 0.6 }, // The round-7 witness: preen at 42°.
            { pose: 'idle' as const, act: false, seconds: 0.2, doze: true },
            ...(['error', 'offline'] as const).map((reaction) => ({ pose: 'sleep' as const, act: false, seconds: 0.2, reaction })),
          ];
          const selected = cases[entryIndex];
          if (!selected) throw new Error('Missing startle case');
          for (const entry of [selected]) {
            cleanup();
            let callback: ((ts: number) => void) | undefined;
            const { engine, headPart, read } = mount(entry.pose, {
              sleeps: 'doze' in entry,
              random: () => 0.5,
              frame: (cb) => { callback = cb; return 1; },
              cancelFrame: () => { callback = undefined; },
            });
            const internals = engine as unknown as ProfileProbe;
            const startling = 'reaction' in entry || (internals.heard() && internals.minded());
            let time = 1;
            let frame = offset;
            callback?.(time * 1000); // Prime the clock: the first animation frame has zero elapsed time.
            const readHead = () => Number(headPart.getAttribute('transform')?.match(/rotate\((-?\d+(?:\.\d+)?)/)?.[1] ?? 0);
            const advance = (seconds: number, sample: (dt: number) => void = () => {}) => {
              const until = time + seconds;
              while (time < until - 1e-10) {
                const dt = Math.min(schedule.dt[frame++ % schedule.dt.length] ?? 1 / FPS, until - time);
                time += dt;
                callback?.(time * 1000);
                sample(dt);
              }
            };
            if (entry.act) engine.act('preen');
            // Inject the quiet clock at DOZE's 60 s boundary; the real idle path enters the minded doze.
            if ('doze' in entry) internals.S.quietT = Number(internals.S.t) - 60;
            advance(entry.seconds);
            if ('doze' in entry) {
              expect(internals.asleep, 'minded doze starts after 60 s without input').toBe(true);
              expect(readHead(), 'minded doze starts with its head at 20°').toBeCloseTo(20, 4);
            }
            if (!startling) {
              // Compare the same pose and cadence without input: nudge must preserve its head script.
              const expected: number[] = [readHead()];
              const replayTime = time;
              const replayFrame = frame;
              advance(1.3, () => { expected.push(readHead()); });
              engine.stop();
              cleanup();
              const control = mount(entry.pose, {
                sleeps: false,
                random: () => 0.5,
                frame: (cb) => { callback = cb; return 1; },
                cancelFrame: () => { callback = undefined; },
              });
              time = 1;
              frame = offset;
              callback?.(time * 1000);
              advance(entry.seconds);
              expect(time).toBe(replayTime);
              expect(frame).toBe(replayFrame);
              const startle = vi.spyOn(control.engine as unknown as ProfileProbe, 'startle');
              const actual: number[] = [control.read().head];
              try {
                control.engine.nudge();
                expect(control.read().head, `${entry.pose}: nudge leaves the head unchanged`).toBe(expected[0]);
                advance(1.3, () => { actual.push(control.read().head); });
                expect(startle, `${entry.pose}: nudge does not startle`).not.toHaveBeenCalled();
                expect(actual, `${schedule.name} ${entry.pose}: head follows its pose`).toEqual(expected);
              } finally {
                startle.mockRestore();
                control.engine.stop();
              }
              continue;
            }
            const label = `${schedule.name} ${'doze' in entry ? 'minded doze' : entry.act ? `preen at ${entry.seconds.toFixed(4)} s` : entry.pose} phase ${phase.toFixed(4)}`;
            const seen = new Set<string>();
            const fail = (kind: string, detail: string) => {
              if (!seen.has(kind)) problems.push(`${label}: ${kind} ${detail}`);
              seen.add(kind);
            };
            let head = readHead();
            const from = head;
            const range = 'doze' in entry ? [20, 20] : entry.act ? [0, Math.max(...preen.values)] : POSE_REFERENCE[entry.pose].parts.head?.range ?? [0, 0];
            if (head < (range[0] ?? 0) - 2 || head > (range[1] ?? 0) + 2) fail('fixture range', `${head.toFixed(4)}°`);
            const tuftFrom = read().tuft;
            let headAt = Infinity;
            let tuftAt = Math.abs(tuftFrom - 18) <= 0.01 ? 0 : Infinity;
            let landingAt = headAt === 0 && tuftAt === 0 ? 0 : Infinity;
            let tuftClock = 0;
            let sampled = false;
            const nudgedAt = time;
            const step = internals.step;
            const spy = vi.spyOn(internals, 'step').mockImplementation(function (dt, headDt) {
              if (headAt === Infinity) {
                const probe = Object.assign(Object.create(Object.getPrototypeOf(engine)) as ProfileProbe, engine, {
                  H: { ...internals.H }, S: { ...internals.S }, B: { ...internals.B },
                  C: Object.fromEntries(Object.entries(internals.C).map(([key, spring]) => [key, { ...spring }])),
                }) as unknown as ProfileProbe;
                const direction = Math.sign(-10 - head) || Math.sign(-10 - from) || 1;
                const before = probe.H.v;
                probe.H.vel = -direction * 360;
                step.call(probe, 0, headDt);
                const toward = (probe.H.v - before) * direction;
                // A snap already on target stays there; a return with the injected velocity moves away.
                if (toward < 0 || (toward === 0 && before !== -10)) {
                  fail('handover before settling', `${(time - nudgedAt).toFixed(4)} s, head ${head.toFixed(4)}°`);
                }
              }
              step.call(internals, dt, headDt);
            });
            const sample = (dt: number) => {
              const elapsed = time - nudgedAt;
              const now = readHead();
              const tuft = read().tuft;
              tuftClock += Math.min(0.033, dt);
              if (!sampled && Math.abs(tuftFrom - 18) > 0.01 && Math.abs(tuft - 18) >= Math.abs(tuftFrom - 18)) {
                fail('tuft waits for head', `tuft ${tuft.toFixed(2)}°, head ${now.toFixed(4)}°`);
              }
              sampled = true;
              // The tuft's own 0.15 s rise uses the engine's capped animation clock, independently of head arrival.
              if (tuftAt === Infinity && tuftClock >= 0.15 - 1e-10 && Math.abs(tuft - 18) > 0.01) {
                fail('tuft schedule', `not at 18° on its first frame after 0.15 s: ${tuft.toFixed(2)}°`);
              }
              const speed = Math.abs(now - head) / dt;
              if (speed > 360) fail('speed', `${speed.toFixed(4)}°/s at ${elapsed.toFixed(4)} s`);
              if ((from >= -10 && now < -12) || (from < -10 && now > -8 && elapsed <= landingAt + 0.6)) {
                fail('overshoot', `${now.toFixed(4)}° at ${elapsed.toFixed(4)} s`);
              }
              if (headAt === Infinity && Math.abs(now + 10) <= 2 && speed < 1e-6) headAt = elapsed;
              if (tuftAt === Infinity && Math.abs(tuft - 18) <= 0.01) tuftAt = elapsed;
              if (landingAt === Infinity && headAt < Infinity && tuftAt < Infinity) landingAt = elapsed;
              if (elapsed < landingAt + 0.6 - 1e-10 && landingAt < Infinity) {
                if (Math.abs(now + 10) > 2 || Math.abs(tuft - 18) > 2 || internals.H.t !== -10) {
                  fail('hold from landing', `landed ${landingAt.toFixed(4)} s, released ${elapsed.toFixed(4)} s`);
                }
              }
              head = now;
            };
            try {
              if ('reaction' in entry) {
                const port = engine as unknown as { play?: (kind: 'error' | 'offline') => void };
                port.play?.(entry.reaction as 'error' | 'offline');
              } else engine.nudge();
              // Sample the deadlines exactly; other frames retain the selected cadence (including its jitter).
              advance(0.15, sample);
              advance(Math.max(...schedule.dt), sample);
              if (tuftAt === Infinity) fail('tuft schedule', 'no independent 18° peak by the first frame after 0.15 s');
              advance(0.2 - (time - nudgedAt), sample);
              if (headAt > 0.2 + 1e-10) fail('landing deadline', `head ${head.toFixed(4)}° at 0.2 s`);
              advance(1.1, sample);
              if (landingAt === Infinity) fail('hold from landing', 'both parts never landed');
            } finally {
              spy.mockRestore();
              engine.stop();
            }
          }
          expect(problems, `phase ${phase}, schedule offset ${offset}`).toEqual([]);
        }),
        { seed: 2610, numRuns: 20, endOnFailure: true },
      );
      expect(runs).toBe(20);
    });
  });

  // TL-P4-25 addendum 8: rates are measured from delivered frames; gaze is always a return.
  it.each([
    { name: '30 fps', ms: [1000 / 30] },
    { name: '60 fps', ms: [1000 / 60] },
    { name: '120 fps', ms: [1000 / 120] },
    { name: 'jittered', ms: [1000 / 120, 1000 / 30, 1000 / 90, 1000 / 60, 25] },
  ].flatMap((schedule) => Array.from({ length: 8 }, (_, batch) => ({ ...schedule, batch }))))('every frame keeps the addendum 5 bounds under random focus, pointer, touch, step and wake events: $name batch $batch', (schedule) => {
    const event = fc.record({
      gap: fc.integer({ min: 0, max: 200 }),
      kind: fc.constantFrom('pointer', 'touch', 'focus', 'blur', 'nudge', 'sleep', 'snapGaze', 'preenNudge'),
      x: fc.integer({ min: -100, max: 300 }),
      y: fc.integer({ min: -150, max: 300 }),
    });
    fc.assert(
      fc.property(fc.constantFrom('idle' as const, 'wait' as const), fc.array(event, { minLength: 1, maxLength: 10 }), (pose, events) => {
        cleanup();
        let callback: ((ts: number) => void) | undefined;
        const random = fakeFrames(11).options.random;
        let choosingSnap = false;
        const { engine, headPart } = mount(pose, {
          random: () => choosingSnap ? 0.5 : random(),
          frame: (cb) => {
            callback = cb;
            return 1;
          },
          cancelFrame: () => { callback = undefined; },
        });
        const readHead = () => Number(headPart.getAttribute('transform')?.match(/rotate\((-?\d+(?:\.\d+)?)/)?.[1] ?? 0);
        let focus: { x: number; y: number } | null = null;
        let head = readHead();
        let speed = 0;
        let inputAt = 0;
        let snapFrom = head;
        let snapTarget: number | null = null;
        let snapStartedAt = 0;
        const startSnap = (target: number) => {
          if (snapTarget !== target) snapStartedAt = time;
          snapFrom = head;
          snapTarget = target;
        };
        let frame = 0;
        let time = 0;
        const problems: string[] = [];
        const tick = (seconds: number) => {
          const until = time + seconds;
          while (time < until) {
            const dt = (schedule.ms[frame % schedule.ms.length] ?? 1000 / FPS) / 1000;
            time += dt;
            callback?.(time * 1000);
            frame++;
            const now = readHead();
            const v = (now - head) / dt;
            const asleep = time - inputAt >= 60;
            // The settling frame still belongs to the snap, including its uncapped hard stop.
            const snap = snapTarget !== null;
            if (Math.abs(v) > 360) problems.push(`frame ${frame}: speed ${v.toFixed(2)} deg/s`);
            if (snap && (now < -12 - 2 || now > Math.max(7, snapFrom) + 2)) problems.push(`frame ${frame}: overshoot ${now.toFixed(2)}`);
            const acceleration = (v - speed) / dt;
            if (!snap && !asleep && Math.abs(acceleration) > 5400) problems.push(`frame ${frame}: return acceleration ${acceleration.toFixed(2)} deg/s^2`);
            if (snapTarget !== null && Math.abs(now - snapTarget) <= 2 && Math.abs(v) < 1e-6) snapTarget = null;
            if (snapTarget !== null && time - snapStartedAt >= 0.2 - 1e-10) {
              problems.push(`frame ${frame}: snap did not settle within 0.2 s at ${snapTarget}°`);
            }
            head = now;
            speed = v;
          }
        };
        const input = () => {
          if (time - inputAt >= 60) startSnap(-10); // an input wakes a sleeping bird with the startle
          inputAt = time;
        };
        for (const e of events) {
          tick(e.gap / FPS);
          const at = { x: e.x, y: e.y };
          if (e.kind === 'snapGaze') {
            input();
            focus = { x: 200, y: -100 };
            engine.look(() => focus, 'focus');
            tick(180 / FPS);
            choosingSnap = true;
            engine.act('snap');
            choosingSnap = false;
            startSnap(-5); // The deterministic snap with this focus lands at -5° (the gaze-after-snap fixture).
            tick(5 / FPS);
            focus = { x: 200, y: 250 };
            // Gaze uses return bounds once the preceding snap has measurably settled.
          } else if (e.kind === 'preenNudge') {
            engine.act('preen');
            tick(36 / FPS);
            input();
            startSnap(-10);
            engine.nudge();
          } else if (e.kind === 'pointer' || e.kind === 'touch') {
            input();
            engine.look(at, e.kind);
          } else if (e.kind === 'focus') {
            input();
            focus = at;
            engine.look(() => focus, 'focus');
          } else if (e.kind === 'blur') focus = null;
          else if (e.kind === 'nudge') {
            input();
            startSnap(-10);
          } else {
            focus = null;
            tick(61);
            continue;
          }
          if (e.kind === 'nudge') engine.nudge();
        }
        tick(4);
        expect(problems.slice(0, 5), JSON.stringify({ schedule: schedule.name, pose, events })).toEqual([]);
        engine.stop();
      }),
      { seed: 2610, numRuns: 5, path: String(schedule.batch * 5) },
    );
  });

  it('every ENGINE_MEMBERS key needs a reference row or an allowlist entry, whatever its tag', () => {
    // TL-P4-22 addendum 21, over every key: a new name with any tag that is not a row of its own fails.
    const known = new Set(Object.keys(ENGINE_MEMBERS));
    fc.assert(
      fc.property(
        fc.oneof(fc.constantFrom('toString', 'constructor', 'stretch', 'glide'), fc.stringMatching(/^[a-z][A-Za-z]{2,10}$/)),
        fc.constantFrom('control' as const, 'script' as const, 'acts' as const, 'poses' as const),
        (name, kind) => {
          fc.pre(!known.has(name));
          const missing = unreferencedMembers({ ...ENGINE_MEMBERS, [name]: kind });
          expect(missing.some((m) => m.startsWith(name)), `${name}: ${kind}`).toBe(true);
        },
      ),
      { seed: 2610, numRuns: 60 },
    );
  });

  it('the wake startle stays within its reference range', () => {
    const ref = ACTION_REFERENCE.startle;
    expect(ref, 'the startle has a reference row').toBeDefined();
    if (!ref) return;
    const parts = Object.entries(ref.parts) as Array<[PartKey, number]>;
    expect(parts.map(([k]) => k).sort()).toEqual(['head', 'tuft']);
    for (const pose of ['idle', 'wait'] as const) {
      // Asleep after 60 s with no input (tuft down at -26deg, head 20deg), then an input with no place wakes it.
      const { engine, frames, read } = mount(pose);
      frames.run(61 * FPS);
      expect(read().tuft, pose).toBeCloseTo(-26, 0);
      engine.nudge();
      const seen: Array<Record<PartKey, number>> = [];
      for (let i = 0; i < 3 * FPS; i++) {
        frames.run(1);
        seen.push(read());
      }
      const problems: string[] = [];
      for (const [k, peak] of parts) {
        const values = seen.map((s) => s[k]);
        const rest = POSE_REFERENCE[pose].parts[k]?.rest ?? NEUTRAL[k];
        const toward = Math.sign(peak - rest);
        const top = values.reduce((best, v, i) => ((v - (values[best] ?? v)) * toward > 0 ? i : best), 0);
        // Eases toward its value: never backs away on the way, never past it.
        const go = values.slice(0, top + 1);
        if (go.some((v, i) => i > 0 && (v - (go[i - 1] ?? v)) * toward < -0.01)) problems.push(`${k} backs away on its way to ${peak}`);
        if (Math.abs((values[top] ?? 0) - peak) > 2) problems.push(`${k} peaks at ${(values[top] ?? 0).toFixed(2)}, reference ${peak} ± 2`);
        // Holds it for its seconds.
        const held = values.filter((v) => Math.abs(v - peak) <= 2).length / FPS;
        if (held < ref.hold) problems.push(`${k} held ${held.toFixed(2)}s, reference ${ref.hold}s`);
        // From there back to rest: within 2 of the span from rest to its value, and at rest at the end.
        const lo = Math.min(rest, peak) - 2;
        const hi = Math.max(rest, peak) + 2;
        const back = values.slice(top);
        const min = Math.min(...back);
        const max = Math.max(...back);
        if (min < lo || max > hi) problems.push(`${k} returns over ${min.toFixed(2)}..${max.toFixed(2)}, range ${lo}..${hi}`);
        const end = values[values.length - 1] ?? 0;
        if (Math.abs(end - rest) > 1) problems.push(`${k} ends at ${end.toFixed(2)}, rest ${rest}`);
      }
      expect(problems, pose).toEqual([]);
    }
  });
});
