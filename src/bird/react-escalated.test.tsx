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

function mount(pose: Pose) {
  const frames = fakeFrames(11);
  const options = { ...frames.options, acts: false };
  const drawing = (p: Pose) => <PoseBower pose={p} size={78} engineOptions={options} />;
  const view = render(drawing(pose));
  const box = view.container.querySelector<HTMLElement>('[data-bird]');
  const perch = box?.querySelector<HTMLElement>('.bird-perch');
  if (!box || !perch) throw new Error('Missing Bower.');
  const read = readRig(perch, (part) => box.querySelector(`.b-${part}`), 78);
  const history: ReturnType<typeof read>[] = [];
  const run = (count: number) => {
    const values: ReturnType<typeof read>[] = [];
    act(() => {
      for (let i = 0; i < count; i++) { frames.run(1); values.push(read()); history.push(values.at(-1) ?? read()); }
    });
    return values;
  };
  run(FPS);
  const engine = activeHandle();
  if (!engine) throw new Error('Missing engine.');
  return { ...view, box, engine, read, run, history, pose: (p: Pose) => view.rerender(drawing(p)) };
}

it('a pose change during the moves-off settle reaches the new still frame before release (sleep to idle at 0.55 s)', () => {
  const b = mount('sleep');
  expect(b.read().head, 'positive control: the sleep pose holds its head down').toBeGreaterThan(18);
  const release = b.engine.release.bind(b.engine);
  let ending: ReturnType<typeof b.read> | undefined;
  let previous: ReturnType<typeof b.read> | undefined;
  vi.spyOn(b.engine, 'release').mockImplementation(() => { ending = b.read(); previous = b.history.at(-1); release(); });
  act(() => usePrefs.setState({ birdMoves: false }));
  b.run(Math.round(0.55 * FPS));
  expect(ending, 'positive control: the settle is still running at 0.55 s').toBeUndefined();
  act(() => b.pose('idle'));
  b.run(2 * FPS);
  expect(ending, 'release after the settle').toBeDefined();
  if (!ending || !previous) throw new Error('Missing release frame.');
  expect(Math.abs(ending.head), "drawn head at release is idle's still frame (0 deg, within 2 deg)").toBeLessThanOrEqual(2);
  expect(Math.abs(ending.head - previous.head), 'the head has stopped (speed near 0) at release').toBeLessThanOrEqual(1.5);
  const after = b.read();
  expect(Math.abs(after.head - ending.head), 'release does not jump the head').toBeLessThanOrEqual(0.1);
  expect(activeHandle()).toBeNull();
  expect(b.box).toHaveClass('posed', 'idle', 'still');
});

it("a mind chirp cannot disturb the tuft that done's display owns", () => {
  const b = mount('idle');
  act(() => { react('done'); });
  b.run(FPS);
  const held = b.read().tuft;
  expect(Math.abs(held - 16), 'positive control: done holds the tuft at 16 deg one second in').toBeLessThanOrEqual(2);
  act(() => b.engine.chirp(0.3));
  const values = b.run(12);
  expect(Math.min(...values.map((v) => v.tuft)), 'tuft stays within 16 +- 2 deg').toBeGreaterThanOrEqual(14);
  expect(Math.max(...values.map((v) => v.tuft))).toBeLessThanOrEqual(18);
});
