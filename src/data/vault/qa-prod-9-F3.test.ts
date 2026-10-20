/**
 * qa-prod-9-F3: the Bin lookup checks its hits' places together, bounded, and Home's opening asks the Bin once, whatever
 * this device's upload queue holds (specs/qa-prod-9/plan.md, F3). Prior art: Drive v3 "Usage limits" (stay within the
 * per-user rate; 403 and 429 are retried with backoff), run here through the repo's one bounded runner, `limiter`
 * with `READ_AHEAD`; TanStack Query's key-based dedupe (one answer per key while its evidence holds). The counts are the
 * performance guard: the pretend Drive charges nothing for a parent read, so no e2e can see this.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { FakeDrive } from '../drive/fake-drive';
import { DriveHttp } from '../drive/drive-http';
import type { DriveFile } from '../drive/drive-api';
import { BowerError, type NewPile } from '../types';
import { createUploadQueue, type UploadQueue } from '../upload-queue';
import { indexedDbUploadStore } from '../upload-store';
import { DriveVault } from './drive-vault';

const AT = Date.parse('2026-10-10T12:00:00Z');
const ACCOUNT = 'ACCOUNT_A';

describe('the real Bin lookup reads its hits\' places together', () => {
  const folder = (id: string): object => ({ id, name: id, mimeType: 'application/vnd.google-apps.folder', parents: ['root'], modifiedTime: '2026-10-09T10:00:00.000Z', createdTime: '2026-10-09T10:00:00.000Z' });
  const hit = (n: number, place: string): object => ({
    id: `hit${n}`, name: `hit${n}.pdf`, mimeType: 'application/pdf', parents: [place], modifiedTime: '2026-10-09T10:00:00.000Z',
    createdTime: '2026-10-09T10:00:00.000Z', appProperties: { bowerItem: 'KEY' }, size: '3', sha256Checksum: 'ab', trashed: true,
  });

  /**
   * The root lists only `Inbox`; the Bin answers `hits` hits, hit n in the binned folder `bin<n % places>`, which is in no
   * listing; each folder's `files.get` answers `parents: ['INBOX']` once `open` resolves.
   */
  function scripted(hits: number, places: number, open: Promise<void>) {
    const seen = { gets: [] as string[], running: 0, most: 0 };
    const http = new DriveHttp({
      token: async () => 'token',
      fetch: async (url) => {
        const u = new URL(String(url));
        const got = /\/files\/([^/]+)$/.exec(u.pathname)?.[1];
        if (got) {
          seen.gets.push(got);
          seen.running += 1;
          seen.most = Math.max(seen.most, seen.running);
          await open;
          seen.running -= 1;
          return new Response(JSON.stringify({ id: got, parents: ['INBOX'] }));
        }
        const q = u.searchParams.get('q') ?? '';
        if (q.startsWith('trashed = true')) return new Response(JSON.stringify({ files: Array.from({ length: hits }, (_, n) => hit(n, `bin${n % places}`)) }));
        return new Response(JSON.stringify({ files: q.includes("'root' in parents") ? [folder('INBOX')] : [] }));
      },
    });
    return { http, seen };
  }

  it('qa9-bin-places-together: 14 hits in 14 binned folders have 8 places asked at once, then 14 gets in all', async () => {
    let release!: () => void;
    const { http, seen } = scripted(14, 14, new Promise<void>((r) => { release = r; }));
    const look = http.binnedByItem('root', ['KEY']);
    await vi.waitFor(() => expect(seen.gets.length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 50));
    expect(seen.running, 'R1: the hits\' places are asked together, READ_AHEAD at a time').toBe(8);
    release();
    const found = await look;
    expect(found.map((b) => b.file.id), 'R1: every hit, in listed order').toEqual(Array.from({ length: 14 }, (_, n) => `hit${n}`));
    expect(seen.gets, 'R1: one files.get per binned folder').toHaveLength(14);
  });

  it('qa9-bin-places-bounded: 40 hits in 20 folders never have more than 8 gets in flight, and each folder is asked once', async () => {
    const { http, seen } = scripted(40, 20, new Promise<void>((r) => setTimeout(r, 5)));
    const found = await http.binnedByItem('root', ['KEY']);
    expect(seen.most, 'R1: bounded by READ_AHEAD, and reaching it').toBe(8);
    expect(found).toHaveLength(40);
    expect([...seen.gets].sort(), 'R1: a folder several hits share is asked once').toEqual(Array.from({ length: 20 }, (_, n) => `bin${n}`).sort());
  });
});

