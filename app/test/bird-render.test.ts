// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Bird } from '../src/components/bird.js';
import type { BirdProps } from '../src/components/bird.js';

function mount(props: BirdProps): SVGSVGElement {
  const root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(h(Bird, props), root);
  });
  const svg = root.querySelector('svg');
  if (svg === null) throw new Error('no svg rendered');
  return svg;
}

function animationEnd(target: Element): void {
  target.dispatchEvent(new Event('animationend', { bubbles: true }));
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('Bird', () => {
  it('renders the rig, hidden from assistive technology', () => {
    const svg = mount({ state: 'looking' });
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('class')).toBe('b p-look');
    expect(svg.getAttribute('width')).toBe('32');
    for (const part of ['rig', 'turn', 'hd', 'ey', 'jw', 'wg', 'tl', 'ft']) {
      expect(svg.querySelector(`.${part}`)).not.toBeNull();
    }
    for (const prop of ['tw', 'pp', 'nt', 'qm', 'zz', 'sp', 'cl']) {
      expect(svg.querySelector(`.${prop}`)).not.toBeNull();
    }
    expect(svg.querySelector('.tray')).toBeNull();
  });

  it('adds the scene only when asked', () => {
    const svg = mount({ state: 'tidying', scene: true, size: 104 });
    for (const part of ['tray', 'nest', 'wall']) {
      expect(svg.querySelector(`.${part}`)).not.toBeNull();
    }
    expect(svg.getAttribute('width')).toBe('104');
  });

  it('calls onDone once when the rig of a plays-once state ends', () => {
    const onDone = vi.fn();
    const svg = mount({ state: 'hello', onDone });
    const rig = svg.querySelector('.rig');
    const wing = svg.querySelector('.wg');
    if (rig === null || wing === null) throw new Error('rig missing');
    animationEnd(wing);
    expect(onDone).not.toHaveBeenCalled();
    animationEnd(rig);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('never calls onDone for a looping state', () => {
    const onDone = vi.fn();
    const svg = mount({ state: 'looking', onDone });
    const rig = svg.querySelector('.rig');
    if (rig === null) throw new Error('rig missing');
    animationEnd(rig);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('holds still when the system asks for reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
    }));
    try {
      expect(mount({ state: 'confused' }).getAttribute('class')).toBe(
        'b e-worried',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
