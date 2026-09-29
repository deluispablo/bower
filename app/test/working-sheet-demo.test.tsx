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
  runningNote,
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
  it('shows the note and the time line', () => {
    state.demo = false;
    mount();
    expect(document.body.textContent).toContain(runningNote(false));
    expect(document.body.textContent).toContain('so far · usually 3 to 6 min');
    expect(document.body.textContent).not.toContain(DEMO_PLAYING_BACK);
  });
});

describe('WorkingSheet in a demo build', () => {
  it('replaces the reassurance line with the recording sentence', () => {
    state.demo = true;
    mount();
    expect(document.body.textContent).toContain(DEMO_REASSURANCE_LEAD);
    expect(document.body.textContent).toContain(DEMO_REASSURANCE_REST);
    expect(document.body.textContent).not.toContain(runningNote(false));
  });

  it('replaces the started-ago badge with "Playing back"', () => {
    state.demo = true;
    mount();
    expect(document.body.textContent).toContain(DEMO_PLAYING_BACK);
    expect(document.body.textContent).not.toContain('Started');
  });

  it('leaves the done state alone (no running note at all)', () => {
    state.demo = true;
    mount('done');
    expect(document.body.textContent).not.toContain(DEMO_REASSURANCE_LEAD);
    expect(document.body.textContent).not.toContain(DEMO_PLAYING_BACK);
  });
});
