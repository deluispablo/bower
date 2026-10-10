import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePrefs } from '@/app/prefs';
import { PoseBower, type Pose } from './Bower';
import { activeHandle } from './presence';
import { react } from './react';
import { FPS, fakeFrames, readRig } from './pose-reference.fixture';

afterEach(() => {
  cleanup();
  usePrefs.setState({ birdMoves: true });
  vi.restoreAllMocks();
});

function mount(pose: Pose = 'idle') {
  const frames = fakeFrames(11);
  const view = render(<PoseBower pose={pose} size={100} engineOptions={{ ...frames.options, acts: false }} />);
  const box = view.container.querySelector<HTMLElement>('[data-bird]');
  const bird = box?.querySelector<HTMLElement>('.bird-perch');
  if (!box || !bird) throw new Error('Missing Bower.');
  const read = readRig(bird, (part) => box.querySelector(`.b-${part}`));
  const snapshot = () => ({ ...read(), face: Number(bird.style.transform.match(/scaleX\(([^)]+)\)/)?.[1] ?? 1) });
  const run = (seconds: number) => {
    const values: ReturnType<typeof snapshot>[] = [];
    act(() => {
      for (let i = 0; i < Math.round(seconds * FPS); i++) { frames.run(1); values.push(snapshot()); }
    });
    return values;
  };
  run(1);
  const engine = activeHandle();
  if (!engine) throw new Error('Missing engine.');
  return { ...view, box, bird, engine, snapshot, run };
}

it('during moves-off gaze moves only the iris and the settle ends at the still frame', () => {
  // Motion-on positive control: this focus really is behind Bower and causes a turn and hop.
  const control = mount();
  act(() => control.engine.look({ x: -200, y: -100 }, 'focus'));
  const turning = control.run(0.6);
  expect(Math.min(...turning.map((v) => v.dy))).toBeLessThan(-7);
  expect(Math.min(...turning.map((v) => v.face))).toBeLessThan(0.9);
  control.unmount();

  const reacting = mount();
  act(() => { reacting.engine.look({ x: -200, y: -100 }, 'focus'); react('duplicate'); });
  const looking = reacting.run(0.6);
  expect(Math.min(...looking.map((v) => v.iris))).toBeLessThan(-0.5);
  expect.soft(Math.max(...looking.map((v) => Math.abs(v.dy))), 'reaction gaze cannot hop').toBeLessThanOrEqual(0.1);
  expect.soft(Math.max(...looking.map((v) => Math.abs(v.face - 1))), 'reaction gaze cannot turn').toBeLessThanOrEqual(0.02);
  expect.soft(looking.at(-1)?.head, 'reaction owns the head').toBeCloseTo(-14, 1);
  reacting.unmount();

  const b = mount();
  const release = b.engine.release.bind(b.engine);
  let ending: ReturnType<typeof b.snapshot> | undefined;
  vi.spyOn(b.engine, 'release').mockImplementation(() => { ending = b.snapshot(); release(); });
  act(() => {
    b.engine.look({ x: -200, y: -100 }, 'focus');
    usePrefs.setState({ birdMoves: false });
  });
  expect(activeHandle()).toBe(b.engine);
  const settling = b.run(0.6);
  expect(ending, 'release follows the 0.6 s engine settle').toBeDefined();
  if (!ending) throw new Error('Missing final settle frame.');
  expect.soft(Math.abs(ending.dy), 'no hop at release (probe: 8.3 px)').toBeLessThanOrEqual(0.1);
  expect.soft(ending.face, 'still x-scale at release (probe: 0.611)').toBeCloseTo(1, 2);
  expect.soft(Math.max(...settling.map((v) => Math.abs(v.dy))), 'no hop during settle').toBeLessThanOrEqual(0.1);
  expect.soft(Math.max(...settling.map((v) => Math.abs(v.face - 1))), 'no turn during settle').toBeLessThanOrEqual(0.02);
  for (const part of ['head', 'pitch', 'tail', 'wing', 'jaw', 'tuft'] as const) {
    expect(Math.abs(ending[part]), `${part} settled before release`).toBeLessThanOrEqual(2);
  }
  for (const part of ['squash', 'stretch', 'wingScale', 'legs', 'eye'] as const) {
    expect(Math.abs(ending[part] - 1), `${part} settled before release`).toBeLessThanOrEqual(0.02);
  }
  expect(activeHandle()).toBeNull();
  expect(b.box).toHaveClass('posed', 'idle', 'still');
  expect(b.bird.style.transform).toBe('');
});

it('offline and error ease from the startle into the alarm pose with no one-frame jump', () => {
  for (const { pose, kind } of [
    { pose: 'idle', kind: 'offline' },
    { pose: 'sleep', kind: 'error' },
    { pose: 'sleep', kind: 'offline' },
  ] as const) {
    const b = mount(pose);
    let reaction: ReturnType<typeof react> | undefined;
    act(() => { reaction = react(kind); });
    const samples = b.run(2.2);
    const context = `${pose} ${kind}`;
    expect(Math.min(...samples.slice(0, FPS / 2).map((v) => v.head)), `${context} startle`).toBeLessThanOrEqual(-8);
    expect(Math.max(...samples.slice(0, FPS / 2).map((v) => v.tuft)), `${context} startle tuft`).toBeGreaterThanOrEqual(16);
    const held = samples.slice(FPS / 2);
    const jumps = held.slice(1).map((v, i) => Math.abs(v.tuft - (held[i]?.tuft ?? v.tuft)));
    expect.soft(Math.max(...jumps), `${context} tuft eases; no 0 to 18 degree pin`).toBeLessThanOrEqual(2);
    expect.soft(Math.min(...held.map((v) => v.tuft)), `${context} alarm stays after startle`).toBeGreaterThanOrEqual(16);
    expect(Math.max(...held.map((v) => v.tuft)), `${context} no alarm overshoot`).toBeLessThanOrEqual(20);
    expect.soft(Math.max(...held.map((v) => v.head)), `${context} no neutral detour`).toBeLessThanOrEqual(-8);
    expect(Math.min(...held.map((v) => v.head)), `${context} no head overshoot`).toBeGreaterThanOrEqual(-12);
    act(() => reaction?.end());
    b.run(1);
    expect(b.snapshot().head).toBeCloseTo(pose === 'sleep' ? 20 : 0, 1);
    if (pose === 'sleep') expect(b.snapshot().eye).toBeCloseTo(0.08, 2);
    b.unmount();
  }
});
