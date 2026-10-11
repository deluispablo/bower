import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import { loadingSources } from '@/testing/loading-sources';
import { FakeDrive } from '@/data/drive/fake-drive';
import { DriveVault } from '@/data/vault/drive-vault';
import { BowerError, type Pile } from '@/data/types';
import type { Sources } from '@/data/sources';
import { useToasts } from '@/ui/toast';
import { DemoWorld } from '@/data/demo/world';
import { SAMPLE_PILES } from '@/data/demo/fixture';
import { PileScreen } from './PileScreen';

let vault: DriveVault | null = null;
afterEach(() => { cleanup(); vault?.dispose(); vault = null; vi.restoreAllMocks(); });
it('the pile retry button sends only failed uploads', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const drive = new FakeDrive();
  const root = await drive.createFolder('root', 'Bower');
  await drive.createFolder(root.id, 'Inbox');
  vault = new DriveVault({ drive, rootId: async () => root.id, runningPiles: () => new Set() });
  const actualOpen = drive.openResumable.bind(drive);
  const uploads = vi.spyOn(drive, 'openResumable').mockImplementationOnce(actualOpen).mockRejectedValueOnce(new BowerError('offline', 'You are offline.'));
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

// note-read-review-1 (Important): a note Bower could not read is shown read-only, never typed over.
it('a pile note Bower could not read cannot be edited until Try again reads it', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const drive = new FakeDrive();
  const root = await drive.createFolder('root', 'Bower');
  await drive.createFolder(root.id, 'Inbox');
  vault = new DriveVault({ drive, rootId: async () => root.id, runningPiles: () => new Set() });
  const pile = await vault.addPile({ text: 'Papers about the lease', items: [{ name: 'lease.pdf', kind: 'pdf', origin: 'This device', body: new Blob(['lease']) }] });
  await vault.settled();
  const note = (await drive.listAll(pile.id)).find((f) => f.name === 'Pile note.md');
  const real = drive.readText.bind(drive);
  let failing = true;
  vi.spyOn(drive, 'readText').mockImplementation(async (id) => {
    if (failing && id === note?.id) throw new BowerError('offline', 'You are offline.');
    return real(id);
  });
  const fresh = new DriveVault({ drive, rootId: async () => root.id, runningPiles: () => new Set() });
  const updatePile = vi.spyOn(fresh, 'updatePile');
  const base = loadingSources();
  render(<MemoryRouter initialEntries={[`/pile/${pile.id}`]}><DataProvider sources={{ ...base, vault: fresh, runs: { ...base.runs, current: async () => null } }}><Routes><Route path="/pile/:id" element={<PileScreen />} /></Routes></DataProvider></MemoryRouter>);
  expect(await screen.findByText('Bower could not check some of its things. Try again.')).toBeVisible();
  const field = screen.getByRole('textbox', { name: 'What is this?' });
  expect(field).toBeDisabled();
  expect(screen.queryByText('No note yet.')).toBeNull();
  fireEvent.change(field, { target: { value: 'Fresh words' } });
  fireEvent.blur(field);
  expect(screen.queryByRole('button', { name: 'Save the note' })).toBeNull();
  expect(updatePile).not.toHaveBeenCalled();
  // Drive answers again; Try again reads the note, and its real words show, editable.
  failing = false;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'What is this?' })).toHaveValue('Papers about the lease'));
  expect(screen.getByRole('textbox', { name: 'What is this?' })).toBeEnabled();
  expect(await real(note?.id ?? '')).toBe('Papers about the lease');
  fresh.dispose();
});

