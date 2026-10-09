import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACT_NAMES, BirdEngine, POSE_NAMES, type ActName, type EngineOptions } from './engine';
import { Rig, type RigPart } from './Rig';
import type { Pose } from './Bower';
import {
  ACTION_REFERENCE,
  ACT_REFERENCE,
  ENGINE_MEMBERS,
  FPS,
  NEUTRAL,
  PART_KIND,
  POSE_REFERENCE,
  actProblems,
  fakeFrames,
  readRig,
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
    const missing: string[] = [];
    for (const [member, kind] of Object.entries(ENGINE_MEMBERS)) {
      if (kind === 'acts') missing.push(...ACT_NAMES.filter((n) => !(n in ACT_REFERENCE)).map((n) => `${member}('${n}')`));
      else if (kind === 'poses') missing.push(...POSE_NAMES.filter((n) => !(n in POSE_REFERENCE)).map((n) => `${member}('${n}')`));
      else if (typeof kind === 'object' && !ACTION_REFERENCE[kind.action]) missing.push(`${member}: ${kind.action}`);
    }
    expect(missing).toEqual([]);
  });

  it('the wake startle stays within its reference range', () => {
    const ref = ACTION_REFERENCE.startle;
    expect(ref, 'the startle has a reference row').toBeDefined();
    if (!ref) return;
    for (const pose of ['idle', 'wait'] as const) {
      // Asleep after 60 s with no input (tuft down at -26deg), then an input with no place wakes it.
      const { engine, frames, read } = mount(pose);
      frames.run(61 * FPS);
      const from = read()[ref.part];
      expect(from, pose).toBeCloseTo(-26, 0);
      engine.nudge();
      const seen: number[] = [];
      for (let i = 0; i < 3 * FPS; i++) {
        frames.run(1);
        seen.push(read()[ref.part]);
      }
      const rest = POSE_REFERENCE[pose].parts.tuft?.rest ?? 0;
      const top = seen.indexOf(Math.max(...seen));
      const problems: string[] = [];
      // Eases up: never back down on the way to the peak, never past it.
      const rise = seen.slice(0, top + 1);
      if (rise.some((v, i) => i > 0 && v < (rise[i - 1] ?? v) - 0.01)) problems.push('the tuft dips on its way up');
      if (Math.abs((seen[top] ?? 0) - ref.peak) > 2) problems.push(`peak ${(seen[top] ?? 0).toFixed(2)}, reference ${ref.peak} ± 2`);
      // Holds the peak for its seconds.
      const held = seen.filter((v) => Math.abs(v - ref.peak) <= 2).length / FPS;
      if (held < ref.hold) problems.push(`held ${held.toFixed(2)}s, reference ${ref.hold}s`);
      // From the peak back to rest: within the range, and at rest at the end.
      const [lo, hi] = ref.range;
      const back = seen.slice(top);
      const min = Math.min(...back);
      const max = Math.max(...back);
      if (min < lo + rest || max > hi) problems.push(`returns over ${min.toFixed(2)}..${max.toFixed(2)}, range ${lo + rest}..${hi}`);
      const end = seen[seen.length - 1] ?? 0;
      if (Math.abs(end - rest) > 1) problems.push(`ends at ${end.toFixed(2)}, rest ${rest}`);
      expect(problems, pose).toEqual([]);
    }
  });
});
