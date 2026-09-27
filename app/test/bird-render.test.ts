// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BowerWorking } from '../src/components/bower-working.js';
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
    // The v8.2 drawing (docs/design/gen.py, BIRD_CORE): joints, then the
    // parts that only some states move (neck, lids, cheek, feet).
    for (const part of ['rig', 'turn', 'hd', 'ey', 'jw', 'wg', 'tl', 'ft']) {
      expect(svg.querySelector(`.${part}`)).not.toBeNull();
    }
    for (const part of ['nk', 'hc', 'ld', 'lb', 'ck', 'fo', 'tf', 'lg']) {
      expect(svg.querySelector(`.${part}`)).not.toBeNull();
    }
    for (const prop of [
      'tw',
      'pp',
      'nt',
      'qm',
      'zz',
      'sp',
      'cl',
      'dd',
      'ex',
      'rn',
    ]) {
      expect(svg.querySelector(`.${prop}`)).not.toBeNull();
    }
    // One wing, three tail feathers, two feet.
    expect(svg.querySelectorAll('.wg').length).toBe(1);
    expect(svg.querySelectorAll('.tf').length).toBe(3);
    expect(svg.querySelectorAll('.fo').length).toBe(2);
    for (const part of ['tray', 'nest', 'nest2', 'bp', 'bn']) {
      expect(svg.querySelector(`.${part}`)).toBeNull();
    }
  });

  it('adds the scene only when asked', () => {
    const svg = mount({ state: 'tidying', scene: true, size: 104 });
    for (const part of ['tray', 'traypaper', 'nest', 'nest2', 'bp', 'bn']) {
      expect(svg.querySelector(`.${part}`)).not.toBeNull();
    }
    expect(svg.querySelector('.wall')).toBeNull();
    expect(svg.getAttribute('width')).toBe('104');
  });

  it('keeps the sleeping nest inside the rig, so it breathes with the bird', () => {
    const svg = mount({ state: 'asleep', scene: true });
    expect(svg.querySelector('.rig .turn .nest2')).not.toBeNull();
    expect(svg.querySelector('.rig .bp')).toBeNull();
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

  it('with reduced motion, calls onDone for a plays-once state right away', () => {
    const onDone = vi.fn();
    const svg = mount({ state: 'done', reducedMotion: true, onDone });
    expect(onDone).toHaveBeenCalledTimes(1);
    const rig = svg.querySelector('.rig');
    if (rig === null) throw new Error('rig missing');
    animationEnd(rig);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('with reduced motion, never calls onDone for a looping state', () => {
    const onDone = vi.fn();
    mount({ state: 'tidying', reducedMotion: true, onDone });
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

describe('BowerWorking', () => {
  it('with reduced motion, goes from show-off to looking when a run is done', () => {
    const root = document.createElement('div');
    document.body.append(root);
    void act(() => {
      render(h(BowerWorking, { state: 'done', reducedMotion: true }), root);
    });
    // Looking has no still face; show-off would hold the proud one.
    expect(root.querySelector('svg')?.getAttribute('class')).toBe('b');
  });
});