// note-read-review-1, Minor 1: a listing that reads the note again never drops what the person is typing.
it.each(['reads it again', 'cannot read it again'] as const)('a draft of the note survives a listing that %s', async (how) => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const drive = new FakeDrive();
  const root = await drive.createFolder('root', 'Bower');
  await drive.createFolder(root.id, 'Inbox');
  vault = new DriveVault({ drive, rootId: async () => root.id, runningPiles: () => new Set() });
  const pile = await vault.addPile({ text: 'Papers about the lease', items: [{ name: 'lease.pdf', kind: 'pdf', origin: 'This device', body: new Blob(['lease']) }] });
  await vault.settled();
  const note = (await drive.listAll(pile.id)).find((f) => f.name === 'Pile note.md');
  if (!note) throw new Error('no pile note');
  const real = drive.readText.bind(drive);
  let failing = false;
  vi.spyOn(drive, 'readText').mockImplementation(async (id) => {
    if (failing && id === note.id) throw new BowerError('offline', 'You are offline.');
    return real(id);
  });
  const listings = vi.spyOn(vault, 'piles');
  const base = loadingSources();
  render(<MemoryRouter initialEntries={[`/pile/${pile.id}`]}><DataProvider sources={{ ...base, vault, runs: { ...base.runs, current: async () => null } }}><Routes><Route path="/pile/:id" element={<PileScreen />} /></Routes></DataProvider></MemoryRouter>);
  const field = (): HTMLElement => screen.getByRole('textbox', { name: 'What is this?' });
  await waitFor(() => expect(field()).toHaveValue('Papers about the lease'));
  fireEvent.change(field(), { target: { value: 'Papers about the new lease' } });
  // The note changes elsewhere, so the next listing reads it again.
  await drive.writeText(note.id, 'Papers about the lease, signed', note.modifiedTime);
  failing = how === 'cannot read it again';
  const before = listings.mock.calls.length;
  await vault.refresh();
  await waitFor(() => expect(listings.mock.calls.length).toBeGreaterThan(before));
  await new Promise((r) => setTimeout(r, 50));
  expect(field()).toHaveValue('Papers about the new lease');
  if (how === 'cannot read it again') {
    expect(field()).toBeDisabled();
    failing = false;
    const again = listings.mock.calls.length;
    await vault.refresh();
    await waitFor(() => expect(listings.mock.calls.length).toBeGreaterThan(again));
    await new Promise((r) => setTimeout(r, 50));
    expect(field()).toHaveValue('Papers about the new lease');
  }
  await waitFor(() => expect(field()).toBeEnabled());
  expect(screen.getByRole('button', { name: 'Save the note' })).toBeVisible();
});

it('with nothing typed, the note shows what a listing read again', async () => {
  const drive = new FakeDrive();
  const root = await drive.createFolder('root', 'Bower');
  await drive.createFolder(root.id, 'Inbox');
  vault = new DriveVault({ drive, rootId: async () => root.id, runningPiles: () => new Set() });
  const pile = await vault.addPile({ text: 'Papers about the lease', items: [{ name: 'lease.pdf', kind: 'pdf', origin: 'This device', body: new Blob(['lease']) }] });
  await vault.settled();
  const note = (await drive.listAll(pile.id)).find((f) => f.name === 'Pile note.md');
  const base = loadingSources();
  render(<MemoryRouter initialEntries={[`/pile/${pile.id}`]}><DataProvider sources={{ ...base, vault, runs: { ...base.runs, current: async () => null } }}><Routes><Route path="/pile/:id" element={<PileScreen />} /></Routes></DataProvider></MemoryRouter>);
  const field = (): HTMLElement => screen.getByRole('textbox', { name: 'What is this?' });
  await waitFor(() => expect(field()).toHaveValue('Papers about the lease'));
  await drive.writeText(note?.id ?? '', 'Papers about the lease, signed', note?.modifiedTime ?? '');
  await vault.refresh();
  await waitFor(() => expect(field()).toHaveValue('Papers about the lease, signed'));
});

