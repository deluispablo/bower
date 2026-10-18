import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
import { plural } from '@/app/words';
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
  render(<MemoryRouter><DataProvider sources={{ ...base, vault: proxy, runs: { ...base.runs, current: async () => null } }}><Home /></DataProvider></MemoryRouter>);
}

const reached = (d: FakeDrive): Promise<void> =>
  vi.waitFor(() => expect(d.resumableCalls.some((c) => c.op === 'put' && c.start === 4)).toBe(true));

describe('home_shows_known_upload_without_calling_it_a_note', () => {
  it('fresh Home while the full read is held', async () => {
    const { d, v } = await setup();
    await v.addPile({ text: 'Receipts', items: [scan()] });
    await reached(d);
    show(v, never);
    const inbox = screen.getByRole('region', { name: 'Inbox' });
    expect(await within(inbox).findByRole('link', { name: /Receipts.*1 thing/ })).toBeVisible();
    expect(within(inbox).queryByText('A note')).toBeNull();
    expect(within(inbox).getByText('Looking…')).toBeVisible();
    expect(within(inbox).queryByRole('button', { name: /^Tidy up/ })).toBeNull();
  });

  it('stale full read after leaving Add mid-save', async () => {
    const { d, v } = await setup();
    let calls = 0;
    show(v, () => (calls++ === 0 ? v.piles() : never()));
    const inbox = screen.getByRole('region', { name: 'Inbox' });
    const subtitle = (): string => inbox.querySelector('p.muted')?.textContent ?? '';
    await waitFor(() => expect(subtitle()).not.toBe('Looking…'));
    const said = subtitle();
    await act(async () => {
      await v.addPile({ text: 'Receipts', items: [scan()] });
      await reached(d);
    });
    expect(await within(inbox).findByRole('link', { name: /Receipts.*1 thing/ })).toBeVisible();
    const n = said.startsWith('Nothing waiting') ? 0 : Number(/^(\d+) things? waiting/.exec(said)?.[1]);
    expect(subtitle()).toBe(`${plural(n + 1, 'thing')} waiting. Tidy up when you have added everything.`);
    expect(within(inbox).queryByRole('button', { name: /^Tidy up/ })?.textContent ?? null).toBe(`Tidy up ${plural(n + 1, 'thing')}`);
  });
});
