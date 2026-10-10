import { createRef } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePrefs } from '@/app/prefs';
import { BowerLayer, PoseBower, type BowerController, type Pose } from './Bower';
import { activeHandle } from './presence';
import { react } from './react';
import { FPS, fakeFrames, readRig } from './pose-reference.fixture';

const originalPath = window.location.pathname;
afterEach(() => {
  cleanup();
  usePrefs.setState({ birdMoves: true });
  window.history.replaceState(null, '', originalPath);
  vi.restoreAllMocks();
});

function mount(pose: Pose | null = 'idle') {
  const frames = fakeFrames(11);
  const controller = createRef<BowerController>();
  const view = render(pose ? <PoseBower pose={pose} size={100} engineOptions={{ ...frames.options, acts: false }} /> :
    <BowerLayer ref={controller} size={100} home={() => ({ x: 50, y: 92 })}
      engineOptions={{ ...frames.options, acts: false }} />);
  const box = view.container.querySelector<HTMLElement>('[data-bird]');
  const bird = box?.querySelector<HTMLElement>(pose ? '.bird-perch' : '.bower-flyer');
  if (!box || !bird) throw new Error('Missing Bower.');
  const read = readRig(bird, (part) => box.querySelector(`.b-${part}`));
  const run = (seconds: number) => {
    const values: ReturnType<typeof read>[] = [];
    act(() => { for (let i = 0; i < Math.round(seconds * FPS); i++) { frames.run(1); values.push(read()); } });
    return values;
  };
  run(1);
  return { ...view, box, bird, read, run, controller };
}

it('Settings draws the closing settle, then holds its CSS head and eyes until moves return', () => {
  window.history.replaceState(null, '', '/settings');
  const b = mount();
  act(() => usePrefs.setState({ birdMoves: false }));
  expect(activeHandle()).not.toBeNull();
  const engine = activeHandle();
  if (!engine) throw new Error('Missing engine.');
  const release = engine.release.bind(engine);
  let ending: ReturnType<typeof b.read> | undefined;
  vi.spyOn(engine, 'release').mockImplementation(() => { ending = b.read(); release(); });
  b.run(0.3);
  expect(b.read().head).toBeGreaterThan(4);
  expect(b.read().eye).toBeGreaterThan(0.08);
  expect(b.read().eye).toBeLessThan(0.5);
  b.run(0.3);
  expect(ending, 'release after the closing settle').toBeDefined();
  if (!ending) throw new Error('Missing release frame.');
  expect(Math.abs(ending.head - 8)).toBeLessThanOrEqual(8 * 0.005);
  expect(Math.abs(ending.eye - 0.08)).toBeLessThanOrEqual(0.005);
  expect(activeHandle()).toBeNull();
  const head = Number(b.box.querySelector<SVGGElement>('.b-head')?.style.transform.match(/^rotate\((.+)deg\)$/)?.[1]);
  const eye = Number(b.box.querySelector<SVGGElement>('.b-eye')?.style.transform.match(/^scaleY\((.+)\)$/)?.[1]);
  // Addendum 7's per-value bound uses a unit floor, as the blend property does.
  expect(Math.abs(head - 8)).toBeLessThanOrEqual(8 * 0.005);
  expect(Math.abs(eye - 0.08)).toBeLessThanOrEqual(0.005);
  const before = b.bird.outerHTML;
  b.run(2);
  expect(b.bird.outerHTML).toBe(before);
  act(() => usePrefs.setState({ birdMoves: true }));
  expect(b.box.querySelector<SVGGElement>('.b-head')?.style.transform).toBe('');
  expect(Math.max(...b.run(1.7).map((v) => v.tuft))).toBeGreaterThanOrEqual(16);
});

it('a mounted sleep pose settles on the setting change with eyes open and releases after 0.6 s', () => {
  const b = mount('sleep');
  act(() => usePrefs.setState({ birdMoves: false }));
  expect(activeHandle()).not.toBeNull();
  b.run(0.3);
  expect(b.box).not.toHaveClass('still');
  expect(b.read().eye).toBeGreaterThan(0.5);
  b.run(0.4);
  expect(activeHandle()).toBeNull();
  expect(b.box).toHaveClass('posed', 'sleep', 'still');
  expect(b.box.querySelector<SVGGElement>('.b-eye')?.style.transform).toBe('scaleY(1)');
  act(() => usePrefs.setState({ birdMoves: true }));
  const waking = b.run(1.7);
  expect(Math.min(...waking.map((v) => v.head))).toBeLessThanOrEqual(-8);
  expect(Math.max(...waking.map((v) => v.tuft))).toBeGreaterThanOrEqual(16);
});

it('enabling moves from an initially still mount creates the engine and wakes and shakes', () => {
  usePrefs.setState({ birdMoves: false });
  const b = mount();
  expect(activeHandle()).toBeNull();
  act(() => usePrefs.setState({ birdMoves: true }));
  expect(activeHandle()).not.toBeNull();
  const samples = b.run(1.7);
  expect(Math.min(...samples.map((v) => v.head))).toBeLessThanOrEqual(-8);
  expect(Math.max(...samples.map((v) => v.tuft))).toBeGreaterThanOrEqual(16);
  expect(Math.min(...samples.map((v) => v.pitch))).toBeLessThanOrEqual(-2);
  expect(Math.max(...samples.map((v) => v.pitch))).toBeGreaterThanOrEqual(2);
});

it('a layer settles during flight and retains the same engine for moves-on', () => {
  const b = mount(null);
  const engine = activeHandle();
  act(() => { b.controller.current?.flyTo(() => ({ x: 250, y: 40, perch: true })); });
  b.run(0.2);
  act(() => usePrefs.setState({ birdMoves: false }));
  expect(activeHandle()).toBe(engine);
  b.run(0.7);
  expect(activeHandle()).toBeNull();
  expect(b.bird).toHaveClass('still');
  act(() => usePrefs.setState({ birdMoves: true }));
  expect(activeHandle()).toBe(engine);
  expect(Math.max(...b.run(1.7).map((v) => v.tuft))).toBeGreaterThanOrEqual(16);
});

it('a sustained reaction that ends before landing is not replayed from the pending slot', () => {
  const b = mount(null);
  act(() => { b.controller.current?.flyTo(() => ({ x: 50, y: 92, perch: true })); });
  b.run(0.1);
  act(() => react('drag-over').end());
  const samples = b.run(3);
  expect(Math.max(...samples.map((v) => v.jaw))).toBeLessThan(2);
  act(() => { react('drag-over'); });
  expect(Math.max(...b.run(0.3).map((v) => v.jaw))).toBeGreaterThanOrEqual(12);
});

it('a new reaction cuts a perched layer reaction while preserving its carry chip', () => {
  const b = mount(null);
  act(() => { b.controller.current?.holding(true); });
  b.run(0.1);
  act(() => { react('drag-over'); });
  expect(b.run(0.3).at(-1)?.jaw).toBeGreaterThanOrEqual(12);
  act(() => { react('hide'); });
  expect(Math.min(...b.run(0.1).map((v) => v.wing))).toBeLessThan(-2);
  b.run(0.2);
  expect(b.read().jaw).toBeLessThan(2);
  expect(b.box.querySelector<HTMLElement>('.bower-carry')?.style.opacity).toBe('1');
});
