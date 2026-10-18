import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import { loadingSources } from '@/testing/loading-sources';
import { beforeUpload } from '@/testing/upload-hook';
import { driveError } from '@/data/drive/drive-api';
import { FakeDrive } from '@/data/drive/fake-drive';
import { seedFakeDrive } from '@/data/fake/seed';
import { DriveVault } from '@/data/vault/drive-vault';
import { PROP } from '@/data/vault/layout';
import { BowerError, type Pile } from '@/data/types';
import type { Sources } from '@/data/sources';
import { NOT_UNDONE_OFFLINE } from '@/ui/report';
import { Toasts, useToasts } from '@/ui/toast';
import { Home } from '@/features/home/Home';
import { PileScreen } from './PileScreen';

// prod1-pile-undo: Remove this pile offers the Undo its restore entry already allows, unless bytes only on this device are discarded.
const BACK = 'The pile is back in the inbox';
const RECOVER = 'Its files go to the Bin of your Drive, where you can get them back.';
const DISCARDED = 'Files already in Drive go to its Bin. Files still on this device will be discarded and cannot be restored.';
const CHOOSE_AGAIN = 'Files already in Drive go to its Bin. Missing files will still need to be chosen again.';

let drive: FakeDrive;
let root: string;
const vaults: DriveVault[] = [];
const declaring = (): DriveVault => {
  const v = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true });
  vaults.push(v);
  return v;
};
const pdf = (name: string): { name: string; kind: 'pdf'; origin: string; body: Blob } => ({ name, kind: 'pdf', origin: 'From this computer', body: new Blob([`%PDF ${name}`]) });

beforeEach(async () => {
  localStorage.clear();
  useToasts.setState({ list: [] });
  drive = new FakeDrive();
  root = (await seedFakeDrive(drive, 'default', Date.now())) ?? '';
});
afterEach(() => {
  cleanup();
  for (const v of vaults.splice(0)) v.dispose();
  useToasts.setState({ list: [] });
  vi.restoreAllMocks();
  sessionStorage.clear();
});

/** The pile's folder, every file in it with its bytes, by id: what a fresh read of Drive says of it. */
async function stateOf(pileId: string) {
  const top = (await drive.listAll(root)).find((f) => f.folder && (f.id === pileId || f.appProperties?.[PROP.pile] === pileId));
  if (!top) return null;
  const under = await drive.listAll(top.id);
  const files = await Promise.all(under.map(async (f) => ({ id: f.id, name: f.name, parents: f.parents, bytes: f.folder ? null : [...(await drive.readBytes(f.id))] })));
  return { top: { id: top.id, name: top.name, parents: top.parents }, files: files.sort((a, b) => a.id.localeCompare(b.id)) };
}

async function declarations() {
  const files = (await drive.listAll(root)).filter((f) => !f.folder && drive.pathOf(f.id, root).startsWith('.bower/piles/declaration-'));
  return (await Promise.all(files.map(async (f) => ({ id: f.id, name: f.name, text: await drive.readText(f.id) })))).sort((a, b) => a.id.localeCompare(b.id));
}

const listed = async (id: string): Promise<Pile[]> => (await declaring().piles()).filter((p) => p.id === id);

/** The app's two removal surfaces and the shared dock: the pile's screen, and Home's inbox inside `main`. */
function app(vault: Sources['vault'], at: string) {
  const base = loadingSources();
  render(
    <MemoryRouter initialEntries={[at]}>
      <DataProvider sources={{ ...base, vault, runs: { ...base.runs, current: async () => null } }}>
        <Routes>
          <Route path="/pile/:id" element={<PileScreen />} />
          <Route path="/" element={<main id="main" tabIndex={-1}><Home /></main>} />
        </Routes>
        <div data-testid="dock"><Toasts /></div>
      </DataProvider>
    </MemoryRouter>,
  );
}

