import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { usePrefs } from '@/app/prefs';
import { PoseBower } from './Bower';
import { activeHandle } from './presence';
import { fakeFrames } from './pose-reference';

const realMatchMedia = window.matchMedia;
afterEach(() => {
  cleanup();
  usePrefs.setState({ birdMoves: true });
  window.matchMedia = realMatchMedia;
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
