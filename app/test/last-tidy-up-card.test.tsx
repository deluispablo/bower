// @vitest-environment jsdom

/**
 * The Last tidy-up card (#498, #321, #754): `run` is the run store's
 * `lastFinished` (or the newest of `GET /runs`); the card shows only the time
 * and the counts line, "Running · n min" while a run goes, and "Partly done"
 * after a partial one. "No tidy-up yet" only when there is no run at all.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Run } from '../src/api.js';
import { LastTidyUpCard } from '../src/routes/home.js';

const DONE_RUN: Run = {
  state: 'done',
  requestedAt: '2026-09-27T08:00:00Z',
  finishedAt: '2026-09-27T08:05:00Z',
  processed: [
    '0-Inbox/Lease agreement 2026.pdf',
    '0-Inbox/Scan of a letter.jpg',
  ],
  items: [
    {
      path: '0-Inbox/Lease agreement 2026.pdf',
      kind: 'file',
      to: '2-Areas/Home/Lease agreement 2026.pdf',
    },
    {
      path: '0-Inbox/Scan of a letter.jpg',
      kind: 'file',
      to: '2-Areas/Home/Scan of a letter.jpg',
    },
  ],
  created: [
    '2-Areas/Home/One.md',
    '2-Areas/Home/Two.md',
    '2-Areas/Home/Three.md',
  ],
  updated: [{ path: '2-Areas/Home/Four.md' }, { path: '2-Areas/Home/Five.md' }],
  setAside: [{ path: '0-Inbox/IMG_1.heic', reason: 'kept-not-read' }],
};

const PARTIAL_RUN: Run = {
  state: 'failed',
  requestedAt: '2026-09-27T08:00:00Z',
  finishedAt: '2026-09-27T08:05:00Z',
  reason: 'drive_unavailable',
  created: [
    '2-Areas/Home/One.md',
    '2-Areas/Home/Two.md',
    '2-Areas/Home/Three.md',
  ],
  left: [
    '0-Inbox/a.pdf',
    '0-Inbox/b.pdf',
    '0-Inbox/c.pdf',
    '0-Inbox/d.pdf',
    '0-Inbox/e.pdf',
  ],
};

const NOW = Date.parse('2026-09-27T08:09:00Z');

let root: HTMLDivElement;

afterEach(() => {
  render(null, root);
  root.remove();
});

async function mount(
  props: Partial<Parameters<typeof LastTidyUpCard>[0]> & {
    state: Parameters<typeof LastTidyUpCard>[0]['state'];
    run: Run | null;
  },
): Promise<void> {
  root = document.createElement('div');
  document.body.append(root);
  await act(() => {
    render(h(LastTidyUpCard, { now: NOW, ...props }), root);
  });
}

describe('LastTidyUpCard', () => {
  it('says "Not yet" only once nothing has ever finished (S-HM-10)', async () => {
    await mount({ state: 'empty', run: null });
    expect(root.textContent).toBe('Last tidy-upNot yet');
  });

  it('done: the time and the counts line, nothing else (R-HOME-0, R-HOME-1)', async () => {
    await mount({ state: 'done', run: DONE_RUN });
    expect(root.textContent).toBe(
      'Last tidy-up4 min ago2 filed · 3 new · 2 updated · 1 needs you',
    );
    expect(root.querySelector('a')?.getAttribute('href')).toBe('/just-filed');
  });

  it('a run with nothing to list opens the Bower tab', async () => {
    await mount({
      state: 'done',
      run: { ...DONE_RUN, items: [], created: [], updated: [], setAside: [] },
    });
    expect(root.textContent).toContain('Nothing new');
    expect(root.querySelector('a')?.getAttribute('href')).toBe(
      '/bower?show=activity',
    );
  });

  it('running: Tidy-up, Running · n min and the count of things', async () => {
    await mount({
      state: 'running',
      run: DONE_RUN,
      active: { startedAt: '2026-09-27T08:07:00Z', total: 5 },
    });
    expect(root.textContent).toBe('Tidy-upRunning · 2 min5 things');
  });

  it('partial: Partly done, the counts, and a tap opens the sheet (R-HOME-2)', async () => {
    const onOpenSheet = vi.fn();
    await mount({ state: 'partial', run: PARTIAL_RUN, onOpenSheet });
    expect(root.textContent).toBe(
      'Last tidy-upPartly done3 new · 5 still in your inbox',
    );
    const card = root.querySelector('button');
    expect(card?.querySelector('.home-tile-partial')).not.toBeNull();
    await act(() => {
      card?.click();
    });
    expect(onOpenSheet).toHaveBeenCalledTimes(1);
  });

  it('failed: never "No tidy-up yet" once a run exists (R-HOME-3)', async () => {
    await mount({
      state: 'failed',
      run: { ...PARTIAL_RUN, created: [], left: [] },
    });
    expect(root.textContent).not.toContain('Not yet');
    // S-HM-10 failed: the failed Badge "Did not finish".
    expect(root.querySelector('.badge-failed')?.textContent).toBe(
      'Did not finish',
    );
  });

  it('shows a skeleton while loading, never "No tidy-up yet" (#322)', async () => {
    await mount({ state: 'loading', run: null });
    expect(root.textContent).not.toContain('No tidy-up yet');
    expect(root.querySelector('.home-skeleton-line')).not.toBeNull();
  });
});