const dock = (): HTMLElement => screen.getByTestId('dock');
/** The Remove question's box (the pile's screen may show another alert, for a thing that did not arrive). */
const question = (): HTMLElement => {
  const box = screen.getByRole('button', { name: 'Keep it' }).closest<HTMLElement>('[role="alert"]');
  if (!box) throw new Error('no question');
  return box;
};
/** Once removed, its toast is up: Undo is on it now or never. */
async function undoButton(): Promise<HTMLElement> {
  expect(await within(dock()).findByText('Pile removed')).toBeVisible();
  return within(dock()).getByRole('button', { name: 'Undo' });
}
const rowOf = (name: string): HTMLElement => {
  const row = screen.getByRole('link', { name: new RegExp(name) }).closest('li');
  if (!row) throw new Error(`no row for ${name}`);
  return row;
};

async function removeFromScreen(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: 'Remove this pile' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove the pile' }));
}

async function savedPile() {
  const uploader = declaring();
  const pile = await uploader.addPile({ text: 'Papers from Alex', items: [pdf('one.pdf'), pdf('two.pdf')] });
  await uploader.settled();
  const shown = (await listed(pile.id))[0];
  if (!shown?.path) throw new Error('no folder pile');
  return shown;
}

describe('removed_saved_pile_offers_working_undo', () => {
  it('Undo, pressed twice while it runs, restores the same folder, words, things and declaration once', async () => {
    const pile = await savedPile();
    const folder = await stateOf(pile.id);
    const copies = await declarations();
    expect(folder?.files.map((f) => f.name).sort()).toEqual(['Pile note.md', 'one.pdf', 'two.pdf']);
    expect(copies).toHaveLength(1);
    const vault = declaring();
    const real = vault.restore.bind(vault);
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    const restore = vi.spyOn(vault, 'restore').mockImplementation(async (path) => { await held; return real(path); });
    app(vault, `/pile/${pile.id}`);
    await removeFromScreen();
    // The pile's screen goes Home, as ever; the dock offers Undo there, once its screen is gone.
    await screen.findByRole('heading', { level: 1, name: /Hello/ });
    const undo = await undoButton();
    expect(await stateOf(pile.id)).toBeNull();
    expect(await declarations()).toEqual([]);
    expect(await listed(pile.id)).toEqual([]);
    fireEvent.click(undo);
    fireEvent.click(undo);
    expect(restore).toHaveBeenCalledOnce();
    expect(restore).toHaveBeenCalledWith(pile.path);
    release();
    expect(await within(dock()).findByText(BACK)).toBeVisible();
    expect(restore).toHaveBeenCalledOnce();
    expect(await stateOf(pile.id)).toEqual(folder);
    expect(await declarations()).toEqual(copies);
    const back = await listed(pile.id);
    expect(back).toHaveLength(1);
    expect(back[0]?.text).toBe('Papers from Alex');
    expect(back[0]?.items.map((i) => [i.id, i.name, i.upload])).toEqual(pile.items.map((i) => [i.id, i.name, undefined]));
    expect(await screen.findAllByRole('link', { name: /Papers from Alex/ })).toHaveLength(1);
  });

  it('from the inbox row: the row goes, focus is on main, and Undo brings the row back', async () => {
    // As Home.test pins the row's Remove: a vault that drops the pile before Remove answers.
    const pile: Pile = { id: 'changed', path: 'Inbox/Papers', text: 'Papers from Alex', createdAt: at, setAside: 'changed', items: [thing('a'), thing('b', { changed: true })] };
    const { vault, removePile, restore } = stubVault([pile]);
    app(vault, '/');
    fireEvent.click(within(await waitFor(() => rowOf('Papers from Alex'))).getByRole('button', { name: 'Remove this pile' }));
    expect(within(rowOf('Papers from Alex')).getByText(RECOVER)).toBeVisible();
    fireEvent.click(within(rowOf('Papers from Alex')).getByRole('button', { name: 'Remove the pile' }));
    await waitFor(() => expect(removePile).toHaveBeenCalledWith('changed'));
    await waitFor(() => expect(screen.queryByRole('link', { name: /Papers from Alex/ })).toBeNull());
    await waitFor(() => expect(document.getElementById('main')).toHaveFocus());
    fireEvent.click(await undoButton());
    expect(await within(dock()).findByText(BACK)).toBeVisible();
    expect(restore.mock.calls).toEqual([['Inbox/Papers']]);
    expect(await screen.findAllByRole('link', { name: /Papers from Alex/ })).toHaveLength(1);
  });
});

