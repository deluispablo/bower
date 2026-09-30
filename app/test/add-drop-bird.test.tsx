// @vitest-environment jsdom

import { h, render } from 'preact';
import type { ComponentChild } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { birdCount, resetBirdPresence } from '../src/bird-presence.js';
import { AddDropRow } from '../src/routes/add.js';
import { stubMatchMedia } from './helpers/match-media.js';

function mount(node: ComponentChild): () => void {
  const root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(node, root);
  });
  return () => {
    void act(() => {
      render(null, root);
    });
    root.remove();
  };
}

afterEach(() => {
  resetBirdPresence();
  vi.unstubAllGlobals();
});

describe('AddDropRow bird (rule 1)', () => {
  it('counts as the one Bower on a computer, so the perch hides', () => {
    stubMatchMedia(true);
    const unmount = mount(h(AddDropRow, {}));
    expect(birdCount()).toBe(1);
    unmount();
    expect(birdCount()).toBe(0);
  });

  it('is not mounted on a phone, so the perch stays', () => {
    stubMatchMedia(false);
    const unmount = mount(h(AddDropRow, {}));
    expect(birdCount()).toBe(0);
    unmount();
  });
});
