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

vi.mock('../src/run-store.js', () => ({
  useRun: () => ({ phase: 'idle', run: null, now: NOW }),
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
  act(() => {
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
    act(() => {
      more?.click();
    });
    expect(root.querySelectorAll('.list-row')).toHaveLength(4);
  });

  it('shows the run state as a Badge', () => {
    mount([run('2026-09-30T10:58:00.000Z', ['Passport copy.pdf'])]);
    expect(root.querySelector('.badge-done')?.textContent).toBe('Done');
  });
});
