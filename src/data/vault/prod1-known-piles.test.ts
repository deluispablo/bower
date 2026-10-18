import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { FakeDrive } from '../drive/fake-drive';
import { seedFakeDrive } from '../fake/seed';
import { createUploadQueue, type UploadQueue } from '../upload-queue';
import { indexedDbUploadStore } from '../upload-store';
import { DriveVault } from './drive-vault';

const BYTES = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
const scan = (): { name: string; kind: 'pdf'; origin: string; body: Blob } => ({ name: 'scan.pdf', kind: 'pdf', origin: 'From this computer', body: new Blob([BYTES], { type: 'application/pdf' }) });

interface Page { drive: FakeDrive; queue: UploadQueue; vault: DriveVault }

function page(d: FakeDrive, idb: IDBFactory, root: string): Page {
  const queue = createUploadQueue({ drive: d, store: indexedDbUploadStore(idb), chunkSize: 4 });
  const vault = new DriveVault({ drive: d, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true, uploads: { queue, account: async () => 'ACCOUNT_A' } });
  return { drive: d, queue, vault };
}

/** Holds chunks from `start` on until `open()`. */
function holdAt(d: FakeDrive, start: number): { open: () => void } {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  d.beforeChunk = async (call) => {
    if (call.start >= start) await gate;
  };
  return { open: () => release() };
}

const reached = (d: FakeDrive, start: number): Promise<void> =>
  vi.waitFor(() => expect(d.resumableCalls.some((c) => c.op === 'put' && c.start === start)).toBe(true));

const pages: Page[] = [];
const holds: Array<{ open: () => void }> = [];
afterEach(() => {
  for (const h of holds.splice(0)) h.open();
  for (const p of pages.splice(0)) {
    p.queue.stop();
    p.vault.dispose();
  }
});

describe('the folder listing shows what is on its way', () => {
  it.each(['this page', 'a reload', 'a lone thing'])('listed_pile_includes_queued_pdf_before_transfer_finishes (%s)', async (source) => {
    const d0 = new FakeDrive({ chunkMultiple: 4 });
    const root = (await seedFakeDrive(d0, 'default', Date.now())) ?? '';
    const idb = new IDBFactory();
    const first = page(d0, idb, root);
    pages.push(first);
    const hold = holdAt(d0, 4);
    holds.push(hold);
    const pile = await first.vault.addPile({ text: source === 'a lone thing' ? '' : 'Receipts', items: [scan()] });
    await reached(d0, 4);
    let current = first;
    if (source === 'a reload') {
      const kept = await d0.snapshot();
      first.queue.stop();
      first.vault.dispose();
      const again = FakeDrive.restore(kept, { chunkMultiple: 4 });
      holds.push(holdAt(again, 4));
      current = page(again, idb, root);
      pages.push(current);
      await vi.waitFor(async () => expect(((await current.vault.piles()).find((p) => p.id === pile.id)?.items ?? []).map((i) => i.name)).toEqual(['scan.pdf']));
    }
    const { drive: d, vault } = current;
    const spies = [vi.spyOn(d, 'readText'), vi.spyOn(d, 'readBytes'), vi.spyOn(d, 'storedDigest')];
    const listed = (await vault.pilesListed()).find((p) => p.id === pile.id);
    for (const s of spies) {
      expect(s).not.toHaveBeenCalled();
      s.mockRestore();
    }
    expect(listed?.items.map((i) => [i.name, i.kind])).toEqual([['scan.pdf', 'pdf']]);
    const upload = listed?.items[0]?.upload ?? 0;
    expect(upload).toBeGreaterThan(0);
    expect(upload).toBeLessThan(1);
    expect(listed?.items).toEqual((await vault.piles()).find((p) => p.id === pile.id)?.items);

    for (const h of holds) h.open();
    await vi.waitFor(async () => expect((await d.listAll(root)).filter((f) => f.appProperties?.asAdded === 'scan.pdf')).toHaveLength(1));
    await vi.waitFor(async () => {
      const after = (await vault.pilesListed()).find((p) => p.id === pile.id);
      expect(after?.items.map((i) => [i.name, i.upload])).toEqual([['scan.pdf', undefined]]);
    });
  });
});
