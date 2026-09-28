// @vitest-environment jsdom

/**
 * The demo banner (#193): nothing in a real build, the sample-notes
 * sentence in a demo one. `isDemo()` is mocked directly (rather than
 * stubbing `VITE_DEMO` and re-importing `api.ts`) so the real demo module
 * — its own fixture vault, loaded from `vault-template/` — never boots for
 * a plain UI check.
 *
 * "Show me around" (#195) replays the first-run tour; `tour-store.ts` is
 * mocked the same way `tour-store.test.ts` mocks `api.ts`'s
 * `updateSettings`, so this stays a plain UI check of the banner calling
 * `replayTour`, not of the store itself.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ demo: false }));

vi.mock('../src/api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.js')>()),
  isDemo: () => state.demo,
}));

const replayTour = vi.fn();
vi.mock('../src/tour-store.js', () => ({
  replayTour: () => {
    replayTour();
  },
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

function button(label: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button')).find(
    (b) => b.textContent === label,
  );
  if (found === undefined) throw new Error(`button ${label} missing`);
  return found;
}

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  document.body.replaceChildren();
  state.demo = false;
  replayTour.mockReset();
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
    expect(root.textContent).toContain(
      'These are sample notes. Nothing here is real.',
    );
  });

  it('"Show me around" replays the tour', () => {
    state.demo = true;
    mount();
    void act(() => button('Show me around').click());
    expect(replayTour).toHaveBeenCalledTimes(1);
  });
});
