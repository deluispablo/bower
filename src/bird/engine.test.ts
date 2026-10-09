import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  return { engine, frames, read: readRig(bird, (part) => g[part], Z), glyph: g.carry ?? null };
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
    // TL-P4-25 addendum 5, the Codex scenario: wake at (200, -100), then focus goes away after 80 frames.
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
