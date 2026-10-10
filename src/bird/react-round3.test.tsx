import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
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

function mount(strict = false) {
  const frames = fakeFrames(11);
  const options = { ...frames.options, acts: !strict ? false : true };
  const drawing = (pose: Pose) => strict ?
    <StrictMode><PoseBower pose={pose} size={78} engineOptions={options} /></StrictMode> :
    <PoseBower pose={pose} size={78} engineOptions={options} />;
  const view = render(drawing(strict ? 'sleep' : 'idle'));
  if (strict) view.rerender(drawing('idle'));
  const box = view.container.querySelector<HTMLElement>('[data-bird]');
  const perch = box?.querySelector<HTMLElement>('.bird-perch');
  if (!box || !perch) throw new Error('Missing Bower.');
  const read = readRig(perch, (part) => box.querySelector(`.b-${part}`), 78);
  const snapshot = () => ({ ...read(), face: Number(perch.style.transform.match(/scaleX\(([^)]+)\)/)?.[1] ?? 1) });
  const run = (count: number) => {
    const values: ReturnType<typeof snapshot>[] = [];
    act(() => {
      for (let i = 0; i < count; i++) { frames.run(1); values.push(snapshot()); }
    });
    return values;
  };
  run(FPS);
  const engine = activeHandle();
  if (!engine) throw new Error('Missing engine.');
  return { ...view, box, perch, engine, snapshot, run };
}

it('turns first, then moves-off reaches x-scale 1.000 ± 0.01 before release without a jump', () => {
  const b = mount();
  const control = document.createElement('button');
  b.container.append(control);
  vi.spyOn(control, 'getBoundingClientRect').mockReturnValue({ left: -220, top: -120, width: 40, height: 40 } as DOMRect);
  act(() => control.focus());
  b.run(1.5 * FPS);
  expect(b.snapshot().face, 'positive control: focus has already turned Bower').toBeLessThan(-0.99);
  const release = b.engine.release.bind(b.engine);
  let ending: ReturnType<typeof b.snapshot> | undefined;
  vi.spyOn(b.engine, 'release').mockImplementation(() => { ending = b.snapshot(); release(); });
  act(() => usePrefs.setState({ birdMoves: false }));
  const values = b.run(0.6 * FPS);
  expect(ending, 'release at the end of the 0.6 s settle').toBeDefined();
  if (!ending) throw new Error('Missing release frame.');
  expect.soft(Math.abs(ending.face - 1), 'drawn x-scale at release').toBeLessThanOrEqual(0.01);
  const after = b.snapshot();
  expect.soft(Math.abs(after.face - ending.face), 'release does not jump the facing scale').toBeLessThanOrEqual(0.01);
  for (const part of ['head', 'pitch', 'tail', 'wing', 'jaw', 'tuft', 'dx', 'dy'] as const) {
    expect(Math.abs(ending[part] - after[part]), `${part} does not jump on release`).toBeLessThanOrEqual(0.1);
  }
  expect(Math.abs((values.at(-2)?.face ?? 0) - ending.face), 'settle finishes smoothly').toBeLessThanOrEqual(0.01);
  expect(activeHandle()).toBeNull();
  expect(b.box).toHaveClass('posed', 'idle', 'still');
});

it("Home's loading sleep-to-idle mount in StrictMode sends a real tap through react('tap') and hops within six frames", () => {
  const b = mount(true);
  const play = vi.spyOn(b.engine, 'play');
  fireEvent.pointerDown(b.box, { clientX: 50, clientY: 50 });
  expect(play).toHaveBeenCalledWith('tap', undefined);
  expect(Math.min(...b.run(6).map((v) => v.dy))).toBeLessThan(-1);
});

it('a new drag-over owns the jaw through its hold and return after cutting a chirp', () => {
  const b = mount();
  act(() => { react('task-done'); });
  expect(Math.max(...b.run(3).map((v) => v.jaw)), 'positive control: the chirp opens the beak').toBeGreaterThan(1);
  let reaction: ReturnType<typeof react> | undefined;
  act(() => { reaction = react('drag-over'); });
  const hold = b.run(30).slice(12);
  expect(Math.min(...hold.map((v) => v.jaw)), 'the old chirp cannot close the owned jaw').toBeGreaterThanOrEqual(12);
  expect(Math.max(...hold.map((v) => v.jaw))).toBeLessThanOrEqual(16);
  act(() => reaction?.end());
  b.run(15);
  expect(b.snapshot().jaw).toBeLessThanOrEqual(0.1);
});

it('the mind chirp step cannot overwrite a reaction-owned jaw', () => {
  const b = mount();
  act(() => { react('drag-over'); });
  b.run(12);
  expect(b.snapshot().jaw, 'positive control: drag-over has opened the beak').toBeGreaterThanOrEqual(12);
  act(() => b.engine.chirp(0.3));
  const values = b.run(18);
  expect(Math.min(...values.map((v) => v.jaw))).toBeGreaterThanOrEqual(12);
  expect(Math.max(...values.map((v) => v.jaw))).toBeLessThanOrEqual(16);
});

it("Home's StrictMode engine changes the head within eight seconds with the CSS still pose absent", () => {
  const b = mount(true);
  expect(b.box).not.toHaveClass('posed');
  const first = b.snapshot().head;
  const values = b.run(8 * FPS);
  expect(values.some((v) => v.head !== first)).toBe(true);
  expect(b.box).not.toHaveClass('posed');
});
