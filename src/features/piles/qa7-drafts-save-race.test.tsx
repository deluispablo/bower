/**
 * qa7-drafts-save-race: a pile note save that ends after its editor left (the person went back and opened the pile
 * again) must not clear newer words typed in the editor now on screen; it advances their base to the words saved, so
 * the next save is no false conflict. Made-up words only.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import { forgetThisPerson } from '@/data/device';
import { FakeDrive } from '@/data/drive/fake-drive';
import { DriveVault } from '@/data/vault/drive-vault';
import { loadingSources } from '@/testing/loading-sources';
import type { Pile } from '@/data/types';
import { PileScreen } from './PileScreen';

const ORIGINAL = 'Papers about the lease';
const vaults: DriveVault[] = [];

beforeEach(() => {
  sessionStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  for (const v of vaults.splice(0)) v.dispose();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

const field = (): HTMLElement => screen.getByRole('textbox', { name: 'What is this?' });
const saveButton = (): HTMLElement => screen.getByRole('button', { name: 'Save the note' });

/**
 * A pile on a pretend Drive. `away` leaves the pile's screen and `reopen` opens it again on the same page (same
 * vault); `reload` is a new page. `saveA` saves "Words A" from the screen with the save held until `finish` releases
 * it, and `finish` resolves once the save's completion handler has run.
 */
