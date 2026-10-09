import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BirdEngine } from './engine';
import { Rig, type RigPart } from './Rig';
import type { Pose } from './Bower';
import { FPS, NEUTRAL, PART_KIND, POSE_REFERENCE, fakeFrames, type PartKey } from './pose-reference.fixture';

const Z = 100;
const POSES = Object.keys(POSE_REFERENCE) as Pose[];
const KEYS = Object.keys(NEUTRAL) as PartKey[];

afterEach(cleanup);

const nums = (s: string | null | undefined): number[] => (s ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];

/** Reads every part the engine moves, in the drawing's units. */
function reader(bird: HTMLElement, g: Partial<Record<RigPart, SVGGElement | null>>) {
  const at = (part: RigPart): number[] => nums(g[part]?.getAttribute('transform'));
  return (): Record<PartKey, number> => {
    const [tx = 0, ty = 0] = nums(bird.style.transform);
    const rig = at('rig');
    const head = at('head');
    const wing = at('wing');
    const tuft = at('tuft');
    return {
      dx: (tx * 100) / Z,
      dy: (ty * 100) / Z,
      pitch: rig[0] ?? 0,
      squash: rig[6] ?? 1,
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

function mount(pose: Pose) {
  const g: Partial<Record<RigPart, SVGGElement | null>> = {};
  render(createElement(Rig, { onPart: (part: RigPart, el: SVGGElement | null) => void (g[part] = el) }));
  const bird = document.createElement('div');
  const frames = fakeFrames(11);
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
    frames.options,
  );
  engine.setPose(pose);
  engine.start();
  return { frames, read: reader(bird, g), glyph: g.carry ?? null };
}

const tolerance = (key: PartKey, excursion: number): number =>
  PART_KIND[key] === 'offset' ? 2 : Math.max(PART_KIND[key] === 'scale' ? 0.004 : 1, 0.2 * excursion);
const restTolerance = (key: PartKey): number => (PART_KIND[key] === 'scale' ? 0.02 : 1);

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
    if (Math.abs(best - per) > per * 0.1) problems.push(`period ${(best / FPS).toFixed(2)}s, reference ${ref.period}s`);

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
    }

    // Only carry holds the thing in the beak, through holding().
    expect(glyph?.getAttribute('display')).toBe(pose === 'carry' ? 'inline' : 'none');
    expect(problems).toEqual([]);
  });
});
