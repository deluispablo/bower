// @vitest-environment jsdom

/**
 * The demo banner (#193): nothing in a real build, the sample-notes
 * sentence in a demo one. `isDemo()` is mocked directly (rather than
 * stubbing `VITE_DEMO` and re-importing `api.ts`) so the real demo module
 * — its own fixture vault, loaded from `vault-template/` — never boots for
 * a plain UI check.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ demo: false }));

vi.mock('../src/api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.js')>()),
  isDemo: () => state.demo,
}));

const { DemoBanner } = await import('../src/components/demo-banner.js');

let root: HTMLDivElement;

function mount(): void {
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(h(DemoBanner, null), root);
  });
}

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  document.body.replaceChildren();
  state.demo = false;
});

describe('DemoBanner', () => {
  it('renders nothing in a real build', () => {
    state.demo = false;
    mount();
    expect(root.textContent).toBe('');
  });

  it('shows the sample-notes sentence in a demo build', () => {
    state.demo = true;
    mount();
    expect(root.textContent).toBe(
      'These are sample notes. Nothing here is real.',
    );
  });
});
