import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import { FakeDrive } from '@/data/drive/fake-drive';
import { seedFakeDrive } from '@/data/fake/seed';
import { DriveVault } from '@/data/vault/drive-vault';
import { PROP } from '@/data/vault/layout';
import { loadingSources } from '@/testing/loading-sources';
import { Home } from './Home';

let vault: DriveVault | null = null;

afterEach(() => {
  vault?.dispose();
  cleanup();
  vi.restoreAllMocks();
});

/** Home over the real vault, every door bound to it; its full read waits for `full`. */
function show(v: DriveVault, full: Promise<void>): HTMLElement {
  const base = loadingSources();
  const proxy = new Proxy({}, {
    get: (_t, k) => {
      if (k === 'piles') return async (...a: Parameters<DriveVault['piles']>) => { await full; return v.piles(...a); };
      const own: unknown = Reflect.get(v, k);
      return typeof own === 'function' ? (own as (...a: unknown[]) => unknown).bind(v) : Reflect.get(base.vault, k);
    },
  }) as Sources['vault'];
  render(<MemoryRouter><DataProvider sources={{ ...base, vault: proxy, runs: { ...base.runs, current: async () => null } }}><Home /></DataProvider></MemoryRouter>);
  return screen.getByRole('region', { name: 'Inbox' });
}

const subtitleOf = (inbox: HTMLElement): string => inbox.querySelector('p.muted')?.textContent ?? '';
const countOf = (said: string): number => Number(/^(\d+) things? waiting/.exec(said)?.[1] ?? 0);
const unfinished = (): number => screen.queryAllByText(/didn't finish arriving/).length;

describe('home_after_leaving_add_mid_save', () => {
  it('lists and counts the pile a relisting started mid-save', async () => {
    const d = new FakeDrive({ chunkMultiple: 4 });
    const root = (await seedFakeDrive(d, 'default', Date.now())) ?? '';
    const inbox = (await d.listAll(root)).find((f) => f.folder && f.name === 'Inbox' && f.parents[0] === root)?.id ?? '';
    const v = new DriveVault({ drive: d, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true });
    vault = v;

    const first = show(v, Promise.resolve());
    await waitFor(() => expect(subtitleOf(first)).toMatch(/waiting/));
    const before = countOf(subtitleOf(first));
    await waitFor(() => expect(within(first).queryByText('Looking…')).toBeNull());
    const unfinishedBefore = unfinished();
    cleanup();

    // A relisting starts as the pile folder is made; its listing was taken before the folder and lands after the save.
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let called!: () => void;
    const taken = new Promise<void>((r) => { called = r; });
    let armed = false;
    const list = d.listAll.bind(d);
    vi.spyOn(d, 'listAll').mockImplementation(async (...a) => {
      if (!armed || a[0] !== root) return list(...a);
      armed = false;
      const files = await list(...a);
      called();
      await gate;
      return files;
    });
    let refreshed: Promise<void> | null = null;
    const create = d.createFolder.bind(d);
    vi.spyOn(d, 'createFolder').mockImplementation(async (...a) => {
      if (a[0] === inbox && a[2]?.[PROP.declaration] && !refreshed) {
        armed = true;
        refreshed = v.refresh();
        await taken;
      }
      return create(...a);
    });
    await v.addPile({ text: 'Context from Alex', items: [] });
    release();
    await refreshed;

    let open!: () => void;
    const full = new Promise<void>((r) => { open = r; });
    const home = show(v, full);
    expect(await within(home).findByRole('link', { name: /Context from Alex/ })).toBeVisible();
    open();
    await waitFor(() => expect(subtitleOf(home)).toMatch(/waiting/));
    expect(countOf(subtitleOf(home))).toBe(before + 1);
    await waitFor(() => expect(unfinished()).toBeLessThanOrEqual(unfinishedBefore));
    expect(unfinished()).toBe(unfinishedBefore);
  });
});
