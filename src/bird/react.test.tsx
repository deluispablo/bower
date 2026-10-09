import { createRef } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePrefs } from '@/app/prefs';
import { BowerLayer, PoseBower, type BowerController, type Pose } from './Bower';
import { activeHandle } from './presence';
import { react, REACTIONS, type ReactionKind } from './react';
import { FPS, REACTION_REFERENCE, fakeFrames, readRig, type PartKey } from './pose-reference.fixture';

const media = window.matchMedia;
afterEach(() => { cleanup(); usePrefs.setState({ birdMoves: true }); window.matchMedia = media; vi.restoreAllMocks(); });

function mount(pose: Pose | null = 'idle') {
  const frames = fakeFrames(11);
  const ref = createRef<BowerController>();
  const view = render(pose ? <PoseBower pose={pose} size={100} engineOptions={{ ...frames.options, acts: false }} /> :
    <BowerLayer ref={ref} size={100} home={() => ({ x: 50, y: 92 })} engineOptions={{ ...frames.options, acts: false }} />);
  const box = view.container.querySelector<HTMLElement>('[data-bird]');
  const bird = box?.querySelector<HTMLElement>(pose ? '.bird-perch' : '.bower-flyer');
  if (!box || !bird) throw new Error('no Bower');
  const read = readRig(bird, (part) => box.querySelector(`.b-${part}`));
  const run = (seconds: number) => {
    const samples: Record<PartKey, number>[] = [];
    act(() => { for (let i = 0; i < Math.round(seconds * FPS); i++) { frames.run(1); samples.push(read()); } });
    return samples;
  };
  run(1);
  return { ...view, frames, ref, box, bird, read, run };
}
const target = (b: ReturnType<typeof mount>) => {
  const el = document.createElement('button'); document.body.append(el);
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ left: 350, top: 34, width: 0, height: 0 } as DOMRect);
  vi.spyOn(b.box, 'getBoundingClientRect').mockReturnValue({ left: 50, top: 0 } as DOMRect);
  return el;
};

it.each(Object.keys(REACTIONS) as ReactionKind[])('each reaction kind plays its action: %s', (kind) => {
  const b = mount();
  const at = target(b);
  if (kind === 'moves-off') { act(() => { activeHandle()?.act('preen'); }); b.run(0.2); expect(b.read().head).toBeGreaterThan(30); }
  act(() => { react(kind, at); });
  const ref = REACTION_REFERENCE[kind];
  expect(Object.keys(REACTION_REFERENCE).sort()).toEqual(Object.keys(REACTIONS).sort());
  const samples = b.run(ref.seconds + 0.05);
  for (const [part, values] of Object.entries(ref.parts) as [PartKey, number[]][]) {
    const seen = samples.map((r) => r[part]);
    for (const value of values) expect(Math.min(...seen.map((v) => Math.abs(v - value))), `${kind} ${part} reaches ${value}`).toBeLessThanOrEqual(2);
    expect(Math.min(...seen), `${kind} ${part} low`).toBeGreaterThanOrEqual(Math.min(b.read()[part], 0, ...values) - 2);
    expect(Math.max(...seen), `${kind} ${part} high`).toBeLessThanOrEqual(Math.max(1, ...values) + 2);
  }
  if (['bin', 'error', 'duplicate', 'link-open'].includes(kind)) expect(Math.max(...samples.map((r) => r.iris))).toBeGreaterThan(1.1);
  if (kind === 'rule') expect(samples.some((r) => r.dy < -7)).toBe(true);
  at.remove();
});

it.each([{ name: 'minded', pose: 'idle' as const }, { name: 'working', pose: 'write' as const },
  { name: 'perched layer', pose: null }])('a reaction plays on a $name bird', ({ pose }) => {
  const b = mount(pose);
  if (!pose) act(() => { b.ref.current?.holding(true); });
  act(() => { react('yes'); });
  const samples = b.run(0.5);
  expect(Math.max(...samples.map((r) => r.head))).toBeGreaterThanOrEqual(16);
  expect(Math.min(...samples.map((r) => r.head))).toBeLessThan(5);
  if (!pose) expect(b.box.querySelector('.b-carry')).toHaveAttribute('display', 'none'); // layer owns its carry chip
});

it('a reaction starts within 0.1 s and cuts the running one', () => {
  const b = mount();
  act(() => { react('duplicate'); }); b.run(0.25);
  expect(b.read().head).toBeLessThan(-12);
  act(() => { react('drag-over'); });
  const samples = b.run(0.1);
  expect(Math.max(...samples.map((r) => r.pitch))).toBeGreaterThan(1);
  b.run(0.2); expect(Math.abs(b.read().head)).toBeLessThan(2);
});

