/**
 * qa7-drafts (qa-7 Claude F5): words typed in a pile's note are saved only when the field loses focus, so a reload
 * before that loses them, while Tell Bower and Add keep their drafts for the tab (`ui/session-draft.ts`). The pile note
 * keeps its unsaved words the same way, with the words it started from, and sign-out forgets them. Made-up words only.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import { forgetThisPerson } from '@/data/device';
import { DemoWorld } from '@/data/demo/world';
import { FakeDrive } from '@/data/drive/fake-drive';
import { DriveVault } from '@/data/vault/drive-vault';
import { loadingSources } from '@/testing/loading-sources';
import type { Sources } from '@/data/sources';
import { BowerError, type Pile } from '@/data/types';
import { PileScreen } from './PileScreen';

let world: DemoWorld;
let sources: Sources;
let pile: Pile;

beforeEach(async () => {
  sessionStorage.clear();
  world = new DemoWorld({ scenario: 'default', scale: 'instant', latency: 0 });
  sources = world.sources();
  pile = await sources.vault.addPile({ text: 'Lease papers for Alex', items: [{ name: 'lease.pdf', kind: 'pdf', origin: 'From this computer', body: new Blob(['%PDF lease']) }] });
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

async function open(id = pile.id): Promise<HTMLElement> {
  render(<MemoryRouter initialEntries={[`/pile/${id}`]}><DataProvider sources={sources}><Routes><Route path="/pile/:id" element={<PileScreen />} /></Routes></DataProvider></MemoryRouter>);
  return screen.findByRole('textbox', { name: 'What is this?' });
}

describe('qa7-drafts: the pile note keeps unsaved words', () => {
  it('AC3 qa7-drafts-pile-kept: words typed and not yet saved are there again after the screen loads again', async () => {
    const box = await open();
    // Positive control: the note the pile was made with.
    expect(box).toHaveValue('Lease papers for Alex');
    fireEvent.change(box, { target: { value: 'Lease papers for Alex ZZ1' } });
    // The reload comes before the field loses focus, so nothing was saved.
    cleanup();
    expect((await sources.vault.piles()).find((p) => p.id === pile.id)?.text).toBe('Lease papers for Alex');
    expect(await open()).toHaveValue('Lease papers for Alex ZZ1');
    expect(screen.getByRole('button', { name: 'Save the note' })).toBeEnabled();
  });

  it('AC3 qa7-drafts-pile-forgotten: sign-out forgets the unsaved words', async () => {
    fireEvent.change(await open(), { target: { value: 'Lease papers for Alex ZZ1' } });
    cleanup();
    forgetThisPerson();
    expect(await open()).toHaveValue('Lease papers for Alex');
  });

  it('AC3 qa7-drafts-pile-saved-cleared: once saved, nothing comes back over the saved note', async () => {
    const box = await open();
    fireEvent.change(box, { target: { value: 'Lease papers for Alex ZZ1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save the note' }));
    await vi.waitFor(async () => expect((await sources.vault.piles()).find((p) => p.id === pile.id)?.text).toBe('Lease papers for Alex ZZ1'));
    cleanup();
    expect(await open()).toHaveValue('Lease papers for Alex ZZ1');
    expect(screen.queryByRole('button', { name: 'Save the note' })).toBeNull();
  });

  it('AC3 qa7-drafts-pile-per-pile: unsaved words in one pile survive typing in another, after a failed save too (review-gaps 8)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // The demo names a pile by the millisecond it was made: the second one is made in a later one.
    await new Promise((r) => setTimeout(r, 2));
    const other = await sources.vault.addPile({ text: 'Receipts from Alex', items: [{ name: 'receipt.pdf', kind: 'pdf', origin: 'From this computer', body: new Blob(['%PDF receipt']) }] });
    expect(other.id).not.toBe(pile.id);
    const box = await open();
    fireEvent.change(box, { target: { value: 'Lease papers for Alex ZZ1' } });
    const update =vi.spyOn(sources.vault, 'updatePile').mockRejectedValueOnce(new BowerError('offline', 'You are offline.'));
    fireEvent.blur(box);
    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    cleanup();
    fireEvent.change(await open(other.id), { target: { value: 'Receipts from Alex ZZ2' } });
    cleanup();
    expect(await open()).toHaveValue('Lease papers for Alex ZZ1');
    cleanup();
    expect(await open(other.id)).toHaveValue('Receipts from Alex ZZ2');
  });

  it.each([['empty', ''], ['quoted and multiline', 'Alex said "keep the lease"\nand the deposit\n\n  too\n']])('AC3 qa7-drafts-pile-lossless: %s words come back as typed (review-gaps 10)', async (_name, words) => {
    fireEvent.change(await open(), { target: { value: words } });
    cleanup();
    expect(await open()).toHaveValue(words);
    expect(screen.getByRole('button', { name: 'Save the note' })).toBeEnabled();
  });

  it.each(['{ broken', '{"text":1,"base":"Lease papers for Alex"}', '"Lease papers ZZ9"', 'null'])('AC3 qa7-drafts-pile-malformed: a kept draft that does not read (%s) leaves the note as saved (review-gaps 10)', async (raw) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sessionStorage.setItem(`bower:pile-note:${pile.id}`, raw);
    expect(await open()).toHaveValue('Lease papers for Alex');
    expect(screen.queryByRole('button', { name: 'Save the note' })).toBeNull();
  });

  it('AC3 qa7-drafts-pile-no-storage: with session storage refused, the note shows and takes typing (review-gaps 10)', async () => {
    const denied = (): never => { throw new DOMException('Synthetic storage denied', 'SecurityError'); };
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, k: string) { return k.startsWith('bower:pile-note') ? denied() : get.call(this, k); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) { if (k.startsWith('bower:pile-note')) denied(); set.call(this, k, v); });
    const box = await open();
    expect(box).toHaveValue('Lease papers for Alex');
    fireEvent.change(box, { target: { value: 'Lease papers for Alex ZZ3' } });
    expect(box).toHaveValue('Lease papers for Alex ZZ3');
    expect(screen.getByRole('button', { name: 'Save the note' })).toBeEnabled();
  });
});

/** A pile on a pretend Drive, and pages over it: each `reload` is a new page (its own memory) showing the pile. */
const vaults: DriveVault[] = [];
afterEach(() => { for (const v of vaults.splice(0)) v.dispose(); });

