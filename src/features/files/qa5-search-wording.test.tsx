/**
 * qa5-search-wording (qa-5 Claude F4): with nothing found, the Search panel says what the command palette says, one
 * sentence from one place, instead of "0 matches". Found results keep their count.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { SearchHit } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { SearchPanel } from './SearchPanel';

// The palette's sentence (src/features/palette/Palette.tsx; e2e/qa4-empty-listbox.spec.ts).
const NOTHING = 'Nothing by that name or in your notes.';

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const hit = (n: number): SearchHit => ({ path: `Resources/Cooking/Curry ${n}.md`, title: `Curry ${n}`, snippet: 'Weeknight curry for Alex' });

async function searched(query: string, hits: SearchHit[]): Promise<HTMLElement> {
  const base = loadingSources();
  const vault = new Proxy(base.vault, { get: (t, k) => (k === 'search' ? async () => hits : Reflect.get(t, k)) });
  render(
    <MemoryRouter>
      <DataProvider sources={{ ...base, vault } as Sources}>
        <SearchPanel />
      </DataProvider>
    </MemoryRouter>,
  );
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search your notes and files' }), { target: { value: query } });
  await act(async () => { await vi.advanceTimersByTimeAsync(150); });
  return screen.getByRole('status');
}

describe('qa5-search-wording: one sentence for nothing found', () => {
  it('AC1 search-panel-nothing: with no match the panel says the palette\'s sentence, never "0 matches"', async () => {
    const status = await searched('zzzz', []);
    expect(status).toHaveTextContent(NOTHING);
    expect(status).not.toHaveTextContent(/\b0 matches\b/);
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it.each([[1, '1 match'], [2, '2 matches']] as const)('R3 search-panel-count: %i found still says "%s"', async (n, words) => {
    const status = await searched('curry', Array.from({ length: n }, (_, i) => hit(i + 1)));
    expect(status).toHaveTextContent(words);
    expect(screen.getAllByRole('listitem')).toHaveLength(n);
  });
});
