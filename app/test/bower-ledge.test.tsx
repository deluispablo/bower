// @vitest-environment jsdom

import { render } from 'preact';
import type { VNode } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  birdCount,
  registerBird,
  resetBirdPresence,
} from '../src/bird-presence.js';
import { BowerLedge, isRunning } from '../src/components/bower-ledge.js';

let host: HTMLElement | undefined;

function mount(vnode: VNode): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  void act(() => {
    render(vnode, host as HTMLElement);
  });
  return host;
}

afterEach(() => {
  if (host !== undefined) render(null, host);
  host?.remove();
  host = undefined;
  resetBirdPresence();
  vi.unstubAllGlobals();
});

describe('isRunning', () => {
  it('is true while a run starts, waits or runs', () => {
    expect(isRunning('starting')).toBe(true);
    expect(isRunning('queued')).toBe(true);
    expect(isRunning('running')).toBe(true);
    expect(isRunning('idle')).toBe(false);
  });
});

describe('BowerLedge', () => {
  it('perches at rest, and the perch does not count as a bird', () => {
    const root = mount(<BowerLedge running={false} />);
    expect(root.querySelector('svg.p-perch')).not.toBeNull();
    expect(birdCount()).toBe(0);
  });

  it('flies during a run and stays although it registers itself', () => {
    const root = mount(<BowerLedge running={true} />);
    expect(root.querySelector('svg.p-fly')).not.toBeNull();
    expect(birdCount()).toBe(1);
  });

  it('goes back to the perch when the run ends', () => {
    const root = mount(<BowerLedge running={true} />);
    void act(() => {
      render(<BowerLedge running={false} />, root);
    });
    expect(root.querySelector('svg.p-perch')).not.toBeNull();
    expect(birdCount()).toBe(0);
  });

  it('is not drawn while another bird is on screen, and returns after', () => {
    const root = mount(<BowerLedge running={false} />);
    let leave = (): void => undefined;
    void act(() => {
      leave = registerBird();
    });
    expect(root.querySelector('.bower-ledge')).toBeNull();
    void act(() => {
      leave();
    });
    expect(root.querySelector('svg.p-perch')).not.toBeNull();
  });

  it('hides a flying ledge too when another bird arrives', () => {
    const root = mount(<BowerLedge running={true} />);
    void act(() => {
      registerBird();
    });
    expect(root.querySelector('.bower-ledge')).toBeNull();
    expect(birdCount()).toBe(1);
  });
});