async function onDrive(): Promise<{ drive: FakeDrive; noteId: string; first: DriveVault; reload: () => DriveVault }> {
  const drive = new FakeDrive();
  const root = await drive.createFolder('root', 'Bower');
  await drive.createFolder(root.id, 'Inbox');
  const make = (): DriveVault => {
    const v = new DriveVault({ drive, rootId: async () => root.id, runningPiles: () => new Set() });
    vaults.push(v);
    return v;
  };
  const show = (v: DriveVault): void => {
    const base = loadingSources();
    render(<MemoryRouter initialEntries={[`/pile/${made.id}`]}><DataProvider sources={{ ...base, vault: v, runs: { ...base.runs, current: async () => null } }}><Routes><Route path="/pile/:id" element={<PileScreen />} /></Routes></DataProvider></MemoryRouter>);
  };
  const first = make();
  const made = await first.addPile({ text: 'Papers about the lease', items: [{ name: 'lease.pdf', kind: 'pdf', origin: 'This device', body: new Blob(['lease']) }] });
  await first.settled();
  const note = (await drive.listAll(made.id)).find((f) => f.name === 'Pile note.md');
  if (!note) throw new Error('no pile note');
  show(first);
  return { drive, noteId: note.id, first, reload: () => { cleanup(); const v = make(); show(v); return v; } };
}

const field = (): HTMLElement => screen.getByRole('textbox', { name: 'What is this?' });
const saveButton = (): HTMLElement => screen.getByRole('button', { name: 'Save the note' });
const elsewhere = async (drive: FakeDrive, id: string, text: string): Promise<void> => void (await drive.writeText(id, text, (await drive.get(id)).modifiedTime));

