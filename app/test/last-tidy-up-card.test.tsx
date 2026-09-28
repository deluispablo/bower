// @vitest-environment jsdom

/**
 * The Last tidy-up card keeps the previous run's line while the next run
 * goes (#498, #321): `run` is the run store's `lastFinished`, which
 * already stays put once a new run starts (`lastFinishedRun`,
 * `run-store.tsx`, covered directly in `run-store.test.ts`) — this is the
 * render-level check the issue also asked for, on the component that
 * actually decides what the card shows.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import type { Run } from '../src/api.js';
import { LastTidyUpCard } from '../src/routes/home.js';

const DONE_RUN: Run = {
  state: 'done',
  requestedAt: '2026-09-27T08:00:00Z',
  finishedAt: '2026-09-27T08:05:00Z',
  processed: [
    '0-Inbox/Lease agreement 2026.pdf',
    '0-Inbox/Scan of a letter.jpg',
    '0-Inbox/Bower - 2026-09-27 0815 What do I still need.md',
  ],
};

let root: HTMLDivElement;

afterEach(() => {
  render(null, root);
  root.remove();
});

async function mount(
  state: Parameters<typeof LastTidyUpCard>[0]['state'],
  run: Run | null,
): Promise<void> {
  root = document.createElement('div');
  document.body.append(root);
  await act(() => {
    render(h(LastTidyUpCard, { state, run, now: Date.now() }), root);
  });
}

describe('LastTidyUpCard', () => {
  it('says "No tidy-up yet" only once nothing has ever finished', async () => {
    await mount('empty', null);
    expect(root.textContent).toContain('No tidy-up yet');
  });

  it("keeps the previous run's line while a new run is running (#498)", async () => {
    await mount('running', DONE_RUN);
    expect(root.textContent).not.toContain('No tidy-up yet');
    expect(root.textContent).toContain('2 filed');
    expect(root.textContent).toContain('1 answered');
  });

  it("keeps the previous run's line after a new run fails (#498)", async () => {
    await mount('failed', DONE_RUN);
    expect(root.textContent).not.toContain('No tidy-up yet');
    expect(root.textContent).toContain('2 filed');
  });

  it('shows a skeleton while loading, never "No tidy-up yet" (#322)', async () => {
    await mount('loading', null);
    expect(root.textContent).not.toContain('No tidy-up yet');
    expect(root.querySelector('.home-skeleton-line')).not.toBeNull();
  });
});
