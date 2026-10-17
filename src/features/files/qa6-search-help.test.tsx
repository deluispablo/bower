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
import type { SearchHit } from '@/data/types';
import { Palette } from '@/features/palette/Palette';
import { loadingSources } from '@/testing/loading-sources';
import { SearchPanel } from './SearchPanel';

const SAID = 'Nothing called "zebra quilt" in your notes or their names. Try fewer letters.';

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  useUi.setState({ paletteOpen: false });
});

type Search = (q: string) => Promise<SearchHit[]>;

function mount(ui: 'panel' | 'palette', search: Search = async () => []): void {
  const base = loadingSources();
  const vault = new Proxy(base.vault, {
    get: (t, k) => (k === 'tree' ? async () => [] : k === 'search' ? search : Reflect.get(t, k)),
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

async function typeIn(ui: 'panel' | 'palette', value: string): Promise<void> {
  fireEvent.change(box(ui), { target: { value } });
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
}

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
    const button = clear[0] as HTMLElement;
    // A real click gives the button the keyboard first, so the box must take it back.
    act(() => button.focus());
    expect(box(ui)).not.toHaveFocus();
    fireEvent.click(button);
    expect(box(ui)).toHaveValue('');
    expect(box(ui)).toHaveFocus();
  });

  it(`AC2 qa6-search-help-enter-${ui}: Enter on the button is not swallowed by the palette's list (native activation stays)`, async () => {
    mount(ui);
    await typeIn(ui, 'zebra quilt');
    const button = screen.getByRole('button', { name: 'Clear the search' });
    // fireEvent returns false when something called preventDefault, which would stop a real Enter from clicking.
    expect(fireEvent.keyDown(button, { key: 'Enter' })).toBe(true);
  });

  it(`AC1 qa6-search-help-literal-${ui}: a new query with quotes and markup is said as typed, trimmed`, async () => {
    mount(ui);
    await typeIn(ui, 'zebra quilt');
    expect(screen.getByRole('status')).toHaveTextContent(SAID);
    await typeIn(ui, ' <i>"tea" & cake</i>  ');
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Nothing called "<i>"tea" & cake</i>" in your notes or their names. Try fewer letters.');
    expect(status).not.toHaveTextContent('zebra');
  });

  it(`R3 qa6-search-help-only-when-nothing-${ui}: no Clear the search before typing, for spaces, while searching, on failure, when found, after clearing`, async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const tidy: SearchHit = { path: 'Resources/Tidy.md', title: 'Tidy', snippet: 'tidy' };
    // The query decides the answer: "wait" never answers, "fail" fails, "tidy" finds one note, anything else nothing.
    mount(ui, (q) =>
      q.includes('wait') ? new Promise<SearchHit[]>(() => {}) : q.includes('fail') ? Promise.reject(new Error('down')) : Promise.resolve(q === 'tidy' ? [tidy] : []),
    );
    const clear = () => screen.queryAllByRole('button', { name: 'Clear the search' });
    expect(clear()).toHaveLength(0);
    await typeIn(ui, '   ');
    expect(clear()).toHaveLength(0);
    await typeIn(ui, 'zebra wait');
    expect(screen.getByRole('status')).not.toHaveTextContent('Nothing called');
    expect(clear()).toHaveLength(0);
    await typeIn(ui, 'zebra fail');
    expect(screen.getByRole('status')).toHaveTextContent(/did not/);
    expect(clear()).toHaveLength(0);
    await typeIn(ui, 'tidy');
    expect(screen.getByRole('status')).not.toHaveTextContent('Nothing called');
    expect(clear()).toHaveLength(0);
    await typeIn(ui, 'zebra quilt');
    expect(clear()).toHaveLength(1);
    await typeIn(ui, '');
    expect(clear()).toHaveLength(0);
    err.mockRestore();
  });
});
