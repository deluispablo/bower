import { readFileSync } from 'node:fs';
import { createRef } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { usePrefs } from '@/app/prefs';
import { BowerLayer, PoseBower, type BowerController, type Pose } from './Bower';
import { ACT_NAMES, type ActName } from './engine';
import { activeHandle } from './presence';
import { REACTIONS, react, type ReactionKind } from './react';
import { ACT_REFERENCE, FPS, POSE_REFERENCE, fakeFrames } from './pose-reference.fixture';


const SEED = 240_726;
const EPSILON = 0.005;
const POSES = Object.keys(POSE_REFERENCE) as Pose[];
const KINDS = Object.keys(REACTIONS) as ReactionKind[];
const STARTS = [...POSES, ...ACT_NAMES.map((name) => `act:${name}` as const), 'turned', 'layer'] as const;
type Start = (typeof STARTS)[number];
type Drawn = Record<string, number>;
const sheet = document.createElement('style');
const originalPath = window.location.pathname;

beforeAll(() => {
  // jsdom does not load imported stylesheets. These are the real still-frame rules,
  // not an oracle reconstructed from the engine's flags or spring targets.
  sheet.textContent = readFileSync('src/bird/poses.css', 'utf8') +
    readFileSync('src/bird/bower.css', 'utf8');
  document.head.append(sheet);
});
afterAll(() => sheet.remove());
afterEach(() => {
  cleanup();
  usePrefs.setState({ birdMoves: true });
  window.history.replaceState(null, '', originalPath);
  vi.restoreAllMocks();
});

/** Semantic values of a transform list, including both translations and scales.
 * SVG attributes win while the engine draws; CSS is read when release removes them.
 * This also reads the iris's y offset, which readRig intentionally does not expose.
 */
function transformValues(text: string) {
  const values = { angle: 0, x: 0, y: 0, sx: 1, sy: 1 };
  for (const match of text.matchAll(/([a-zA-Z]+)\(([^)]*)\)/g)) {
    const nums = match[2]?.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    const a = nums[0] ?? 0;
    const b = nums[1] ?? 0;
    switch (match[1]) {
      case 'rotate': values.angle += a; break;
      case 'translate': values.x += a; values.y += b; break;
      case 'translateX': values.x += a; break;
      case 'translateY': values.y += a; break;
      case 'scale': values.sx *= a; values.sy *= nums[1] ?? a; break;
      case 'scaleX': values.sx *= a; break;
      case 'scaleY': values.sy *= a; break;
      default: throw new Error(`Unmeasured drawn transform: ${match[0]}`);
    }
  }
  return values;
}

function reader(container: HTMLElement, layer: boolean) {
  const bird = container.querySelector<HTMLElement>(layer ? '.bower-flyer' : '.bird-perch');
  if (!bird) throw new Error('Missing drawn Bower.');
  const parts = ['rig', 'head', 'tail', 'wing', 'legs', 'jaw', 'tuft', 'eye', 'iris'] as const;
  const groups = parts.map((name) => {
    const el = container.querySelector<SVGGElement>(`.b-${name}`);
    if (!el) throw new Error(`Missing drawn ${name}.`);
    return { name, el };
  });
  const glyph = container.querySelector<SVGGElement>('.b-carry');
  const carry = container.querySelector<HTMLElement>('.bower-carry');
  return (): Drawn => {
    const placed = transformValues(bird.style.transform || getComputedStyle(bird).transform);
    const output: Drawn = {
      // The fixture uses a 100 px drawing: 100% and 100px have the same size.
      width: Number.parseFloat(bird.style.width || getComputedStyle(bird).width) || 100,
      height: Number.parseFloat(bird.style.height || getComputedStyle(bird).height) || 100,
      opacity: Number(bird.style.opacity || getComputedStyle(bird).opacity || 1),
    };
    for (const [key, value] of Object.entries(placed)) output[`perch.${key}`] = value;
    for (const { name, el } of groups) {
      const values = transformValues(el.getAttribute('transform') ?? getComputedStyle(el).transform);
      for (const [key, value] of Object.entries(values)) output[`${name}.${key}`] = value;
    }
    if (glyph) {
      // CSS display overrides the presentation attribute in the released carry pose.
      // jsdom omits SVG presentation attributes from computed style. The only
      // stylesheet override is the released carry drawing's display:inline.
      const display = glyph.matches('.posed.carry .b-carry') ?
        getComputedStyle(glyph).display : glyph.getAttribute('display');
      output.glyph = display === 'none' ? 0 : 1;
    }
    if (carry) {
      output['carry.opacity'] = Number(carry.style.opacity || getComputedStyle(carry).opacity || 0);
      for (const [key, value] of Object.entries(transformValues(carry.style.transform))) output[`carry.${key}`] = value;
    }
    return output;
  };
}

function startPose(start: Start): Pose {
  if (start.startsWith('act:')) return ACT_REFERENCE[start.slice(4) as ActName].pose;
  return POSES.includes(start as Pose) ? start as Pose : 'idle';
}

