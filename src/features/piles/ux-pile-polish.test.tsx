/**
 * ux-pile-polish (rulings R1, R8): a shared origin is said once in the heading; an arrived image shows its picture,
 * read only for a listed thing of that pile, with object URLs released, stale answers ignored, and a failed preview
 * blocking nothing.
 */
import { useEffect } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import { BowerError, type Pile, type PileItem } from '@/data/types';
import { FakeDrive } from '@/data/drive/fake-drive';
import { DriveVault } from '@/data/vault/drive-vault';
import { DemoWorld } from '@/data/demo/world';
import { useUi } from '@/app/ui-store';
import { loadingSources } from '@/testing/loading-sources';
import { Home } from '@/features/home/Home';
import { PileScreen } from './PileScreen';

const day = Date.parse('2026-10-03T09:00:00');
const thing = (id: string, origin: string, more: Partial<PileItem> = {}): PileItem => ({ id, name: `${id}.pdf`, kind: 'pdf', origin, ...more });
const pile = (id: string, items: PileItem[]): Pile => ({ id, text: '', createdAt: day, items });

let go: (to: string) => void = () => undefined;
function Grab() {
  const nav = useNavigate();
  useEffect(() => {
    go = nav;
  }, [nav]);
  return null;
}

/** A vault over piles held here: `set` changes them and tells the screen, as a listing would. */
function stubVault(start: Pile[], imagePreview?: (pileId: string, itemId: string) => Promise<Blob>) {
  let piles = start;
  const listeners = new Set<() => void>();
  const base = loadingSources();
  const doors: Record<string, unknown> = {
    piles: async () => piles,
    pilesListed: undefined,
    chooseAgain: undefined,
    imagePreview,
    subscribe: (cb: () => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  const vault = new Proxy({}, { get: (_t, k) => (typeof k === 'string' && k in doors ? doors[k] : Reflect.get(base.vault, k)) }) as Sources['vault'];
  const set = (next: Pile[]): void => {
    piles = next;
    act(() => listeners.forEach((cb) => cb()));
  };
  return { sources: { ...base, vault, runs: { ...base.runs, current: async () => null } } as Sources, set };
}

function show(sources: Sources, at: string) {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <DataProvider sources={sources}>
        <Routes>
          <Route path="/pile/:id" element={<><PileScreen /><Grab /></>} />
          <Route path="/" element={<Grab />} />
        </Routes>
      </DataProvider>
    </MemoryRouter>,
  );
}

const rows = () => within(screen.getByRole('list', { name: 'In this pile' })).getAllByRole('listitem');

let made: string[] = [];
let revoked: string[] = [];
const realCreate = URL.createObjectURL;
const realRevoke = URL.revokeObjectURL;
let vault: DriveVault | null = null;
beforeEach(() => {
  made = [];
  revoked = [];
  URL.createObjectURL = vi.fn(() => {
    const url = `blob:preview-${made.length}`;
    made.push(url);
    return url;
  });
  URL.revokeObjectURL = vi.fn((url: string) => void revoked.push(url));
});
afterEach(() => {
  cleanup();
  vault?.dispose();
  vault = null;
  URL.createObjectURL = realCreate;
  URL.revokeObjectURL = realRevoke;
  vi.restoreAllMocks();
  sessionStorage.clear();
  useUi.getState().setTidy(false);
});

describe('AC1 the origin is said once', () => {
  it('a pile from one origin says it in the heading and no row repeats it', async () => {
    const items = Array.from({ length: 9 }, (_, i) => thing(`t${i}`, 'From your phone'));
    show(stubVault([pile('p', items)]).sources, '/pile/p');
    expect(await screen.findByText(/^9 things from your phone, added /)).toBeVisible();
    expect(screen.queryByText('From your phone')).toBeNull();
  });

  it('a pile of mixed origins keeps its heading and each row says its own', async () => {
    const items = [thing('a', 'From your phone'), thing('b', 'From Mail'), thing('c', 'From your phone'), thing('d', 'From the browser')];
    show(stubVault([pile('p', items)]).sources, '/pile/p');
    expect(await screen.findByText(/^4 things, added /)).toBeVisible();
    expect(rows().map((r) => r.textContent)).toEqual(['a.pdfFrom your phone', 'b.pdfFrom Mail', 'c.pdfFrom your phone', 'd.pdfFrom the browser']);
  });

  it('rows on their way, missing or changed keep their line in a shared-origin pile', async () => {
    const items = [
      thing('a', 'From your phone'),
      thing('b', 'From your phone', { upload: 0.4 }),
      thing('c', 'From your phone', { upload: 0 }),
      thing('d', 'From your phone', { upload: -1 }),
      thing('e', 'From your phone', { upload: -1, chooseAgain: true }),
      thing('f', 'From your phone', { changed: true }),
    ];
    show(stubVault([pile('p', items)]).sources, '/pile/p');
    expect(await screen.findByText(/^6 things from your phone, added /)).toBeVisible();
    expect(rows().map((r) => r.textContent)).toEqual(['a.pdf', 'b.pdfSending… 40%', 'c.pdfSending…', "d.pdfDidn't arrive", "e.pdfDidn't arrive. Choose the file again.", 'f.pdfChanged']);
  });
});

describe('AC3 a preview reads only a listed thing of that pile', () => {
  it('refuses any other id before Drive is asked, and reads a thing of the pile once per version', async () => {
    const drive = new FakeDrive();
    const root = await drive.createFolder('root', 'Bower');
    await drive.createFolder(root.id, 'Inbox');
    const elsewhere = await drive.createText(root.id, 'Notes.md', 'A note elsewhere');
    vault = new DriveVault({ drive, rootId: async () => root.id, runningPiles: () => new Set() });
    const a = await vault.addPile({ text: 'Shelves', items: [
      { name: 'one.png', kind: 'image', origin: 'From this device', body: new Blob(['one'], { type: 'image/png' }) },
      { name: 'two.png', kind: 'image', origin: 'From this device', body: new Blob(['two'], { type: 'image/png' }) },
    ] });
    const b = await vault.addPile({ text: 'Other', items: [{ name: 'three.png', kind: 'image', origin: 'From this device', body: new Blob(['three'], { type: 'image/png' }) }] });
    await vault.settled();
    const other = await drive.createFolder('root', 'Other Bower');
    await drive.createFolder(other.id, 'Inbox');
    const otherVault = new DriveVault({ drive, rootId: async () => other.id, runningPiles: () => new Set() });
    const c = await otherVault.addPile({ text: 'Theirs', items: [{ name: 'four.png', kind: 'image', origin: 'From this device', body: new Blob(['four'], { type: 'image/png' }) }] });
    await otherVault.settled();
    const listed = await vault.piles();
    const thingsOf = (id: string) => listed.find((p) => p.id === id)?.items ?? [];
    const [first] = thingsOf(a.id);
    const [ofB] = thingsOf(b.id);
    const ofC = (await otherVault.piles()).find((p) => p.id === c.id)?.items[0];
    otherVault.dispose();
    if (!first || !ofB || !ofC) throw new Error('setup: the piles did not list');
    const reads = vi.spyOn(drive, 'readBytes');
    const refused = async (p: Promise<Blob> | undefined) => {
      const e: unknown = await p?.then(() => null, (x: unknown) => x);
      expect(e).toBeInstanceOf(BowerError);
      expect((e as BowerError).code).toBe('not-found');
    };
    await refused(vault.imagePreview?.(a.id, elsewhere.id));
    await refused(vault.imagePreview?.(a.id, ofB.id));
    await refused(vault.imagePreview?.(c.id, ofC.id));
    await refused(vault.imagePreview?.(a.id, ofC.id));
    expect(reads).not.toHaveBeenCalled();
    const blob = await vault.imagePreview?.(a.id, first.id);
    expect(await blob?.text()).toBe('one');
    expect(reads).toHaveBeenCalledTimes(1);
    await vault.imagePreview?.(a.id, first.id);
    expect(reads).toHaveBeenCalledTimes(1);
  });
});

const image = (id: string, more: Partial<PileItem> = {}): PileItem => ({ id, name: `${id}.png`, kind: 'image', origin: 'From this device', ...more });
const png = (): Blob => new Blob(['png'], { type: 'image/png' });
const img = (row: HTMLElement) => row.querySelector('img');

describe('AC3 object URLs live only while their picture shows', () => {
  it('a picture is revoked when its thing is replaced, when the screen moves to another pile, and on unmount', async () => {
    const preview = vi.fn(async () => png());
    const { sources, set } = stubVault([pile('p', [image('a')]), pile('q', [image('c')])], preview);
    const view = show(sources, '/pile/p');
    await waitFor(() => expect(img(rows()[0] as HTMLElement)?.getAttribute('src')).toBe('blob:preview-0'));
    expect(img(rows()[0] as HTMLElement)?.getAttribute('alt')).toBe('');
    set([pile('p', [image('b')]), pile('q', [image('c')])]);
    await waitFor(() => expect(img(rows()[0] as HTMLElement)?.getAttribute('src')).toBe('blob:preview-1'));
    expect(revoked).toEqual(['blob:preview-0']);
    act(() => go('/pile/q'));
    await waitFor(() => expect(img(rows()[0] as HTMLElement)?.getAttribute('src')).toBe('blob:preview-2'));
    expect(revoked).toEqual(['blob:preview-0', 'blob:preview-1']);
    view.unmount();
    expect(revoked).toEqual(['blob:preview-0', 'blob:preview-1', 'blob:preview-2']);
  });

  it('an answer for a pile the screen left never shows, and every URL made is revoked', async () => {
    let answerP!: (b: Blob) => void;
    const preview = vi.fn((pileId: string) => (pileId === 'p' ? new Promise<Blob>((r) => { answerP = r; }) : Promise.resolve(png())));
    const { sources } = stubVault([pile('p', [image('a')]), pile('q', [image('c')])], preview);
    show(sources, '/pile/p');
    await waitFor(() => expect(preview).toHaveBeenCalledWith('p', 'a'));
    act(() => go('/pile/q'));
    await waitFor(() => expect(img(rows()[0] as HTMLElement)).not.toBeNull());
    const shown = img(rows()[0] as HTMLElement)?.getAttribute('src');
    await act(async () => answerP(png()));
    expect(screen.queryByText('a.png')).toBeNull();
    const srcs = [...document.querySelectorAll('img')].map((i) => i.getAttribute('src'));
    expect(srcs).toEqual([shown]);
    expect(made.filter((u) => u !== shown).every((u) => revoked.includes(u))).toBe(true);
    cleanup();
    expect(made.every((u) => revoked.includes(u))).toBe(true);
  });

  it('only an arrived image is asked for: an image on its way and other kinds keep their icon', async () => {
    const preview = vi.fn(async () => png());
    const { sources } = stubVault([pile('p', [image('a', { upload: 0.4 }), thing('b', 'From this device'), image('c')])], preview);
    show(sources, '/pile/p');
    await waitFor(() => expect(img(rows()[2] as HTMLElement)).not.toBeNull());
    expect(preview.mock.calls).toEqual([['p', 'c']]);
    expect(img(rows()[0] as HTMLElement)).toBeNull();
    expect(rows()[0]?.querySelector('svg')).not.toBeNull();
    expect(img(rows()[1] as HTMLElement)).toBeNull();
  });
});

describe('AC3 and R5 a preview that fails blocks nothing', () => {
  it('a refused preview says Preview unavailable, logs once, and Tidy up and Remove still work', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const preview = vi.fn(async () => { throw new BowerError('offline', 'You are offline.'); });
    const { sources } = stubVault([pile('p', [image('a')])], preview);
    show(sources, '/pile/p');
    expect(await screen.findByText('Preview unavailable')).toBeInTheDocument();
    expect(within(rows()[0] as HTMLElement).getByText('Preview unavailable')).toBeInTheDocument();
    expect(error).toHaveBeenCalledTimes(1);
    const tidy = screen.getByRole('button', { name: 'Tidy up the inbox' });
    expect(tidy).toBeEnabled();
    fireEvent.click(tidy);
    expect(useUi.getState().tidyOpen).toBe(true);
    const remove = screen.getByRole('button', { name: 'Remove this pile' });
    expect(remove).toBeEnabled();
    fireEvent.click(remove);
    expect(screen.getByRole('alert')).toHaveTextContent('Its files go to the Bin of your Drive, where you can get them back.');
  });

  it('a picture the browser cannot decode says Preview unavailable and logs nothing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { sources } = stubVault([pile('p', [image('a')])], vi.fn(async () => png()));
    show(sources, '/pile/p');
    await waitFor(() => expect(img(rows()[0] as HTMLElement)).not.toBeNull());
    fireEvent.error(img(rows()[0] as HTMLElement) as HTMLImageElement);
    expect(await screen.findByText('Preview unavailable')).toBeInTheDocument();
    expect(img(rows()[0] as HTMLElement)).toBeNull();
    expect(error).not.toHaveBeenCalled();
  });
});

describe('R8 Home never asks for a preview', () => {
  it('Home shows piles holding images without calling imagePreview', async () => {
    const w = new DemoWorld({ scenario: 'default', scale: 'instant', latency: 0 });
    const real = w.sources();
    const imagePreview = vi.fn(async () => png());
    const sources = { ...real, vault: new Proxy(real.vault, { get: (t, k) => (k === 'imagePreview' ? imagePreview : Reflect.get(t, k)) }) } as Sources;
    expect((await real.vault.piles()).some((p) => p.items.some((it) => it.kind === 'image' && it.upload === undefined))).toBe(true);
    render(<MemoryRouter><DataProvider sources={sources}><Home /></DataProvider></MemoryRouter>);
    await screen.findByRole('link', { name: /Job offer and a flat near it/ }, { timeout: 3000 });
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    expect(imagePreview).not.toHaveBeenCalled();
  });
});
