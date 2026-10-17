/**
 * qa7-a11y-empty (qa-7 Codex F1, Claude F8): with no result, Search and the command palette still expose the
 * "Suggestions" listbox with no option, and the combobox stays expanded. The WAI-ARIA APG combobox pattern: the popup is
 * hidden and `aria-expanded` is false while there is nothing to choose; the no-result sentence and Clear the search stay
 * outside it (qa4-empty-listbox).
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { SearchHit } from '@/data/types';
import * as media from '@/ui/media';
import { useUi } from '@/app/ui-store';
import { nothingFound } from '@/app/words';
import { loadingSources } from '@/testing/loading-sources';
import { Palette } from './Palette';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
  useUi.setState({ paletteOpen: false });
});

async function typed(query: string, search: Sources['vault']['search'] = async () => []): Promise<void> {
  const base = loadingSources();
  const file = { path: 'Resources/Cooking/Weeknight curry.md', name: 'Weeknight curry.md', type: 'file', kind: 'note', modified: 0, created: 0 };
  const tree = [{ path: 'Resources', name: 'Resources', type: 'folder', modified: 0, created: 0, children: [file] }];
  const vault = new Proxy(base.vault, {
    get: (t, k) => (k === 'tree' ? async () => tree : k === 'search' ? search : Reflect.get(t, k)),
  });
  useUi.setState({ paletteOpen: true });
  render(
    <MemoryRouter>
      <DataProvider sources={{ ...base, vault } as Sources}>
        <Palette />
        <Routes><Route path="/note/*" element={<p>Opened the selected note</p>} /><Route path="*" element={null} /></Routes>
      </DataProvider>
    </MemoryRouter>,
  );
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  await type(query);
}

async function type(query: string): Promise<void> {
  fireEvent.change(screen.getByRole('combobox'), { target: { value: query } });
  await act(async () => { await vi.advanceTimersByTimeAsync(200); });
}

describe.each([false, true])('qa7-a11y-empty: no empty Suggestions listbox (desktop %s)', (desktop) => {
  beforeEach(() => { vi.spyOn(media, 'useIsDesktop').mockReturnValue(desktop); });
  it('AC2 qa7-a11y-empty-palette: with no result, no listbox is exposed and the combobox is collapsed', async () => {
    await typed('zzqanoresults');
    // Positive control: the search answered with nothing found, and Clear the search is offered.
    expect(screen.getByRole('status')).toHaveTextContent(nothingFound('zzqanoresults'));
    expect(screen.getByRole('button', { name: /Clear the search/ })).toBeVisible();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
  });

  it('AC2 qa7-a11y-empty-palette-found: with a result, the listbox and its options are there and the combobox is expanded', async () => {
    await typed('curry');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Weeknight curry/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true');
  });

  it('AC2 qa7-a11y-empty-palette-transitions: late inside-note results restore the list and keyboard selection', async () => {
    let finish: (hits: SearchHit[]) => void = () => { throw new Error('Search has not started.'); };
    const late = new Promise<SearchHit[]>((resolve) => { finish = resolve; });
    await typed('curry', (q) => q === 'saffron' ? late : Promise.resolve([]));
    const input = screen.getByRole('combobox');
    const status = screen.getByRole('status');
    expect(screen.getByRole('option', { name: /Weeknight curry/ })).toBeVisible();
    expect(input).toHaveAttribute('aria-expanded', 'true');
    for (const q of ['zzqanoresults', 'zzanotherempty']) {
      await type(q);
      expect.soft(screen.queryByRole('listbox')).toBeNull();
      expect.soft(input).toHaveAttribute('aria-expanded', 'false');
      expect(screen.getByRole('status')).toBe(status);
      expect(status).toHaveTextContent(nothingFound(q));
      expect(screen.getByRole('button', { name: /Clear the search/ })).toBeVisible();
    }
    await type('saffron');
    expect(status).toHaveTextContent('Looking in your notes…');
    expect.soft(screen.queryByRole('listbox')).toBeNull();
    expect.soft(input).toHaveAttribute('aria-expanded', 'false');
    await act(async () => {
      finish([{ path: 'Resources/Cooking/Weeknight curry.md', title: 'Weeknight curry', snippet: 'Stir in saffron.' }]);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('listbox')).toBeVisible();
    expect(screen.getByRole('option', { name: /Weeknight curry/ })).toBeVisible();
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('status')).toBe(status);
    expect(status).toBeEmptyDOMElement();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Opened the selected note')).toBeVisible();
  });
});
