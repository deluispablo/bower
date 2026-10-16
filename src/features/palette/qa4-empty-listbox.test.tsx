/**
 * qa4-empty-listbox (qa-4 Codex F4, accessibility): with nothing found, Search and the command palette say so in a
 * live status outside the list of suggestions, so the listbox holds options or nothing (WAI-ARIA APG combobox:
 * a listbox owns only options and groups; ARIA 1.2 "listbox" required owned elements).
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import { useUi } from '@/app/ui-store';
import { loadingSources } from '@/testing/loading-sources';
import { Palette } from './Palette';

const NOTHING = 'Nothing by that name or in your notes.';

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  useUi.setState({ paletteOpen: false });
});

type Search = () => Promise<never[]>;

async function mount(search: Search = async () => []): Promise<void> {
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
      </DataProvider>
    </MemoryRouter>,
  );
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
}

async function type(query: string): Promise<void> {
  fireEvent.change(screen.getByRole('combobox'), { target: { value: query } });
  await act(async () => { await vi.advanceTimersByTimeAsync(200); });
}

async function typed(query: string, search?: Search): Promise<void> {
  await mount(search);
  await type(query);
}

/** The message sits in the status, outside the listbox, and the listbox holds no text. */
function saidOutside(text: string): void {
  const status = screen.getByRole('status');
  expect(status).toHaveTextContent(text);
  const list = screen.getByRole('listbox');
  expect(list).not.toContainElement(status);
  expect(within(list).queryByText(text)).toBeNull();
}

describe('qa4-empty-listbox: nothing found is said outside the listbox', () => {
  it('AC1 empty-message-in-status: the message is a live status, and the listbox holds no text and no other role', async () => {
    await typed('zzzz-no-such-note');
    saidOutside(NOTHING);
    expect(within(screen.getByRole('listbox')).queryAllByRole('option')).toHaveLength(0);
  });

  it('AC2 status-quiet-when-found: with something found, the listbox has its options and the status says nothing', async () => {
    await typed('curry');
    // Positive control: the note is an option of the listbox.
    expect(within(screen.getByRole('listbox')).getByRole('option', { name: /Weeknight curry/ })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('R2 status-persists: one status element lives through found, empty and found again', async () => {
    await typed('curry');
    const status = screen.getByRole('status');
    await type('zzzz-no-such-note');
    expect(screen.getByRole('status')).toBe(status);
    expect(status).toHaveTextContent(NOTHING);
    await type('curry');
    expect(screen.getByRole('status')).toBe(status);
    expect(status).toHaveTextContent('');
  });

  it('R3 status-polite: the status is polite, never assertive', async () => {
    await typed('zzzz-no-such-note');
    const status = screen.getByRole('status');
    // role=status is implicitly polite; an explicit aria-live must agree.
    expect(status.getAttribute('aria-live') ?? 'polite').toBe('polite');
    expect(status.closest('[aria-live="assertive"]')).toBeNull();
  });

  it('R5 pending-in-status: while the search is out, "Looking in your notes…" is the status, outside the listbox', async () => {
    await typed('zzzz-no-such-note', () => new Promise<never[]>(() => {}));
    saidOutside('Looking in your notes…');
  });

  it('R5 failed-in-status: when the search fails, its message is the status, outside the listbox', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await typed('zzzz-no-such-note', () => Promise.reject(new Error('down')));
    saidOutside('Search did not answer. Names still work; try the words again in a moment.');
    err.mockRestore();
  });
});