describe('qa7-drafts: a kept pile draft keeps the words it started from', () => {
  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => undefined); });

  it('AC3 qa7-drafts-pile-base-kept: changed elsewhere before the reload, Save is refused, then the informed overwrite works (review-gaps 7)', async () => {
    const d = await onDrive();
    await waitFor(() => expect(field()).toHaveValue('Papers about the lease'));
    fireEvent.change(field(), { target: { value: 'My unsaved draft' } });
    await elsewhere(d.drive, d.noteId, 'Changed elsewhere');
    d.reload();
    await waitFor(() => expect(field()).toHaveValue('My unsaved draft'));
    fireEvent.click(saveButton());
    expect(await screen.findByText('This note changed elsewhere. It now says “Changed elsewhere”. Save again to replace it with yours.')).toBeVisible();
    expect(await d.drive.readText(d.noteId)).toBe('Changed elsewhere');
    fireEvent.click(saveButton());
    await waitFor(async () => expect(await d.drive.readText(d.noteId)).toBe('My unsaved draft'));
  });

  it('AC3 qa7-drafts-pile-refused-base: refused, reloaded, Save is refused again and the overwrite is offered (review-gaps 18)', async () => {
    const d = await onDrive();
    await waitFor(() => expect(field()).toHaveValue('Papers about the lease'));
    fireEvent.change(field(), { target: { value: 'My unsaved draft' } });
    await elsewhere(d.drive, d.noteId, 'Changed elsewhere');
    fireEvent.click(saveButton());
    expect(await screen.findByText(/It now says “Changed elsewhere”/)).toBeVisible();
    d.reload();
    await waitFor(() => expect(field()).toHaveValue('My unsaved draft'));
    fireEvent.click(saveButton());
    expect(await screen.findByText(/It now says “Changed elsewhere”/)).toBeVisible();
    expect(await d.drive.readText(d.noteId)).toBe('Changed elsewhere');
    fireEvent.click(saveButton());
    await waitFor(async () => expect(await d.drive.readText(d.noteId)).toBe('My unsaved draft'));
  });

  it('AC3 qa7-drafts-pile-typed-while-saving: words typed while a save runs survive a reload and then save (review-gaps 11, 17)', async () => {
    const d = await onDrive();
    await waitFor(() => expect(field()).toHaveValue('Papers about the lease'));
    let release = (): void => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const real = d.first.updatePile.bind(d.first);
    vi.spyOn(d.first, 'updatePile').mockImplementationOnce(async (id, input, base) => { await gate; return real(id, input, base); });
    fireEvent.change(field(), { target: { value: 'Words A' } });
    fireEvent.click(saveButton());
    fireEvent.change(field(), { target: { value: 'Words B' } });
    release();
    await waitFor(async () => expect(await d.drive.readText(d.noteId)).toBe('Words A'));
    await screen.findByRole('button', { name: 'Save the note' });
    d.reload();
    await waitFor(() => expect(field()).toHaveValue('Words B'));
    fireEvent.click(saveButton());
    await waitFor(async () => expect(await d.drive.readText(d.noteId)).toBe('Words B'));
    expect(screen.queryByText(/It now says/)).toBeNull();
  });

  it('AC3 qa7-drafts-pile-cleared: after a save, a note changed elsewhere shows when the pile opens again (review-gaps 9)', async () => {
    const d = await onDrive();
    await waitFor(() => expect(field()).toHaveValue('Papers about the lease'));
    fireEvent.change(field(), { target: { value: 'Words A' } });
    fireEvent.click(saveButton());
    await waitFor(async () => expect(await d.drive.readText(d.noteId)).toBe('Words A'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save the note' })).toBeNull());
    await elsewhere(d.drive, d.noteId, 'Newer elsewhere');
    d.reload();
    await waitFor(() => expect(field()).toHaveValue('Newer elsewhere'));
    expect(screen.queryByRole('button', { name: 'Save the note' })).toBeNull();
  });
});
