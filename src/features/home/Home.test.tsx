import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { Pile } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { Home } from './Home';

afterEach(cleanup);
describe('Home identity', () => {
  it('Home greets the person who signed in', async () => {
    const base = loadingSources();
    render(<MemoryRouter><DataProvider sources={{ ...base, session: { ...base.session, current: async () => ({ name: 'Sam', email: 'sam@example.com' }) } }}><Home /></DataProvider></MemoryRouter>);
    await waitFor(() => expect(screen.queryByRole('heading', { name: "G'day, Sam" })).not.toBeNull());
    expect(screen.getByRole('link', { name: 'Your account and settings' })).toHaveTextContent('S');
    expect(screen.queryByText(/G'day, Alex/)).toBeNull();
    cleanup();
    render(<MemoryRouter><DataProvider sources={loadingSources()}><Home /></DataProvider></MemoryRouter>);
    expect(screen.queryByText(/Alex/)).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("G'day");
  });
});

describe('a set-aside pile shows its reason in the inbox', () => {
  const at = Date.now();
  const thing = (id: string, extra: Partial<Pile['items'][number]> = {}): Pile['items'][number] => ({ id, name: `${id}.pdf`, kind: 'pdf', origin: 'From this computer', ...extra });
  const PILES: Pile[] = [
    { id: 'changed', path: 'Inbox/Papers', text: 'Papers from Alex', createdAt: at, setAside: 'changed', items: [thing('a'), thing('b', { changed: true })] },
    { id: 'missing', path: 'Inbox/Receipts', text: 'Receipts', createdAt: at - 1, setAside: 'not-arrived', items: [thing('c', { upload: -1 })] },
    { id: 'lists', path: 'Inbox/Letters', text: 'Letters', createdAt: at - 2, setAside: 'declaration', items: [thing('d')] },
    { id: 'unchecked', path: 'Inbox/Scans', text: 'Scans', createdAt: at - 3, setAside: 'not-checked', items: [thing('e')] },
    { id: 'empty', path: 'Inbox/Old', text: '', createdAt: at - 4, setAside: 'empty', items: [] },
    { id: 'ready', path: 'Inbox/Ready', text: 'Ready to file', createdAt: at - 5, items: [thing('f')] },
    { id: 'note', path: 'Inbox/Bins', text: 'Bins go out on Tuesday', createdAt: at - 6, items: [] },
  ];
  const KEEP_OPEN = "This device couldn't keep a copy. Keep Bower open until everything is sent.";

  function home(notice: string | null) {
    const base = loadingSources();
    let current = [...PILES];
    const listeners = new Set<() => void>();
    const retryPile = vi.fn(async () => undefined);
    const removePile = vi.fn(async (id: string) => {
      current = current.filter((p) => p.id !== id);
      for (const cb of listeners) cb();
    });
    const doors: Record<string, unknown> = {
      piles: async () => current,
      retryPile,
      removePile,
      uploadNotice: async () => notice,
      subscribe: (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); },
    };
    const vault = new Proxy({}, { get: (_t, k) => (typeof k === 'string' && k in doors ? doors[k] : Reflect.get(base.vault, k)) }) as Sources['vault'];
    render(<MemoryRouter><DataProvider sources={{ ...base, vault, runs: { ...base.runs, current: async () => null } }}><main id="main" tabIndex={-1}><Home /></main></DataProvider></MemoryRouter>);
    return { retryPile, removePile };
  }
  const rowOf = (name: string): HTMLElement => {
    const row = screen.getByRole('link', { name: new RegExp(name) }).closest('li');
    if (!row) throw new Error(`no row for ${name}`);
    return row;
  };

  it('each set-aside pile says why, with its action; a ready pile says nothing', async () => {
    const { retryPile, removePile } = home(null);
    await screen.findByRole('link', { name: /Papers from Alex/ });
    expect(within(rowOf('Papers from Alex')).getByText('Some of its things changed after they were added. Remove it and add them again.')).toBeVisible();
    expect(within(rowOf('Receipts')).getByText('Some of its things have not arrived yet.')).toBeVisible();
    expect(within(rowOf('Letters')).getByText('Bower found two different lists of what is in this pile. Remove it and add it again.')).toBeVisible();
    expect(within(rowOf('Scans')).getByText('Bower could not check some of its things. Try again.')).toBeVisible();
    expect(screen.getByText('Nothing is left in it. Remove it from your inbox.')).toBeVisible();
    expect(rowOf('Ready to file').textContent).not.toMatch(/Remove|Try again/);
    // Could not check is no dead end: Try again checks again now (TL-P2-19).
    expect(within(rowOf('Scans')).queryByRole('button', { name: 'Remove this pile' })).toBeNull();
    fireEvent.click(within(rowOf('Scans')).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(retryPile).toHaveBeenCalledWith('unchecked'));
    // Remove is the pile's own Remove, with its question first.
    expect(within(rowOf('Letters')).getByRole('button', { name: 'Remove this pile' })).toBeVisible();
    fireEvent.click(within(rowOf('Papers from Alex')).getByRole('button', { name: 'Remove this pile' }));
    fireEvent.click(within(rowOf('Papers from Alex')).getByRole('button', { name: 'Remove the pile' }));
    await waitFor(() => expect(removePile).toHaveBeenCalledWith('changed'));
    fireEvent.click(within(rowOf('Receipts')).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(retryPile).toHaveBeenCalledWith('missing'));
    expect(within(rowOf('Receipts')).queryByRole('button', { name: 'Remove this pile' })).toBeNull();
  });

  it('each action names its pile, and focus follows the question to remove it', async () => {
    const { removePile } = home(null);
    await screen.findByRole('link', { name: /Papers from Alex/ });
    expect(within(rowOf('Receipts')).getByRole('button', { name: 'Try again' })).toHaveAccessibleDescription(/Receipts/);
    const remove = within(rowOf('Letters')).getByRole('button', { name: 'Remove this pile' });
    expect(remove).toHaveAccessibleDescription(/Letters/);
    fireEvent.click(remove);
    const yes = within(rowOf('Letters')).getByRole('button', { name: 'Remove the pile' });
    // The question opens on its least destructive answer, so a repeated key cannot remove the pile.
    await waitFor(() => expect(within(rowOf('Letters')).getByRole('button', { name: 'Keep it' })).toHaveFocus());
    expect(yes).not.toHaveFocus();
    // On a phone the two answers wrap rather than run off the screen.
    expect(yes.parentElement).toHaveStyle({ flexWrap: 'wrap' });
    fireEvent.click(within(rowOf('Letters')).getByRole('button', { name: 'Keep it' }));
    await waitFor(() => expect(within(rowOf('Letters')).getByRole('button', { name: 'Remove this pile' })).toHaveFocus());
    fireEvent.click(within(rowOf('Letters')).getByRole('button', { name: 'Remove this pile' }));
    fireEvent.click(within(rowOf('Letters')).getByRole('button', { name: 'Remove the pile' }));
    await waitFor(() => expect(removePile).toHaveBeenCalledWith('lists'));
    await waitFor(() => expect(screen.queryByRole('link', { name: /Letters/ })).toBeNull());
    await waitFor(() => expect(document.getElementById('main')).toHaveFocus());
  });

  it('an empty pile is not said to have a note to put in the Bin', async () => {
    home(null);
    const sentence = await screen.findByText('Nothing is left in it. Remove it from your inbox.');
    const row = sentence.closest('li');
    if (!row) throw new Error('no row');
    // TL-P2-22 (1): an empty pile says so; "A note" is only for a pile that is a note.
    expect(row.textContent).toContain('Nothing in it');
    expect(row.textContent).not.toContain('A note');
    expect(rowOf('Bins go out on Tuesday').textContent).toContain('A note');
    fireEvent.click(within(row).getByRole('button', { name: 'Remove this pile' }));
    expect(within(row).getByRole('button', { name: 'Remove the pile' })).toBeVisible();
    expect(row.textContent).not.toMatch(/note goes to the Bin|Its files go/);
  });

  it("this device's upload notice shows once, for the whole inbox", async () => {
    home(KEEP_OPEN);
    await screen.findByRole('link', { name: /Papers from Alex/ });
    const inbox = screen.getByRole('region', { name: 'Inbox' });
    expect(await within(inbox).findAllByText(KEEP_OPEN)).toHaveLength(1);
    for (const p of PILES.filter((x) => x.text)) expect(rowOf(p.text).textContent).not.toContain(KEEP_OPEN);
  });

  it('the place the notice is said stays on screen when there is none, so it is heard when it comes', async () => {
    home(null);
    await screen.findByRole('link', { name: /Papers from Alex/ });
    const inbox = screen.getByRole('region', { name: 'Inbox' });
    expect(within(inbox).getByRole('status')).toHaveTextContent('');
  });
});
