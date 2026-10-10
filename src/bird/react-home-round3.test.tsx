import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePrefs } from '@/app/prefs';
import { DataProvider } from '@/data/provider';
import { DemoWorld } from '@/data/demo/world';
import { Home } from '@/features/home/Home';
import { activeHandle } from './presence';
import { FPS, fakeFrames } from './pose-reference.fixture';

let world: DemoWorld | undefined;
afterEach(() => {
  cleanup();
  world?.dispose();
  usePrefs.setState({ birdMoves: true });
  vi.restoreAllMocks();
});

async function home() {
  const frames = fakeFrames(11);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(frames.options.frame);
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(frames.options.cancelFrame);
  vi.spyOn(Math, 'random').mockImplementation(frames.options.random);
  world = new DemoWorld({ scenario: 'default', scale: 'instant', now: Date.UTC(2026, 9, 10, 12) });
  const sources = world.sources();
  const view = render(<StrictMode><MemoryRouter><DataProvider sources={sources}><Home /></DataProvider></MemoryRouter></StrictMode>);
  await act(async () => {});
  const bird = view.container.querySelector<HTMLElement>('[data-bird]:not(.posed)');
  const perch = bird?.querySelector<HTMLElement>('.bird-perch');
  const head = bird?.querySelector('.b-head');
  if (!bird || !perch || !head) throw new Error('Missing Home Bower.');
  expect(bird.dataset.pose).toBe('idle');
  const run = (count: number) => act(() => frames.run(count));
  run(FPS);
  return { ...view, bird, perch, head, run };
}

it("a real tap on loaded Home goes through react('tap') and hops within six frames", async () => {
  const b = await home();
  const engine = activeHandle();
  if (!engine) throw new Error('Missing Home engine.');
  const play = vi.spyOn(engine, 'play');
  fireEvent.pointerDown(b.bird, { clientX: 50, clientY: 50 });
  expect(play).toHaveBeenCalledWith('tap', undefined);
  let lowest = 0;
  for (let i = 0; i < 6; i++) {
    b.run(1);
    lowest = Math.min(lowest, Number(b.perch.style.transform.match(/translate\([^,]+,(-?[\d.]+)px/)?.[1] ?? 0));
  }
  expect(lowest).toBeLessThan(-1);
});

it('the loaded Home engine changes its head within eight seconds and keeps the CSS pose off', async () => {
  const b = await home();
  const first = b.head.getAttribute('transform');
  let changed = false;
  for (let i = 0; i < 8 * FPS; i++) {
    b.run(1);
    changed ||= b.head.getAttribute('transform') !== first;
  }
  expect(changed).toBe(true);
  expect(b.bird).not.toHaveClass('posed');
});

it('the Home head poll changes within eight seconds when the weighted draw keeps selecting pause', async () => {
  const b = await home();
  // A legal draw near the top of the weighted table selects pause, which does not move the head.
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  const first = b.head.getAttribute('transform');
  let changed = false;
  for (let i = 0; i < 8 * FPS; i++) {
    b.run(1);
    changed ||= b.head.getAttribute('transform') !== first;
  }
  expect(b.bird).not.toHaveClass('posed');
  expect(changed, "the unchanged e2e's eight-second head poll").toBe(true);
});