async function setup(): Promise<{ drive: FakeDrive; noteId: string; page: DriveVault; reopen: () => void; reload: () => DriveVault; saveA: (listedFirst?: boolean) => Promise<() => Promise<void>> }> {
  const drive = new FakeDrive();
  const root = await drive.createFolder('root', 'Bower');
  await drive.createFolder(root.id, 'Inbox');
  const make = (): DriveVault => {
    const v = new DriveVault({ drive, rootId: async () => root.id, runningPiles: () => new Set() });
    vaults.push(v);
    return v;
  };
  const page = make();
  const made: Pile = await page.addPile({ text: ORIGINAL, items: [{ name: 'lease.pdf', kind: 'pdf', origin: 'This device', body: new Blob(['lease']) }] });
  await page.settled();
  const note = (await drive.listAll(made.id)).find((f) => f.name === 'Pile note.md');
  if (!note) throw new Error('no pile note');
  const show = (v: DriveVault): void => {
    const base = loadingSources();
    render(<MemoryRouter initialEntries={[`/pile/${made.id}`]}><DataProvider sources={{ ...base, vault: v, runs: { ...base.runs, current: async () => null } }}><Routes><Route path="/pile/:id" element={<PileScreen />} /></Routes></DataProvider></MemoryRouter>);
  };
  show(page);
  await waitFor(() => expect(field()).toHaveValue(ORIGINAL));
  const saveA = async (listedFirst = false): Promise<() => Promise<void>> => {
    let release = (): void => undefined;
    const gate = new Promise<void>((r) => (release = r));
    let done: Promise<unknown> = Promise.resolve();
    const real = page.updatePile.bind(page);
    // `listedFirst`: the save ends only once its listing has reached the screen, the order that comes now and then.
    vi.spyOn(page, 'updatePile').mockImplementationOnce((id, input, base) => (done = gate.then(() => real(id, input, base)).then(async (r) => {
      if (listedFirst) await screen.findByRole('heading', { name: 'Words A' });
      return r;
    })) as Promise<Pile>);
    fireEvent.change(field(), { target: { value: 'Words A' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled());
    return async () => {
      release();
      await done;
      // The save's completion handler runs after the save's promise settles.
      await new Promise((r) => setTimeout(r, 0));
      expect(await drive.readText(note.id)).toBe('Words A');
    };
  };
  return {
    drive,
    noteId: note.id,
    page,
    reopen: () => { cleanup(); show(page); },
    reload: () => { cleanup(); const v = make(); show(v); return v; },
    saveA,
  };
}

describe('qa7-drafts-save-race: an older save never clears newer words', () => {
  it('AC1 save-race-newer-kept: save A, go away, reopen, type B, A completes, reload shows B with Save offered (review-gaps 1)', async () => {
    const d = await setup();
    const finish = await d.saveA();
    d.reopen();
    await waitFor(() => expect(field()).toHaveValue('Words A'));
    fireEvent.change(field(), { target: { value: 'Words B' } });
    await finish();
    expect(field()).toHaveValue('Words B');
    d.reload();
    await waitFor(() => expect(field()).toHaveValue('Words B'));
    expect(saveButton()).toBeEnabled();
  });

  it('AC1 save-race-empty: B deliberately cleared survives A, distinct from no draft (review-gaps 3)', async () => {
    const d = await setup();
    const finish = await d.saveA();
    d.reopen();
    await waitFor(() => expect(field()).toHaveValue('Words A'));
    fireEvent.change(field(), { target: { value: '' } });
    await finish();
    d.reload();
    await screen.findByRole('heading', { name: 'Words A' });
    expect(field()).toHaveValue('');
    expect(saveButton()).toBeEnabled();
  });

  it.each([['A ends first', false], ['its listing comes first', true]])('AC1 save-race-original: B back at the original words survives A and the listing after it, %s (review-gaps 3)', async (_order, listedFirst) => {
    const d = await setup();
    const finish = await d.saveA(listedFirst);
    d.reopen();
    await waitFor(() => expect(field()).toHaveValue('Words A'));
    fireEvent.change(field(), { target: { value: ORIGINAL } });
    await finish();
    // The listing of the saved words reaches the screen (its heading), and the typed words stay.
    await screen.findByRole('heading', { name: 'Words A' });
    expect(field()).toHaveValue(ORIGINAL);
    expect(saveButton()).toBeEnabled();
    d.reload();
    await screen.findByRole('heading', { name: 'Words A' });
    expect(field()).toHaveValue(ORIGINAL);
    expect(saveButton()).toBeEnabled();
  });

  it('AC1 save-race-base-advanced: after A completes, type C on the reopened screen, reload, save C: no false conflict (review-gaps 4)', async () => {
    const d = await setup();
    const finish = await d.saveA();
    d.reopen();
    await waitFor(() => expect(field()).toHaveValue('Words A'));
    fireEvent.change(field(), { target: { value: 'Words B' } });
    await finish();
    fireEvent.change(field(), { target: { value: 'Words C' } });
    d.reload();
    await waitFor(() => expect(field()).toHaveValue('Words C'));
    fireEvent.click(saveButton());
    await waitFor(async () => expect(await d.drive.readText(d.noteId)).toBe('Words C'));
    expect(screen.queryByText(/It now says/)).toBeNull();
  });

  it('AC1 save-race-base-on-screen: after A completes, the reopened screen itself saves B: no false conflict (review-gaps 4)', async () => {
    const d = await setup();
    const finish = await d.saveA();
    d.reopen();
    await waitFor(() => expect(field()).toHaveValue('Words A'));
    fireEvent.change(field(), { target: { value: 'Words B' } });
    await finish();
    fireEvent.click(saveButton());
    await waitFor(async () => expect(await d.drive.readText(d.noteId)).toBe('Words B'));
    expect(screen.queryByText(/It now says/)).toBeNull();
  });

  it('AC1 save-race-away: B typed, both screens gone when A completes: reload shows B, and it saves (review-gaps 4)', async () => {
    const d = await setup();
    const finish = await d.saveA();
    d.reopen();
    await waitFor(() => expect(field()).toHaveValue('Words A'));
    fireEvent.change(field(), { target: { value: 'Words B' } });
    cleanup();
    await finish();
    d.reload();
    await waitFor(() => expect(field()).toHaveValue('Words B'));
    fireEvent.click(saveButton());
    await waitFor(async () => expect(await d.drive.readText(d.noteId)).toBe('Words B'));
    expect(screen.queryByText(/It now says/)).toBeNull();
  });

  it('AC1 save-race-sign-out: signed out while A saves, its completion never writes forgotten words back (review-gaps 5)', async () => {
    const d = await setup();
    const finish = await d.saveA();
    // Typed while it saves, then signed out.
    fireEvent.change(field(), { target: { value: 'Words B' } });
    cleanup();
    forgetThisPerson();
    await finish();
    expect(Object.keys(sessionStorage).filter((k) => k.startsWith('bower:pile-note:'))).toEqual([]);
    d.reload();
    await waitFor(() => expect(field()).toHaveValue('Words A'));
    expect(screen.queryByRole('button', { name: 'Save the note' })).toBeNull();
  });
});
