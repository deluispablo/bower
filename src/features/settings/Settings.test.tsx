import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import { loadingSources } from '@/testing/loading-sources';
import { Settings } from './Settings';

describe('Settings', () => {
  it('AC3 settings-leaving-group: deleting the account is a group of its own, after Account, with nothing else in it', async () => {
    render(<MemoryRouter><DataProvider sources={loadingSources()}><Settings /></DataProvider></MemoryRouter>);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings.slice(-2)).toEqual(['Account', 'Leaving Bower']);
    /** The level 2 heading a control sits under. */
    const groupOf = (el: HTMLElement): string | null => {
      const all = screen.getAllByRole('heading', { level: 2 });
      return all.filter((h) => !!(h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1)?.textContent ?? null;
    };
    expect(groupOf(screen.getByRole('button', { name: 'Sign out' }))).toBe('Account');
    const del = screen.getByRole('button', { name: 'Delete' });
    expect(groupOf(del)).toBe('Leaving Bower');
    expect(screen.getByText('Delete your Bower account')).toBeInTheDocument();
    expect(groupOf(screen.getByText('Delete your Bower account'))).toBe('Leaving Bower');
  });

  it('shows who is signed in, not a name written in the code', async () => {
    const base = loadingSources();
    const sources = { ...base, session: { ...base.session, current: async () => ({ name: 'Sam', email: 'sam@example.com' }) } } as Sources;
    render(
      <MemoryRouter>
        <DataProvider sources={sources}>
          <Settings />
        </DataProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Sam')).toBeInTheDocument();
    expect(screen.getByText('sam@example.com')).toBeInTheDocument();
    expect(screen.queryByText('Alex')).toBeNull();
  });
});


// The count comes from the production queue injected into the live sources, never a UI counter.
describe('c02-upload-count-ui sign-out contract', () => {
  beforeEach(() => { cleanup(); vi.useFakeTimers(); });
  const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); });

  async function setup(count: number) {
    const { FakeDrive } = await import('@/data/drive/fake-drive');
    const { FakeWorker } = await import('@/data/fake/fake-worker');
    const { FakeRunService } = await import('@/data/fake/fake-run-service');
    const { makeLiveSources, uploadAccount } = await import('@/data/live');
    const { createUploadQueue } = await import('@/data/upload-queue');
    const { memoryUploadStore } = await import('@/data/upload-store');
    const { sha256 } = await import('@/data/vault/hashes');
    const drive = new FakeDrive();
    const root = await drive.createFolder('root', 'Bower');
    const inbox = await drive.createFolder(root.id, 'Inbox');
    for (const name of ['Projects', 'Areas', 'Resources', 'Archive']) await drive.createFolder(root.id, name);
    await drive.createFolder((await drive.createFolder(root.id, '.bower')).id, 'changes');
    const queue = createUploadQueue({ drive, store: memoryUploadStore(), locks: { request: async (_name, _options, callback) => callback(null) } });
    const worker = new FakeWorker({ drive, rootId: root.id, scenario: 'empty', runs: new FakeRunService({ drive, scale: 'instant' }) });
    const sources = makeLiveSources({ drive, worker, uploadQueue: queue });
    const user = await sources.session.current();
    if (!user) throw new Error('The synthetic session must be signed in.');
    await queue.start(await uploadAccount(user.email), root.id);
    for (let i = 0; i < count; i += 1) {
      const body = new Blob([`%PDF synthetic ${i}`]);
      await queue.add({ declarationId: 'C02_DECLARATION', memberKey: `C02_MEMBER_${i}`, pileId: 'C02_PILE', parentId: inbox.id, name: `scan-${i}.pdf`, body, sha256: await sha256(body) });
    }
    expect(queue.pendingCount?.()).toBe(count);
    const signOut = vi.spyOn(sources.session, 'signOut');
    render(<MemoryRouter><DataProvider sources={sources}><Settings /></DataProvider></MemoryRouter>);
    const opener = screen.getByRole('button', { name: 'Sign out' });
    return { queue, sources, signOut, opener };
  }

  it('c02-upload-count-ui: Sign out while 2 things send', async () => {
    // jsdom history traversal queues a nested immediate on the next fake-clock tick.
    const settleOverlay = () => act(async () => { await vi.advanceTimersByTimeAsync(10); });
    const f = await setup(2);
    try {
      f.opener.focus();
      fireEvent.click(f.opener);
      await settleOverlay();
      const sheet = screen.getByRole('dialog', { name: 'Sign out now?' });
      expect(within(sheet).getByText("2 things you added are still sending from this device. If you sign out now, they stop and you'll need to add them again.", { exact: true })).toHaveClass('muted');
      const keep = within(sheet).getByRole('button', { name: 'Keep sending' });
      expect(keep).toHaveFocus();
      expect(f.signOut).not.toHaveBeenCalled();
      fireEvent.click(keep);
      await settleOverlay();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(f.opener).toHaveFocus();
      expect(f.queue.pendingCount?.()).toBe(2);
      fireEvent.click(f.opener);
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' });
      await settleOverlay();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(f.opener).toHaveFocus();
      expect(f.signOut).not.toHaveBeenCalled();
      expect(f.queue.pendingCount?.()).toBe(2);
      fireEvent.click(f.opener);
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign out' }));
      await settleOverlay();
      expect(f.signOut).toHaveBeenCalledOnce();
      expect(f.queue.pendingCount?.()).toBe(0);
      expect(await f.sources.session.current()).toBeNull();
    } finally { f.sources.dispose(); }
  });

  it('c02-upload-count-ui: Sign out with nothing sending', async () => {
    const f = await setup(0);
    try {
      fireEvent.click(f.opener);
      expect(screen.queryByRole('dialog', { name: 'Sign out now?' })).toBeNull();
      await settle();
      expect(f.signOut).toHaveBeenCalledOnce();
      expect(await f.sources.session.current()).toBeNull();
    } finally { f.sources.dispose(); }
  });

  it('AC4 signed-out-farewell: a finished sign-out leaves the sign-in screen its one line to say', async () => {
    const f = await setup(0);
    try {
      expect(sessionStorage.getItem('bower:bye')).toBeNull();
      fireEvent.click(f.opener);
      await settle();
      expect(await f.sources.session.current()).toBeNull();
      expect(sessionStorage.getItem('bower:bye')).toBe('signed-out');
    } finally { f.sources.dispose(); }
  });

  it('c02-upload-count-ui: Sign out while 1 thing sends uses the singular sentence', async () => {
    const f = await setup(1);
    try {
      fireEvent.click(f.opener);
      await settle();
      const sheet = screen.getByRole('dialog', { name: 'Sign out now?' });
      expect(within(sheet).getByText("1 thing you added is still sending from this device. If you sign out now, it stops and you'll need to add it again.", { exact: true })).toBeVisible();
      expect(f.queue.pendingCount?.()).toBe(1);
      expect(f.signOut).not.toHaveBeenCalled();
    } finally { f.sources.dispose(); }
  });
});
