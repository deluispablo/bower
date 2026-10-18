import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import type { DriveFile } from '../drive/drive-api';
import { seedFakeDrive } from '../fake/seed';
import { PILE_NOTE } from '../piles';
import { BowerError, type NewPile } from '../types';
import { DriveVault } from './drive-vault';
import { PROP } from './layout';

const AT = Date.parse('2026-10-10T12:00:00Z');
const WORDS: NewPile = { text: 'Context from Alex', items: [] };
const LINK: NewPile = { text: 'Rowing dues', items: [{ name: 'Rowing', kind: 'link', origin: 'Pasted', url: 'https://example.com/rowing' }] };

interface Deferred { promise: Promise<void>; resolve: () => void }
const deferred = (): Deferred => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
};

/** One relisting of the folder: its `listAll` is held at `gate`, from a snapshot taken when it is called (or `snapshot`). */
interface Hold { gate: Deferred; called: Deferred; snapshot?: DriveFile[]; fail?: boolean; done?: Promise<void> }
const hold = (more: Partial<Hold> = {}): Hold => ({ gate: deferred(), called: deferred(), ...more });

interface Page { drive: FakeDrive; root: string; inbox: string; vault: DriveVault; holds: Hold[] }
const pages: DriveVault[] = [];

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  for (const v of pages.splice(0)) v.dispose();
  vi.restoreAllMocks();
});

async function setup(): Promise<Page> {
  let tick = AT;
  const drive = new FakeDrive({ chunkMultiple: 4, clock: () => (tick += 1000) });
  const root = (await seedFakeDrive(drive, 'default', AT)) ?? '';
  const inbox = (await drive.listAll(root)).find((f) => f.folder && f.name === 'Inbox' && f.parents[0] === root)?.id ?? '';
  const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true });
  pages.push(vault);
  const holds: Hold[] = [];
  const list = drive.listAll.bind(drive);
  vi.spyOn(drive, 'listAll').mockImplementation(async (...args) => {
    const h = args[0] === root ? holds.shift() : undefined;
    if (!h) return list(...args);
    const files = h.snapshot ?? (await list(...args));
    h.called.resolve();
    if (h.fail) throw new BowerError('offline', 'You are offline.');
    await h.gate.promise;
    return files;
  });
  return { drive, root, inbox, vault, holds };
}

/** Starts a relisting held by `h`, and waits until its snapshot is taken. */
function relist(p: Page, h: Hold): () => Promise<void> {
  return async () => {
    p.holds.push(h);
    h.done = p.vault.refresh();
    h.done.catch(() => undefined);
    await h.called.promise;
  };
}

/** Runs `folder` before the pile folder is made and `note` before its note, once each. */
function during(p: Page, step: { folder?: () => Promise<void>; note?: () => Promise<void> }): void {
  const folder = p.drive.createFolder.bind(p.drive);
  const text = p.drive.createText.bind(p.drive);
  vi.spyOn(p.drive, 'createFolder').mockImplementation(async (...a) => {
    const go = a[0] === p.inbox && a[2]?.[PROP.declaration] ? step.folder : undefined;
    step.folder = go ? undefined : step.folder;
    if (go) await go();
    return folder(...a);
  });
  vi.spyOn(p.drive, 'createText').mockImplementation(async (...a) => {
    const go = a[1] === PILE_NOTE ? step.note : undefined;
    step.note = go ? undefined : step.note;
    if (go) await go();
    return text(...a);
  });
}

const once = async (p: Page, id: string): Promise<void> => {
  expect((await p.vault.pilesListed()).filter((x) => x.id === id)).toHaveLength(1);
  expect((await p.vault.piles()).filter((x) => x.id === id)).toHaveLength(1);
};
const gone = async (p: Page, id: string): Promise<void> => {
  expect((await p.vault.pilesListed()).filter((x) => x.id === id)).toEqual([]);
  expect((await p.vault.piles()).filter((x) => x.id === id)).toEqual([]);
};
const folderOf = async (p: Page, id: string): Promise<DriveFile> => {
  const f = (await p.drive.listAll(p.root)).find((x) => x.folder && x.appProperties?.[PROP.pile] === id);
  if (!f) throw new Error('The pile folder was not made.');
  return f;
};

describe('a relisting never loses this page\'s own writes', () => {
  it.each([
    ['words only', 'after the save', WORDS],
    ['words only', 'between folder and note', WORDS],
    ['words + link', 'after the save', LINK],
    ['words + link', 'between folder and note', LINK],
  ] as const)('relisting_during_save_keeps_the_new_pile (%s, %s)', async (_kind, landing, input) => {
    const p = await setup();
    const before = (await p.vault.orphanSummary()).count;
    const h = hold();
    during(p, {
      folder: relist(p, h),
      ...(landing === 'between folder and note' ? { note: async () => { h.gate.resolve(); await h.done; } } : {}),
    });
    const pile = await p.vault.addPile(input);
    h.gate.resolve();
    await h.done;
    await once(p, pile.id);
    expect((await p.vault.orphanSummary()).count).toBe(before);
    if (input === WORDS) {
      await p.vault.updatePile(pile.id, 'Context from Alex, edited', 'Context from Alex');
      const folder = await folderOf(p, pile.id);
      const note = (await p.drive.listAll(p.root)).find((f) => f.name === PILE_NOTE && f.parents[0] === folder.id);
      expect(await p.drive.readText(note?.id ?? '')).toContain('Context from Alex, edited');
    }
  });

  it('two_relistings_during_one_save', async () => {
    const p = await setup();
    const first = hold();
    const second = hold();
    during(p, {
      folder: relist(p, first),
      note: async () => {
        await relist(p, second)();
        first.gate.resolve();
        await first.done;
      },
    });
    const pile = await p.vault.addPile(WORDS);
    second.gate.resolve();
    await second.done;
    await once(p, pile.id);
    expect((await p.vault.piles()).find((x) => x.id === pile.id)?.text).toBe('Context from Alex');
  });

  it('failed_relisting_then_success (guard)', async () => {
    const p = await setup();
    const before = (await p.vault.orphanSummary()).count;
    const h = hold({ fail: true });
    during(p, { folder: relist(p, h) });
    const pile = await p.vault.addPile(WORDS);
    await expect(h.done).rejects.toMatchObject({ code: 'offline' });
    await p.vault.refresh();
    await once(p, pile.id);
    expect((await p.vault.orphanSummary()).count).toBe(before);
  });

  it('removed_elsewhere_is_gone_after_the_second_listing (guard)', async () => {
    const p = await setup();
    const pre = await p.drive.listAll(p.root, { checksums: true });
    const pile = await p.vault.addPile(WORDS);
    const h = hold({ snapshot: pre });
    h.gate.resolve();
    p.holds.push(h);
    await p.vault.refresh();
    await p.drive.trash((await folderOf(p, pile.id)).id);
    await p.vault.refresh();
    await gone(p, pile.id);
  });

  it('removed_pile_stays_removed_across_an_older_listing', async () => {
    const p = await setup();
    const pile = await p.vault.addPile(WORDS);
    const folder = await folderOf(p, pile.id);
    const pre = await p.drive.listAll(p.root, { checksums: true });
    const h = hold({ snapshot: pre });
    const trash = p.drive.trash.bind(p.drive);
    vi.spyOn(p.drive, 'trash').mockImplementation(async (...a) => {
      if (a[0] === folder.id && !h.done) await relist(p, h)();
      return trash(...a);
    });
    await p.vault.removePile(pile.id);
    h.gate.resolve();
    await h.done;
    await gone(p, pile.id);
  });
});
