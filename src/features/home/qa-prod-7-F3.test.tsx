import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import { FakeDrive } from '@/data/drive/fake-drive';
import { seedFakeDrive } from '@/data/fake/seed';
import { createUploadQueue, type UploadQueue } from '@/data/upload-queue';
import { indexedDbUploadStore } from '@/data/upload-store';
import { DriveVault } from '@/data/vault/drive-vault';
import { loadingSources } from '@/testing/loading-sources';
import { Home } from './Home';

const scan = (): { name: string; kind: 'pdf'; origin: string; body: Blob } => ({ name: 'scan.pdf', kind: 'pdf', origin: 'From this computer', body: new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])], { type: 'application/pdf' }) });

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

describe('home_shows_no_notice_for_own_send', () => {
  it('a loose thing this page is still sending never shows as one that did not finish arriving', async () => {
    const { d, v } = await setup();
    await v.addPile({ text: '', items: [scan()] });
    await vi.waitFor(() => expect(d.resumableCalls.some((c) => c.op === 'put' && c.start === 4)).toBe(true));
    const summary = vi.fn(() => v.orphanSummary());
    const base = loadingSources();
    const doors: Record<string, unknown> = {
      pilesListed: () => v.pilesListed(),
      subscribe: (cb: () => void) => v.subscribe(cb),
      piles: () => v.piles(),
      orphanSummary: summary,
      uploadNotice: async () => null,
      questions: async () => [],
      changes: async () => [],
      suggestions: async () => [],
    };
    const proxy = new Proxy({}, { get: (_t, k) => (typeof k === 'string' && k in doors ? doors[k] : Reflect.get(base.vault, k)) }) as Sources['vault'];
    render(
      <MemoryRouter>
        <DataProvider sources={{ ...base, vault: proxy, runs: { ...base.runs, current: async () => null } }}>
          <Home />
        </DataProvider>
      </MemoryRouter>,
    );
    await vi.waitFor(() => expect(summary).toHaveBeenCalled());
    await act(async () => {
      await summary.mock.results.at(-1)?.value;
    });
    expect(screen.queryByText(/didn't finish arriving/)).toBeNull();
    expect(screen.queryByText(/couldn't check that everything you added arrived/)).toBeNull();
  });
});
