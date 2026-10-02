// @vitest-environment jsdom

/**
 * Activity on the Bower tab (#915, board BW-Activity-375, R-BW-5): one card
 * per run titled with its day and time and its length, a Badge, the counts
 * ("1 filed."), each file it took as a ListRow, "and N more" past two rows,
 * and never a relative time ("22 h ago": those are for Home only, K-16).
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Run } from '../src/api.js';

const NOW = Date.parse('2026-09-30T11:10:00.000Z');

const store: {
  phase: string;
  run: Run | null;
  keptCount: number | null;
  openSheet: () => void;
} = { phase: 'idle', run: null, keptCount: null, openSheet: () => {} };

vi.mock('../src/run-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/run-store.js')>()),
  useRun: () => ({ ...store, now: NOW }),
}));

vi.mock('../src/vault-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/vault-store.js')>()),
  useVault: () => ({ files: [], index: null }),
}));

const { ActivityPanel } = await import('../src/components/activity-panel.js');

function run(finishedAt: string, names: string[]): Run {
  return {
    state: 'done',
    requestedAt: new Date(Date.parse(finishedAt) - 120_000).toISOString(),
    startedAt: new Date(Date.parse(finishedAt) - 120_000).toISOString(),
    finishedAt,
    processed: names.map((name) => `0-Inbox/${name}`),
    items: names.map((name) => ({ path: `0-Inbox/${name}`, kind: 'file' })),
  };
}

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('div');
  document.body.append(root);
});

afterEach(() => {
  render(null, root);
  root.remove();
});

function mount(runs: Run[]): void {
  void act(() => {
    render(h(ActivityPanel, { load: { status: 'ready', runs } }), root);
  });
}

describe('ActivityPanel (#915)', () => {
  it('has no relative time anywhere ("ago", "just now")', () => {
    mount([
      run('2026-09-30T10:58:00.000Z', ['Passport copy.pdf']),
      run('2026-09-29T14:03:00.000Z', ['Lease.pdf', 'Notes.md']),
    ]);
    const text = root.textContent ?? '';
    expect(text).not.toMatch(/\bago\b/);
    expect(text).not.toMatch(/just now/i);
    expect(text).toContain('1 filed.');
    expect(text).toContain('2 min');
  });

  it('draws each file as a ListRow with its kind, and "and N more" past two', () => {
    mount([
      run('2026-09-29T14:03:00.000Z', [
        'Passport copy.pdf',
        'Lease.pdf',
        'Receipt.pdf',
        'Bills.pdf',
      ]),
    ]);
    const rows = root.querySelectorAll('.list-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('Passport copy');
    expect(rows[0]?.textContent).toContain('PDF');
    const more = [...root.querySelectorAll('button')].find(
      (b) => b.textContent === 'and 2 more',
    );
    expect(more).toBeDefined();
    void act(() => {
      more?.click();
    });
    expect(root.querySelectorAll('.list-row')).toHaveLength(4);
  });

  it('shows the run state as a Badge', () => {
    mount([run('2026-09-30T10:58:00.000Z', ['Passport copy.pdf'])]);
    expect(root.querySelector('.badge-done')?.textContent).toBe('Done');
  });
});

describe('Activity while a tidy-up runs (R-HOME-3, #1001)', () => {
  afterEach(() => {
    store.phase = 'idle';
    store.run = null;
    store.keptCount = null;
    store.openSheet = () => {};
  });

  function running(): void {
    store.phase = 'running';
    store.run = {
      state: 'running',
      requestedAt: new Date(NOW - 2 * 60_000 - 20_000).toISOString(),
      startedAt: new Date(NOW - 60_000).toISOString(),
      total: 3,
    };
  }

  it('shows the running run first, never "No tidy-up yet"', () => {
    running();
    mount([]);
    const text = root.textContent ?? '';
    expect(text).not.toContain('No tidy-up yet');
    const first = root.querySelector('.activity-card');
    expect(first?.classList.contains('activity-card--running')).toBe(true);
    expect(first?.textContent).toContain('Running');
    expect(first?.textContent).toContain('Tidying up 3 things.');
    expect(first?.textContent).toMatch(/Started \d\d:\d\d · 2 min so far/);
  });

  it('puts it above the finished runs and opens the sheet', () => {
    running();
    store.keptCount = 4;
    const openSheet = vi.fn();
    store.openSheet = openSheet;
    mount([run('2026-09-30T10:58:00.000Z', ['Passport copy.pdf'])]);
    const cards = root.querySelectorAll('.activity-card');
    expect(cards).toHaveLength(2);
    expect(cards[0]?.textContent).toContain('Tidying up 4 things.');
    root
      .querySelector<HTMLButtonElement>('.activity-card--running button')
      ?.click();
    expect(openSheet).toHaveBeenCalledTimes(1);
  });

  it('shows the running run while the history is still loading', () => {
    running();
    void act(() => {
      render(h(ActivityPanel, { load: { status: 'loading' } }), root);
    });
    expect(root.textContent).not.toContain('Reading what Bower did');
    expect(root.querySelector('.activity-card--running')).not.toBeNull();
  });

  it('says nothing of a run once it is over', () => {
    mount([]);
    expect(root.textContent).toContain('No tidy-up yet');
    expect(root.querySelector('.activity-card--running')).toBeNull();
  });
});
