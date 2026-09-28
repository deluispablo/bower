// @vitest-environment jsdom

/**
 * The working sheet in a demo build (#363, `Demo-Working` board, handover
 * C.10): the reassurance line under the bar becomes the "A recording."
 * sentence and the started-ago badge becomes "Playing back" while a run is
 * queued or running; outside the demo neither changes. `isDemo()` is mocked
 * directly (rather than stubbing `VITE_DEMO` and re-importing `api.ts`) so
 * the real demo module never boots for a plain UI check — the same pattern
 * `settings-demo.test.ts` and `demo-banner.test.ts` use.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Run } from '../src/api.js';

const state = vi.hoisted(() => ({ demo: false }));

vi.mock('../src/api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.js')>()),
  isDemo: () => state.demo,
}));

vi.mock('../src/vault-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/vault-store.js')>()),
  useVault: () => ({ files: [] }),
}));

const {
  WorkingSheet,
  REASSURANCE,
  DEMO_REASSURANCE_LEAD,
  DEMO_REASSURANCE_REST,
  DEMO_PLAYING_BACK,
} = await import('../src/components/working-sheet.js');

const run: Run = {
  state: 'running',
  requestedAt: new Date().toISOString(),
  processed: [],
};

let root: HTMLDivElement;

function mount(phase: 'running' | 'done' = 'running'): void {
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(
      h(WorkingSheet, {
        phase,
        run,
        now: Date.now(),
        open: true,
        onDismiss: vi.fn(),
      }),
      root,
    );
  });
}

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  document.body.replaceChildren();
  state.demo = false;
});

describe('WorkingSheet outside the demo', () => {
  it('shows the footer and "started just now" in the header', () => {
    state.demo = false;
    mount();
    expect(root.textContent).toContain(REASSURANCE);
    expect(root.textContent).toContain('started just now');
    expect(root.textContent).not.toContain(DEMO_PLAYING_BACK.toLowerCase());
  });
});

describe('WorkingSheet in a demo build', () => {
  it('replaces the reassurance line with the recording sentence', () => {
    state.demo = true;
    mount();
    expect(root.textContent).toContain(DEMO_REASSURANCE_LEAD);
    expect(root.textContent).toContain(DEMO_REASSURANCE_REST);
    expect(root.textContent).not.toContain(REASSURANCE);
  });

  it('replaces the started-ago badge with "Playing back"', () => {
    state.demo = true;
    mount();
    expect(root.textContent).toContain(DEMO_PLAYING_BACK.toLowerCase());
    expect(root.textContent).not.toContain('tarted');
  });

  it('leaves the done state alone (no reassurance line at all)', () => {
    state.demo = true;
    mount('done');
    expect(root.textContent).not.toContain(DEMO_REASSURANCE_LEAD);
    expect(root.textContent).not.toContain(DEMO_PLAYING_BACK.toLowerCase());
  });
});
