/**
 * audit-search-400 (audit 2026-10-16, finding 2): the palette (desktop ⌘K and the phone's Search) lists at most
 * 400 notes and folders, but it took the first 400 of the whole folder, not the first 400 that match, and it left
 * out of Inside notes every note anywhere in the folder whose name matched. A match past entry 400 vanished.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { SearchHit } from '@/data/types';
import { useUi } from '@/app/ui-store';
import { loadingSources } from '@/testing/loading-sources';
import { Palette } from './Palette';

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  useUi.setState({ paletteOpen: false });
});

const note = (name: string) => ({ path: `Resources/${name}.md`, name: `${name}.md`, type: 'file', kind: 'note', modified: 0, created: 0 });

async function palette(names: string[], hits: SearchHit[], query: string): Promise<void> {
  const base = loadingSources();
  const tree = [{ path: 'Resources', name: 'Resources', type: 'folder', modified: 0, created: 0, children: names.map(note) }];
  const vault = new Proxy(base.vault, {
    get: (t, k) => (k === 'tree' ? async () => tree : k === 'search' ? async () => hits : Reflect.get(t, k)),
  });
  useUi.setState({ paletteOpen: true });
  render(<MemoryRouter><DataProvider sources={{ ...base, vault } as Sources}><Palette /></DataProvider></MemoryRouter>);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  fireEvent.change(screen.getByRole('combobox'), { target: { value: query } });
  await act(async () => { await vi.advanceTimersByTimeAsync(200); });
}

const fillers = (n: number) => Array.from({ length: n }, (_, i) => `Filler ${String(i + 1).padStart(3, '0')}`);

it('AC1 audit-search-400-name-past-400: a note past the first 400 entries whose name matches is listed by name', async () => {
  // 450 entries before it (the folder itself counts as one), and the search finds nothing inside notes.
  await palette([...fillers(450), 'Zebra plan'], [], 'zebra');
  expect(within(screen.getByRole('listbox')).getByRole('option', { name: /Zebra plan/ })).toBeInTheDocument();
});

it('AC2 audit-search-400-inside-same-slice: with more than 400 name matches, one not listed by name shows under Inside notes', async () => {
  const names = Array.from({ length: 401 }, (_, i) => `Plan ${String(i + 1).padStart(3, '0')}`);
  const last = note('Plan 401');
  await palette(names, [{ path: last.path, title: 'Plan 401', snippet: 'A plan.' }], 'plan');
  const inside = screen.getByRole('group', { name: 'Inside notes' });
  expect(within(inside).getByRole('option', { name: /Plan 401/ })).toBeInTheDocument();
});

it('R1 audit-search-400-words-any-order: past 400 entries, every word matches in any order, whatever the case and spacing', async () => {
  await palette([...fillers(450), 'Zebra green plan'], [], '  PLAN   zebra ');
  expect(within(screen.getByRole('listbox')).getByRole('option', { name: /Zebra green plan/ })).toBeInTheDocument();
});

it('R3 audit-search-400-inside-only-unlisted: a hit listed by name stays out of Inside notes, one past the cap shows there', async () => {
  const names = Array.from({ length: 401 }, (_, i) => `Plan ${String(i + 1).padStart(3, '0')} zebra`);
  const hit = (name: string): SearchHit => ({ path: note(name).path, title: name, snippet: 'A plan.' });
  await palette(names, [hit('Plan 001 zebra'), hit('Plan 401 zebra')], 'Zebra  plan');
  const inside = screen.getByRole('group', { name: 'Inside notes' });
  expect(within(inside).getByRole('option', { name: /Plan 401 zebra/ })).toBeInTheDocument();
  expect(within(inside).queryByRole('option', { name: /Plan 001 zebra/ })).toBeNull();
});
