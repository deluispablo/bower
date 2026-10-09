import { createRef } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePrefs } from '@/app/prefs';
import { BowerLayer, PoseBower, type BowerController, type Pose } from './Bower';
import { BirdEngine, type ActName, type EngineOptions } from './engine';
import { activeHandle } from './presence';
import { ACT_REFERENCE, FPS, actProblems, fakeFrames, readRig, type PartKey } from './pose-reference.fixture';

const realMatchMedia = window.matchMedia;
afterEach(() => {
  cleanup();
  usePrefs.setState({ birdMoves: true });
  window.matchMedia = realMatchMedia;
  Reflect.deleteProperty(document, 'hidden');
  vi.restoreAllMocks();
});

const birds = (root: HTMLElement): HTMLElement[] => [...root.querySelectorAll<HTMLElement>('[data-bird]')];

it("a minor bird never takes the turn from the page's Bower", () => {
  const frames = fakeFrames();
  const { container } = render(
    <>
      <PoseBower pose="idle" size={78} engineOptions={frames.options} />
      <PoseBower pose="read" size={34} minor engineOptions={frames.options} />
    </>,
  );
  const [page, chip] = birds(container);
  expect(chip).toHaveClass('still');
  expect(page).not.toHaveClass('still');
});

it('with Bower moves off or reduced motion, the bird with the turn shows its still frame and mounts no engine', () => {
  const off = fakeFrames();
  usePrefs.setState({ birdMoves: false });
  const first = render(<PoseBower pose="idle" size={78} engineOptions={off.options} />);
  expect(birds(first.container)[0]).toHaveClass('posed', 'idle', 'still');
  expect(off.asked).toBe(0);
  expect(activeHandle()).toBeNull();
  first.unmount();

  usePrefs.setState({ birdMoves: true });
  window.matchMedia = (query: string) => ({ ...realMatchMedia(query), matches: query.includes('reduce') });
  const reduced = fakeFrames();
  const second = render(<PoseBower pose="read" size={78} engineOptions={reduced.options} />);
  expect(birds(second.container)[0]).toHaveClass('posed', 'read', 'still');
  expect(reduced.asked).toBe(0);
  expect(activeHandle()).toBeNull();
});

it('a minor bird steps out of sight under an overlay bird', () => {
  const frames = fakeFrames();
  const { container } = render(
    <>
      <PoseBower pose="idle" size={78} engineOptions={frames.options} />
      <PoseBower pose="read" size={34} minor engineOptions={frames.options} />
      <PoseBower pose="sleep" size={110} priority={1} engineOptions={frames.options} />
    </>,
  );
  const [page, chip, sheet] = birds(container);
  expect(page).toHaveStyle({ visibility: 'hidden' });
  expect(chip).toHaveStyle({ visibility: 'hidden' });
  expect(sheet).not.toHaveStyle({ visibility: 'hidden' });
  expect(sheet).not.toHaveClass('still');
});

