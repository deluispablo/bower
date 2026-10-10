import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePrefs } from '@/app/prefs';
import { PoseBower, type Pose } from './Bower';
import { activeHandle } from './presence';
import { REACTIONS, react, type ReactionKind } from './react';
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

it('a pose change during the moves-off settle waits until release (sleep to idle at 0.55 s)', () => {
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
  expect(Math.abs(b.read().head - 20), 'queuing idle does not change the drawn sleep head').toBeLessThanOrEqual(20 * 0.005);
  b.run(2);
  expect(ending, 'the queued pose does not release the settle early').toBeUndefined();
  expect(Math.abs(b.read().head - 20), 'sleep stays drawn until the blend ends').toBeLessThanOrEqual(20 * 0.005);
  b.run(1);
  expect(ending, 'release after the settle').toBeDefined();
  if (!ending || !previous) throw new Error('Missing release frame.');
  expect(Math.abs(ending.head - 20), "drawn head at release is the snapshot pose's sleep still frame").toBeLessThanOrEqual(20 * 0.005);
  expect(Math.abs(ending.head - previous.head), 'the head has stopped (speed near 0) at release').toBeLessThanOrEqual(1.5);
  expect(Math.abs(ending.head - previous.head), 'the blend does not jump the head into its release frame').toBeLessThanOrEqual(0.1);
  const after = b.read();
  // The queued pose deliberately changes the CSS frame after release; it never retargets the blend.
  expect(Math.abs(after.head), 'the queued idle pose applies after release').toBeLessThanOrEqual(0.005);
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

it('the moves-off settle from the land pose reaches full opacity before release (moves off 0.05 s in)', () => {
  const frames = fakeFrames(11);
  const options = { ...frames.options, acts: false };
  const view = render(<PoseBower pose="land" size={78} engineOptions={options} />);
  const perch = view.container.querySelector<HTMLElement>('.bird-perch');
  if (!perch) throw new Error('Missing Bower.');
  act(() => frames.run(Math.round(0.05 * FPS)));
  const engine = activeHandle();
  if (!engine) throw new Error('Missing engine.');
  const start = Number(perch.style.opacity);
  expect(start, 'positive control: land is still fading in 0.05 s in').toBeLessThan(0.5);
  const release = engine.release.bind(engine);
  let atRelease: number | undefined;
  vi.spyOn(engine, 'release').mockImplementation(() => { atRelease = Number(perch.style.opacity || 'NaN'); release(); });
  act(() => usePrefs.setState({ birdMoves: false }));
  act(() => frames.run(2 * FPS));
  expect(atRelease, 'release after the settle').toBeDefined();
  expect(atRelease, 'drawn opacity at release is the still frame (1)').toBeGreaterThanOrEqual(0.99);
});

it('a chirp right after react(), before its first frame, cannot disturb the tuft the reaction owns', () => {
  const b = mount('idle');
  expect(Math.abs(b.read().tuft), 'positive control: idle holds the tuft at 0').toBeLessThanOrEqual(0.5);
  act(() => { react('done'); b.engine.chirp(0.3); });
  const values = b.run(FPS);
  expect(Math.min(...values.map((v) => v.tuft)), "done's tuft eases in from 0 with no dip past -2 deg").toBeGreaterThanOrEqual(-2);
  expect(Math.abs((values.at(-1)?.tuft ?? 0) - 16), 'positive control: done reaches 16 +- 2 deg').toBeLessThanOrEqual(2);
});

it('no reaction moves focus: a focused field keeps it through every kind', () => {
  const b = mount('idle');
  const field = document.createElement('input');
  field.setAttribute('aria-label', 'Name');
  document.body.append(field);
  field.focus();
  const before = b.read().head;
  for (const kind of Object.keys(REACTIONS) as ReactionKind[]) {
    if (kind === 'moves-off') continue;
    act(() => { react(kind, field).end(); });
    b.run(3);
    expect(document.activeElement, `${kind} leaves focus on the field`).toBe(field);
  }
  expect(b.history.some((v) => v.head !== before), 'positive control: the reactions moved the rig').toBe(true);
  field.remove();
});
