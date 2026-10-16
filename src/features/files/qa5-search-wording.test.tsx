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

type Deferred = { resolve: (h: SearchHit[]) => void; reject: (e: unknown) => void };

/** A panel whose every search waits until the test answers it (queries in call order). */
function pending() {
  const calls: { q: string; d: Deferred }[] = [];
  const base = loadingSources();
  const vault = new Proxy(base.vault, {
    get: (t, k) =>
      k === 'search'
        ? (q: string) => new Promise<SearchHit[]>((resolve, reject) => calls.push({ q, d: { resolve, reject } }))
        : Reflect.get(t, k),
  });
  render(
    <MemoryRouter>
      <DataProvider sources={{ ...base, vault } as Sources}>
        <SearchPanel />
      </DataProvider>
    </MemoryRouter>,
  );
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const type = async (value: string) => {
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search your notes and files' }), { target: { value } });
    await act(async () => { await vi.advanceTimersByTimeAsync(150); });
  };
  const answer = (i: number): Deferred => {
    const c = calls[i];
    if (!c) throw new Error(`no search ${i}`);
    return c.d;
  };
  return { calls, answer, type, status: () => screen.getByRole('status') };
}

const HINT = 'Names, summaries and what notes say.';

describe('qa5-search-wording: panel states keep their words (R4)', () => {
  it.each([['empty', ''], ['whitespace', '   ']])('R4 %s input says the hint, not the sentence', async (_n, value) => {
    const p = pending();
    await p.type(value);
    expect(p.status()).toHaveTextContent(HINT);
    expect(p.status()).not.toHaveTextContent(NOTHING);
    expect(p.calls).toHaveLength(0);
  });

  it('R4 pending search says "Searching…", not the sentence', async () => {
    const p = pending();
    await p.type('zzzz');
    expect(p.status()).toHaveTextContent('Searching…');
    expect(p.status()).not.toHaveTextContent(NOTHING);
  });

  it('R4 cleared input after a no-result search goes back to the hint', async () => {
    const p = pending();
    await p.type('zzzz');
    await act(async () => p.answer(0).resolve([]));
    expect(p.status()).toHaveTextContent(NOTHING);
    await p.type('');
    expect(p.status()).toHaveTextContent(HINT);
    expect(p.status()).not.toHaveTextContent(NOTHING);
  });

  it('R4 a failed search keeps its own sentence', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const p = pending();
    await p.type('zzzz');
    await act(async () => p.answer(0).reject(new Error('down')));
    expect(p.status()).toHaveTextContent('Search did not work. Try again.');
    expect(p.status()).not.toHaveTextContent(NOTHING);
    err.mockRestore();
  });

  it('R4 an older empty answer arriving after a newer query never shows for it', async () => {
    const p = pending();
    await p.type('zz');
    await p.type('zzz');
    expect(p.calls.map((c) => c.q)).toEqual(['zz', 'zzz']);
    await act(async () => p.answer(0).resolve([]));
    expect(p.status()).toHaveTextContent('Searching…');
    expect(p.status()).not.toHaveTextContent(NOTHING);
    await act(async () => p.answer(1).resolve([hit(1)]));
    expect(p.status()).toHaveTextContent('1 match');
    expect(p.status()).not.toHaveTextContent(NOTHING);
  });
});

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
