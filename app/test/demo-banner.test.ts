// @vitest-environment jsdom

/**
 * The demo banner (#362): nothing in a real build; in a demo one, one
 * sentence and "Run your own" to `/login`, and nothing while the tour is
 * on screen. `isDemo()` is mocked directly (rather than stubbing
 * `VITE_DEMO` and re-importing `api.ts`) so the real demo module — its own
 * fixture vault, loaded from `vault-template/` — never boots for a plain UI
 * check.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ demo: false }));

vi.mock('../src/api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.js')>()),
  isDemo: () => state.demo,
}));

const { DemoBanner, DEMO_BANNER_TEXT } =
  await import('../src/components/demo-banner.js');

let root: HTMLDivElement;

function mount(tourOpen?: boolean): void {
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(h(DemoBanner, { tourOpen }), root);
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

  it('shows the one sentence and Run your own to /login in a demo build', () => {
    state.demo = true;
    mount();
    expect(DEMO_BANNER_TEXT).toBe(
      'This is a demo, not the real thing: sample notes, nothing saved.',
    );
    expect(root.textContent).toContain(DEMO_BANNER_TEXT);
    const link = root.querySelector('a');
    expect(link?.textContent).toBe('Run your own');
    expect(link?.getAttribute('href')).toBe('/login');
    expect(root.querySelector('button')).toBeNull();
  });

  it('steps aside while the tour is on screen', () => {
    state.demo = true;
    mount(true);
    expect(root.textContent).toBe('');
  });
});