describe('Home\'s opening asks the Bin once with a pile left in this device\'s queue', () => {
  const pages: DriveVault[] = [];
  const queues: UploadQueue[] = [];

  beforeEach(() => {
    vi.setSystemTime(AT);
    localStorage.clear();
  });

  afterEach(async () => {
    for (const queue of queues) queue.stop();
    await Promise.all(queues.map((queue) => queue.idle()));
    for (const page of pages) page.dispose();
    pages.length = queues.length = 0;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const input = (tag: string, n: number): NewPile => ({
    text: '', items: Array.from({ length: n }, (_, i) => ({ name: `${tag}-${i}.pdf`, kind: 'pdf' as const, origin: 'From this computer', body: new Blob([`%PDF ${tag} ${i}`], { type: 'application/pdf' }) })),
  });

  /** Seven binned two-thing piles, one live pile, and one pile whose upload stayed in the device's queue, unsent. */
  async function opening(): Promise<{ drive: FakeDrive; fresh: () => DriveVault }> {
    const drive = new FakeDrive({ clock: () => AT, chunkMultiple: 4 });
    const root = (await drive.createFolder('root', 'Bower')).id;
    const inbox = (await drive.createFolder(root, 'Inbox')).id;
    await drive.createFolder((await drive.createFolder(root, '.bower')).id, 'piles');
    const idb = new IDBFactory();
    const page = (queued: boolean): DriveVault => {
      const queue = queued ? createUploadQueue({ drive, store: indexedDbUploadStore(idb), chunkSize: 4, now: () => new Date(AT) }) : undefined;
      if (queue) queues.push(queue);
      const v = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true, device: 'DEVICE_A', ...(queue ? { uploads: { queue, account: async () => ACCOUNT } } : {}) });
      pages.push(v);
      return v;
    };
    const uploader = page(false);
    for (let i = 0; i < 7; i++) await uploader.addPile(input(`p${i}`, 2));
    await uploader.settled();
    // A binned thing is trashed with its children (the fake does not inherit trash, Drive does).
    const listed = async (): Promise<DriveFile[]> => (await drive.listAll(inbox)).filter((f) => f.parents[0] === inbox);
    for (const f of await listed()) {
      for (const c of (await drive.listAll(f.id)).filter((x) => x.parents[0] === f.id)) await drive.trash(c.id);
      await drive.trash(f.id);
    }
    await uploader.addPile(input('live', 2));
    await uploader.settled();
    drive.beforeChunk = () => { throw new BowerError('offline', 'You are offline.'); };
    const sender = page(true);
    await sender.addPile(input('queued', 1));
    await sender.settled();
    sender.dispose();
    expect(await listed(), 'setup: the live pile only').toHaveLength(1);
    return { drive, fresh: () => page(true) };
  }

  it('qa9-one-lookup-with-a-queued-pile: piles() then orphanSummary(), and the three together, each call binnedByItem once', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { drive, fresh } = await opening();
    const spy = vi.spyOn(drive, 'binnedByItem');
    const home = fresh();
    await home.piles();
    await home.orphanSummary();
    expect(spy, 'R2: one Bin lookup for the opening, sequential').toHaveBeenCalledTimes(1);
    spy.mockClear();
    const other = fresh();
    await Promise.all([other.piles(), other.orphanSummary(), other.piles()]);
    expect(spy, 'R2: one Bin lookup for the opening, concurrent').toHaveBeenCalledTimes(1);
  });
});
