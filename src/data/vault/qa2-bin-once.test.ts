import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { DriveHttp } from '../drive/drive-http';
import { driveError, type DriveFile } from '../drive/drive-api';
import type { NewPile } from '../types';
import { DriveVault } from './drive-vault';
import { PROP } from './layout';

const AT = Date.parse('2026-10-10T12:00:00Z');
const vaults: DriveVault[] = [];
let drive: FakeDrive;
let root: string;
let inbox: string;

async function freshDrive(): Promise<void> {
  for (const v of vaults) v.dispose();
  vaults.length = 0;
  drive = new FakeDrive({ clock: () => AT });
  root = (await drive.createFolder('root', 'Bower')).id;
  inbox = (await drive.createFolder(root, 'Inbox')).id;
  await drive.createFolder((await drive.createFolder(root, '.bower')).id, 'piles');
}

beforeEach(async () => {
  vi.setSystemTime(AT);
  localStorage.clear();
  await freshDrive();
});

afterEach(() => {
  for (const v of vaults) v.dispose();
  vaults.length = 0;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const page = (): DriveVault => {
  const v = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true, device: 'DEVICE_A' });
  vaults.push(v);
  return v;
};
const input = (tag: string, n: number): NewPile => ({
  text: '', items: Array.from({ length: n }, (_, i) => ({ name: `${tag}-${i}.pdf`, kind: 'pdf' as const, origin: 'From this computer', body: new Blob([`%PDF ${tag} ${i}`], { type: 'application/pdf' }) })),
});
/** A binned thing is trashed with its children (the fake does not inherit trash, Drive does). */
const bin = async (file: DriveFile): Promise<void> => {
  if (file.folder) for (const c of (await drive.listAll(file.id)).filter((f) => f.parents[0] === file.id)) await drive.trash(c.id);
  await drive.trash(file.id);
};
const inInbox = async (): Promise<DriveFile[]> => (await drive.listAll(inbox)).filter((f) => f.parents[0] === inbox);

/** `n` folder piles added and settled, then each put in the Bin; the Bin evidence is checked to be there. */
async function binnedPiles(n: number): Promise<void> {
  const uploader = page();
  for (let i = 0; i < n; i++) await uploader.addPile(input(`p${i}`, 2));
  await uploader.settled();
  const before = await inInbox();
  expect(before).toHaveLength(n);
  const folders = before.filter((f) => f.folder);
  const keys: string[] = [];
  for (const f of folders) for (const c of (await drive.listAll(f.id)).filter((x) => x.parents[0] === f.id)) keys.push(c.appProperties?.[PROP.item] ?? '');
  for (const f of before) await bin(f);
  expect(keys.length).toBeGreaterThan(0);
  expect((await drive.binnedByItem(root, keys)).length).toBe(n * 2);
}

