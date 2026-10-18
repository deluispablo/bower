import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { Pile } from '@/data/types';
import { FakeDrive } from '@/data/drive/fake-drive';
import { seedFakeDrive } from '@/data/fake/seed';
import { createUploadQueue, type UploadQueue } from '@/data/upload-queue';
import { indexedDbUploadStore } from '@/data/upload-store';
import { DriveVault } from '@/data/vault/drive-vault';
import { loadingSources } from '@/testing/loading-sources';
import { useUi } from '@/app/ui-store';
import { plural } from '@/app/words';
import { TidySheet } from '@/features/tidy/TidySheet';
import { TidyButton } from '@/features/tidy/TidyButton';
import { Home } from './Home';

const scan = (): { name: string; kind: 'pdf'; origin: string; body: Blob } => ({ name: 'scan.pdf', kind: 'pdf', origin: 'From this computer', body: new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])], { type: 'application/pdf' }) });
const never = (): Promise<never> => new Promise(() => undefined);

let open = (): void => undefined;
let queue: UploadQueue | null = null;
let vault: DriveVault | null = null;

afterEach(() => {
  open();
  queue?.stop();
  vault?.dispose();
  cleanup();
});

async function setup(): Promise<{ d: FakeDrive; v: DriveVault }> {
  const d = new FakeDrive({ chunkMultiple: 4 });
  const root = (await seedFakeDrive(d, 'default', Date.now())) ?? '';
  queue = createUploadQueue({ drive: d, store: indexedDbUploadStore(new IDBFactory()), chunkSize: 4 });
  const v = new DriveVault({ drive: d, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true, uploads: { queue, account: async () => 'ACCOUNT_A' } });
  vault = v;
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  open = () => release();
  d.beforeChunk = async (call) => {
    if (call.start >= 4) await gate;
  };
  return { d, v };
}

/** Home, the tidy-up sheet and the desktop Tidy up button, in one provider over the vault. */
function show(v: DriveVault, piles: () => Promise<Pile[]>): void {
  const base = loadingSources();
  const doors: Record<string, unknown> = {
    pilesListed: () => v.pilesListed(),
    subscribe: (cb: () => void) => v.subscribe(cb),
    piles,
    uploadNotice: async () => null,
    questions: async () => [],
    changes: async () => [],
    suggestions: async () => [],
  };
  const proxy = new Proxy({}, { get: (_t, k) => (typeof k === 'string' && k in doors ? doors[k] : Reflect.get(base.vault, k)) }) as Sources['vault'];
  useUi.setState({ tidyOpen: false });
  render(
    <MemoryRouter>
      <DataProvider sources={{ ...base, vault: proxy, runs: { ...base.runs, current: async () => null } }}>
        <div role="group" aria-label="Top bar"><TidyButton /></div>
        <Home />
        <TidySheet />
      </DataProvider>
    </MemoryRouter>,
  );
}

const reached = (d: FakeDrive): Promise<void> =>
  vi.waitFor(() => expect(d.resumableCalls.some((c) => c.op === 'put' && c.start === 4)).toBe(true));

const topButton = (): HTMLElement => within(screen.getByRole('group', { name: 'Top bar' })).getByRole('button');

describe('listed_pile_counts_while_full_read_lags', () => {
  it('every count follows the rows shown, before and after the held full read lands', async () => {
    const { d, v } = await setup();
    // Each full read is held on its own from the add on; release() answers every held one with a fresh read.
    let holding = false;
    let answered = 0;
    let held: Array<() => void> = [];
    const pending: Array<Promise<Pile[]>> = [];
    const piles = (): Promise<Pile[]> => {
      if (!holding) return v.piles().then((p) => { answered++; return p; });
      const p = new Promise<Pile[]>((res, rej) => { held.push(() => { v.piles().then(res, rej); }); });
      pending.push(p);
      return p;
    };
    const release = (): void => {
      holding = false;
      const now = held;
      held = [];
      now.forEach((go) => go());
    };
    show(v, piles);
    const inbox = screen.getByRole('region', { name: 'Inbox' });
    const subtitle = (): string => inbox.querySelector('p.muted')?.textContent ?? '';
    // Home's, the sheet's and the button's first full reads have answered.
    await waitFor(() => expect(subtitle()).not.toBe('Looking…'));
    await waitFor(() => expect(answered).toBeGreaterThanOrEqual(3));
    const said = subtitle();
    const n = said.startsWith('Nothing waiting') ? 0 : Number(/^(\d+) things? waiting/.exec(said)?.[1]);
    expect(Number.isInteger(n)).toBe(true);
    const things = plural(n + 1, 'thing');

    holding = true;
    await act(async () => {
      await v.addPile({ text: 'Receipts', items: [scan()] });
      await reached(d);
    });
    expect(await within(inbox).findByRole('link', { name: /Receipts.*1 thing/ })).toBeVisible();
    expect(subtitle().startsWith(`${things} waiting`)).toBe(true);
    expect(within(inbox).getByRole('button', { name: `Tidy up ${things}` })).toBeVisible();
    expect(topButton()).toHaveTextContent(new RegExp(`^Tidy up ${n + 1}$`));

    fireEvent.click(within(inbox).getByRole('button', { name: `Tidy up ${things}` }));
    const sheet = await screen.findByRole('dialog', { name: `Tidy up ${things}?` });
    expect(within(sheet).getByRole('button', { name: `Tidy up ${things}` })).toBeVisible();
    expect(within(sheet).queryByText('Nothing in the inbox')).toBeNull();

    // The held reads land, Receipts included: nothing jumps.
    expect(held.length).toBeGreaterThan(0);
    await act(async () => {
      release();
      await Promise.all(pending);
    });
    expect(screen.getByRole('dialog', { name: `Tidy up ${things}?` })).toBeVisible();

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(subtitle().startsWith(`${things} waiting`)).toBe(true);
    expect(within(inbox).getByRole('button', { name: `Tidy up ${things}` })).toBeVisible();
  });
});

describe('no_count_before_first_full_read', () => {
  it('a fresh Home whose first full read is held shows the listed row with no count anywhere', async () => {
    const { d, v } = await setup();
    await v.addPile({ text: 'Receipts', items: [scan()] });
    await reached(d);
    show(v, never);
    const inbox = screen.getByRole('region', { name: 'Inbox' });
    expect(await within(inbox).findByRole('link', { name: /Receipts.*1 thing/ })).toBeVisible();
    expect(within(inbox).getByText('Looking…')).toBeVisible();
    expect(within(inbox).queryByText(/\d+ things? waiting/)).toBeNull();
    expect(within(inbox).queryByRole('button', { name: /^Tidy up/ })).toBeNull();
    expect(topButton()).toHaveTextContent(/^Tidy up$/);
    expect(topButton()).toBeDisabled();
    act(() => useUi.getState().setTidy(true));
    const sheet = await screen.findByRole('dialog');
    expect(sheet.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(within(sheet).queryByText('Nothing in the inbox', { selector: 'p' })).toBeNull();
  });
});