// note-read-review-1, Minor 8: through the vault, a note Bower cannot parse gives its reason, a read-only note, Remove, no Try again.
it.each([
  ['---\nbower_format: ownership/9\n---\nReceipts from Alex\n', "This pile's note needs a newer Bower."],
  ['---\nbower_format: ownership/2\n---\nReceipts from Alex\n', "Bower can't read this pile's note."],
] as const)('a pile note Bower cannot parse, listed by the vault, says why with Remove and no Try again (%#)', async (text, said) => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const drive = new FakeDrive();
  const root = await drive.createFolder('root', 'Bower');
  await drive.createFolder(root.id, 'Inbox');
  vault = new DriveVault({ drive, rootId: async () => root.id, runningPiles: () => new Set() });
  const pile = await vault.addPile({ text: 'Receipts from Alex', items: [{ name: 'receipt.pdf', kind: 'pdf', origin: 'This device', body: new Blob(['receipt']) }] });
  await vault.settled();
  const note = (await drive.listAll(pile.id)).find((f) => f.name === 'Pile note.md');
  await drive.writeText(note?.id ?? '', text, note?.modifiedTime ?? '');
  const fresh = new DriveVault({ drive, rootId: async () => root.id, runningPiles: () => new Set() });
  const base = loadingSources();
  render(<MemoryRouter initialEntries={[`/pile/${pile.id}`]}><DataProvider sources={{ ...base, vault: fresh, runs: { ...base.runs, current: async () => null } }}><Routes><Route path="/pile/:id" element={<PileScreen />} /></Routes></DataProvider></MemoryRouter>);
  expect(await screen.findByText(said)).toBeVisible();
  expect(screen.getByRole('textbox', { name: 'What is this?' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Remove this pile' })).toBeVisible();
  fresh.dispose();
});

// Final delta review (Important): a kept draft is never saved over words this page never showed (RFC 9110 §13.1.1).
it.each(['reads it again', 'cannot read it again, then Try again reads it'] as const)('a draft whose note changed elsewhere is refused and kept when a listing %s', async (how) => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const drive = new FakeDrive();
  const root = await drive.createFolder('root', 'Bower');
  await drive.createFolder(root.id, 'Inbox');
  vault = new DriveVault({ drive, rootId: async () => root.id, runningPiles: () => new Set() });
  const pile = await vault.addPile({ text: 'Papers about the lease', items: [{ name: 'lease.pdf', kind: 'pdf', origin: 'This device', body: new Blob(['lease']) }] });
  await vault.settled();
  const note = (await drive.listAll(pile.id)).find((f) => f.name === 'Pile note.md');
  if (!note) throw new Error('no pile note');
  const real = drive.readText.bind(drive);
  let failing = false;
  vi.spyOn(drive, 'readText').mockImplementation(async (id) => {
    if (failing && id === note.id) throw new BowerError('offline', 'You are offline.');
    return real(id);
  });
  const base = loadingSources();
  render(<MemoryRouter initialEntries={[`/pile/${pile.id}`]}><DataProvider sources={{ ...base, vault, runs: { ...base.runs, current: async () => null } }}><Routes><Route path="/pile/:id" element={<PileScreen />} /></Routes></DataProvider></MemoryRouter>);
  const field = (): HTMLElement => screen.getByRole('textbox', { name: 'What is this?' });
  await waitFor(() => expect(field()).toHaveValue('Papers about the lease'));
  fireEvent.change(field(), { target: { value: 'My unsaved draft' } });
  await drive.writeText(note.id, 'Changed elsewhere', note.modifiedTime);
  if (how === 'reads it again') await vault.refresh();
  else {
    failing = true;
    await vault.refresh();
    await waitFor(() => expect(field()).toBeDisabled());
    failing = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  }
  await waitFor(() => expect(field()).toBeEnabled());
  expect(field()).toHaveValue('My unsaved draft');
  fireEvent.click(screen.getByRole('button', { name: 'Save the note' }));
  await waitFor(() => expect(useToasts.getState().list.map((t) => t.text)).toContain('This changed somewhere else. Look again and try once more.'));
  expect(field()).toHaveValue('My unsaved draft');
  expect(await real(note.id)).toBe('Changed elsewhere');
  // Final review (R4): the words now there are shown next to the draft, and saving again is an informed overwrite.
  expect(await screen.findByText('This note changed elsewhere. It now says “Changed elsewhere”. Save again to replace it with yours.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Save the note' }));
  await waitFor(async () => expect(await real(note.id)).toBe('My unsaved draft'));
  await waitFor(() => expect(screen.queryByText(/It now says/)).toBeNull());
  expect(field()).toHaveValue('My unsaved draft');
});

