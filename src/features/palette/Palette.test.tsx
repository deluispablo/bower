import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import { BowerError } from '@/data/types';
import { useUi } from '@/app/ui-store';
import { loadingSources } from '@/testing/loading-sources';
import { Palette } from './Palette';

afterEach(() => {
  cleanup();
  useUi.setState({ paletteOpen: false });
});

describe('the palette', () => {
  it('says when search fails, instead of looking forever', async () => {
    const base = loadingSources();
    const vault = new Proxy(base.vault, {
      get: (t, k) => (k === 'search' ? () => Promise.reject(new BowerError('offline', "You're offline.")) : Reflect.get(t, k)),
    });
    useUi.setState({ paletteOpen: true });
    render(
      <MemoryRouter>
        <DataProvider sources={{ ...base, vault } as Sources}>
          <Palette />
        </DataProvider>
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByRole('combobox'), 'Tally');
    expect(await screen.findByText(/Search did not answer/)).toBeInTheDocument();
  });

  it('the palette names things as the tree does: no .pdf or .url after a name', async () => {
    const base = loadingSources();
    const file = (path: string, kind: string) => ({ path, name: path.split('/').pop() ?? '', type: 'file', kind, modified: 0, created: 0 });
    const tree = [{ path: 'Resources', name: 'Resources', type: 'folder', modified: 0, created: 0, children: [file('Resources/Lease draft.pdf', 'pdf'), file('Resources/saved-page.example.url', 'link')] }];
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
    await userEvent.type(screen.getByRole('combobox'), 'e');
    expect(await screen.findByText('Lease draft', undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText('saved-page.example')).toBeInTheDocument();
    expect(screen.queryByText(/\.(pdf|url)$/)).toBeNull();
  });
});


describe('the palette and focus', () => {
  it('focus returns to the opener when the palette closes', async () => {
    const base = loadingSources();
    render(
      <MemoryRouter>
        <DataProvider sources={base}>
          <button type="button" onClick={() => useUi.getState().setPalette(true)}>Open it</button>
          <Palette />
        </DataProvider>
      </MemoryRouter>,
    );
    const opener = screen.getByRole('button', { name: 'Open it' });
    opener.focus();
    await userEvent.keyboard('{Enter}');
    await screen.findByRole('combobox');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
    // A choice that does not navigate (a theme) comes back to the opener too.
    await userEvent.keyboard('{Enter}');
    await userEvent.type(await screen.findByRole('combobox'), 'Keep Bower still');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});