describe('one Inbox read asks the Bin once', () => {
  it('one Inbox read asks the Bin the same number of times with 2 and with 20 binned piles', async () => {
    const calls: number[] = [];
    for (const n of [2, 20]) {
      await freshDrive();
      await binnedPiles(n);
      const spy = vi.spyOn(drive, 'binnedByItem');
      await page().piles();
      calls.push(spy.mock.calls.length);
    }
    expect(calls[0]).toBe(calls[1]);
    expect(calls[1]).toBeLessThanOrEqual(1);
  });

  it('a Bin lookup that fails is asked once and logged once, and the summary says it is incomplete', async () => {
    await binnedPiles(20);
    const failure = driveError('offline');
    const spy = vi.spyOn(drive, 'binnedByItem').mockRejectedValue(failure);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const summary = await page().orphanSummary();
    expect(summary.complete).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(log.mock.calls.filter((c) => c[0] === failure)).toHaveLength(1);
  });

  it('the orphan count and the piles ids are unchanged for 20 binned piles', async () => {
    await binnedPiles(20);
    const v = page();
    expect(await v.piles()).toEqual([]);
    expect(await v.orphanSummary()).toEqual({ count: 0, complete: true });
  });

  it('a missing loose item, a binned loose item and a binned folder in one read: the rows, the count and one lookup', async () => {
    // The first loose item never arrives: its upload fails and its declaration stays.
    drive.beforeChunk = () => { throw driveError('offline'); };
    const lost = page();
    const missing = await lost.addPile(input('missing', 1));
    await lost.settled();
    drive.beforeChunk = null;
    const uploader = page();
    const looseBinned = await uploader.addPile(input('loose', 1));
    const folderBinned = await uploader.addPile(input('folder', 2));
    await uploader.settled();
    for (const f of await inInbox()) if (f.name.startsWith('loose') || f.folder) await bin(f);
    const spy = vi.spyOn(drive, 'binnedByItem');
    const v = page();
    const piles = await v.piles();
    const label = (id: string): string => (id === missing.id ? 'missing' : id === looseBinned.id ? 'loose' : id === folderBinned.id ? 'folder' : 'other');
    expect(piles.map((p) => [label(p.id), p.setAside])).toEqual([['missing', undefined]]);
    expect(await v.orphanSummary()).toEqual({ count: 1, complete: true });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('after a failed lookup, repeated and concurrent reads reuse it; after refresh a new lookup completes', async () => {
    await binnedPiles(3);
    const failure = driveError('offline');
    const spy = vi.spyOn(drive, 'binnedByItem').mockRejectedValueOnce(failure);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const v = page();
    expect((await v.orphanSummary()).complete).toBe(false);
    const logged = log.mock.calls.length;
    await Promise.all([v.orphanSummary(), v.piles(), v.orphanSummary()]);
    expect((await v.orphanSummary()).complete).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(log.mock.calls.length).toBe(logged);
    await v.refresh();
    expect((await v.orphanSummary()).complete).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('a refresh while the first lookup is pending: the old rejection does not replace the new complete result', async () => {
    await binnedPiles(3);
    const real = drive.binnedByItem.bind(drive);
    let reject!: (e: unknown) => void;
    const spy = vi.spyOn(drive, 'binnedByItem').mockImplementationOnce(() => new Promise((_, r) => { reject = r; }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const v = page();
    const cold = [v.orphanSummary(), v.orphanSummary(), v.orphanSummary()];
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockImplementation(real);
    await v.refresh();
    expect((await v.orphanSummary()).complete).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
    reject(driveError('offline'));
    await Promise.allSettled(cold);
    expect((await v.orphanSummary()).complete).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('an empty Inbox and fully accounted declarations make no Bin call, even when the Bin would reject', async () => {
    const spy = vi.spyOn(drive, 'binnedByItem').mockRejectedValue(driveError('offline'));
    const empty = page();
    expect(await empty.piles()).toEqual([]);
    expect((await empty.orphanSummary()).complete).toBe(true);
    const uploader = page();
    await uploader.addPile(input('kept', 2));
    await uploader.settled();
    const reader = page();
    expect(await reader.piles()).toHaveLength(1);
    expect(await reader.orphanSummary()).toEqual({ count: 0, complete: true });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('the real Bin lookup at its page cap', () => {
  const wire = (id: string): object => ({ id, name: `${id}.pdf`, mimeType: 'application/pdf', parents: ['root'], modifiedTime: '2026-10-09T10:00:00.000Z', createdTime: '2026-10-09T10:00:00.000Z', appProperties: { bowerItem: 'KEY' }, size: '3', sha256Checksum: 'ab' });
  /** Two pages answered (the cap), the last with a next page when `more`. */
  const http = (more: boolean): DriveHttp => new DriveHttp({
    token: async () => 'token',
    fetch: async (url) => {
      const q = new URL(String(url)).searchParams;
      if (q.get('q')?.includes('trashed = true') !== true) return new Response(JSON.stringify({ files: [wire('live')] }));
      const at = Number(q.get('pageToken') ?? 0);
      return new Response(JSON.stringify({ files: [wire(`hit${at}`)], ...(at === 0 || more ? { nextPageToken: String(at + 1) } : {}) }));
    },
  });

  it('refuses when another page remains after the cap', async () => {
    await expect(http(true).binnedByItem('root', ['KEY'])).rejects.toMatchObject({ code: 'unknown' });
  });

  it('answers when the last allowed page has no next page', async () => {
    expect((await http(false).binnedByItem('root', ['KEY'])).map((b) => b.file.id)).toEqual(['hit0', 'hit1']);
  });
});