describe('restore_failure_keeps_retryable_undo', () => {
  it('offline, then unreached: the same message offers Try again with the same key, and success restores once', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const pile = await savedPile();
    const folder = await stateOf(pile.id);
    const vault = declaring();
    const restore = vi.spyOn(vault, 'restore')
      .mockRejectedValueOnce(new BowerError('offline', "You're offline."))
      .mockRejectedValueOnce(new BowerError('unreached', 'Drive did not answer.'));
    app(vault, `/pile/${pile.id}`);
    await removeFromScreen();
    fireEvent.click(await undoButton());
    expect(await within(dock()).findByText(NOT_UNDONE_OFFLINE)).toBeVisible();
    fireEvent.click(within(dock()).getByRole('button', { name: 'Try again' }));
    expect(await within(dock()).findByText('Not undone yet: Drive did not answer.')).toBeVisible();
    fireEvent.click(within(dock()).getByRole('button', { name: 'Try again' }));
    expect(await within(dock()).findByText(BACK)).toBeVisible();
    // One message the whole time, never a second.
    expect(within(dock()).queryByText('Pile removed')).toBeNull();
    expect(restore.mock.calls).toEqual([[pile.path], [pile.path], [pile.path]]);
    expect(await stateOf(pile.id)).toEqual(folder);
    expect(await listed(pile.id)).toHaveLength(1);
  });

  it('any other refusal is reported as ever, with no Try again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const pile = await savedPile();
    const vault = declaring();
    vi.spyOn(vault, 'restore').mockRejectedValueOnce(new BowerError('not-found', 'It is no longer in the Bin.'));
    app(vault, `/pile/${pile.id}`);
    await removeFromScreen();
    fireEvent.click(await undoButton());
    expect(await within(dock()).findByText('It is no longer in the Bin.')).toBeVisible();
    expect(within(dock()).queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});

/** A vault whose piles are as given; Remove drops one, and Undo would put it back. */
function stubVault(piles: Pile[]) {
  const base = loadingSources();
  let current = [...piles];
  const listeners = new Set<() => void>();
  const tell = (): void => listeners.forEach((cb) => cb());
  const removePile = vi.fn(async (id: string) => { current = current.filter((p) => p.id !== id); tell(); });
  const restore = vi.fn(async (key: string) => {
    const p = piles.find((x) => (x.path ?? x.id) === key);
    if (p && !current.includes(p)) current = [...current, p];
    tell();
  });
  const doors: Record<string, unknown> = {
    piles: async () => current,
    removePile,
    restore,
    uploadNotice: async () => null,
    subscribe: (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); },
  };
  const vault = new Proxy({}, { get: (_t, k) => (typeof k === 'string' && k in doors ? doors[k] : Reflect.get(base.vault, k)) }) as Sources['vault'];
  return { vault, removePile, restore };
}

const at = Date.now();
const thing = (id: string, extra: Partial<Pile['items'][number]> = {}): Pile['items'][number] => ({ id, name: `${id}.pdf`, kind: 'pdf', origin: 'From this computer', ...extra });

