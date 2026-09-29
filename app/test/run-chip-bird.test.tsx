// @vitest-environment jsdom

import { render } from 'preact';
import type { VNode } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerBird, resetBirdPresence } from '../src/bird-presence.js';
import {
  RunChip,
  barBirdState,
  chipModel,
} from '../src/components/run-chip.js';
import type { ChipModel } from '../src/components/run-chip.js';
import { buildRun } from './fixtures/run-outcome-builders.js';
import { stubMatchMedia } from './helpers/match-media.js';

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

function chip(state: 'running' | 'done' | 'partial' | 'failed'): ChipModel {
  const now = Date.parse('2026-09-29T10:07:00.000Z');
  const base = {
    phase: 'idle' as const,
    run: null,
    lastFinished: null,
    resultSeen: false,
    now,
    desktop: false,
  };
  const built =
    state === 'running'
      ? chipModel({ ...base, phase: 'running', run: buildRun('running') })
      : chipModel({ ...base, lastFinished: buildRun(state) });
  if (built === null) throw new Error('fixture has no chip');
  return built;
}

describe('the phone bar bird (R-BIRD-5)', () => {
  it('maps the states: flying, done, confused, none when it did not finish', () => {
    expect(barBirdState('running')).toBe('flying');
    expect(barBirdState('done')).toBe('done');
    expect(barBirdState('partial')).toBe('confused');
    expect(barBirdState('failed')).toBeNull();
  });

  it('draws the bird in place of the icon on a phone', () => {
    const root = mount(
      <RunChip model={chip('running')} desktop={false} onOpen={vi.fn()} />,
    );
    expect(root.querySelector('.run-chip-bird svg.p-fly')).not.toBeNull();
    expect(root.querySelector('.run-chip-spin')).toBeNull();
  });

  it('does not render a bird on desktop', () => {
    const root = mount(
      <RunChip model={chip('done')} desktop={true} onOpen={vi.fn()} />,
    );
    expect(root.querySelector('.run-chip-bird')).toBeNull();
    expect(root.querySelector('svg')).not.toBeNull();
  });

  it('keeps the icon under reduced motion', () => {
    stubMatchMedia((query) => query.includes('prefers-reduced-motion'));
    const root = mount(
      <RunChip model={chip('running')} desktop={false} onOpen={vi.fn()} />,
    );
    expect(root.querySelector('.run-chip-bird')).toBeNull();
    expect(root.querySelector('.run-chip-spin')).not.toBeNull();
  });

  it('keeps the icon while another bird is on screen', () => {
    registerBird();
    const root = mount(
      <RunChip model={chip('partial')} desktop={false} onOpen={vi.fn()} />,
    );
    expect(root.querySelector('.run-chip-bird')).toBeNull();
  });

  it('keeps the icon when the tidy-up did not finish', () => {
    const root = mount(
      <RunChip model={chip('failed')} desktop={false} onOpen={vi.fn()} />,
    );
    expect(root.querySelector('.run-chip-bird')).toBeNull();
  });
});