it('a perched Bower with the turn idles through the engine and stays on its perch', () => {
  const Z = 100;
  const frames = fakeFrames(3);
  const { container } = render(<PoseBower pose="idle" size={Z} engineOptions={frames.options} />);
  const bird = birds(container)[0];
  // CSS stays off the engine's bird: its transforms would beat the engine's.
  expect(bird).not.toHaveClass('posed');
  const perch = bird?.querySelector<HTMLElement>('.bird-perch') ?? null;
  expect(perch).not.toBeNull();
  const head = bird?.querySelector('.b-head');
  const seen = new Set<string>();
  let worstX = 0;
  let lowest = 0;
  let highest = 0;
  act(() => {
    for (let i = 0; i < 12 * 60; i++) {
      frames.run(1);
      const [x = NaN, y = NaN] = (perch?.style.transform.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
      // Home is the box's own (x, y) = (Z/2, 0.92·Z), so the translate is (x − Z/2, y − 0.92·Z) = (0, 0).
      worstX = Math.max(worstX, Math.abs(x - (Z / 2 - Z / 2)));
      lowest = Math.max(lowest, y - (0.92 * Z - 0.92 * Z));
      highest = Math.min(highest, y);
      seen.add(head?.getAttribute('transform') ?? '');
    }
  });
  expect(perch?.style.transform).not.toBe('');
  expect(worstX).toBeLessThanOrEqual(1);
  // Within the hop and bob: never below the perch, never more than a hop (9 px) above it.
  expect(lowest).toBeLessThanOrEqual(1);
  expect(highest).toBeGreaterThanOrEqual(-9);
  // It idles: the head moves (two snaps per 6 s loop).
  expect(seen.size).toBeGreaterThan(10);
});

// ---------- d-v2-07: Bower is alive on every screen ----------

const Z = 100;
const nums = (s: string | null | undefined): number[] => (s ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];

/** PoseBower alone, with the turn: fake frames, a seeded random source, the mind's acts on unless asked. */
function perched(pose: Pose, options: EngineOptions = {}, extra?: React.ReactNode) {
  const frames = fakeFrames(5);
  const view = render(
    <>
      {extra}
      <PoseBower pose={pose} size={Z} engineOptions={{ ...frames.options, ...options }} />
    </>,
  );
  const box = view.container.querySelector<HTMLElement>('[data-bird]');
  const perch = box?.querySelector<HTMLElement>('.bird-perch');
  if (!box || !perch) throw new Error('no bird');
  const read = readRig(perch, (name) => box.querySelector(`.b-${name}`), Z);
  const run = (seconds: number, each?: (r: Record<PartKey, number>) => void): void =>
    act(() => {
      for (let i = 0; i < Math.round(seconds * FPS); i++) {
        frames.run(1);
        each?.(read());
      }
    });
  /** The perch's own transform: translate(x, y) scaleX(face). */
  const placed = (): { y: number; face: number } => {
    const [, y = 0, face = 1] = nums(perch.style.transform);
    return { y, face };
  };
  const handle = (): BirdEngine => {
    const h = activeHandle();
    if (!h) throw new Error('no engine');
    return h;
  };
  return { view, box, perch, frames, read, run, placed, handle };
}

const pointer = (type: string, x: number, y: number, target: EventTarget = document): void => {
  act(() => {
    target.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true }));
  });
};

/** Every transform the bird's elements carry, as one string. */
const transforms = (root: HTMLElement): string =>
  [root, ...root.querySelectorAll<Element>('*')].map((el) => `${el.getAttribute('transform') ?? ''}|${el instanceof HTMLElement ? el.style.transform : ''}`).join(';');

it('the perched Bower follows the pointer', () => {
  const b = perched('idle', { acts: false });
  b.run(1);
  // The eye is at (70, 34) of the 100 px box; the box sits at the page's origin in jsdom.
  pointer('pointermove', -200, 34);
  b.run(0.2);
  const left = b.read().iris;
  pointer('pointermove', 400, 34);
  b.run(0.2);
  const right = b.read().iris;
  expect(left).toBeLessThan(0);
  expect(right).toBeGreaterThan(0);
});

