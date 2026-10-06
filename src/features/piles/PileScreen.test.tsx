import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import { loadingSources } from '@/testing/loading-sources';
import { FakeDrive } from '@/data/drive/fake-drive';
import { DriveVault } from '@/data/vault/drive-vault';
import { BowerError, type Pile } from '@/data/types';
import type { Sources } from '@/data/sources';
import { PileScreen } from './PileScreen';

let vault: DriveVault | null = null;
afterEach(() => { cleanup(); vault?.dispose(); vault = null; vi.restoreAllMocks(); });
it('the pile retry button sends only failed uploads', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const drive = new FakeDrive();
  const root = await drive.createFolder('root', 'Bower');
  await drive.createFolder(root.id, 'Inbox');
  vault = new DriveVault({ drive, rootId: async () => root.id, runningPiles: () => new Set() });
  const actualUpload = drive.upload.bind(drive);
  const uploads = vi.spyOn(drive, 'upload').mockImplementationOnce(actualUpload).mockRejectedValueOnce(new BowerError('offline', 'You are offline.'));
  const pile = await vault.addPile({ text: 'Two pictures', items: [
    { name: 'one.png', kind: 'image', origin: 'This device', body: new Blob(['one']) },
    { name: 'two.png', kind: 'image', origin: 'This device', body: new Blob(['two']) },
  ] });
  await vault.settled();
  const retry = vi.spyOn(vault, 'retryPile');
  const base = loadingSources();
  render(<MemoryRouter initialEntries={[`/pile/${pile.id}`]}><DataProvider sources={{ ...base, vault, runs: { ...base.runs, current: async () => null } }}><Routes><Route path="/pile/:id" element={<PileScreen />} /></Routes></DataProvider></MemoryRouter>);
  const button = await screen.findByRole('button', { name: 'Try again' });
  expect(screen.getByRole('alert')).toHaveTextContent('Some things did not reach your Bower folder.');
  expect(uploads).toHaveBeenCalledTimes(2);
  fireEvent.click(button);
  await waitFor(() => expect(uploads).toHaveBeenCalledTimes(3));
  await vault.settled();
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  expect(retry).toHaveBeenCalledOnce();
  expect(retry).toHaveBeenCalledWith(pile.id);
  const files = await drive.listAll(root.id);
  expect(files.filter((f) => f.name === 'one.png')).toHaveLength(1);
  expect(files.filter((f) => f.name === 'two.png')).toHaveLength(1);
});

describe('a set-aside pile shows its reason in the inbox', () => {
  const changed: Pile = {
    id: 'p-changed', path: 'Inbox/2026-10-06 Papers from Alex', text: 'Papers from Alex', createdAt: Date.now(), setAside: 'changed',
    items: [{ id: 'a', name: 'a.pdf', kind: 'pdf', origin: 'From this computer' }, { id: 'b', name: 'b.pdf', kind: 'pdf', origin: 'From this computer', changed: true }],
  };
  const notArrived: Pile = {
    id: 'p-missing', path: 'Inbox/2026-10-06 Receipts', text: 'Receipts', createdAt: Date.now(), setAside: 'not-arrived',
    items: [{ id: 'c', name: 'c.pdf', kind: 'pdf', origin: 'From this computer', upload: -1 }],
  };
  function screenFor(pile: Pile, retryPile = vi.fn(async () => undefined)) {
    const base = loadingSources();
    const vault = new Proxy({}, { get: (_t, k) => (k === 'piles' ? async () => [pile] : k === 'retryPile' ? retryPile : Reflect.get(base.vault, k)) }) as Sources['vault'];
    render(<MemoryRouter initialEntries={[`/pile/${pile.id}`]}><DataProvider sources={{ ...base, vault, runs: { ...base.runs, current: async () => null } }}><Routes><Route path="/pile/:id" element={<PileScreen />} /></Routes></DataProvider></MemoryRouter>);
    return retryPile;
  }

  it('a changed thing: the reason, the thing shown as changed, and the Remove button it names', async () => {
    screenFor(changed);
    expect(await screen.findByText('Some of its things changed after they were added. Remove it and add them again.')).toBeVisible();
    const list = screen.getByRole('list', { name: 'In this pile' });
    expect(within(list).getByText('b.pdf').parentElement).toHaveTextContent('Changed');
    expect(within(list).queryByText("Didn't arrive")).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Remove/ }).map((b) => b.textContent)).toEqual(['Remove this pile']);
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('bytes Bower could not check: the reason and Try again, which checks again now', async () => {
    const retry = screenFor({ ...notArrived, id: 'p-unchecked', setAside: 'not-checked', items: [{ id: 'd', name: 'd.pdf', kind: 'pdf', origin: 'From this computer' }] });
    expect(await screen.findByText('Bower could not check some of its things. Try again.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(retry).toHaveBeenCalledWith('p-unchecked'));
  });

  it('an empty pile is called an empty pile, not your note', async () => {
    screenFor({ id: 'p-empty', path: 'Inbox/2026-10-06 Old', text: '', createdAt: Date.now(), setAside: 'empty', items: [] });
    expect(await screen.findByRole('heading', { level: 1, name: 'An empty pile' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Your note' })).toBeNull();
    expect(screen.getByText(/^Nothing in it, added /)).toBeVisible();
    expect(screen.queryByText(/A note, added/)).toBeNull();
  });

  it('a thing that has not arrived: the reason and Try again, said once', async () => {
    const retry = screenFor(notArrived);
    expect(await screen.findByText('Some of its things have not arrived yet.')).toBeVisible();
    expect(screen.queryByText('Some things did not reach your Bower folder.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(retry).toHaveBeenCalledWith('p-missing'));
  });
});
