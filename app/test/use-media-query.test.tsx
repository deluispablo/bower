// @vitest-environment jsdom

/**
 * `useMediaQuery` (#357): false without `matchMedia`, the query's answer
 * with it, and it follows a change of the window's width.
 */

import { h, render } from 'preact';
import type { JSX } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { stubMatchMedia } from './helpers/match-media.js';
import { mediaMatches, useMediaQuery } from '../src/use-media-query.js';

const QUERY = '(min-width: 1200px)';

function Probe(): JSX.Element {
  return h('p', null, useMediaQuery(QUERY) ? 'wide' : 'narrow');
}

let root: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) {
    render(null, root);
    root.remove();
    root = null;
  }
  vi.unstubAllGlobals();
});

async function mount(): Promise<HTMLDivElement> {
  const el = document.createElement('div');
  document.body.append(el);
  root = el;
  await act(() => {
    render(h(Probe, null), el);
  });
  return el;
}

describe('useMediaQuery', () => {
  it('is false where matchMedia is missing', async () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(mediaMatches(QUERY)).toBe(false);
    expect((await mount()).textContent).toBe('narrow');
  });

  it('answers the query and follows its changes', async () => {
    const stub = stubMatchMedia(true);
    const el = await mount();
    expect(el.textContent).toBe('wide');

    await act(() => {
      stub.set(false);
    });
    expect(el.textContent).toBe('narrow');
  });
});
