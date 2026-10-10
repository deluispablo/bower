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
// A layer fills its positioned parent. Home is a point anywhere in that frame,
// not just the one point whose drawing happens to need no translation.
const LAYER_FRAME = { width: window.innerWidth, height: window.innerHeight };
const ORIGIN_HOME = { x: 50, y: 92 };
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
    // Placement may be expressed by CSS positioning after the engine releases.
    placed.x += Number.parseFloat(getComputedStyle(bird).left) || 0;
    placed.y += Number.parseFloat(getComputedStyle(bird).top) || 0;
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
  home: fc.record({
    x: fc.integer({ min: 0, max: LAYER_FRAME.width }),
    y: fc.integer({ min: 0, max: LAYER_FRAME.height }),
  }),
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
    <div style={{ position: 'relative', ...LAYER_FRAME }}>
      <BowerLayer ref={controller} size={100} home={() => timing.home} engineOptions={options} />
    </div> :
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
      if (layer) {
        expected['perch.x'] = timing.home.x - 50;
        expected['perch.y'] = timing.home.y - 92;
      }
      const queued = stillFrame(timing.nextPose, timing.settings, false);
      const control = trace(start, kind, timing, 'control');
      const foreign = trace(start, kind, timing, 'foreign');
      const changed = layer ? null : trace(start, kind, timing, 'pose');
      const origin = layer ? trace(start, kind, { ...timing, home: ORIGIN_HOME }, 'control') : null;
      const problems: string[] = [];
      const check = (label: string, actual: Drawn, wanted: Drawn) => {
        const wrong = differences(actual, wanted);
        if (wrong.length) problems.push(`${label}: ${wrong.join('; ')}`);
      };
      if (origin) {
        // Positive control: the original zero-translation home still settles
        // and survives release under exactly the same bounds.
        const originStill = { ...expected, 'perch.x': 0, 'perch.y': 0 };
        if (!origin.released) problems.push('positive control: origin did not release');
        else check('positive control: origin at release', origin.released.drawn, originStill);
        check('positive control: origin after release', origin.after, originStill);
      }
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
      chirpAt: 0, actAt: 18, gazeAt: 12, nextPose: 'idle', mindAct: 'preen', settings: false,
      home: { x: 350, y: 280 } };
    fc.assert(property, { seed: SEED, numRuns: batch === 'random' ? 2 : 1,
      examples: batch === 'witness' ? [[witness]] : [], endOnFailure: true });
  });
});

const DIRECT_TIMING: Timing = {
  phase: 60, reactionFrames: 0, poseAt: 12, chirpAt: 0, actAt: 18, gazeAt: 12,
  nextPose: 'alarm', mindAct: 'preen', settings: false, home: ORIGIN_HOME,
};

it('a layer keeps its home position across moves-off release at (350, 280)', () => {
  const origin = trace('layer', 'moves-off', DIRECT_TIMING, 'control');
  expect(origin.released, 'positive control: the origin home finishes its settle').toBeDefined();
  if (!origin.released) throw new Error('Missing origin release.');
  expect(differences(origin.after, origin.released.drawn),
    'positive control: the origin home has no release jump').toEqual([]);

  const offset = trace('layer', 'moves-off', { ...DIRECT_TIMING, home: { x: 350, y: 280 } }, 'control');
  expect(offset.released, 'the offset home finishes its settle').toBeDefined();
  if (!offset.released) throw new Error('Missing offset release.');
  expect(differences({ 'perch.x': offset.released.drawn['perch.x'] ?? NaN,
    'perch.y': offset.released.drawn['perch.y'] ?? NaN }, { 'perch.x': 300, 'perch.y': 188 }),
  'positive control: the drawn feet reach the requested home before release').toEqual([]);
  expect(differences(offset.after, offset.released.drawn),
    'release preserves the whole drawn still frame, including the home position').toEqual([]);
});

function resizedDrawing(settle: boolean, resize: boolean) {
  usePrefs.setState({ birdMoves: true });
  window.history.replaceState(null, '', '/');
  const frames = fakeFrames(11);
  const options = { ...frames.options, acts: false };
  const drawing = (size: number) => <PoseBower pose="idle" size={size} engineOptions={options} />;
  const view = render(drawing(100));
  const read = reader(view.container, false);
  const run = (n: number) => act(() => frames.run(n));
  run(61);
  if (settle) act(() => usePrefs.setState({ birdMoves: false }));
  run(18); // Midway through the 36-frame settle.
  const before = read();
  if (resize) view.rerender(drawing(200));
  const immediate = read();
  run(1);
  const next = read();
  const moving = activeHandle() !== null;
  view.unmount();
  return { before, immediate, next, moving };
}

