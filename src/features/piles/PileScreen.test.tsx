import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import { loadingSources } from '@/testing/loading-sources';
import { FakeDrive } from '@/data/drive/fake-drive';
import { DriveVault } from '@/data/vault/drive-vault';
import { BowerError } from '@/data/types';
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
