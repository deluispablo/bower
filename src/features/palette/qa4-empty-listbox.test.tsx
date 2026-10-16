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

describe('qa4-empty-listbox: nothing found is said outside the listbox', () => {
  it('AC1 empty-message-in-status: the message is a live status, and the listbox holds no text and no other role', async () => {
    await typed('zzzz-no-such-note');
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(NOTHING);
    const list = screen.getByRole('listbox');
    expect(list).not.toContainElement(status);
    expect(within(list).queryByText(NOTHING)).toBeNull();
    expect(within(list).queryAllByRole('option')).toHaveLength(0);
  });

  it('AC2 status-quiet-when-found: with something found, the listbox has its options and the status says nothing', async () => {
    await typed('curry');
    // Positive control: the note is an option of the listbox.
    expect(within(screen.getByRole('listbox')).getByRole('option', { name: /Weeknight curry/ })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });
});