it('a size change midway through moves-off cannot bypass the frozen drawn blend', () => {
  const live = resizedDrawing(false, true);
  expect([live.before.width, live.before.height], 'positive control: the mounted size starts at 100').toEqual([100, 100]);
  expect([live.next.width, live.next.height], 'positive control: a live component draws the new size').toEqual([200, 200]);
  const unchanged = resizedDrawing(true, false);
  const resized = resizedDrawing(true, true);
  expect(resized.moving, 'the size changes before the settle releases its engine').toBe(true);
  expect(differences(resized.immediate, unchanged.immediate), 'the size prop preserves the drawn snapshot at the call').toEqual([]);
  expect(differences(resized.next, unchanged.next),
    'every drawn value, width and height included, follows the original snapshot blend until release').toEqual([]);
});

function resumedPose(enableAt: number) {
  usePrefs.setState({ birdMoves: true });
  window.history.replaceState(null, '', '/');
  const frames = fakeFrames(11);
  const options = { ...frames.options, acts: false };
  const drawing = (pose: Pose) => <PoseBower pose={pose} size={100} engineOptions={options} />;
  const view = render(drawing('idle'));
  const read = reader(view.container, false);
  const run = (n: number) => act(() => frames.run(n));
  run(61);
  act(() => usePrefs.setState({ birdMoves: false }));
  run(12);
  const beforeQueue = read();
  view.rerender(drawing('alarm'));
  const afterQueue = read();
  run(enableAt - 12);
  const stillBeforeEnable = view.container.querySelector('[data-pose]')?.classList.contains('still');
  act(() => usePrefs.setState({ birdMoves: true }));
  const samples: Drawn[] = [];
  for (let i = 0; i < 4 * FPS; i++) { run(1); samples.push(read()); }
  const pose = view.container.querySelector('[data-pose]')?.getAttribute('data-pose');
  const animated = activeHandle() !== null && !view.container.querySelector('[data-pose]')?.classList.contains('still');
  view.unmount();
  return { beforeQueue, afterQueue, stillBeforeEnable, samples, pose, animated };
}

it('moves returning during settle draw and animate the queued alarm pose after waking and shaking', () => {
  // Packet item 6 still requires wake + shake if moves return before release.
  // Addendum 7 queues the pose only while settling: when motion returns that
  // queued pose must become the drawn, animated pose, just as after a full settle.
  const completed = resumedPose(42);
  expect(completed.stillBeforeEnable, 'positive control: the full settle released').toBe(true);
  expect(completed.samples.at(-1)?.['tuft.angle'], 'positive control: a queued alarm draws after a full settle')
    .toBeCloseTo(18, 2);
  const interrupted = resumedPose(18);
  expect(differences(interrupted.afterQueue, interrupted.beforeQueue), 'queuing alarm does not retarget the blend').toEqual([]);
  expect(interrupted.stillBeforeEnable, 'moves return before release').toBe(false);
  expect(interrupted.pose).toBe('alarm');
  expect(interrupted.animated).toBe(true);
  for (const result of [completed, interrupted]) {
    expect(Math.min(...result.samples.map((v) => v['head.angle'] ?? NaN)), 'moves-on wakes with the startle').toBeLessThanOrEqual(-8);
    expect(Math.min(...result.samples.map((v) => v['rig.angle'] ?? NaN)), 'moves-on shakes to the left').toBeLessThanOrEqual(-2);
    expect(Math.max(...result.samples.map((v) => v['rig.angle'] ?? NaN)), 'moves-on shakes to the right').toBeGreaterThanOrEqual(2);
  }
  const last = interrupted.samples.at(-1);
  expect(differences({ 'tuft.angle': last?.['tuft.angle'] ?? NaN, 'tuft.y': last?.['tuft.y'] ?? NaN },
    { 'tuft.angle': 18, 'tuft.y': -2 }), 'the queued alarm, rather than the old idle pose, stays drawn after moves return').toEqual([]);
  const lateHeads = interrupted.samples.slice(2 * FPS).map((v) => v['head.angle'] ?? NaN);
  expect(Math.min(...lateHeads), 'the resumed alarm script still lowers its head after the wake ends').toBeLessThanOrEqual(-8);
  expect(Math.max(...lateHeads), 'the resumed alarm script also returns its head').toBeGreaterThanOrEqual(-2);
});