it('a reaction during a flight is kept in the one pending slot and plays on landing, latest wins', () => {
  const b = mount(null);
  act(() => { b.ref.current?.flyTo(() => ({ x: 50, y: 92, perch: true })); });
  b.run(0.1);
  act(() => { react('yes'); react('hide'); react('drag-over'); });
  const flight = b.run(0.2);
  expect(Math.max(...flight.map((r) => r.jaw))).toBeLessThan(2);
  const landed = b.run(3);
  expect(Math.max(...landed.map((r) => r.jaw))).toBeGreaterThanOrEqual(12);
  expect(Math.max(...landed.map((r) => r.head))).toBeLessThan(16);
});

it('with reduced motion react does nothing', () => {
  const b = mount(); act(() => { react('yes'); });
  expect(Math.max(...b.run(0.5).map((r) => r.head))).toBeGreaterThanOrEqual(16);
  b.unmount(); window.matchMedia = (q) => ({ ...media(q), matches: q.includes('reduce') });
  const still = mount(); const before = still.bird.outerHTML;
  act(() => { react('yes'); }); still.run(1);
  expect(still.bird.outerHTML).toBe(before); expect(activeHandle()).toBeNull();
});

it('with moves off only the settle runs, then the still frame', () => {
  const b = mount(); act(() => { react('yes'); });
  expect(Math.max(...b.run(0.2).map((r) => r.head))).toBeGreaterThanOrEqual(16);
  act(() => { usePrefs.setState({ birdMoves: false }); });
  expect(activeHandle()).not.toBeNull(); expect(b.box).not.toHaveClass('still');
  act(() => { react('hide'); });
  expect(Math.min(...b.run(0.3).map((r) => r.wing))).toBeGreaterThan(-2);
  b.run(0.4); expect(b.box).toHaveClass('still'); expect(activeHandle()).toBeNull();
  const before = b.bird.outerHTML; act(() => { react('yes'); }); b.run(1);
  expect(b.bird.outerHTML).toBe(before);
  act(() => { usePrefs.setState({ birdMoves: true }); });
  expect(activeHandle()).not.toBeNull();
  expect(Math.max(...b.run(1.7).map((r) => r.tuft))).toBeGreaterThanOrEqual(16);
});

it.each(['point-tidy', 'drag-over'] as const)('a sustained reaction ends on end() or after 10 s: %s', (kind) => {
  const b = mount(); let reaction = react(kind); b.run(1);
  expect(b.read().pitch).toBeGreaterThan(4);
  act(() => { reaction.end(); }); b.run(0.3); expect(Math.abs(b.read().pitch)).toBeLessThan(2);
  act(() => { reaction = react(kind); }); b.run(9.5); expect(b.read().pitch).toBeGreaterThan(4);
  b.run(0.8); expect(Math.abs(b.read().pitch)).toBeLessThan(2);
});

it('a mind-asleep bird wakes with the startle, then reacts', () => {
  const b = mount(); b.run(61); expect(b.read().eye).toBeCloseTo(0.08, 2);
  act(() => { react('yes'); }); const startle = b.run(0.75);
  expect(Math.min(...startle.map((r) => r.head))).toBeLessThanOrEqual(-8);
  expect(Math.max(...startle.map((r) => r.tuft))).toBeGreaterThanOrEqual(16);
  expect(Math.max(...b.run(1).map((r) => r.head))).toBeGreaterThanOrEqual(16);
  b.run(56); expect(Math.max(...b.run(0.5).map((r) => r.eye))).toBeGreaterThan(0.9);
});

it('a sleep-pose bird ignores reactions except error and offline', () => {
  const control = mount(); act(() => { react('yes'); });
  expect(Math.max(...control.run(0.5).map((r) => r.head))).toBeGreaterThanOrEqual(16); control.unmount();
  const b = mount('sleep');
  for (const kind of Object.keys(REACTIONS) as ReactionKind[]) {
    if (kind === 'error' || kind === 'offline') continue;
    act(() => { react(kind); }); b.run(0.2);
    expect(b.read().head, kind).toBeCloseTo(20, 1); expect(b.read().eye, kind).toBeCloseTo(0.08, 2);
  }
  for (const kind of ['error', 'offline'] as const) {
    let reaction = react(kind); const samples = b.run(2);
    expect(Math.min(...samples.map((r) => r.head))).toBeLessThanOrEqual(-8);
    expect(b.read().head).toBeCloseTo(-10, 1); expect(b.read().eye).toBeGreaterThan(0.9);
    act(() => { reaction.end(); }); b.run(1); expect(b.read().head).toBeCloseTo(20, 1);
    expect(b.read().eye).toBeCloseTo(0.08, 2);
  }
});

it("a tap goes through react('tap') on the mounted bird", () => {
  const b = mount();
  const engine = activeHandle() as unknown as { play?: (kind: ReactionKind) => void };
  expect(engine.play).toBeTypeOf('function');
  const play = vi.spyOn(engine, 'play');
  fireEvent.pointerDown(b.box); expect(play).toHaveBeenCalledWith('tap', undefined);
  expect(Math.min(...b.run(0.15).map((r) => r.dy))).toBeLessThan(-7);
});