/** Render the real released drawing, including Settings' two inline overrides.
 * Moves-off opens sleep's eyes away from Settings, as the packet requires.
 */
function stillFrame(pose: Pose, settings: boolean, layer: boolean): Drawn {
  const view = render(<PoseBower pose={pose} size={100} minor />);
  const head = view.container.querySelector<SVGGElement>('.b-head');
  const eye = view.container.querySelector<SVGGElement>('.b-eye');
  if (!head || !eye) throw new Error('Missing still frame.');
  eye.style.transform = `scaleY(${settings ? 0.08 : 1})`;
  if (settings) head.style.transform = 'rotate(8deg)';
  const output = reader(view.container, false)();
  if (layer) {
    output['carry.opacity'] = 0;
    for (const [key, value] of Object.entries(transformValues(''))) output[`carry.${key}`] = value;
  }
  view.unmount();
  return output;
}

const timings = fc.record({
  phase: fc.integer({ min: 3, max: 80 }),
  reactionFrames: fc.integer({ min: 0, max: 120 }),
  poseAt: fc.integer({ min: 0, max: 35 }),
  chirpAt: fc.integer({ min: 0, max: 35 }),
  actAt: fc.integer({ min: 0, max: 35 }),
  gazeAt: fc.integer({ min: 0, max: 35 }),
  nextPose: fc.constantFrom(...POSES),
  mindAct: fc.constantFrom(...ACT_NAMES),
  settings: fc.boolean(),
});
type Timing = typeof timings extends fc.Arbitrary<infer Value> ? Value : never;
type Track = 'control' | 'foreign' | 'pose';

function trace(start: Start, kind: ReactionKind, timing: Timing, track: Track) {
  usePrefs.setState({ birdMoves: true });
  window.history.replaceState(null, '', timing.settings ? '/settings' : '/');
  const layer = start.startsWith('layer');
  const pose = startPose(start);
  const frames = fakeFrames(11);
  const controller = createRef<BowerController>();
  const options = { ...frames.options, acts: true };
  const drawing = (p: Pose) => layer ?
    <BowerLayer ref={controller} size={100} home={() => ({ x: 50, y: 92 })} engineOptions={options} /> :
    <PoseBower pose={p} size={100} engineOptions={options} />;
  const view = render(drawing(pose));
  const read = reader(view.container, layer);
  const engine = activeHandle();
  if (!engine) throw new Error('Missing motion engine.');
  let currentFrame = 0;
  let released: { frame: number; drawn: Drawn } | undefined;
  const release = engine.release.bind(engine);
  const spy = vi.spyOn(engine, 'release').mockImplementation(() => {
    released ??= { frame: currentFrame, drawn: read() };
    release();
  });
  const run = (n: number) => act(() => frames.run(n));
  run(1); // Prime the injected clock; every measured frame then advances by 1/FPS.
  if (start.startsWith('act:')) {
    act(() => engine.act(start.slice(4) as ActName));
    run(start === 'act:preen' ? Math.round(0.6 * FPS) : Math.min(timing.phase, 6));
  } else if (start === 'turned') {
    act(() => engine.look({ x: -220, y: -120 }, 'focus'));
    run(1.5 * FPS);
  } else {
    run(start === 'land' ? 3 : timing.phase);
  }
  // moves-off itself is the transition, so it is not prematurely played twice.
  if (kind !== 'moves-off') {
    act(() => { react(kind); });
    run(timing.reactionFrames);
  }
  const before = read();
  const samples: Drawn[] = [];
  const immediate: Drawn[] = [];
  const gaze = { x: -220, y: -120 };
  act(() => engine.look(() => gaze, 'focus'));
  act(() => usePrefs.setState({ birdMoves: false }));
  immediate.push(read());
  // Full 0.6 s contract plus two frames to observe the handover. No engine flag
  // is used for an oracle: the release spy only marks the public lifecycle event.
  for (let i = 0; i < 38; i++) {
    act(() => {
      if (track === 'foreign') {
        if (i === timing.chirpAt) engine.chirp(0.3);
        if (i === timing.actAt) engine.act(timing.mindAct);
        if (i === timing.gazeAt) {
          gaze.x = 220;
          gaze.y = 120;
          engine.look(() => gaze, 'focus');
        }
      }
      if (track === 'pose' && i === timing.poseAt) view.rerender(drawing(timing.nextPose));
    });
    immediate.push(read());
    currentFrame = i + 1;
    run(1);
    samples.push(read());
  }
  const after = read();
  spy.mockRestore();
  view.unmount();
  return { before, samples, immediate, released, after };
}

/** 0.5% per scalar, with a unit floor for zero-valued angles/offsets.
 * No aggregate vector norm may hide a wrong opacity, scale or iris component.
 */
