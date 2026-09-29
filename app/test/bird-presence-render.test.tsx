// @vitest-environment jsdom

import { h, render } from 'preact';
import type { ComponentChild } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  birdCount,
  resetBirdPresence,
  usePerchVisible,
} from '../src/bird-presence.js';
import { Bird, BowerMark } from '../src/components/bird.js';
import type { BirdProps } from '../src/components/bird.js';

function Perch(): ComponentChild {
  return usePerchVisible() ? h('i', { 'data-perch': '' }) : null;
}

function mount(node: ComponentChild): {
  root: HTMLElement;
  unmount: () => void;
} {
  const root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(node, root);
  });
  return {
    root,
    unmount: () => {
      void act(() => {
        render(null, root);
      });
    },
  };
}

function bird(props: Partial<BirdProps> = {}): ComponentChild {
  return h(Bird, { state: 'looking', size: 88, ...props });
}

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    value: false,
  });
  resetBirdPresence();
});

describe('bird presence in the render', () => {
  it('moves the count 1 to 0 when the greeting mounts and unmounts', () => {
    expect(birdCount()).toBe(0);
    const { unmount } = mount(bird());
    expect(birdCount()).toBe(1);
    unmount();
    expect(birdCount()).toBe(0);
  });

  it('hides the perch while a bird is on screen', () => {
    const perch = mount(h(Perch, {}));
    expect(perch.root.querySelector('[data-perch]')).not.toBeNull();
    const greeting = mount(bird());
    expect(perch.root.querySelector('[data-perch]')).toBeNull();
    greeting.unmount();
    expect(perch.root.querySelector('[data-perch]')).not.toBeNull();
  });

  it('never counts the mark, the perch or a bird under 40 px', () => {
    mount(h(BowerMark, { size: 24 }));
    mount(bird({ state: 'perched' }));
    expect(birdCount()).toBe(0);
  });

  it('holds other birds still while an overlay shows Bower', () => {
    const other = mount(bird({ state: 'hello' }));
    expect(other.root.querySelector('svg')?.getAttribute('class')).toContain(
      'p-hello',
    );
    const overlay = mount(bird({ state: 'hello', overlay: true }));
    expect(
      other.root.querySelector('svg')?.getAttribute('class'),
    ).not.toContain('p-hello');
    expect(overlay.root.querySelector('svg')?.getAttribute('class')).toContain(
      'p-hello',
    );
    overlay.unmount();
    expect(other.root.querySelector('svg')?.getAttribute('class')).toContain(
      'p-hello',
    );
  });
});

describe('bird pause', () => {
  it('pauses while the tab is hidden', () => {
    const { root } = mount(bird());
    const svg = root.querySelector('svg');
    expect(svg?.getAttribute('class')).not.toContain('paused');
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    });
    void act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(svg?.getAttribute('class')).toContain('paused');
  });

  it('pauses while an IntersectionObserver reports it off screen', () => {
    let callback: IntersectionObserverCallback = () => undefined;
    const disconnect = vi.fn();
    class FakeObserver {
      constructor(cb: IntersectionObserverCallback) {
        callback = cb;
      }
      observe(): void {}
      disconnect(): void {
        disconnect();
      }
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { root, unmount } = mount(bird());
    const svg = root.querySelector('svg');
    const report = (isIntersecting: boolean): void => {
      void act(() => {
        callback(
          [{ isIntersecting } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        );
      });
    };
    report(false);
    expect(svg?.getAttribute('class')).toContain('paused');
    report(true);
    expect(svg?.getAttribute('class')).not.toContain('paused');
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