it('a focused control turns the gaze', () => {
  const b = perched('idle', { acts: false }, <button type="button">Tidy up</button>);
  const button = b.view.getByRole('button', { name: 'Tidy up' });
  const rect = (left: number, top: number, size: number): DOMRect =>
    ({ left, top, width: size, height: size, right: left + size, bottom: top + size, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
  vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(rect(280, 280, 40));
  vi.spyOn(b.box, 'getBoundingClientRect').mockReturnValue(rect(0, 0, Z));
  b.run(1);
  const before = nums(b.box.querySelector('.b-iris')?.getAttribute('transform'))[1] ?? 0;
  act(() => button.focus());
  fireEvent.focusIn(button);
  b.run(0.3);
  // Below and in front of Bower: the iris drops toward it.
  const toward = nums(b.box.querySelector('.b-iris')?.getAttribute('transform'))[1] ?? 0;
  expect(before).toBeCloseTo(0, 1);
  expect(toward).toBeGreaterThan(0.8);
  // Focus stays there, so the gaze does too, past the 2.5 s of a pointer.
  b.run(5);
  expect(nums(b.box.querySelector('.b-iris')?.getAttribute('transform'))[1] ?? 0).toBeGreaterThan(0.8);
});

it('after 60 s with no input the bird sleeps, and input wakes it with a startle', () => {
  const b = perched('idle');
  const eyes: number[] = [];
  b.run(58);
  b.run(1, (r) => eyes.push(r.eye));
  expect(Math.max(...eyes)).toBeGreaterThan(0.5);
  b.run(2.5);
  const asleep: number[] = [];
  b.run(1, (r) => asleep.push(r.eye));
  expect(Math.max(...asleep)).toBeCloseTo(0.08, 2);
  expect(b.read().head).toBeGreaterThan(15);

  pointer('pointermove', 400, 34);
  const woke: Array<Record<PartKey, number>> = [];
  b.run(0.6, (r) => woke.push(r));
  expect(Math.max(...woke.map((r) => r.eye))).toBeGreaterThan(0.9);
  expect(Math.max(...woke.map((r) => r.tuft))).toBeGreaterThan(16);
  b.run(1.5);
  expect(Math.abs(b.read().tuft)).toBeLessThan(3);
});

it('a tap starts within 0.1 s and cuts the running act', () => {
  const b = perched('idle', { acts: false });
  b.run(0.5);
  act(() => b.handle().act('preen'));
  b.run(0.2);
  expect(b.read().head).toBeGreaterThan(30);
  pointer('pointerdown', 50, 50, b.box);
  let hop = 0;
  b.run(0.1, () => (hop = Math.min(hop, b.placed().y)));
  expect(hop).toBeLessThan(-1);
  // The preen holds the head at 38–42 until 0.75 s; cut, the head springs back.
  b.run(0.3);
  expect(b.read().head).toBeLessThan(25);
});

it('each idle act stays within its range', () => {
  const problems: string[] = [];
  for (const name of Object.keys(ACT_REFERENCE) as ActName[]) {
    const b = perched(ACT_REFERENCE[name].pose, { acts: false });
    b.run(1);
    const rest = b.read();
    act(() => b.handle().act(name));
    const seen: Array<Record<PartKey, number>> = [];
    b.run(1.5, (r) => seen.push(r));
    problems.push(...actProblems(name, seen, rest));
    b.view.unmount();
  }
  expect(problems).toEqual([]);
});

it('with reduced motion or moves off no transform changes over 5 s', () => {
  usePrefs.setState({ birdMoves: false });
  const off = perched('idle');
  const first = transforms(off.box);
  pointer('pointermove', 400, 34);
  off.run(5);
  expect(transforms(off.box)).toBe(first);
  off.view.unmount();

  usePrefs.setState({ birdMoves: true });
  window.matchMedia = (query: string) => ({ ...realMatchMedia(query), matches: query.includes('reduce') });
  const reduced = perched('wait');
  const still = transforms(reduced.box);
  pointer('pointermove', 400, 34);
  reduced.run(5);
  expect(transforms(reduced.box)).toBe(still);
});

it('flipping reduced motion mid-render stops the engine', () => {
  let reduce = false;
  const heard = new Set<() => void>();
  window.matchMedia = (query: string) =>
    ({
      ...realMatchMedia(query),
      get matches() {
        return query.includes('reduce') && reduce;
      },
      addEventListener: (_type: string, cb: () => void) => heard.add(cb),
      removeEventListener: (_type: string, cb: () => void) => heard.delete(cb),
    }) as unknown as MediaQueryList;
  const b = perched('idle');
  b.run(1);
  expect(b.box).not.toHaveClass('still');
  expect(activeHandle()).not.toBeNull();
  act(() => {
    reduce = true;
    heard.forEach((cb) => cb());
  });
  expect(b.box).toHaveClass('still');
  expect(activeHandle()).toBeNull();
  const asked = b.frames.asked;
  b.run(2);
  expect(b.frames.asked).toBe(asked);
});

it('a hidden tab pauses the clock and resumes with no startle', () => {
  let hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  const b = perched('idle', { acts: false });
  b.run(30);
  act(() => {
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  b.run(60);
  act(() => {
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const back: Array<Record<PartKey, number>> = [];
  b.run(2, (r) => back.push(r));
  expect(Math.max(...back.map((r) => Math.abs(r.tuft)))).toBeLessThan(3);
  // 30 s before and 27 s after: not 60 s of engine time, so still awake.
  b.run(27);
  const eyes: number[] = [];
  b.run(1, (r) => eyes.push(r.eye));
  expect(Math.max(...eyes)).toBeGreaterThan(0.5);
});

it('a layer bird never sleeps', () => {
  const frames = fakeFrames(5);
  const { container } = render(
    <div style={{ position: 'relative' }}>
      <BowerLayer home={() => ({ x: 50, y: 80 })} engineOptions={frames.options} />
    </div>,
  );
  const eye = container.querySelector('.b-eye');
  const eyes: number[] = [];
  act(() => {
    for (let i = 0; i < 75 * FPS; i++) {
      frames.run(1);
      if (i > 65 * FPS) eyes.push(nums(eye?.getAttribute('transform'))[3] ?? 1);
    }
  });
  expect(Math.max(...eyes)).toBeGreaterThan(0.9);
});

it('a layer bird in flight keeps only the latest tap and plays it on landing', () => {
  const chirps = vi.spyOn(BirdEngine.prototype, 'chirp');
  const frames = fakeFrames(5);
  const ref = createRef<BowerController>();
  const { getByRole } = render(
    <div style={{ position: 'relative' }}>
      <BowerLayer ref={ref} home={() => ({ x: 50, y: 80 })} engineOptions={{ ...frames.options, acts: false }} />
    </div>,
  );
  const run = (seconds: number): void => act(() => frames.run(Math.round(seconds * FPS)));
  run(0.5);
  act(() => void ref.current?.flyTo(() => ({ x: 50, y: 80, perch: true })));
  run(0.2);
  const flyer = getByRole('button', { name: 'Bower', hidden: true });
  for (let i = 0; i < 3; i++) fireEvent.click(flyer);
  run(0.3);
  expect(chirps).not.toHaveBeenCalled();
  run(2);
  expect(chirps).toHaveBeenCalledTimes(1);
});

it('a bird in the sleep pose ignores input and taps', () => {
  const b = perched('sleep');
  b.run(2);
  const seen: Array<Record<PartKey, number>> = [];
  const ys: number[] = [];
  pointer('pointermove', -200, 300);
  pointer('pointerdown', 50, 50, b.box);
  b.run(1, (r) => {
    seen.push(r);
    ys.push(b.placed().y);
  });
  expect(Math.max(...seen.map((r) => r.eye))).toBeCloseTo(0.08, 2);
  expect(Math.max(...seen.map((r) => r.tuft))).toBeLessThan(-20);
  expect(Math.max(...seen.map((r) => Math.abs(r.iris - (seen[0]?.iris ?? 0))))).toBeLessThan(0.05);
  expect(Math.min(...ys)).toBeGreaterThan(-1);
  expect(b.placed().face).toBeGreaterThan(0);
});

it('the pointer behind the bird for 0.5 s turns it with a hop', () => {
  const b = perched('idle', { acts: false });
  b.run(1);
  pointer('pointermove', -200, 34);
  b.run(0.4);
  expect(b.placed().face).toBeGreaterThan(0);
  let hop = 0;
  b.run(0.4, () => (hop = Math.min(hop, b.placed().y)));
  expect(b.placed().face).toBeLessThan(0);
  expect(hop).toBeLessThan(-1);
});

it('the run chip bird keeps its still frame', () => {
  const frames = fakeFrames(5);
  const { container } = render(
    <>
      <PoseBower pose="idle" size={78} engineOptions={frames.options} />
      <PoseBower pose="read" size={34} minor engineOptions={frames.options} />
    </>,
  );
  const chip = birds(container)[1];
  if (!chip) throw new Error('no chip');
  const first = transforms(chip);
  act(() => frames.run(6 * FPS));
  expect(chip).toHaveClass('still');
  expect(transforms(chip)).toBe(first);
  expect(chip.querySelector('.b-eye')?.getAttribute('transform')).toBeNull();
});

it('Bower is aria-hidden and out of the tab order', () => {
  const b = perched('idle');
  expect(b.box).toHaveAttribute('aria-hidden', 'true');
  expect(b.box).not.toHaveAttribute('tabindex');
  expect(b.box.querySelectorAll('a, button, input, [tabindex]')).toHaveLength(0);
});
