// @vitest-environment jsdom

/**
 * What a run means (R-MEAN-2): the two parts, their links, and nothing when
 * the run reported none. Hermetic: the folder listing is stubbed.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RunOutcome } from '../src/run-outcome.js';

const byPath = new Map([
  ['Projects/Flat/Orchard Row.md', { id: 'id-1' }],
  ['Projects/Flat/Mill Lane.md', { id: 'id-2' }],
]);

vi.mock('../src/vault-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/vault-store.js')>()),
  useVault: () => ({ index: { byPath } }),
}));

const { RunMeaning, meaningLink } =
  await import('../src/components/run-meaning.js');

function outcome(extra: Partial<RunOutcome>): RunOutcome {
  return {
    state: 'done',
    startedAt: '2026-09-29T10:00:00.000Z',
    filed: 0,
    created: 0,
    updated: 0,
    needsYou: 0,
    requests: 0,
    left: 0,
    items: [],
    ...extra,
  };
}

let root: HTMLDivElement | null = null;

function mount(value: RunOutcome, onNavigate?: () => void): HTMLElement {
  root = document.createElement('div');
  document.body.append(root);
  const props =
    onNavigate === undefined
      ? { outcome: value }
      : { outcome: value, onNavigate };
  void act(() => {
    render(h(RunMeaning, props), root as HTMLElement);
  });
  return root;
}

afterEach(() => {
  root?.remove();
  root = null;
});

describe('RunMeaning', () => {
  it('shows both parts, each note a link that opens it', () => {
    const onNavigate = vi.fn();
    const el = mount(
      outcome({
        disagree: [
          {
            a: 'Projects/Flat/Orchard Row.md',
            b: 'Projects/Flat/Mill Lane.md',
            reason: 'the free-from dates differ',
          },
        ],
        next: [
          { path: 'Projects/Flat/Mill Lane.md', action: 'Book a viewing at' },
          { action: 'Say what the floor plan is' },
        ],
      }),
      onNavigate,
    );
    expect(el.textContent).toContain('Things that disagree');
    expect(el.textContent).toContain('Next for you');
    const links = [...el.querySelectorAll('a')];
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/note/id-1',
      '/note/id-2',
      '/note/id-2',
    ]);
    links[0]?.click();
    expect(onNavigate).toHaveBeenCalled();
    expect(el.querySelectorAll('.run-meaning-next li')).toHaveLength(2);
  });

  it('shows nothing when the run reported neither', () => {
    expect(mount(outcome({})).innerHTML).toBe('');
  });

  it('shows a note the listing lacks as plain text', () => {
    const el = mount(
      outcome({ next: [{ path: 'Gone/Note.md', action: 'Read' }] }),
    );
    expect(el.querySelector('a')).toBeNull();
    expect(el.textContent).toContain('Note');
    expect(meaningLink(null, 'Gone/Note.md')).toEqual({ title: 'Note' });
  });
});
