/**
 * qa6-a11y (qa-6 Claude F7): a list with no items is not rendered, so a screen reader never announces "list, 0 items"
 * (the principle of qa4-empty-listbox): the run sheet's question slot and the Search panel with nothing found.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { RunState } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { SearchPanel } from '@/features/files/SearchPanel';
import { Questions } from './Home';

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const AT = 1_800_000_000_000;
const going: RunState = { id: 'empty-run', scope: 'all', phase: 'reading', requestedAt: AT, phaseAt: AT + 100, total: 1, seen: false };

function withVault(methods: Record<string, unknown>, ui: React.ReactNode): void {
  const base = loadingSources();
  const vault = new Proxy(base.vault, { get: (t, k) => (typeof k === 'string' && k in methods ? methods[k] : Reflect.get(t, k)) });
  render(
    <MemoryRouter>
      <DataProvider sources={{ ...base, vault } as Sources}>{ui}</DataProvider>
    </MemoryRouter>,
  );
}

const emptyLists = (): string[] => screen.queryAllByRole('list').filter((l) => l.querySelectorAll('li').length === 0).map((l) => l.outerHTML.slice(0, 80));

describe('qa6-a11y: no empty lists', () => {
  it('AC4 qa6-a11y-sheet-no-empty-list: the run sheet with no question holds no list', async () => {
    withVault({ questions: async () => [], tree: async () => [] }, <Questions run={going} />);
    await act(async () => { await Promise.resolve(); });
    expect(emptyLists()).toEqual([]);
  });

  it('AC4 qa6-a11y-search-no-empty-list: the Search panel with nothing found holds no list', async () => {
    withVault({ search: async () => [] }, <SearchPanel />);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search your notes and files' }), { target: { value: 'zzz' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(150); });
    // Positive control: the search answered with nothing found (the sentence itself is qa6-search-help's).
    expect(screen.getByRole('status')).toHaveTextContent(/^Nothing /);
    expect(emptyLists()).toEqual([]);
  });
});
