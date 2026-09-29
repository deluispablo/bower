// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { stubMatchMediaFor } from './helpers/match-media.js';

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
    // The v9 drawing (spec Appendix A): joints, then the
    // parts that only some states move (neck, lids, blush, feet).
    for (const part of ['rig', 'turn', 'hd', 'ey', 'jw', 'wg', 'tl', 'ft']) {
      expect(svg.querySelector(`.${part}`)).not.toBeNull();
    }
    for (const part of ['nk', 'hc', 'ld', 'lb', 'bl', 'ir', 'fo', 'tf', 'lg']) {
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
      'bcap',
      'wv',
      'rd',
      'pdot',
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
    // The pale cheek is gone (v9 has a blush instead); the gem is the cap.
    for (const part of ['ck', 'sgem', 'sgemhl']) {
      expect(svg.querySelector(`.${part}`)).toBeNull();
    }
  });

  it('draws the v9 head, eye, blush, iris ring, beak and cap as in Appendix A', () => {
    const svg = mount({ state: 'looking' });
    function attrs(selector: string): Record<string, string | null> {
      const el = svg.querySelector(selector);
      if (el === null) throw new Error(`${selector} missing`);
      return Object.fromEntries(
        ['cx', 'cy', 'r', 'rx', 'ry', 'x', 'width'].map((name) => [
          name,
          el.getAttribute(name),
        ]),
      );
    }
    expect(attrs('.hc')).toMatchObject({ cx: '62', cy: '39', r: '21' });
    expect(attrs('.ec')).toMatchObject({ cx: '69', cy: '37', r: '6.3' });
    expect(attrs('.ir')).toMatchObject({ cx: '69', cy: '37', r: '5.6' });
    expect(attrs('.bl')).toMatchObject({ cx: '78', cy: '49', rx: '3.4' });
    expect(attrs('.ld')).toMatchObject({ cy: '23.2', r: '7.6' });
    expect(attrs('.lb')).toMatchObject({ cy: '51', r: '7.6' });
    expect(attrs('.bk')).toMatchObject({ x: '80', width: '11' });
    expect(attrs('.bj')).toMatchObject({ x: '80', width: '8.5' });
    expect(svg.querySelectorAll('.eh').length).toBe(2);
    // The blush follows the lower lid; the cap sits in the head group, in the beak.
    expect(svg.querySelector('.lb + .bl')).not.toBeNull();
    expect(svg.querySelector('.hd .bcap .bci')).not.toBeNull();
  });

  it('keeps the round 7 props inside turn, after the wing, so flip turns them', () => {
    const svg = mount({ state: 'listening' });
    expect(svg.querySelectorAll('.turn > .wv').length).toBe(3);
    expect(svg.querySelectorAll('.turn > .rd .rdl').length).toBe(3);
    expect(svg.querySelectorAll('.turn > .pdot').length).toBe(2);
    const wing = svg.querySelector('.wg');
    const arcs = svg.querySelector('.w1');
    if (wing === null || arcs === null) throw new Error('parts missing');
    // eslint-disable-next-line no-bitwise
    expect(wing.compareDocumentPosition(arcs) & 4).toBe(4);
  });

  it('gives each new pose its class, and pointing down adds pd', () => {
    expect(mount({ state: 'listening' }).getAttribute('class')).toBe(
      'b p-listen',
    );
    expect(mount({ state: 'reading' }).getAttribute('class')).toBe('b p-read');
    expect(mount({ state: 'perched' }).getAttribute('class')).toBe('b p-perch');
    expect(mount({ state: 'pointing' }).getAttribute('class')).toBe(
      'b p-point',
    );
    expect(mount({ state: 'pointing', down: true }).getAttribute('class')).toBe(
      'b p-point pd',
    );
  });

  it('with reduced motion, the held poses get their still classes', () => {
    expect(
      mount({
        state: 'pointing',
        down: true,
        reducedMotion: true,
      }).getAttribute('class'),
    ).toBe('b s-point pd');
    expect(
      mount({ state: 'reading', reducedMotion: true }).getAttribute('class'),
    ).toBe('b s-read');
    expect(
      mount({ state: 'listening', reducedMotion: true }).getAttribute('class'),
    ).toBe('b e-curious');
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
    stubMatchMediaFor('(prefers-reduced-motion: reduce)');
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
