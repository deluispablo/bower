// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EDGE_PX,
  OPEN_TRAVEL_PX,
  isOverIgnored,
  startsEdgeSwipe,
  useEdgeSwipe,
} from '../src/use-edge-swipe.js';
import type { EdgeSwipeOptions } from '../src/use-edge-swipe.js';

function pointer(
  type: string,
  x: number,
  y = 300,
  target: EventTarget = document.body,
  pointerType = 'touch',
): void {
  const event = new MouseEvent(type, {
    clientX: x,
    clientY: y,
    bubbles: true,
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  target.dispatchEvent(event);
}

let host: HTMLElement;
const calls = {
  onDrag: vi.fn<(px: number) => void>(),
  onOpen: vi.fn<() => void>(),
  onCancel: vi.fn<() => void>(),
};

function Probe(props: { enabled: boolean }): null {
  const options: EdgeSwipeOptions = { enabled: props.enabled, ...calls };
  useEdgeSwipe(options);
  return null;
}

function mount(enabled = true): void {
  void act(() => {
    render(h(Probe, { enabled }), host);
  });
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  calls.onDrag.mockReset();
  calls.onOpen.mockReset();
  calls.onCancel.mockReset();
});

afterEach(() => {
  render(null, host);
  document.body.replaceChildren();
});

describe('edge swipe thresholds', () => {
  it('starts only within 16 px of the left edge', () => {
    expect(EDGE_PX).toBe(16);
    expect(OPEN_TRAVEL_PX).toBe(24);
    expect(startsEdgeSwipe(0, document.body)).toBe(true);
    expect(startsEdgeSwipe(16, document.body)).toBe(true);
    expect(startsEdgeSwipe(17, document.body)).toBe(false);
  });

  it('is ignored over the tree and over a horizontal scroller', () => {
    const tree = document.createElement('ul');
    tree.setAttribute('role', 'tree');
    const row = document.createElement('li');
    tree.append(row);
    const chips = document.createElement('div');
    chips.style.overflowX = 'auto';
    Object.defineProperty(chips, 'scrollWidth', { value: 600 });
    Object.defineProperty(chips, 'clientWidth', { value: 300 });
    const chip = document.createElement('button');
    chips.append(chip);
    document.body.append(tree, chips);
    expect(isOverIgnored(row)).toBe(true);
    expect(isOverIgnored(chip)).toBe(true);
    expect(isOverIgnored(document.body)).toBe(false);
    expect(startsEdgeSwipe(4, chip)).toBe(false);
  });
});

describe('useEdgeSwipe', () => {
  it('follows the finger and opens past 24 px', () => {
    mount();
    pointer('pointerdown', 4);
    pointer('pointermove', 20);
    expect(calls.onDrag).toHaveBeenLastCalledWith(16);
    pointer('pointermove', 40);
    pointer('pointerup', 40);
    expect(calls.onOpen).toHaveBeenCalledOnce();
    expect(calls.onCancel).not.toHaveBeenCalled();
  });

  it('cancels when let go short of the threshold', () => {
    mount();
    pointer('pointerdown', 4);
    pointer('pointermove', 20);
    pointer('pointerup', 20);
    expect(calls.onOpen).not.toHaveBeenCalled();
    expect(calls.onCancel).toHaveBeenCalledOnce();
  });

  it('leaves a vertical scroll, a start away from the edge and a mouse alone', () => {
    mount();
    pointer('pointerdown', 4, 300);
    pointer('pointermove', 8, 360);
    pointer('pointerup', 60, 360);
    pointer('pointerdown', 40);
    pointer('pointermove', 100);
    pointer('pointerup', 100);
    pointer('pointerdown', 4, 300, document.body, 'mouse');
    pointer('pointermove', 100, 300, document.body, 'mouse');
    pointer('pointerup', 100, 300, document.body, 'mouse');
    expect(calls.onDrag).not.toHaveBeenCalled();
    expect(calls.onOpen).not.toHaveBeenCalled();
  });

  it('does nothing while disabled (desktop, the Folders tab)', () => {
    mount(false);
    pointer('pointerdown', 4);
    pointer('pointermove', 60);
    pointer('pointerup', 60);
    expect(calls.onOpen).not.toHaveBeenCalled();
  });
});