it('a long note changed elsewhere is shown cut at a word, about 80 characters in', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const drive = new FakeDrive();
  const root = await drive.createFolder('root', 'Bower');
  await drive.createFolder(root.id, 'Inbox');
  vault = new DriveVault({ drive, rootId: async () => root.id, runningPiles: () => new Set() });
  const pile = await vault.addPile({ text: 'Papers about the lease', items: [{ name: 'lease.pdf', kind: 'pdf', origin: 'This device', body: new Blob(['lease']) }] });
  await vault.settled();
  const note = (await drive.listAll(pile.id)).find((f) => f.name === 'Pile note.md');
  if (!note) throw new Error('no pile note');
  const base = loadingSources();
  render(<MemoryRouter initialEntries={[`/pile/${pile.id}`]}><DataProvider sources={{ ...base, vault, runs: { ...base.runs, current: async () => null } }}><Routes><Route path="/pile/:id" element={<PileScreen />} /></Routes></DataProvider></MemoryRouter>);
  const field = (): HTMLElement => screen.getByRole('textbox', { name: 'What is this?' });
  await waitFor(() => expect(field()).toHaveValue('Papers about the lease'));
  fireEvent.change(field(), { target: { value: 'My unsaved draft' } });
  await drive.writeText(note.id, 'Changed elsewhere by Alex with a much longer note about the lease, the deposit and the inventory list for the flat', note.modifiedTime);
  await vault.refresh();
  fireEvent.click(screen.getByRole('button', { name: 'Save the note' }));
  expect(await screen.findByText('This note changed elsewhere. It now says “Changed elsewhere by Alex with a much longer note about the lease, the deposit…”. Save again to replace it with yours.')).toBeVisible();
});

