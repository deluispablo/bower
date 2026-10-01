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
import { useBirdRoom } from '../src/components/bower-ledge.js';

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

function Room({ counts }: { counts: boolean }): VNode | null {
  return useBirdRoom(true, counts) ? <span class="room" /> : null;
}

describe('useBirdRoom (#950 D-1 keeps it for the phone bar)', () => {
  it('has room while no other bird is on screen', () => {
    const root = mount(<Room counts={false} />);
    expect(root.querySelector('.room')).not.toBeNull();
    expect(birdCount()).toBe(0);
  });

  it('gives way while another bird is on screen, and returns after', () => {
    const root = mount(<Room counts={false} />);
    let leave = (): void => undefined;
    void act(() => {
      leave = registerBird();
    });
    expect(root.querySelector('.room')).toBeNull();
    void act(() => {
      leave();
    });
    expect(root.querySelector('.room')).not.toBeNull();
  });
});
