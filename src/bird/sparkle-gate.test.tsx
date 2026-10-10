import { readFileSync } from 'node:fs';
import { createRef } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { usePrefs } from '@/app/prefs';
import { BowerLayer, type BowerController } from './Bower';
import { activeHandle } from './presence';
import { FPS, fakeFrames } from './pose-reference.fixture';

const sheet = document.createElement('style');
beforeAll(() => {
  // jsdom does not load the component's CSS import. Measure the real CSS rule
  // selected by .go; jsdom cannot advance a browser CSS animation timeline.
  sheet.textContent = readFileSync('src/bird/bower.css', 'utf8') +
    readFileSync('src/bird/poses.css', 'utf8');
  document.head.append(sheet);
});
afterAll(() => sheet.remove());
afterEach(() => {
  cleanup();
  usePrefs.setState({ birdMoves: true });
  vi.restoreAllMocks();
});

function mount(moves: boolean, initiallyReduced: boolean) {
  usePrefs.setState({ birdMoves: moves });
  let reduced = initiallyReduced;
  const media = new EventTarget();
  const matchMedia = window.matchMedia.bind(window);
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    ...matchMedia(query),
    get matches() { return query === '(prefers-reduced-motion: reduce)' && reduced; },
    addEventListener: media.addEventListener.bind(media),
    removeEventListener: media.removeEventListener.bind(media),
  }));
  const frames = fakeFrames(11);
  const controller = createRef<BowerController>();
  const view = render(<BowerLayer ref={controller} size={100} home={() => ({ x: 50, y: 92 })}
    engineOptions={{ ...frames.options, acts: false }} />);
  const spark = view.container.querySelector<HTMLElement>('.bower-spark');
  if (!spark) throw new Error('Missing sparkle.');
  const adds = vi.spyOn(spark.classList, 'add');
  const run = (count: number) => act(() => frames.run(count));
  const showOff = () => act(() => { controller.current?.showOff(); });
  const reduce = () => act(() => { reduced = true; media.dispatchEvent(new Event('change')); });
  const animations = () => Array.from(view.container.querySelectorAll<HTMLElement | SVGElement>('*'))
    .map((el) => getComputedStyle(el).animation)
    .filter((value) => value !== '' && value !== 'none');
  const drawing = () => view.container.innerHTML;
  run(1); // Prime the injected frame timestamp before measuring showOff's first burst.
  return { ...view, spark, adds, frames, run, showOff, reduce, animations, drawing };
}

for (const mode of ['moves-off', 'reduced-motion'] as const) {
  it(`showOff sparkle stops at ${mode} and stays still after release`, () => {
    // Already-disabled controls exercise the real layer controller too. Observe
    // class additions, not only the final DOM, so a transient burst cannot pass.
    const disabled = mount(mode !== 'moves-off', mode === 'reduced-motion');
    disabled.showOff();
    disabled.run(4 * FPS);
    expect(disabled.adds.mock.calls.flat(), 'disabled showOff never starts .go').not.toContain('go');
    expect(disabled.spark).not.toHaveClass('go');
    expect(disabled.animations()).toEqual([]);
    disabled.unmount();
    vi.restoreAllMocks();

    const b = mount(true, false);
    const engine = activeHandle();
    if (!engine) throw new Error('Missing live engine.');
    const release = vi.spyOn(engine, 'release');
    b.showOff();
    // Stop on the very first sparkle, within the 0.2 s showOff step + one frame.
    for (let i = 0; i < FPS && !b.spark.classList.contains('go'); i++) b.run(1);
    expect(b.spark, 'positive control: motion-on showOff starts .go').toHaveClass('go');
    expect(b.animations(), 'positive control: the real sparkle CSS is selected').toHaveLength(5);
    expect(b.animations().every((value) => value.includes('spark'))).toBe(true);
    b.adds.mockClear();

    if (mode === 'moves-off') act(() => usePrefs.setState({ birdMoves: false }));
    else b.reduce();
    if (mode === 'moves-off') {
      expect(activeHandle(), 'settle begins before release').toBe(engine);
      expect(release).not.toHaveBeenCalled();
    } else expect(release, 'reduced motion releases immediately').toHaveBeenCalledOnce();
    expect.soft(b.spark, 'settle begin / immediate reduced release clears .go').not.toHaveClass('go');
    expect.soft(b.animations(), 'CSS decoration stops at the gate immediately').toEqual([]);
    b.run(0.6 * FPS);
    expect(release).toHaveBeenCalledOnce();
    expect(activeHandle()).toBeNull();
    expect.soft(b.spark, 'no independent sparkle survives release').not.toHaveClass('go');
    expect.soft(b.animations(), 'no CSS animation survives release').toEqual([]);
    const released = b.drawing();
    const asked = b.frames.asked;
    b.run(4 * FPS);
    expect(b.frames.asked, 'released engine requests no later frame').toBe(asked);
    expect(b.drawing(), 'the released rig and decoration stay unchanged').toBe(released);
    expect(b.adds.mock.calls.flat(), 'no later burst restarts .go').not.toContain('go');
    expect.soft(b.animations(), 'later frames cannot leave CSS moving').toEqual([]);
  });
}
