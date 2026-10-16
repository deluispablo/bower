/**
 * qa6-search-help (designer qa-6 note 4, design spec d-v2-21): with nothing found, the Search panel and the command
 * palette (the phone's Search) name what was typed, offer a next step, and share one "Clear the search" button.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUi } from '@/app/ui-store';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import { Palette } from '@/features/palette/Palette';
import { loadingSources } from '@/testing/loading-sources';
import { SearchPanel } from './SearchPanel';

const SAID = 'Nothing called "zebra quilt" in your notes or their names. Try fewer letters.';

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  useUi.setState({ paletteOpen: false });
});

function mount(ui: 'panel' | 'palette'): void {
  const base = loadingSources();
  const vault = new Proxy(base.vault, {
    get: (t, k) => (k === 'tree' ? async () => [] : k === 'search' ? async () => [] : Reflect.get(t, k)),
  });
  if (ui === 'palette') useUi.setState({ paletteOpen: true });
  render(
    <MemoryRouter>
      <DataProvider sources={{ ...base, vault } as Sources}>{ui === 'panel' ? <SearchPanel /> : <Palette />}</DataProvider>
    </MemoryRouter>,
  );
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
}

const box = (ui: 'panel' | 'palette'): HTMLElement =>
  ui === 'panel' ? screen.getByRole('searchbox', { name: 'Search your notes and files' }) : screen.getByRole('combobox');

describe.each(['panel', 'palette'] as const)('qa6-search-help in the %s', (ui) => {
  it(`AC1 qa6-search-help-words-${ui}: no result names the query and says what to try`, async () => {
    mount(ui);
    fireEvent.change(box(ui), { target: { value: '  zebra quilt ' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(screen.getByRole('status')).toHaveTextContent(SAID);
  });

  it(`AC2 qa6-search-help-clear-${ui}: one Clear the search button empties the box and gives it the keyboard`, async () => {
    mount(ui);
    fireEvent.change(box(ui), { target: { value: 'zebra quilt' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    const clear = screen.getAllByRole('button', { name: 'Clear the search' });
    expect(clear).toHaveLength(1);
    fireEvent.click(clear[0] as HTMLElement);
    expect(box(ui)).toHaveValue('');
    expect(box(ui)).toHaveFocus();
  });
});