function differences(actual: Drawn, expected: Drawn): string[] {
  return Object.keys(expected).flatMap((key) => {
    const got = actual[key];
    const want = expected[key] ?? NaN;
    return got === undefined || !Number.isFinite(got) || Math.abs(got - want) > EPSILON * Math.max(1, Math.abs(want)) + 1e-9 ?
      [`${key}: ${got} != ${want}`] : [];
  });
}

// One property, partitioned into tiny Cartesian cells so each fast-check call
// stays comfortably below 1.5 s. Every reaction and every fixture pose/act is
// exercised even when another cell is red; seeds and run counts never vary.
describe.each(KINDS.flatMap((kind) => STARTS.flatMap((start) =>
  (['witness', 'random'] as const).map((batch) => ({ kind, start, batch })))))(
  '$kind / $start / $batch', ({ kind, start, batch }) => {
  it('the moves-off settle blends the whole drawn output to the still frame', () => {
    const property = fc.property(timings, (generated) => {
      const timing = { ...generated };
      if (timing.nextPose === startPose(start)) timing.nextPose = startPose(start) === 'sleep' ? 'idle' : 'sleep';
      const layer = start.startsWith('layer');
      const expected = stillFrame(startPose(start), timing.settings, layer);
      const queued = stillFrame(timing.nextPose, timing.settings, false);
      const control = trace(start, kind, timing, 'control');
      const foreign = trace(start, kind, timing, 'foreign');
      const changed = layer ? null : trace(start, kind, timing, 'pose');
      const problems: string[] = [];
      const check = (label: string, actual: Drawn, wanted: Drawn) => {
        const wrong = differences(actual, wanted);
        if (wrong.length) problems.push(`${label}: ${wrong.join('; ')}`);
      };
      for (const [name, result] of [['control', control], ['foreign', foreign], ['pose', changed]] as const) {
        if (!result) continue;
        if (!result.released) {
          problems.push(`${name}: no release at 0.6 s`);
          continue;
        }
        if (result.released.frame !== Math.round(0.6 * FPS)) problems.push(`${name}: release at frame ${result.released.frame}, expected 36`);
        check(`(a) ${name} at release`, result.released.drawn, expected);
      }
      // Continuity is measured without a queued pose's deliberate change after
      // release. The pose track separately proves that change waits for release.
      for (const [name, result] of [['control', control], ['foreign', foreign]] as const) {
        if (!result.released) continue;
        const next = result.samples[result.released.frame];
        if (!next) problems.push(`(b) ${name} missing frame after release`);
        else check(`(b) ${name} frame after release`, next, result.released.drawn);
      }
      check('(c) react call preserves the snapshot', control.immediate[0] ?? {}, control.before);
      for (let i = 0; i < 36; i++) {
        const base = control.samples[i] ?? {};
        check(`(c) foreign frame ${i + 1}`, foreign.samples[i] ?? {}, base);
        check(`(c) synchronous writer ${i}`, foreign.immediate[i + 1] ?? {}, i ? control.samples[i - 1] ?? {} : control.before);
        if (changed && i < 35) check(`(d) queued pose frame ${i + 1}`, changed.samples[i] ?? {}, base);
      }
      // Natural layer breathing is also a foreign writer: even the unperturbed
      // drawing must be the packet's cubic ease-out of the snapshot vector.
      for (let i = 0; i < 35; i++) {
        const q = 1 - (1 - (i + 1) / 36) ** 3;
        const blend: Drawn = {};
        for (const [key, to] of Object.entries(expected)) {
          const from = control.before[key] ?? to;
          const value = from + (to - from) * q;
          // Match apply()'s drawing precision before enforcing the 0.5% bound.
          const digits = key === 'head.angle' ? 4 : key.endsWith('.sx') || key.endsWith('.sy') ? 3 :
            key.startsWith('perch.') || key.startsWith('carry.') ? 1 :
              key.endsWith('.angle') || key.startsWith('iris.') || key === 'opacity' ? 2 : null;
          blend[key] = key === 'glyph' ? from : digits === null ? value : Number(value.toFixed(digits));
        }
        check(`(c) whole drawn blend frame ${i + 1}`, control.samples[i] ?? {}, blend);
      }
      if (changed) check('(d) queued pose after release', changed.after, queued);
      expect(problems, `${kind} / ${start} ${JSON.stringify(timing)}`).toEqual([]);
    });
    // First run reaches the pass witnesses: early land, late sleep -> idle,
    // turned facing, preen at 0.6 s, chirp before the first settle frame,
    // and an active layer's breathing. A second run uses generated moments.
    const witness: Timing = { phase: 60, reactionFrames: kind === 'done' ? 60 : kind === 'offline' || kind === 'error' ? 90 : 0, poseAt: start === 'sleep' ? 33 : 6,
      chirpAt: 0, actAt: 18, gazeAt: 12, nextPose: 'idle', mindAct: 'preen', settings: false };
    fc.assert(property, { seed: SEED, numRuns: batch === 'random' ? 2 : 1,
      examples: batch === 'witness' ? [[witness]] : [], endOnFailure: true });
  });
});