it('a draft whose note did not change saves after a listing reads it again', async () => {
  const drive = new FakeDrive();
  const root = await drive.createFolder('root', 'Bower');
  await drive.createFolder(root.id, 'Inbox');
  vault = new DriveVault({ drive, rootId: async () => root.id, runningPiles: () => new Set() });
  const pile = await vault.addPile({ text: 'Papers about the lease', items: [{ name: 'lease.pdf', kind: 'pdf', origin: 'This device', body: new Blob(['lease']) }] });
  await vault.settled();
  const note = (await drive.listAll(pile.id)).find((f) => f.name === 'Pile note.md');
  const base = loadingSources();
  render(<MemoryRouter initialEntries={[`/pile/${pile.id}`]}><DataProvider sources={{ ...base, vault, runs: { ...base.runs, current: async () => null } }}><Routes><Route path="/pile/:id" element={<PileScreen />} /></Routes></DataProvider></MemoryRouter>);
  const field = (): HTMLElement => screen.getByRole('textbox', { name: 'What is this?' });
  await waitFor(() => expect(field()).toHaveValue('Papers about the lease'));
  fireEvent.change(field(), { target: { value: 'My draft' } });
  await vault.refresh();
  fireEvent.click(screen.getByRole('button', { name: 'Save the note' }));
  await waitFor(async () => expect(await drive.readText(note?.id ?? '')).toBe('My draft'));
  // And a second edit after it saves too: the saved words are its new base.
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Save the note' })).toBeNull());
  fireEvent.change(field(), { target: { value: 'My second draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save the note' }));
  await waitFor(async () => expect(await drive.readText(note?.id ?? '')).toBe('My second draft'));
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

  it('a list Bower could not read: its own sentence and Try again, which reads it again now', async () => {
    const retry = screenFor({ ...notArrived, id: 'p-unreadable', setAside: 'unreadable', items: [{ id: 'd', name: 'd.pdf', kind: 'pdf', origin: 'From this computer' }] });
    expect(await screen.findByText('Bower could not read the list of what is in this pile. Try again.')).toBeVisible();
    expect(screen.queryByText('Bower could not check some of its things. Try again.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(retry).toHaveBeenCalledWith('p-unreadable'));
  });

  it('a note-only pile whose note Bower could not read is your note, not an empty pile, and Remove says it goes to the Bin', async () => {
    screenFor({ id: 'p-unread', path: 'Inbox/2026-10-06 Bins', text: '', createdAt: Date.now(), setAside: 'not-checked', noteLocked: true, items: [] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Your note' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'An empty pile' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove this pile' }));
    expect(await screen.findByText('The note goes to the Bin of your Drive.')).toBeVisible();
  });

  it.each([
    ['note-format', "This pile's note needs a newer Bower."],
    ['note-damaged', "Bower can't read this pile's note."],
  ] as const)('a pile note Bower cannot parse (%s): its reason, the note read-only, Remove and no Try again', async (why, said) => {
    screenFor({ id: `p-${why}`, path: 'Inbox/2026-10-06 Bins', text: '', createdAt: Date.now(), setAside: why, noteLocked: true, items: [{ id: 'd', name: 'd.pdf', kind: 'pdf', origin: 'From this computer' }] });
    expect(await screen.findByText(said)).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'What is this?' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Remove/ }).map((b) => b.textContent)).toEqual(['Remove this pile']);
  });

  it('an empty pile is called an empty pile, not your note', async () => {
    screenFor({ id: 'p-empty', path: 'Inbox/2026-10-06 Old', text: '', createdAt: Date.now(), setAside: 'empty', items: [] });
    expect(await screen.findByRole('heading', { level: 1, name: 'An empty pile' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Your note' })).toBeNull();
    expect(screen.getByText(/^Nothing in it, added /)).toBeVisible();
    expect(screen.queryByText(/A note, added/)).toBeNull();
  });

  it("an empty pile's removal never mentions a note", async () => {
    // Undeclared (no reason on it) and declared empty alike: no things and no words means no note.
    const asked = async (pile: Pile): Promise<void> => {
      cleanup();
      screenFor(pile);
      await screen.findByRole('heading', { level: 1 });
      fireEvent.click(screen.getByRole('button', { name: 'Remove this pile' }));
    };
    const bare = { path: 'Inbox/2026-10-06 Old', text: '  ', createdAt: Date.now(), items: [] };
    await asked({ id: 'p-bare', ...bare });
    expect(screen.queryByText(/Bin of your Drive/)).toBeNull();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(expect.arrayContaining(['Remove the pile', 'Keep it']));
    await asked({ id: 'p-empty-declared', ...bare, setAside: 'empty' });
    expect(screen.queryByText(/Bin of your Drive/)).toBeNull();
    // A pile that is a note, or has files, keeps its sentence.
    await asked({ id: 'p-note', ...bare, text: 'Call Alex back' });
    expect(screen.getByText('The note goes to the Bin of your Drive.')).toBeVisible();
    await asked({ id: 'p-files', ...bare, items: [{ id: 'a', name: 'a.pdf', kind: 'pdf', origin: 'From this computer' }] });
    expect(screen.getByText('Its files go to the Bin of your Drive, where you can get them back.')).toBeVisible();
  });

  it('a thing that has not arrived: the reason and Try again, said once', async () => {
    const retry = screenFor(notArrived);
    expect(await screen.findByText('Some of its things have not arrived yet.')).toBeVisible();
    expect(screen.queryByText('Some things did not reach your Bower folder.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(retry).toHaveBeenCalledWith('p-missing'));
  });
});

describe('a reselected file must match its declared member', () => {
  const missing: Pile = {
    id: 'p-chosen', path: 'Inbox/2026-10-06 Receipts', text: 'Receipts', createdAt: Date.now(), setAside: 'not-arrived',
    items: [{ id: 'a', name: 'a.pdf', kind: 'pdf', origin: 'From this computer' }, { id: 'member-c', name: 'c.pdf', kind: 'pdf', origin: 'From this computer', upload: -1, chooseAgain: true }],
  };
  function screenFor(pile: Pile, chooseAgain: Sources['vault']['chooseAgain']) {
    const base = loadingSources();
    const retryPile = vi.fn(async () => undefined);
    const vault = new Proxy({}, { get: (_t, k) => (k === 'piles' ? async () => [pile] : k === 'retryPile' ? retryPile : k === 'chooseAgain' ? chooseAgain : Reflect.get(base.vault, k)) }) as Sources['vault'];
    render(<MemoryRouter initialEntries={[`/pile/${pile.id}`]}><DataProvider sources={{ ...base, vault, runs: { ...base.runs, current: async () => null } }}><Routes><Route path="/pile/:id" element={<PileScreen />} /></Routes></DataProvider></MemoryRouter>);
    return retryPile;
  }
  const picker = (): HTMLInputElement => {
    const input = document.querySelector<HTMLInputElement>('input[type=file]');
    if (!input) throw new Error('no file picker');
    return input;
  };

  it('Try again for a thing whose bytes are not on this device opens a file picker and sends the chosen file for it', async () => {
    const chooseAgain = vi.fn(async () => undefined);
    const retry = screenFor(missing, chooseAgain);
    const open = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(open).toHaveBeenCalledOnce();
    const file = new File(['%PDF c.pdf'], 'c.pdf', { type: 'application/pdf' });
    fireEvent.change(picker(), { target: { files: [file] } });
    await waitFor(() => expect(chooseAgain).toHaveBeenCalledWith('p-chosen', 'member-c', { body: file }));
    expect(retry).not.toHaveBeenCalled();
  });

  it('a different file is refused in its one sentence, and Try again opens the picker again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const refusal = "That isn't the same file. Choose the file you added before.";
    const chooseAgain = vi.fn(async () => { throw new BowerError('conflict', refusal); });
    screenFor(missing, chooseAgain);
    const open = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(open).toHaveBeenCalledOnce();
    fireEvent.change(picker(), { target: { files: [new File(['other'], 'other.pdf')] } });
    await waitFor(() => expect(useToasts.getState().list.map((t) => t.text)).toContain(refusal));
    expect(screen.getByText('Some of its things have not arrived yet.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(open).toHaveBeenCalledTimes(2);
  });

  const linkPile: Pile = { ...missing, id: 'p-link', items: [{ id: 'a', name: 'a.pdf', kind: 'pdf', origin: 'From this computer' }, { id: 'member-l', name: 'source.example/path', kind: 'link', origin: 'A link you pasted', upload: -1, chooseAgain: true }] };

  it('a link that did not arrive is pasted again: Try again goes to the field, and Send sends it as Add would', async () => {
    const chooseAgain = vi.fn(async () => undefined);
    const retry = screenFor(linkPile, chooseAgain);
    const open = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    const field = screen.getByRole('textbox', { name: 'Paste a link' });
    expect(field).toHaveFocus();
    expect(open).not.toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: 'not a link' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByRole('alert')).toHaveTextContent('That is not a web address. Check it and try again.');
    expect(chooseAgain).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: ' source.example/path ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(chooseAgain).toHaveBeenCalledWith('p-link', 'member-l', { url: 'https://source.example/path' }));
  });

  it('another link is refused in its one sentence, and the field keeps it to correct', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const refusal = "That isn't the same link. Paste the link you added before.";
    const chooseAgain = vi.fn(async () => { throw new BowerError('conflict', refusal); });
    screenFor(linkPile, chooseAgain);
    const field = await screen.findByRole('textbox', { name: 'Paste a link' });
    fireEvent.change(field, { target: { value: 'source.example/other' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(useToasts.getState().list.map((t) => t.text)).toContain(refusal));
    expect(field).toHaveValue('source.example/other');
  });

  it.each([
    ['a file: Try again, which opens its picker', 'member-c', () => screen.getByRole('button', { name: 'Try again' })],
    ['a link: the field to paste it in', 'member-l', () => screen.getByRole('textbox', { name: 'Paste a link' })],
  ] as const)('opened from the Inbox for a thing to choose again, the screen is ready at it (%s)', async (_label, key, ready) => {
    const pile: Pile = { ...missing, items: [...missing.items, { id: 'member-l', name: 'source.example/path', kind: 'link', origin: 'A link you pasted', upload: -1, chooseAgain: true }] };
    const base = loadingSources();
    const vault = new Proxy({}, { get: (_t, k) => (k === 'piles' ? async () => [pile] : k === 'chooseAgain' ? vi.fn(async () => undefined) : Reflect.get(base.vault, k)) }) as Sources['vault'];
    render(<MemoryRouter initialEntries={[{ pathname: `/pile/${pile.id}`, state: { choose: key } }]}><DataProvider sources={{ ...base, vault, runs: { ...base.runs, current: async () => null } }}><Routes><Route path="/pile/:id" element={<PileScreen />} /></Routes></DataProvider></MemoryRouter>);
    await screen.findByRole('button', { name: 'Try again' });
    await waitFor(() => expect(ready()).toHaveFocus());
  });

  it("Try again says which files it asks for, and waits while one is checked", async () => {
    const pile: Pile = { ...missing, items: [...missing.items, { id: 'member-d', name: 'd.pdf', kind: 'pdf', origin: 'From this computer', upload: -1, chooseAgain: true }] };
    let done!: () => void;
    const chooseAgain = vi.fn(() => new Promise<void>((r) => { done = r; }));
    screenFor(pile, chooseAgain);
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    const button = await screen.findByRole('button', { name: 'Try again' });
    expect(button).toHaveAccessibleDescription('Choose c.pdf again on this device to send it. Choose d.pdf again on this device to send it.');
    button.focus();
    fireEvent.click(button);
    fireEvent.change(picker(), { target: { files: [new File(['%PDF d.pdf'], 'd.pdf')] } });
    // Waiting, it keeps the focus: aria-disabled, not disabled, and a press does nothing.
    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'));
    expect(button).toBeEnabled();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(chooseAgain).toHaveBeenCalledOnce();
    done();
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'));
  });

  it('the paste field says which link it asks for, and Send waits, keeping the focus, while it is checked', async () => {
    let done!: () => void;
    const chooseAgain = vi.fn(() => new Promise<void>((r) => { done = r; }));
    screenFor(linkPile, chooseAgain);
    const field = await screen.findByRole('textbox', { name: 'Paste a link' });
    expect(field).toHaveAccessibleDescription('Paste the link again on this device to send it.');
    fireEvent.change(field, { target: { value: 'source.example/path' } });
    const send = screen.getByRole('button', { name: 'Send' });
    send.focus();
    fireEvent.click(send);
    await waitFor(() => expect(send).toHaveAttribute('aria-disabled', 'true'));
    expect(send).toBeEnabled();
    expect(send).toHaveFocus();
    fireEvent.click(send);
    expect(chooseAgain).toHaveBeenCalledOnce();
    done();
    await waitFor(() => expect(send).not.toHaveAttribute('aria-disabled'));
  });

  it('Try again also sends again what failed from this page, then asks for the file', async () => {
    const pile: Pile = { ...missing, items: [{ id: 'x', name: 'x.pdf', kind: 'pdf', origin: 'From this computer', upload: -1 }, ...missing.items.slice(1)] };
    const retry = screenFor(pile, vi.fn(async () => undefined));
    const open = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(open).toHaveBeenCalledOnce();
    await waitFor(() => expect(retry).toHaveBeenCalledWith('p-chosen'));
  });

  it('the demo has nothing to choose again: no thing asks for it, and its piles show no picker or paste field', async () => {
    const w = new DemoWorld({ scenario: 'default', scale: 'instant', latency: 0 });
    try {
      const sources = w.sources();
      for (const sample of SAMPLE_PILES) w.addSample(sample);
      await sources.vault.addPile({ text: 'Receipts from Alex', items: [{ name: 'c.pdf', kind: 'pdf', origin: 'From this computer', body: new Blob(['%PDF c.pdf']) }, { name: 'source.example/path', kind: 'link', origin: 'A link you pasted', url: 'https://source.example/path' }] });
      const piles = await sources.vault.piles();
      expect(piles.some((p) => p.setAside)).toBe(true);
      expect(piles.flatMap((p) => p.items).filter((i) => i.chooseAgain)).toEqual([]);
      expect(sources.vault.chooseAgain).toBeUndefined();
      for (const pile of piles.filter((p) => p.setAside || p.items.length)) {
        render(<MemoryRouter initialEntries={[`/pile/${pile.id}`]}><DataProvider sources={sources}><Routes><Route path="/pile/:id" element={<PileScreen />} /></Routes></DataProvider></MemoryRouter>);
        await screen.findByRole('list', { name: 'In this pile' });
        expect(document.querySelector('input[type=file]')).toBeNull();
        expect(screen.queryByRole('textbox', { name: 'Paste a link' })).toBeNull();
        cleanup();
      }
    } finally {
      w.dispose();
    }
  });
});

describe('Q1b pile question projection', () => {
  const at = 1_800_000_000_000;
  const sentence = "Bower couldn't place this. Tell it more in the pile's words, or move it yourself.";
  const paper: Pile = { id: 'paper', path: 'Inbox/Papers', text: 'Papers from Alex', createdAt: at,
    items: [{ id: 'letter', name: 'letter.pdf', kind: 'pdf', origin: 'From this computer' }] };
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(at); });
  afterEach(() => {
    cleanup();
    for (const t of useToasts.getState().list) useToasts.getState().dismiss(t.id);
    vi.useRealTimers();
  });
  async function settle(): Promise<void> { await act(async () => { await vi.advanceTimersByTimeAsync(0); }); }
  async function projection(extra: Partial<Pile>) {
    const base = loadingSources();
    let current: Pile = { ...paper, ...extra };
    const listeners = new Set<() => void>();
    const updatePile = vi.fn(async (id: string, text: string, _seen: string) => {
      expect(id).toBe('paper');
      // Q1a owns the reset; the screen must respond to its newly published projection.
      current = { ...current, text: text.trim(), question: undefined };
      listeners.forEach((cb) => cb());
    });
    const methods: Record<string, unknown> = { piles: async () => [current], tree: async () => [],
      questions: async () => [], updatePile,
      subscribe: (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); } };
    const source = new Proxy(base.vault, { get: (target, key) => typeof key === 'string' && key in methods ? methods[key] : Reflect.get(target, key) });
    render(<MemoryRouter initialEntries={['/pile/paper']}><DataProvider sources={{ ...base, vault: source,
      runs: { ...base.runs, current: async () => null } }}><Routes><Route path="/pile/:id" element={<PileScreen />} /></Routes></DataProvider></MemoryRouter>);
    await settle();
    // Positive control: the original words and tidy-up action remain usable through PileScreen.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Papers from Alex');
    expect(screen.getByRole('textbox', { name: 'What is this?' })).toHaveValue('Papers from Alex');
    expect(screen.getByRole('button', { name: 'Tidy up the inbox' })).toBeVisible();
    return { updatePile };
  }

  it('Q1b After 2 rounds the pile page gives the words and Move sentence', async () => {
    await projection({ question: 'exhausted' });
    const line = screen.getByText(sentence, { exact: true });
    expect(line.tagName).toBe('P');
    expect(line).toBeVisible();
    const heading = screen.getByRole('heading', { level: 1 });
    const words = screen.getByRole('textbox', { name: 'What is this?' });
    expect(heading.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(line.compareDocumentPosition(words) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Tell it more/ })).toBeNull();
  });

  it('Q1b Changed pile words clear the exhausted sentence from the published projection', async () => {
    const { updatePile } = await projection({ question: 'exhausted' });
    expect(screen.getByText(sentence, { exact: true })).toBeVisible();
    const field = screen.getByRole('textbox', { name: 'What is this?' });
    fireEvent.change(field, { target: { value: 'Papers about the garden lease' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save the note' })); await settle();
    expect(updatePile).toHaveBeenCalledExactlyOnceWith('paper', 'Papers about the garden lease', 'Papers from Alex');
    expect(screen.queryByText(sentence)).toBeNull();
    expect(screen.getByRole('textbox', { name: 'What is this?' })).toHaveValue('Papers about the garden lease');
  });

  it('Q1b A waiting pile and a damaged pile do not show exhaustion', async () => {
    await projection({ question: 'waiting' });
    expect(screen.queryByText(sentence)).toBeNull();
    cleanup();
    await projection({ question: 'exhausted', setAside: 'not-checked' });
    expect(screen.getByText('Bower could not check some of its things. Try again.')).toBeVisible();
    expect(screen.queryByText(sentence)).toBeNull();
  });
});
