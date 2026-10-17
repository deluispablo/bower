/**
 * qa7-a11y-empty (qa-7 Codex F1, Claude F8): with no result, Search and the command palette still expose the
 * "Suggestions" listbox with no option, and the combobox stays expanded. The WAI-ARIA APG combobox pattern: the popup is
 * hidden and `aria-expanded` is false while there is nothing to choose; the no-result sentence and Clear the search stay
 * outside it (qa4-empty-listbox).
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import { useUi } from '@/app/ui-store';
import { nothingFound } from '@/app/words';
import { loadingSources } from '@/testing/loading-sources';
import { Palette } from './Palette';

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  useUi.setState({ paletteOpen: false });
});

async function typed(query: string): Promise<void> {
  const base = loadingSources();
  const file = { path: 'Resources/Cooking/Weeknight curry.md', name: 'Weeknight curry.md', type: 'file', kind: 'note', modified: 0, created: 0 };
  const tree = [{ path: 'Resources', name: 'Resources', type: 'folder', modified: 0, created: 0, children: [file] }];
  const vault = new Proxy(base.vault, {
    get: (t, k) => (k === 'tree' ? async () => tree : k === 'search' ? async () => [] : Reflect.get(t, k)),
  });
  useUi.setState({ paletteOpen: true });
  render(
    <MemoryRouter>
      <DataProvider sources={{ ...base, vault } as Sources}>
        <Palette />
      </DataProvider>
    </MemoryRouter>,
  );
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  fireEvent.change(screen.getByRole('combobox'), { target: { value: query } });
  await act(async () => { await vi.advanceTimersByTimeAsync(200); });
}

describe('qa7-a11y-empty: no empty Suggestions listbox', () => {
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
});
