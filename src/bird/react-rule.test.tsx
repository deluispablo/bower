import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePrefs } from '@/app/prefs';
import { PoseBower } from './Bower';
import { activeHandle } from './presence';
import { react } from './react';
import { FPS, REACTION_REFERENCE, fakeFrames, readRig } from './pose-reference.fixture';

const media = window.matchMedia;
afterEach(() => {
  cleanup();
  usePrefs.setState({ birdMoves: true });
  window.matchMedia = media;
  vi.restoreAllMocks();
});

function mount() {
  const frames = fakeFrames(11);
  const view = render(<PoseBower pose="idle" size={100} engineOptions={{ ...frames.options, acts: false }} />);
  const box = view.container.querySelector<HTMLElement>('[data-bird]');
  const perch = box?.querySelector<HTMLElement>('.bird-perch');
  const glyph = box?.querySelector('.b-carry');
  if (!box || !perch || !glyph) throw new Error('Missing Bower or paper glyph.');
  const read = readRig(perch, (part) => box.querySelector(`.b-${part}`));
  const run = (count: number) => {
    const samples: Array<ReturnType<typeof read> & { paper: boolean }> = [];
    act(() => {
      for (let i = 0; i < count; i++) {
        frames.run(1);
        samples.push({ ...read(), paper: glyph.getAttribute('display') !== 'none' });
      }
    });
    return samples;
  };
  run(FPS);
  return { ...view, box, perch, glyph, run };
}

it('rule carries the paper from the hop start until it drops with a jaw open at about 1.0 s', () => {
  const b = mount();
  const engine = activeHandle();
  if (!engine) throw new Error('Missing engine.');
  // Observe completion of the real reaction, rather than mistaking a hidden glyph for its end.
  const state = engine as unknown as { reaction: { kind: string } | null; S: { doing: unknown } };
  expect(b.glyph).toHaveAttribute('display', 'none');
  act(() => { engine.play('rule', { x: 59, y: 92 }); });
  const samples = b.run(Math.round(REACTION_REFERENCE.rule.seconds * FPS));
  const at = (seconds: number) => samples[Math.round(seconds * FPS) - 1];
  const hopFrame = samples.findIndex((s) => s.dy < -0.1);
  const paperFrame = samples.findIndex((s) => s.paper);
  expect(hopFrame, 'positive control: rule starts the real hop').toBeGreaterThanOrEqual(0);
  expect(Math.min(...samples.map((s) => s.dy)), 'the reference hop reaches -9 ± 2 px').toBeLessThanOrEqual(-7);
  expect.soft(paperFrame, 'paper appears within one frame of the hop start').toBeGreaterThanOrEqual(0);
  expect.soft(Math.abs(paperFrame - hopFrame), 'paper and hop start together').toBeLessThanOrEqual(1);
  for (const seconds of [0.05, 0.3, 0.6, 0.9]) {
    expect.soft(at(seconds)?.paper, `paper remains in the beak at ${seconds} s`).toBe(true);
  }
  const missingFrames = samples.slice(Math.max(0, hopFrame), Math.round(0.9 * FPS))
    .flatMap((s, i) => s.paper ? [] : [i + Math.max(0, hopFrame) + 1]);
  expect.soft(missingFrames, 'paper is continuously visible through the hop and settle to 0.9 s').toEqual([]);

  // About 1.0 s: a 0.9–1.1 s drop window; angle tolerance is the reference's ±2°.
  const dropWindow = samples.slice(Math.round(0.9 * FPS) - 1, Math.round(1.1 * FPS));
  const jawPeak = Math.max(...dropWindow.map((s) => s.jaw));
  const jawReference = REACTION_REFERENCE.tap.parts.jaw?.[0];
  if (jawReference === undefined) throw new Error('Missing short jaw-open reference.');
  expect.soft(Math.abs(jawPeak - jawReference), 'short drop jaw reaches the reference 14 ± 2 deg near 1.0 s')
    .toBeLessThanOrEqual(2);
  const dropFrame = samples.findIndex((s, i) => i > paperFrame && !s.paper);
  expect.soft((dropFrame + 1) / FPS, 'paper drops no earlier than 0.9 s').toBeGreaterThanOrEqual(0.9);
  expect.soft((dropFrame + 1) / FPS, 'paper drops by 1.1 s').toBeLessThanOrEqual(1.1);
  expect.soft(samples[dropFrame]?.jaw, 'the jaw is open when the paper drops').toBeGreaterThan(2);
  expect.soft(samples.filter((s) => s.jaw > 2).length / FPS, 'the jaw opening lasts at most 0.3 s')
    .toBeLessThanOrEqual(0.3);
  expect.soft(at(1.2)?.jaw, 'the jaw has closed by 1.2 s').toBeLessThanOrEqual(2);
  expect.soft(at(1.2)?.paper, 'paper is gone by the reference 1.2 s deadline').toBe(false);
  expect.soft(state.reaction, 'rule has ended by 1.2 s').toBeNull();
  expect.soft(state.S.doing, 'rule releases the act channel by 1.2 s').toBeNull();

  // The motion-on hop and initial paper above are the positive control for both still guards.
  b.unmount();
  for (const setting of ['reduced motion', 'moves off'] as const) {
    window.matchMedia = setting === 'reduced motion' ?
      (q) => ({ ...media(q), matches: q.includes('reduce') }) : media;
    usePrefs.setState({ birdMoves: setting !== 'moves off' });
    const still = mount();
    expect(still.box, setting).toHaveClass('posed', 'idle', 'still');
    expect(activeHandle(), setting).toBeNull();
    expect(still.glyph, setting).toHaveAttribute('display', 'none');
    const before = still.box.outerHTML;
    act(() => { react('rule'); });
    const stillSamples = still.run(Math.round(REACTION_REFERENCE.rule.seconds * FPS));
    expect(still.box.outerHTML, `${setting}: rule leaves the existing still frame unchanged`).toBe(before);
    expect(stillSamples.every((s) => !s.paper && s.jaw === 0 && s.dy === 0), setting).toBe(true);
    expect(activeHandle(), `${setting}: rule starts no engine`).toBeNull();
    still.unmount();
  }
});
