import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { FakeDrive } from '../drive/fake-drive';
import { seedFakeDrive } from '../fake/seed';
import { createUploadQueue, type UploadQueue } from '../upload-queue';
import { indexedDbUploadStore } from '../upload-store';
import { BowerError, type NewPile } from '../types';
import { DriveVault } from './drive-vault';
import { PROP } from './layout';

const AT = Date.parse('2026-10-10T12:00:00Z');
const scan = (): NewPile['items'][number] => ({ name: 'scan.pdf', kind: 'pdf', origin: 'From this computer', body: new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])], { type: 'application/pdf' }) });
const WORDS: NewPile = { text: 'Context from Alex', items: [] };
const LINK: NewPile = { text: 'Rowing dues', items: [{ name: 'Rowing', kind: 'link', origin: 'Pasted', url: 'https://example.com/rowing' }] };
const PDF = (): NewPile => ({ text: 'Receipts', items: [scan()] });

type Summary = { count: number; complete: boolean };
interface Page { drive: FakeDrive; root: string; inbox: string; vault: DriveVault }

const vaults: DriveVault[] = [];
const queues: UploadQueue[] = [];
const holds: Array<() => void> = [];

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  for (const open of holds.splice(0)) open();
  for (const q of queues.splice(0)) q.stop();
  for (const v of vaults.splice(0)) v.dispose();
  vi.restoreAllMocks();
});

async function setup(): Promise<Page> {
  let tick = AT;
  const drive = new FakeDrive({ chunkMultiple: 4, clock: () => (tick += 1000) });
  const root = (await seedFakeDrive(drive, 'default', AT)) ?? '';
  const inbox = (await drive.listAll(root)).find((f) => f.folder && f.name === 'Inbox' && f.parents[0] === root)?.id ?? '';
  const queue = createUploadQueue({ drive, store: indexedDbUploadStore(new IDBFactory()), chunkSize: 4 });
  queues.push(queue);
  const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true, uploads: { queue, account: async () => 'ACCOUNT_A' } });
  vaults.push(vault);
  return { drive, root, inbox, vault };
}

/** Holds every chunk from `start` on until the test ends. */
function holdAt(d: FakeDrive, start: number): void {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  holds.push(() => release());
  d.beforeChunk = async (call) => {
    if (call.start >= start) await gate;
  };
}

const reached = (d: FakeDrive, start: number): Promise<void> =>
  vi.waitFor(() => expect(d.resumableCalls.some((c) => c.op === 'put' && c.start === start)).toBe(true));

/** Before the pile folder is made (once): reads the summary into `mid`, then makes the folder or runs `fail`. */
function midway(p: Page, fail?: () => never): { mid: () => Summary | undefined } {
  let mid: Summary | undefined;
  let done = false;
  const folder = p.drive.createFolder.bind(p.drive);
  vi.spyOn(p.drive, 'createFolder').mockImplementation(async (...a) => {
    if (!done && a[0] === p.inbox && a[2]?.[PROP.declaration]) {
      done = true;
      mid = await p.vault.orphanSummary();
      if (fail) fail();
    }
    return folder(...a);
  });
  return { mid: () => mid };
}

describe('own_save_not_counted', () => {
  it.each([['words only', () => WORDS], ['words + link', () => LINK], ['words + pdf', PDF]] as const)(
    'a summary read during this page\'s own save never counts it (%s)', async (_kind, input) => {
      const p = await setup();
      const before = await p.vault.orphanSummary();
      const step = midway(p);
      await p.vault.addPile(input());
      expect(step.mid()).toEqual(before);
      expect(await p.vault.orphanSummary()).toEqual(before);
    },
  );
});

describe('own_loose_send_not_counted', () => {
  it('a loose thing still sending, and a words-only pile in its gap beside it, are never counted', async () => {
    const p = await setup();
    const before = await p.vault.orphanSummary();
    holdAt(p.drive, 4);
    await p.vault.addPile({ text: '', items: [scan()] });
    await reached(p.drive, 4);
    expect(await p.vault.orphanSummary()).toEqual(before);
    const step = midway(p);
    await p.vault.addPile(WORDS);
    expect(step.mid()).toEqual(before);
  });
});

describe('real_orphan_still_counted', () => {
  const offline = (): never => { throw new BowerError('offline', 'You are offline.'); };

  it('a save whose folder creation fails is counted afterwards, on this page and on another', async () => {
    const p = await setup();
    const before = await p.vault.orphanSummary();
    const step = midway(p, offline);
    await expect(p.vault.addPile(LINK)).rejects.toMatchObject({ code: 'offline' });
    expect(step.mid()).toEqual(before);
    expect(await p.vault.orphanSummary()).toEqual({ count: before.count + 1, complete: true });
    const other = new DriveVault({ drive: p.drive, rootId: async () => p.root, runningPiles: () => new Set(), declarePiles: true });
    vaults.push(other);
    expect(await other.orphanSummary()).toEqual({ count: before.count + 1, complete: true });
  });

  it('a failed save tells its readers, and the next summary counts it', async () => {
    const p = await setup();
    const before = await p.vault.orphanSummary();
    let failed = false;
    midway(p, () => { failed = true; return offline(); });
    const told: boolean[] = [];
    p.vault.subscribe(() => told.push(failed));
    await expect(p.vault.addPile(LINK)).rejects.toMatchObject({ code: 'offline' });
    expect(told).toContain(true);
    expect(await p.vault.orphanSummary()).toEqual({ count: before.count + 1, complete: true });
  });
});
