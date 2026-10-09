import { createElement } from 'react';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { usePrefs } from '@/app/prefs';
import { PoseBower } from './Bower';
import { BirdEngine } from './engine';
import { activeHandle, useBirdTurn, useOutranked } from './presence';
import { fakeFrames } from './pose-reference.fixture';

afterEach(() => {
  cleanup();
  usePrefs.setState({ birdMoves: true });
});

it('minor entries are ignored', () => {
  const page = renderHook(() => ({ bird: useBirdTurn(0), outranked: useOutranked(0) }));
  // A minor bird of a higher priority, mounted after the page's: newest and highest, yet ignored.
  const minor = renderHook(() => ({ bird: useBirdTurn(2, { minor: true }), outranked: useOutranked(2) }));
  expect(page.result.current.bird.turn).toBe(true);
  expect(minor.result.current.bird.turn).toBe(false);
  // topPriority ignores it too: the page's bird is not outranked by a minor one.
  expect(page.result.current.outranked).toBe(false);
});

it('the handle is set for the active bird, null for a still bird, and cleared on unmount', () => {
  const frames = fakeFrames();
  const view = render(createElement(PoseBower, { pose: 'idle', size: 72, engineOptions: frames.options }));
  expect(activeHandle()).toBeInstanceOf(BirdEngine);

  // A newer bird takes the turn: until it has an engine, there is no handle to act on.
  const newer = renderHook(() => useBirdTurn(0));
  expect(newer.result.current.turn).toBe(true);
  expect(activeHandle()).toBeNull();
  newer.unmount();
  expect(activeHandle()).toBeInstanceOf(BirdEngine);

  // With "Bower moves" off the bird is still: no engine, no handle.
  act(() => usePrefs.setState({ birdMoves: false }));
  expect(activeHandle()).toBeNull();
  act(() => usePrefs.setState({ birdMoves: true }));
  expect(activeHandle()).toBeInstanceOf(BirdEngine);

  view.unmount();
  expect(activeHandle()).toBeNull();
});