describe('unsent_bytes_are_not_promised_restorable', () => {
  const cases: Array<[string, Pile]> = [
    ['saved and still sending', { id: 'mixed', path: 'Inbox/Papers', text: 'Papers from Alex', createdAt: at, items: [thing('saved'), thing('sending', { upload: 0.4 })] }],
    ['only on this device, not started', { id: 'zero', text: 'Receipts', createdAt: at, items: [thing('queued', { upload: 0 })] }],
    ['only on this device, failed', { id: 'failed', text: 'Letters', createdAt: at, items: [thing('stuck', { upload: -1 })] }],
  ];
  it.each(cases)('%s: the question says what is discarded, and no Undo follows', async (_name, pile) => {
    const { vault, removePile, restore } = stubVault([pile]);
    app(vault, `/pile/${pile.id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove this pile' }));
    expect(within(question()).getByText(DISCARDED)).toBeVisible();
    expect(within(question()).queryByText(RECOVER)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove the pile' }));
    await waitFor(() => expect(removePile).toHaveBeenCalledWith(pile.id));
    expect(await within(dock()).findByText('Pile removed')).toBeVisible();
    expect(within(dock()).queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(restore).not.toHaveBeenCalled();
  });
});

describe('every supported pile shape keeps its Undo', () => {
  const cases: Array<[string, Pile, string | null]> = [
    ['an empty pile, by its id', { id: 'empty', text: '', createdAt: at, setAside: 'empty', items: [] }, null],
    ['a note-only pile', { id: 'note', path: 'Inbox/Bins', text: 'Bins go out on Tuesday', createdAt: at, items: [] }, 'The note goes to the Bin of your Drive.'],
    ['a loose saved file', { id: 'loose', path: 'Inbox/offer.pdf', text: '', createdAt: at, items: [thing('offer')] }, RECOVER],
    ['a set-aside pile whose note is locked', { id: 'locked', path: 'Inbox/Postcards', text: '', createdAt: at, setAside: 'note-damaged', noteLocked: true, items: [thing('postcards')] }, RECOVER],
    ['a pile with a thing to choose again', { id: 'again', path: 'Inbox/Scans', text: 'Scans', createdAt: at, items: [thing('kept'), thing('gone', { upload: -1, chooseAgain: true })] }, CHOOSE_AGAIN],
  ];
  it.each(cases)('%s', async (_name, pile, sentence) => {
    const { vault, restore } = stubVault([pile]);
    app(vault, `/pile/${pile.id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove this pile' }));
    for (const said of [RECOVER, DISCARDED, CHOOSE_AGAIN, 'The note goes to the Bin of your Drive.']) {
      if (said === sentence) expect(within(question()).getByText(said)).toBeVisible();
      else expect(within(question()).queryByText(said)).toBeNull();
    }
    if (sentence === null) expect(question().querySelector('p')).toBeNull();
    fireEvent.click(within(question()).getByRole('button', { name: 'Remove the pile' }));
    fireEvent.click(await undoButton());
    expect(await within(dock()).findByText(BACK)).toBeVisible();
    expect(restore.mock.calls).toEqual([[pile.path ?? pile.id]]);
  });

  it('a declared thing that never arrived: removed by its id, and Undo brings back its declaration, still to choose again', async () => {
    const uploader = declaring();
    beforeUpload(drive, () => {
      throw driveError('offline');
    });
    const added = await uploader.addPile({ text: '', items: [pdf('loose.pdf')] });
    await uploader.settled();
    const copies = await declarations();
    const pile = (await listed(added.id))[0];
    expect(pile?.path).toBeUndefined();
    expect(pile?.items.map((i) => [i.name, i.upload, i.chooseAgain])).toEqual([['loose.pdf', -1, true]]);
    const vault = declaring();
    const restore = vi.spyOn(vault, 'restore');
    app(vault, `/pile/${added.id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove this pile' }));
    expect(within(question()).getByText(CHOOSE_AGAIN)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Remove the pile' }));
    await screen.findByRole('heading', { level: 1, name: /Hello/ });
    await waitFor(async () => expect(await declarations()).toEqual([]));
    fireEvent.click(await undoButton());
    expect(await within(dock()).findByText(BACK)).toBeVisible();
    expect(restore.mock.calls).toEqual([[added.id]]);
    expect(await declarations()).toEqual(copies);
    expect((await listed(added.id)).map((p) => p.items.map((i) => [i.name, i.upload, i.chooseAgain]))).toEqual([[['loose.pdf', -1, true]]]);
  });
});
