import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { DriveHttp } from '../drive/drive-http';
import { seedFakeDrive } from '../fake/seed';
import { findNode } from '../tree';
import { BowerError } from '../types';
import { DriveVault, NOT_THE_SAME_TEXT } from './drive-vault';
import { noteRefusal } from './note-format';
import { planRun } from '../fake/fake-runner';
import { tidyUp } from '@/testing/tidy-up';
import { beforeUpload, holdChunks } from '@/testing/upload-hook';
import { SET_ASIDE_TEXT } from '../pile-readiness';
import { FakeRunService } from '../fake/fake-run-service';
import { parsePileDeclaration } from '../contracts/pile-declaration';
import { canonicalRecordJson, hashRecordJson } from '../contracts/record-json';
import { driveError, driveFailure, unconfirmedWriteError, UNCONFIRMED_WRITE_MESSAGE, type DriveFile, type DrivePatch, type WriteOptions } from '../drive/drive-api';
import { IDBFactory } from 'fake-indexeddb';
import { createUploadQueue, type StorageLike, type UploadQueue } from '../upload-queue';
import { indexedDbUploadStore, memoryUploadStore } from '../upload-store';
import { makeLiveSources, uploadAccount } from '../live';
import { FakeWorker } from '../fake/fake-worker';
import { pairQuestionId } from '../contracts/questions';
import { CHANGED_ELSEWHERE, notAsSeenReason, notRead } from '../contracts/still-as-seen';
import fc from 'fast-check';

const PASSPORT = 'Areas/Documents/Passport renewal.md';
let drive: FakeDrive;
let root: string;
let vault: DriveVault;

beforeEach(async () => {
  vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
  localStorage.clear();
  drive = new FakeDrive();
  root = (await seedFakeDrive(drive, 'default', Date.now())) ?? '';
  vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
});

afterEach(() => vi.useRealTimers());

/** A fixture where the context was never created, with no Bin entry. */
async function contextNeverCreated(ids: string[]): Promise<void> {
  const missing = new Set(ids);
  const kept = JSON.parse(await drive.snapshot()) as { files: Array<{ meta: { id: string } }> };
  drive = FakeDrive.restore(JSON.stringify({ ...kept, files: kept.files.filter((f) => !missing.has(f.meta.id)) }));
  vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
}

const idOf = async (path: string): Promise<string> => {
  const all = await drive.listAll(root);
  const f = all.find((x) => drive.pathOf(x.id, root) === path);
  if (!f) throw new Error(`no ${path}`);
  return f.id;
};

/** The listing as Drive gives it for files with no checksum: `unchecked` (a Docs file), or just not carried yet. */
function listedWithout(ids: readonly string[], unchecked: boolean): void {
  const real = drive.listAll.bind(drive);
  vi.spyOn(drive, 'listAll').mockImplementation(async (r, o) =>
    (await real(r, o)).map((f) => {
      if (!ids.includes(f.id)) return f;
      const { sha256: _h, size: _s, ...rest } = f;
      return unchecked ? { ...rest, unchecked: true as const } : rest;
    }));
}

/** Every pdf listed with no checksum yet, so a digest has to ask Drive (the offline tests exercise that path). */
const pdfsUnlisted = async (): Promise<void> => listedWithout((await drive.listAll(root)).filter((f) => f.name.endsWith('.pdf')).map((f) => f.id), false);

describe('DriveVault files', () => {
  it.each(['note', 'folder'] as const)('creation refuses a leading dot without writing (%s)', async (type) => {
    const before = await drive.snapshot();
    const tree = await vault.tree();
    const changes = await vault.changes();
    for (const name of [type === 'note' ? '.Garden.md' : '.Garden', ' \t.Garden \n', '.', '..Garden']) {
      await expect(vault.create('Resources/Cooking', type, name)).rejects.toMatchObject({ name: 'BowerError', code: 'conflict', message: 'A name cannot start with a dot.' });
      expect(await drive.snapshot()).toBe(before);
      expect(await vault.tree()).toEqual(tree);
      expect(await vault.changes()).toEqual(changes);
    }
  });

  it.each(['note', 'folder'] as const)('creation keeps dotted names defaults and length limits (%s)', async (type) => {
    const suffix = type === 'note' ? '.md' : '';
    expect(await vault.create('Resources/Cooking', type, `Garden.2026${suffix}`)).toBe(`Resources/Cooking/Garden.2026${suffix}`);
    expect(await vault.create('Resources/Cooking', type)).toBe(`Resources/Cooking/${type === 'note' ? 'Untitled.md' : 'New folder'}`);
    const limit = `${'a'.repeat(120)}${suffix}`;
    expect(await vault.create('Resources/Cooking', type, limit)).toBe(`Resources/Cooking/${limit}`);
    await expect(vault.create('Resources/Cooking', type, `${'a'.repeat(121)}${suffix}`)).rejects.toMatchObject({ code: 'conflict', message: expect.stringContaining('too long') });
  });

  it('an applied change kept only on this page remains visible and can leave the Bin', async () => {
    await vault.tree();
    const create = drive.createText.bind(drive);
    drive.createText = async () => { throw new TypeError('Failed to fetch'); };
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    let heard = 0;
    vault.subscribe(() => heard++);
    const path = 'Resources/Cooking/Lemon tart.md';
    await expect(vault.move(path, 'Areas')).rejects.toMatchObject({ applied: { path: 'Areas/Lemon tart.md' }, message: expect.stringMatching(/change was made.*keep this page open/i) });
    expect(findNode(await vault.tree(), 'Areas/Lemon tart.md')).not.toBeNull();
    await expect(vault.rename('Areas/Lemon tart.md', 'Lemon cake')).rejects.toMatchObject({ applied: { path: 'Areas/Lemon cake.md' } });
    expect(findNode(await vault.tree(), 'Areas/Lemon cake.md')).not.toBeNull();
    await expect(vault.trash('Areas/Lemon cake.md')).rejects.toMatchObject({ applied: { path: null } });
    expect(findNode(await vault.tree(), 'Areas/Lemon cake.md')).toBeNull();
    expect(heard).toBeGreaterThanOrEqual(3);
    set.mockRestore();
    drive.createText = create;
    await vault.restore('Areas/Lemon cake.md');
    expect(findNode(await vault.tree(), 'Areas/Lemon cake.md')).not.toBeNull();
    await vault.flushJournal();
    expect((await vault.changes()).some((r) => r.kind === 'trash')).toBe(false);
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
    await expect(vault.rename('Areas/Lemon cake.md', 'Another')).rejects.toMatchObject({ code: 'unknown' });
    await expect(vault.trash('Areas/Lemon cake.md')).rejects.toMatchObject({ code: 'unknown' });
    get.mockRestore();
    expect(findNode(await vault.tree(), 'Areas/Lemon cake.md')).not.toBeNull();
  });

  it('toggleTask rejects on a stale modifiedTime', async () => {
    await vault.note(PASSPORT);
    drive.touch(await idOf(PASSPORT));
    await expect(vault.toggleTask(PASSPORT, 4)).rejects.toMatchObject({ code: 'conflict' });
    expect(drive.dump(root).get(PASSPORT)).toContain('- [ ] Photo form signed by a witness');
  });

  it('a toggle writes the file and a journal line', async () => {
    await vault.toggleTask(PASSPORT, 4);
    expect(drive.dump(root).get(PASSPORT)).toContain('- [x] Photo form signed by a witness');
    expect((await vault.changes()).at(-1)?.what).toBe('Ticked "Photo form signed by a witness" in Passport renewal');
  });

  it('a file in the Bin is not in the tree', async () => {
    await drive.trash(await idOf('Resources/Cooking/Lemon tart.md'));
    await vault.refresh();
    expect(findNode(await vault.tree(), 'Resources/Cooking/Lemon tart.md')).toBeNull();
  });

  it('Bower bookkeeping stays out of the tree', async () => {
    const tree = await vault.tree();
    expect(tree.some((n) => n.name.startsWith('.'))).toBe(false);
  });

  it('a note lists its links and backlinks as paths', async () => {
    const n = await vault.note('Projects/Flat hunt/Flat hunt.md');
    expect(n.links).toContain('Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md');
    const larkspur = await vault.note('Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md');
    expect(larkspur.backlinks).toContain('Projects/Flat hunt/Flat hunt.md');
  });

  it('opening a new thing marks it seen on this device', async () => {
    const isNew = (await vault.tree()).flatMap(function all(n): string[] {
      return [...(n.isNew ? [n.path] : []), ...(n.children ?? []).flatMap(all)];
    });
    const first = isNew[0];
    if (!first) return;
    await vault.markSeen(first);
    expect(findNode(await vault.tree(), first)?.isNew).toBeFalsy();
  });

  it('tells listeners after a change', async () => {
    let heard = 0;
    vault.subscribe(() => heard++);
    await vault.move('Resources/Cooking/Lemon tart.md', 'Areas');
    expect(heard).toBeGreaterThan(0);
  });

  it('a Drive failure reaches the screen as a BowerError', async () => {
    drive.failNext('offline');
    await expect(vault.tree()).rejects.toMatchObject({ code: 'offline' });
    await expect(vault.tree()).resolves.toBeDefined();
  });
});

describe('DriveVault inbox and Bower', () => {
  async function contextPile(folder: boolean) {
    const inbox = await idOf('Inbox');
    const f = folder ? await drive.createFolder(inbox, 'Context pile') : await drive.createText(inbox, 'Input.pdf', 'Original file bytes');
    if (folder) {
      await drive.createText(f.id, 'Input.pdf', 'Original file bytes');
      await drive.createText(f.id, 'Pile note.md', 'Original context');
    }
    const pile = (await vault.piles()).find((p) => p.id === f.id);
    if (!pile) throw new Error('no context pile');
    return { f, pile, inbox };
  }

  it.each([
    ['lone', 'name', 'Edited context'], ['lone', 'parent', 'Edited context'],
    ['folder', 'name', 'Edited context'], ['folder', 'parent', 'Edited context'],
    ['folder', 'name', ''], ['folder', 'parent', ''],
  ])('editing a pile refuses external name or place changes (%s, %s, "%s")', async (shape, change, text) => {
    const { f, pile, inbox } = await contextPile(shape === 'folder');
    // Another Drive client changes the metadata after this app has cached the pile.
    await drive.update(f.id, change === 'name' ? { name: 'Changed elsewhere' } : { addParent: await idOf('Areas'), removeParent: inbox });
    const before = await drive.snapshot();
    const createFolder = vi.spyOn(drive, 'createFolder');
    await expect(vault.updatePile(pile.id, text)).rejects.toMatchObject({ code: 'conflict', message: 'This changed somewhere else. Look again and try once more.' });
    expect(await drive.snapshot()).toBe(before);
    expect(createFolder).not.toHaveBeenCalled();
  });

  it.each(['lone', 'folder'])('editing a pile accepts unchanged name and place (%s)', async (shape) => {
    const { f, pile } = await contextPile(shape === 'folder');
    // Content-only edits must travel with the file, without blocking a structural edit.
    const item = shape === 'folder' ? await idOf(`${pile.path}/Input.pdf`) : f.id;
    await drive.writeText(item, 'New remote file bytes', (await drive.get(item)).modifiedTime);
    drive.touch(f.id);
    const changed = await vault.updatePile(pile.id, 'Edited context');
    expect(changed.text).toBe('Edited context');
    expect(changed.items).toHaveLength(1);
    expect(await drive.readText(item)).toBe('New remote file bytes');
    expect(drive.dump(root).get(`${changed.path}/Pile note.md`)).toBe('Edited context');
    const cleared = await vault.updatePile(pile.id, '');
    expect(cleared.text).toBe('');
    expect(cleared.items).toHaveLength(1);
    expect(await drive.readText(item)).toBe('New remote file bytes');
  });

  it('editing a pile keeps the context content version check', async () => {
    const { pile } = await contextPile(true);
    // First give the pile the ordinary derived name, then cache its context version.
    const named = await vault.updatePile(pile.id, 'Original context');
    const note = await idOf(`${named.path}/Pile note.md`);
    await drive.writeText(note, 'New remote context', (await drive.get(note)).modifiedTime);
    await expect(vault.updatePile(pile.id, 'Original context')).rejects.toMatchObject({ code: 'conflict' });
    expect(await drive.readText(note)).toBe('New remote context');
  });

  it("a retry of a pile's words after my own unknown write is not called a change elsewhere", async () => {
    const { pile } = await contextPile(true);
    const named = await vault.updatePile(pile.id, 'Original context');
    const note = await idOf(`${named.path}/Pile note.md`);
    const writeText = drive.writeText.bind(drive);
    const get = drive.get.bind(drive);
    // The words land, Drive answers 5xx, and the read that would resolve it gets no answer either.
    drive.writeText = async (...a) => {
      await writeText(...a);
      drive.writeText = writeText;
      drive.get = async () => {
        drive.get = get;
        throw driveError('offline');
      };
      throw unconfirmedWriteError();
    };
    await expect(vault.updatePile(named.id, 'Original context, edited')).rejects.toMatchObject({ code: 'unknown', message: UNCONFIRMED_WRITE_MESSAGE });
    // Alex saves again: their own write is recognised by its stamp and checksum, not reported as changed somewhere else.
    await expect(vault.updatePile(named.id, 'Original context, edited')).resolves.toMatchObject({ text: 'Original context, edited' });
    expect(await drive.readText(note)).toBe('Original context, edited');
    // Changed on the laptop since, the same retry is refused, and the laptop's words stay.
    drive.writeText = async (...a) => {
      await writeText(...a);
      drive.writeText = writeText;
      drive.get = async () => {
        drive.get = get;
        throw driveError('offline');
      };
      throw unconfirmedWriteError();
    };
    await expect(vault.updatePile(named.id, 'Words from this phone')).rejects.toMatchObject({ code: 'unknown' });
    await drive.writeText(note, 'Words from the laptop', (await drive.get(note)).modifiedTime);
    await expect(vault.updatePile(named.id, 'Words from this phone')).rejects.toMatchObject({ code: 'conflict' });
    expect(await drive.readText(note)).toBe('Words from the laptop');
  });

  it.each(['', 'Different context'])('stale pile context refuses every effect before write or removal ("%s")', async (text) => {
    const { pile } = await contextPile(true);
    const named = await vault.updatePile(pile.id, 'Original context');
    const note = await idOf(`${named.path}/Pile note.md`);
    await drive.writeText(note, 'New remote context', (await drive.get(note)).modifiedTime);
    const before = await drive.snapshot();
    await expect(vault.updatePile(pile.id, text)).rejects.toMatchObject({ code: 'conflict' });
    // Include the Bin and metadata: a content conflict must not partially rename or clear.
    expect(await drive.snapshot()).toBe(before);
    expect(await drive.readText(note)).toBe('New remote context');
    await vault.refresh();
    const fresh = await vault.updatePile(pile.id, text);
    expect(fresh.text).toBe(text);
    expect(fresh.items).toHaveLength(1);
    if (text) expect(await drive.readText(note)).toBe(text);
    else expect((await drive.listAll(root)).some((f) => f.id === note)).toBe(false);
  });

  it('editing a pile still checks context versions at the content write', async () => {
    const { pile } = await contextPile(true);
    const named = await vault.updatePile(pile.id, 'Original context');
    const note = await idOf(`${named.path}/Pile note.md`);
    const write = drive.writeText.bind(drive);
    const race = vi.spyOn(drive, 'writeText').mockImplementationOnce(async (id, text, modified) => {
      await write(id, 'A late remote context', modified);
      return write(id, text, modified);
    });
    await expect(vault.updatePile(pile.id, 'Original context')).rejects.toMatchObject({ code: 'conflict' });
    expect(await drive.readText(note)).toBe('A late remote context');
    race.mockRestore();
  });

  it('piles keep the names their things were added under', async () => {
    const piles = await vault.piles();
    const job = piles.find((p) => p.text.startsWith('Job offer and a flat'));
    expect(job?.items.map((i) => i.name)).toContain('listing-88213.example');
    expect(job?.items.find((i) => i.name === 'listing-88213.example')).toMatchObject({ kind: 'link', origin: 'From the browser' });
    expect(piles.find((p) => p.path === 'Inbox/Dentist reminder.pdf')?.text).toBe('');
  });

  it('addPile with a link writes a .url file', async () => {
    await vault.addPile({ text: 'Car insurance', items: [{ name: 'insurer.example/renewal', kind: 'link', origin: 'A link you pasted', url: 'https://insurer.example/renewal' }] });
    await vault.settled();
    const url = [...drive.dump(root).entries()].find(([p]) => p.endsWith('insurer.example - renewal.url'));
    expect(url?.[1]).toBe('[InternetShortcut]\nURL=https://insurer.example/renewal\n');
  });

  it('addPile sends the file itself', async () => {
    await vault.addPile({ text: '', items: [{ name: 'scan.pdf', kind: 'pdf', origin: 'From this computer', body: new Blob(['%PDF made up']) }] });
    await vault.settled();
    const f = (await drive.listAll(root)).find((x) => x.name === 'scan.pdf');
    expect(await drive.readText(f?.id ?? '')).toBe('%PDF made up');
  });

  it('removePile refuses a pile the run took', async () => {
    const pile = (await vault.piles())[0];
    if (!pile) throw new Error('no pile');
    const busy = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set([pile.id]) });
    await expect(busy.removePile(pile.id)).rejects.toMatchObject({ code: 'conflict' });
    await expect(busy.updatePile(pile.id, 'new words')).rejects.toMatchObject({ code: 'conflict' });
  });

  it('an upload that fails marks upload -1 and keeps the rest', async () => {
    beforeUpload(drive, ({ name }) => {
      if (name === 'b.jpg') throw new Error('network down');
    });
    const p = await vault.addPile({ text: 'Two photos', items: [{ name: 'a.jpg', kind: 'image', origin: 'x', body: new Blob(['a']) }, { name: 'b.jpg', kind: 'image', origin: 'x', body: new Blob(['b']) }] });
    await vault.settled();
    const pile = (await vault.piles()).find((x) => x.id === p.id);
    expect(pile?.items.map((i) => [i.name, i.upload])).toEqual([
      ['a.jpg', undefined],
      ['b.jpg', -1],
    ]);
  });

  it('a lone thing that gets a note becomes a pile folder and keeps its id', async () => {
    const lone = (await vault.piles()).find((p) => p.path === 'Inbox/Dentist reminder.pdf');
    if (!lone) throw new Error('no lone pile');
    await vault.updatePile(lone.id, 'From the dentist');
    const now = (await vault.piles()).find((p) => p.id === lone.id);
    expect(now?.path).toMatch(/^Inbox\/\d{4}-\d{2}-\d{2} From the dentist$/);
    expect(now?.items.map((i) => i.name)).toEqual(['Dentist reminder.pdf']);
  });

  it('rules: worded ones from Rules.md, then yours waiting in the journal', async () => {
    const before = await vault.rules();
    expect(before.length).toBe(3);
    expect(before[0]?.yourWords).toBe('receipts to money by month');
    await vault.addRule('anything from the dentist goes in health');
    const after = await vault.rules();
    expect(after[0]).toMatchObject({ pending: true, text: 'anything from the dentist goes in health', yourWords: 'anything from the dentist goes in health' });
    expect(drive.dump(root).get('Rules.md')).not.toContain('dentist');
  });

  it('removeRule lists zero times on a hit and once on each miss', async () => {
    const hit = await vault.addRule('Keep sketches together');
    const other = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
    try {
      const stale = await other.addRule('Keep drafts together');
      const listAll = vi.spyOn(drive, 'listAll');
      await expect(vault.removeRule(hit.id)).resolves.toBeTypeOf('function');
      expect(listAll).not.toHaveBeenCalled();

      await expect(vault.removeRule('missing-rule-id')).rejects.toMatchObject({ code: 'not-found' });
      expect(listAll).toHaveBeenCalledTimes(1);
      expect(listAll).toHaveBeenLastCalledWith(root, { checksums: true });

      // Cache the absence before another page adds the next rule.
      const late = await other.addRule('Keep outlines together');
      await expect(vault.removeRule(late.id)).resolves.toBeTypeOf('function');
      expect(listAll).toHaveBeenCalledTimes(2);
      await expect(vault.removeRule(stale.id)).resolves.toBeTypeOf('function');
      expect(listAll).toHaveBeenCalledTimes(2);
    } finally {
      other.dispose();
    }
  });

  it('keeping a suggestion adds it as a rule and hides it', async () => {
    const [a] = await vault.suggestions();
    if (!a) throw new Error('no suggestion');
    await vault.dismissSuggestion(a.id, true);
    expect((await vault.suggestions()).map((s) => s.id)).not.toContain(a.id);
    expect((await vault.rules())[0]).toMatchObject({ pending: true, text: a.title });
  });

  it('dropping a suggestion hides it on this device and adds no rule', async () => {
    const [a] = await vault.suggestions();
    if (!a) throw new Error('no suggestion');
    const rules = (await vault.rules()).length;
    await vault.dismissSuggestion(a.id, false);
    expect((await vault.suggestions()).map((s) => s.id)).not.toContain(a.id);
    expect(await vault.rules()).toHaveLength(rules);
  });
});

describe('sending things again', () => {
  it('retry uploads only the missing items', async () => {
    let fail = true;
    beforeUpload(drive, ({ name }) => {
      if (name === 'b.jpg' && fail) throw new Error('network down');
    });
    const p = await vault.addPile({ text: 'Two photos', items: [{ name: 'a.jpg', kind: 'image', origin: 'x', body: new Blob(['a']) }, { name: 'b.jpg', kind: 'image', origin: 'x', body: new Blob(['b']) }] });
    await vault.settled();
    fail = false;
    await vault.retryPile(p.id);
    await vault.settled();
    const pile = (await vault.piles()).find((x) => x.id === p.id);
    expect(pile?.items.map((i) => [i.name, i.upload])).toEqual([
      ['a.jpg', undefined],
      ['b.jpg', undefined],
    ]);
    expect((await drive.listAll(root)).filter((f) => f.name === 'a.jpg')).toHaveLength(1);
  });
});

describe('what the review found', () => {
  it('root index, hot and log names are ordinary notes that can be made, renamed into or moved to', async () => {
    await expect.soft(vault.create('', 'note', 'index.md')).resolves.toBe('index.md');
    const plan = await vault.create('', 'note', 'Plan.md');
    await expect.soft(vault.rename(plan, 'Log')).resolves.toBe('Log.md');
    const inner = await vault.create('Resources', 'note', 'hot.md');
    await expect.soft(vault.move(inner, '')).resolves.toBe('hot.md');
    expect.soft(drive.dump(root).has('index.md')).toBe(true);
  });

  it('a retry never sends twice a thing that arrived but whose answer was lost', async () => {
    let lose = true;
    let armed = false;
    beforeUpload(drive, ({ name }) => { armed = name === 'b.jpg' && lose; });
    // It arrives in Drive, but its answer is lost.
    drive.beforeChunk = () => {
      if (!armed) return;
      armed = false;
      lose = false;
      drive.loseNextReply();
    };
    const p = await vault.addPile({ text: 'Two photos', items: [{ name: 'a.jpg', kind: 'image', origin: 'x', body: new Blob(['a']) }, { name: 'b.jpg', kind: 'image', origin: 'x', body: new Blob(['b']) }] });
    await vault.settled();
    await vault.retryPile(p.id);
    await vault.settled();
    expect((await drive.listAll(root)).filter((f) => f.name.startsWith('b'))).toHaveLength(1);
    expect((await vault.piles()).find((x) => x.id === p.id)?.items.map((i) => i.upload)).toEqual([undefined, undefined]);
  });

  it('Try again works while another pile is still on its way', async () => {
    let failA = true;
    let release: () => void = () => undefined;
    const slow = new Promise<void>((r) => (release = r));
    beforeUpload(drive, async ({ name }) => {
      if (name === 'a.jpg' && failA) {
        failA = false;
        throw new Error('network down');
      }
      if (name === 'slow.jpg') await slow;
    });
    const a = await vault.addPile({ text: 'Pile A', items: [{ name: 'a.jpg', kind: 'image', origin: 'x', body: new Blob(['a']) }] });
    await new Promise((r) => setTimeout(r, 0));
    await vault.addPile({ text: 'Pile B', items: [{ name: 'slow.jpg', kind: 'image', origin: 'x', body: new Blob(['s']) }] });
    for (let i = 0; i < 20 && (await vault.piles()).find((x) => x.id === a.id)?.items[0]?.upload !== -1; i++) await new Promise((r) => setTimeout(r, 0));
    await vault.retryPile(a.id);
    // The queue sends one file at a time: Try again is taken at once and goes when the other one is in.
    expect((await vault.piles()).find((x) => x.id === a.id)?.items[0]?.upload).toBe(0);
    release();
    await vault.settled();
    expect((await vault.piles()).find((x) => x.id === a.id)?.items[0]?.upload).toBeUndefined();
  });

  it('backlinks are only notes that really link here', async () => {
    const all = await drive.listAll(root);
    drive.fullText = async () => all.filter((f) => f.name.endsWith('.md'));
    const back = (await vault.note('Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md')).backlinks;
    expect(back).toContain('Projects/Flat hunt/Flat hunt.md');
    expect(back).not.toContain('Resources/Cooking/Lemon tart.md');
  });

  it('backlinks leave out Bower\'s own files and keep Inbox notes, even past the read limit', async () => {
    const link = '---\nsummary: links\n---\n\nSee [[Flat 3, 12 Larkspur Lane]]\n';
    const bower = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === '.bower')?.id ?? (await drive.createFolder(root, '.bower')).id;
    const hidden = [await drive.createText(bower, 'index.md', link)];
    for (let i = 0; i < 70; i++) hidden.push(await drive.createText(bower, `extra ${i}.md`, link));
    const inbox = await drive.createText(await idOf('Inbox'), 'Viewing plan.md', link);
    await vault.refresh();
    drive.fullText = async () => [...hidden, inbox];
    const back = (await vault.note('Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md')).backlinks;
    expect(back).toEqual(['Inbox/Viewing plan.md']);
  });

  it('search reads a bounded number of notes', async () => {
    const folder = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === 'Resources');
    for (let i = 0; i < 150; i++) await drive.createText(folder?.id ?? '', `Idea ${i}.md`, `---\nsummary: idea ${i}\n---\n\nthe rent idea number ${i}\n`);
    await vault.refresh();
    let reads = 0;
    const read = drive.readText.bind(drive);
    drive.readText = async (id) => (reads++, read(id));
    const hits = await vault.search('rent idea');
    expect(hits.length).toBeGreaterThan(10);
    expect(reads).toBeLessThanOrEqual(60);
  });
});

describe('a lost reply to a write', () => {
  const TART = 'Resources/Cooking/Lemon tart.md';
  /** Calls to `get` made after the first `update`/`writeText` call, i.e. the read-back. */
  const readBacks = (): { writes: () => number; gets: () => number } => {
    let writes = 0;
    let gets = 0;
    const update = drive.update.bind(drive);
    const writeText = drive.writeText.bind(drive);
    const get = drive.get.bind(drive);
    drive.update = async (id, patch) => { writes++; return update(id, patch); };
    drive.writeText = async (id, text, at) => { writes++; return writeText(id, text, at); };
    drive.get = async (id) => { if (writes > 0) gets++; return get(id); };
    return { writes: () => writes, gets: () => gets };
  };

  it('a lost reply to a rename that landed counts as saved', async () => {
    await vault.tree();
    const seen = readBacks();
    drive.loseNextReply();
    const to = await vault.rename(TART, 'Lemon cake');
    expect(to).toBe('Resources/Cooking/Lemon cake.md');
    expect(seen.gets()).toBeGreaterThan(0);
    expect(findNode(await vault.tree(), to)).not.toBeNull();
    expect(findNode(await vault.tree(), TART)).toBeNull();
    const renames = (await vault.changes()).filter((r) => r.kind === 'rename');
    expect(renames).toHaveLength(1);
  });

  it('a lost reply to a move that did not land says offline', async () => {
    await vault.tree();
    const seen = readBacks();
    const update = drive.update.bind(drive);
    drive.update = async (id) => { await update(id, {}); throw driveError('offline'); };
    await expect(vault.move(TART, 'Areas')).rejects.toMatchObject({ code: 'offline', message: "You're offline. Try again when you're back." });
    expect(seen.gets()).toBeGreaterThan(0);
    expect(findNode(await vault.tree(), TART)).not.toBeNull();
    expect((await vault.changes()).some((r) => r.kind === 'move')).toBe(false);
  });

  it('a lost reply to a task toggle that cannot be read back says not sure', async () => {
    await vault.tree();
    const seen = readBacks();
    const writeText = drive.writeText.bind(drive);
    drive.writeText = async (id, text, at) => {
      await writeText(id, text, at);
      drive.get = async () => { throw driveError('offline'); };
      drive.readText = async () => { throw driveError('offline'); };
      throw driveError('offline');
    };
    await expect(vault.toggleTask(PASSPORT, 4)).rejects.toMatchObject({ name: 'BowerError', message: "Bower isn't sure that saved. Check again when you're back online." });
    expect(seen.writes()).toBe(1);
  });
});

describe('an app write is found again by its stamp', () => {
  it('an app write with an unknown outcome is resolved by its stamp', async () => {
    await vault.tree();
    const writeText = drive.writeText.bind(drive);
    const readText = drive.readText.bind(drive);
    let written = false;
    let readAfter = 0;
    // Drive stores the toggle and then answers 5xx: the outcome is unknown.
    drive.writeText = async (...a) => {
      await writeText(...a);
      written = true;
      drive.writeText = writeText;
      throw unconfirmedWriteError();
    };
    drive.readText = async (id) => {
      if (written) readAfter++;
      return readText(id);
    };
    await vault.toggleTask(PASSPORT, 4);
    expect(drive.dump(root).get(PASSPORT)).toContain('- [x] Photo form signed by a witness');
    expect((await drive.get(await idOf(PASSPORT))).appProperties?.bowerOp).toEqual(expect.stringMatching(/^[0-9a-f]{32}$/));
    // Resolved by the stamp on the file, not by reading its text back.
    expect(readAfter).toBe(0);
  });

  it('a retry after my own unknown write is not called a change elsewhere', async () => {
    await vault.tree();
    const writeText = drive.writeText.bind(drive);
    const get = drive.get.bind(drive);
    // The toggle lands, Drive answers 5xx, and the read that would resolve it gets no answer either.
    drive.writeText = async (...a) => {
      await writeText(...a);
      drive.writeText = writeText;
      drive.get = async () => {
        drive.get = get;
        throw driveError('offline');
      };
      throw unconfirmedWriteError();
    };
    await expect(vault.toggleTask(PASSPORT, 4)).rejects.toMatchObject({ code: 'unknown', message: UNCONFIRMED_WRITE_MESSAGE });
    // Alex taps it again: their own write is recognised by its stamp, not reported as changed somewhere else.
    await expect(vault.toggleTask(PASSPORT, 4)).resolves.toBeUndefined();
    expect(drive.dump(root).get(PASSPORT)).toContain('- [x] Photo form signed by a witness');
    expect((await vault.changes()).filter((r) => r.what === 'Ticked "Photo form signed by a witness" in Passport renewal')).toHaveLength(1);
  });

  it('a retry after a change elsewhere is a conflict, not saved', async () => {
    await vault.tree();
    await vault.note(PASSPORT);
    const writeText = drive.writeText.bind(drive);
    const get = drive.get.bind(drive);
    // The toggle lands, Drive answers 5xx, and the read that would resolve it gets no answer either.
    drive.writeText = async (...a) => {
      await writeText(...a);
      drive.writeText = writeText;
      drive.get = async () => {
        drive.get = get;
        throw driveError('offline');
      };
      throw unconfirmedWriteError();
    };
    await expect(vault.toggleTask(PASSPORT, 4)).rejects.toMatchObject({ code: 'unknown', message: UNCONFIRMED_WRITE_MESSAGE });
    // Alex then edits the note on the laptop: Drive keeps Bower's stamp on it, but not Bower's text.
    const id = await idOf(PASSPORT);
    await drive.writeText(id, 'Edited on the laptop', (await drive.get(id)).modifiedTime);
    // Alex taps again: the stamp says Bower's write landed once, the checksum says the note is no longer what it wrote.
    await expect(vault.toggleTask(PASSPORT, 4)).rejects.toMatchObject({ code: 'conflict' });
    expect(drive.dump(root).get(PASSPORT)).toBe('Edited on the laptop');
    expect((await vault.changes()).filter((r) => r.what.startsWith('Ticked "Photo form signed by a witness"'))).toHaveLength(0);
    // The screen shows the laptop's version, never Bower's text under it.
    expect(JSON.stringify(await vault.note(PASSPORT))).not.toContain('Photo form signed by a witness');
  });

  it('a toggle after the note changed elsewhere between the read and the write is refused', async () => {
    await vault.tree();
    const writeText = drive.writeText.bind(drive);
    // Another device saves the note right after Bower read it and before its write.
    drive.writeText = async (id, ...rest) => {
      drive.writeText = writeText;
      drive.touch(id);
      return writeText(id, ...rest);
    };
    await expect(vault.toggleTask(PASSPORT, 4)).rejects.toMatchObject({ code: 'conflict' });
    expect(drive.dump(root).get(PASSPORT)).toContain('- [ ] Photo form signed by a witness');
  });
});

describe('what the code review found', () => {
  it('a rename or move of something changed elsewhere writes nothing', async () => {
    await vault.tree();
    const id = await idOf('Resources/Cooking/Lemon tart.md');
    await drive.update(id, { name: 'Lemon pie.md' });
    await expect(vault.rename('Resources/Cooking/Lemon tart.md', 'Tart')).rejects.toMatchObject({ code: 'conflict' });
    expect((await drive.get(id)).name).toBe('Lemon pie.md');
  });

  it('a move of something moved elsewhere writes nothing', async () => {
    await vault.tree();
    const id = await idOf('Resources/Cooking/Lemon tart.md');
    const areas = await idOf('Areas');
    const cooking = await idOf('Resources/Cooking');
    await drive.update(id, { addParent: areas, removeParent: cooking });
    await expect(vault.move('Resources/Cooking/Lemon tart.md', 'Projects')).rejects.toMatchObject({ code: 'conflict' });
    expect((await drive.get(id)).parents).toEqual([areas]);
  });

  it("your own change keeps a seen thing seen", async () => {
    const id = await idOf('Resources/Cooking/Lemon tart.md');
    await drive.update(id, { appProperties: { bowerNew: '1' } });
    await vault.refresh();
    await vault.markSeen('Resources/Cooking/Lemon tart.md');
    const to = await vault.rename('Resources/Cooking/Lemon tart.md', 'Lemon tart, best');
    expect(findNode(await vault.tree(), to)?.isNew).toBeFalsy();
  });

  it('a pile removed while a thing is on its way does not come back', async () => {
    let release: () => void = () => undefined;
    const slow = new Promise<void>((r) => (release = r));
    holdChunks(drive, slow);
    const p = await vault.addPile({ text: '', items: [{ name: 'late.pdf', kind: 'pdf', origin: 'x', body: new Blob(['x']) }] });
    await vi.waitFor(() => expect(drive.resumableCalls.some((c) => c.op === 'open')).toBe(true));
    await vault.removePile(p.id);
    release();
    await vault.settled();
    await vault.refresh();
    expect((await vault.piles()).some((x) => x.items.some((i) => i.name === 'late.pdf'))).toBe(false);
  });

  it('a pile that could not be made leaves no empty folder', async () => {
    const real = drive.createText.bind(drive);
    drive.createText = async (parent, name, text, props) => {
      if (name === 'Pile note.md') throw new Error('network down');
      return real(parent, name, text, props);
    };
    await expect(vault.addPile({ text: 'Half made', items: [] })).rejects.toBeDefined();
    await vault.refresh();
    expect((await vault.tree()).find((n) => n.path === 'Inbox')?.children?.some((n) => n.name.endsWith('Half made'))).toBe(false);
  });

  it('restoring a path inside a binned pile brings the pile back as it was', async () => {
    const pile = (await vault.piles()).find((p) => p.path && p.items.length > 1);
    if (!pile?.path) throw new Error('no pile folder');
    const inside = `${pile.path}/${pile.items[0]?.name ?? ''}`;
    await vault.trash(inside);
    await vault.restore(inside);
    expect((await vault.piles()).find((p) => p.id === pile.id)?.path).toBe(pile.path);
  });

  it('a journal line that fails to write once is tried again', async () => {
    const real = drive.createText.bind(drive);
    let failed = false;
    drive.createText = async (parent, name, text, props) => {
      if (name.endsWith('.json') && !failed) {
        failed = true;
        throw new Error('network blip');
      }
      return real(parent, name, text, props);
    };
    await vault.move('Resources/Cooking/Lemon tart.md', 'Areas');
    expect((await vault.changes()).at(-1)?.kind).toBe('move');
  });

  it('two first changes make one journal folder', async () => {
    const fresh = new FakeDrive();
    const r = (await fresh.createFolder('root', 'Bower')).id;
    for (const n of ['Inbox', 'Projects', 'Areas', 'Resources', 'Archive']) await fresh.createFolder(r, n);
    const v = new DriveVault({ drive: fresh, rootId: async () => r, runningPiles: () => new Set() });
    await Promise.all([v.addRule('one'), v.addRule('two'), v.addRequest('three')]);
    const all = await fresh.listAll(r);
    expect(all.filter((f) => f.name === '.bower')).toHaveLength(1);
    expect(all.filter((f) => f.name === 'changes')).toHaveLength(1);
    expect(await v.changes()).toHaveLength(3);
  });

  it('first changes on separate clients are all visible after refresh', async () => {
    for (const existingBower of [false, true]) {
      localStorage.clear();
      const fresh = new FakeDrive();
      const r = (await fresh.createFolder('root', 'Bower')).id;
      for (const name of ['Inbox', 'Projects', 'Areas', 'Resources', 'Archive']) await fresh.createFolder(r, name);
      if (existingBower) await fresh.createFolder(r, '.bower');
      const open = (): DriveVault => new DriveVault({ drive: fresh, rootId: async () => r, runningPiles: () => new Set() });
      const a = open();
      const b = open();
      await Promise.all([a.tree(), b.tree()]);
      const create = fresh.createText.bind(fresh);
      const get = fresh.get.bind(fresh);
      let lost = 2;
      let blind = 0;
      // Each line lands and its answer is lost; the read by its id that follows gets no answer either, so it waits.
      fresh.createText = async (...a: Parameters<FakeDrive['createText']>) => {
        const made = await create(...a);
        if (a[1].endsWith('.json') && lost-- > 0) {
          blind++;
          throw driveError('offline');
        }
        return made;
      };
      fresh.get = async (...a: Parameters<FakeDrive['get']>) => {
        if (blind > 0 && a[1]?.binned) {
          blind--;
          throw driveError('offline');
        }
        return get(...a);
      };
      await Promise.all([a.addRule('Keep receipts together'), b.addRule('Keep original files')]);
      const before = await fresh.listAll(r);
      const folders = before.filter((f) => f.folder && f.name === 'changes');
      expect(folders).toHaveLength(2);
      expect(before.filter((f) => f.folder && f.name === '.bower')).toHaveLength(existingBower ? 1 : 2);
      const key = `bower:outbox:${r}`;
      const waiting = localStorage.getItem(key);
      expect(waiting).not.toBeNull();
      localStorage.removeItem(key);
      await Promise.all([a.refresh(), b.refresh()]);
      for (const client of [a, b, open()]) {
        expect((await client.rules()).map((rule) => rule.text).sort()).toEqual(['Keep original files', 'Keep receipts together']);
      }
      if (waiting) localStorage.setItem(key, waiting);
      const line = before.find((f) => !f.folder && f.name.endsWith('.json'));
      if (!line || !folders[1]) throw new Error('Missing change fixture');
      await create(folders[1].id, line.name, await fresh.readText(line.id));
      // Another device can process a write whose answer this browser lost.
      const out = await tidyUp(fresh, r, 'instructions');
      expect(out).toMatchObject({ phase: 'done', report: { rulesWorded: 2 } });
      await a.flushJournal();
      await Promise.all([a.refresh(), b.refresh()]);
      expect(await a.changes()).toEqual([]);
      expect(await b.changes()).toEqual([]);
      const after = await fresh.listAll(r);
      // Your changes only: the run's own records live in `.bower/runs`.
      const lines = after.filter((f) => !f.folder && f.name.endsWith('.json') && fresh.pathOf(f.id, r).startsWith('.bower/changes/'));
      expect(lines).toHaveLength(3);
      expect(lines.every((f) => after.find((parent) => parent.id === f.parents[0])?.name === 'archive')).toBe(true);
      expect(localStorage.getItem(`bower:outbox:${r}`)).toBeNull();
    }
  });

  it('a journal line names the Drive file it is about', async () => {
    const id = await idOf('Resources/Cooking/Lemon tart.md');
    await vault.move('Resources/Cooking/Lemon tart.md', 'Areas');
    const file = (await drive.listAll(root)).filter((f) => f.name.endsWith('.json') && drive.pathOf(f.id, root).startsWith('.bower/changes/')).at(-1);
    expect(JSON.parse(await drive.readText(file?.id ?? ''))).toMatchObject({ kind: 'move', fileId: id });
  });
});

describe('the outbox over the folder itself', () => {
  it('outbox over the folder itself: a line whose answer was lost is not written twice', async () => {
    await vault.tree();
    const real = drive.createText.bind(drive);
    const get = drive.get.bind(drive);
    let lose = true;
    // The line lands and its answer is lost; the read by its id that follows gets no answer either, so it waits.
    drive.createText = async (...a: Parameters<FakeDrive['createText']>) => {
      const f = await real(...a);
      if (lose && a[1].endsWith('.json') && a[2].includes('"kind":"rule"')) {
        lose = false;
        drive.get = async () => {
          drive.get = get;
          throw driveError('offline');
        };
        throw driveError('offline');
      }
      return f;
    };
    await vault.addRule('anything from the dentist goes in health');
    await vault.addRequest('Put my id papers together');
    const all = await drive.listAll(root);
    const changes = all.find((f) => f.name === 'changes' && f.folder);
    const lines = all.filter((f) => f.parents[0] === changes?.id && f.name.endsWith('.json'));
    expect(lines).toHaveLength(2);
  });

  it('a journal line kept on the device is sent after a reload under the id the home kept, through the app', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await vault.tree();
    const real = drive.createText.bind(drive);
    const get = drive.get.bind(drive);
    const rule = (a: Parameters<FakeDrive['createText']>): boolean => a[1].endsWith('.json') && a[2].includes('"kind":"rule"');
    const sentWith: Array<string | undefined> = [];
    let lose = true;
    // The rule's line lands and its answer is lost; the read by its id that follows gets no answer either.
    drive.createText = async (...a: Parameters<FakeDrive['createText']>) => {
      if (rule(a)) sentWith.push(a[4]);
      const f = await real(...a);
      if (lose && rule(a)) {
        lose = false;
        drive.get = async () => {
          drive.get = get;
          throw driveError('offline');
        };
        throw driveError('offline');
      }
      return f;
    };
    await vault.addRule('anything from the dentist goes in health');
    const kept = JSON.parse(localStorage.getItem(`bower:outbox:${root}`) ?? '[]') as Array<{ line: { id: string }; reserved?: string }>;
    expect(kept).toHaveLength(1);
    expect(kept[0]?.reserved).toBe(sentWith[0]);
    // The page is reloaded: a new app knows only what this device kept.
    vault.dispose();
    const ids = vi.spyOn(drive, 'generateIds');
    const reloaded = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
    await reloaded.flushJournal();
    // Sent under the id kept on its line and found by it: no new id, one file, nothing left waiting.
    expect(ids).not.toHaveBeenCalled();
    expect(sentWith).toEqual([kept[0]?.reserved, kept[0]?.reserved]);
    expect((await drive.listAll(root)).filter((f) => f.name === `${kept[0]?.line.id}.json`).map((f) => f.id)).toEqual([kept[0]?.reserved]);
    expect(localStorage.getItem(`bower:outbox:${root}`)).toBeNull();
  });
});

describe('a journal that cannot be read', () => {
  it('a note opens when the journal cannot be read', async () => {
    await vault.addRule('anything from the dentist goes in health');
    const all = await drive.listAll(root);
    const changes = all.find((f) => f.name === 'changes' && f.folder);
    const line = all.find((f) => f.parents[0] === changes?.id && f.name.endsWith('.json'));
    const real = drive.readText.bind(drive);
    drive.readText = async (id) => {
      if (id === line?.id) throw new TypeError('Failed to fetch');
      return real(id);
    };
    const later = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
    expect((await later.note(PASSPORT)).path).toBe(PASSPORT);
  });
});

describe('saved links in search', () => {
  it('a saved link searches by its address, never by its file syntax', async () => {
    await vault.tree();
    const cooking = await idOf('Resources/Cooking');
    await drive.createText(cooking, 'Soup recipe.url', '[InternetShortcut]\nURL=https://soup.example/lentil\n');
    await vault.refresh();
    const hit = (await vault.search('lentil')).find((h) => h.path === 'Resources/Cooking/Soup recipe.url');
    expect(hit?.snippet).toBe('soup.example/lentil');
    expect(await vault.search('internetshortcut')).toEqual([]);
  });
});

describe('links', () => {
  it('links follow a rename, before the next tidy-up', async () => {
    const to = await vault.rename('Projects/Flat hunt/Flat 7, Cobble Row.md', 'Cobble Row flat');
    expect((await vault.note('Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md')).links).toContain(to);
    expect((await vault.note(to)).backlinks).toContain('Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md');
  });
});

describe('things that arrive late', () => {
  it('a late thing comes back with its pile on Undo', async () => {
    let release: () => void = () => undefined;
    const slow = new Promise<void>((r) => (release = r));
    holdChunks(drive, slow);
    const p = await vault.addPile({ text: 'Late papers', items: [{ name: 'late.pdf', kind: 'pdf', origin: 'x', body: new Blob(['x']) }] });
    await vi.waitFor(() => expect(drive.resumableCalls.some((c) => c.op === 'open')).toBe(true));
    await vault.trash(p.path ?? '');
    release();
    await vault.settled();
    await vault.restore(p.path ?? '');
    await vault.settled();
    expect((await vault.piles()).find((x) => x.id === p.id)?.items.map((i) => [i.name, i.upload])).toEqual([['late.pdf', undefined]]);
    expect((await drive.listAll(root)).filter((f) => f.name === 'late.pdf')).toHaveLength(1);
  });

  it('a late file whose answer comes after the pile went to the Bin goes with it, and comes back on Undo', async () => {
    let release: () => void = () => undefined;
    const slow = new Promise<void>((r) => (release = r));
    let lateId = '';
    let started: () => void = () => undefined;
    const onItsWay = new Promise<void>((r) => (started = r));
    // It arrives in Drive, but its answer comes only after the pile went to the Bin.
    holdChunks(drive, slow, true, (file) => { lateId = file.id; started(); });
    const p = await vault.addPile({ text: 'Late papers', items: [{ name: 'late.pdf', kind: 'pdf', origin: 'x', body: new Blob(['x']) }] });
    await onItsWay;
    await vault.trash(p.path ?? '');
    release();
    await vault.settled();
    expect((await drive.listAll(root)).some((f) => f.id === lateId)).toBe(false);
    await vault.restore(p.path ?? '');
    await vault.settled();
    expect((await drive.listAll(root)).filter((f) => f.name === 'late.pdf')).toHaveLength(1);
  });

  /**
   * The staged file lands, but its final answer is an error. Its read-back is already on the wire when trash
   * halts the queue; that late answer follows the pile to the Bin while the folder's Bin is still being written.
   */
  async function landsAfterTheBin(failFirstBin: boolean, binPileLast: boolean): Promise<{ lateId: string; pile: { id: string; path?: string }; failed: () => boolean; v: DriveVault }> {
    const base = memoryUploadStore();
    let kept: () => void = () => undefined;
    const keeping = new Promise<void>((r) => (kept = r));
    let letKeep: () => void = () => undefined;
    const keepGate = new Promise<void>((r) => (letKeep = r));
    const store = { ...base, add: async (...args: Parameters<typeof base.add>) => { kept(); await keepGate; return base.add(...args); } };
    const queue = createUploadQueue({ drive, store });
    const v = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), uploads: { queue, account: async () => 'ACCOUNT_A' } });
    const realTrash = drive.trash.bind(drive);
    let lateId = '';
    let failOnce = failFirstBin;
    let lateBinned: () => void = () => undefined;
    const binned = new Promise<void>((r) => (lateBinned = r));
    let reading: () => void = () => undefined;
    const readStarted = new Promise<void>((r) => (reading = r));
    let answer: () => void = () => undefined;
    const answerGate = new Promise<void>((r) => (answer = r));
    const put = drive.putChunk.bind(drive);
    drive.putChunk = async (...args) => {
      const status = await put(...args);
      if (status.kind === 'done') {
        lateId = status.file.id;
        // Drive has the reserved file, but the client receives an error and must read it back.
        throw driveError('conflict');
      }
      return status;
    };
    const uploaded = drive.getUploaded.bind(drive);
    drive.getUploaded = async (id) => {
      const file = await uploaded(id);
      if (id === lateId) {
        reading();
        await answerGate;
      }
      return file;
    };
    const halt = queue.halt.bind(queue);
    vi.spyOn(queue, 'halt').mockImplementation((id) => {
      const halted = halt(id);
      // The read was sent before halt; its answer can still arrive after the abort.
      answer();
      return halted;
    });
    let folder = '';
    drive.trash = async (id) => {
      if (id === folder && binPileLast) await binned;
      if (id === lateId && failOnce) {
        failOnce = false;
        throw new TypeError('Failed to fetch');
      }
      const r = await realTrash(id);
      if (id === lateId) lateBinned();
      return r;
    };
    const saving = v.addPile({ text: 'Late papers', items: [{ name: 'late.pdf', kind: 'pdf', origin: 'x', body: new Blob(['x']) }] });
    await keeping;
    letKeep();
    const pile = await saving;
    await readStarted;
    folder = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === pile.path)?.id ?? '';
    const trashing = v.trash(pile.path ?? '');
    await trashing;
    await v.settled();
    return { lateId, pile, failed: () => failOnce, v };
  }

  it('a file that lands after its pile is gone goes to the Bin', async () => {
    const r = await landsAfterTheBin(true, true);
    expect(r.lateId).not.toBe('');
    // The first Bin of the late file failed and was tried again.
    expect(r.failed()).toBe(false);
    // The file itself is in the Bin, nothing is lost.
    expect((await drive.listAll(root)).some((f) => f.id === r.lateId)).toBe(false);
    expect(drive['files'].get(r.lateId)?.trashed).toBe(true);
  });

  it('a file that lands during a halt is not uploaded again on Undo', async () => {
    const r = await landsAfterTheBin(false, true);
    expect(r.lateId).not.toBe('');
    await r.v.restore(r.pile.path ?? '');
    await r.v.settled();
    // One file in Drive, in the pile again: not a second upload with the first left in the Bin.
    expect([...drive['files'].values()].filter((f) => f.meta.name.startsWith('late') && !f.meta.folder)).toHaveLength(1);
    expect((await drive.listAll(root)).filter((f) => f.name.startsWith('late') && !f.folder)).toHaveLength(1);
  });

  it('a note whose text changed elsewhere can still be renamed, its text kept', async () => {
    await vault.tree();
    const id = await idOf('Resources/Cooking/Lemon tart.md');
    const f = await drive.get(id);
    await drive.writeText(id, 'written on another device', f.modifiedTime);
    const to = await vault.rename('Resources/Cooking/Lemon tart.md', 'Lemon tart, best');
    expect(to).toBe('Resources/Cooking/Lemon tart, best.md');
    expect(await drive.readText(id)).toBe('written on another device');
  });
});

it('ticking your own task keeps its note seen', async () => {
  const id = await idOf(PASSPORT);
  await drive.update(id, { appProperties: { bowerNew: '1' } });
  await vault.refresh();
  expect(findNode(await vault.tree(), PASSPORT)?.isNew).toBe(true);
  await vault.markSeen(PASSPORT);
  expect(findNode(await vault.tree(), PASSPORT)?.isNew).toBeFalsy();
  await vault.toggleTask(PASSPORT, 4);
  expect(findNode(await vault.tree(), PASSPORT)?.isNew).toBeFalsy();
  await vault.refresh();
  expect(findNode(await vault.tree(), PASSPORT)?.isNew).toBeFalsy();
});

it('runner files with the wrong shape give a readable error', async () => {
  const sys = await idOf('.bower');
  const cases: Array<{ name: string; read: () => Promise<unknown>; bad: unknown[] }> = [
    { name: 'questions.json', read: () => vault.questions(), bad: [{ v: 1 }, { v: 1, questions: {} }, { v: 1, questions: [{ id: 'q', text: 42, yes: 'Yes', no: 'No', askedAt: 1 }] }] },
    { name: 'suggestions.json', read: () => vault.suggestions(), bad: [{ v: 1 }, { v: 1, suggestions: [null] }, { v: 1, suggestions: [{ id: 's', title: 'Keep it', why: [] }] }] },
    { name: 'requests.json', read: () => vault.requests(), bad: [{ v: 1 }, { v: 1, done: [{ id: 'r', text: 'File it', at: 'later' }] }, { v: 1, done: [{ id: 'r', text: 'File it', at: 1, done: false }] }] },
    { name: 'hashes.json', read: () => vault.duplicates([{ name: 'one.txt', body: new Blob(['one']) }]), bad: [{ v: 1 }, { v: 1, hashes: [] }, { v: 1, hashes: { ['a'.repeat(64)]: 42 } }] },
    { name: 'last-run.json', read: () => vault.lastRun(), bad: [{ v: 1 }, { v: 1, run: { id: 'r' } }, { v: 1, run: { id: 'r', scope: 'all', phase: 'done', requestedAt: 1, phaseAt: 2, report: { filed: [], created: [], updated: [], setAside: [], questions: [{}] } } }] },
  ];
  for (const c of cases) {
    let f = (await drive.listAll(root)).find((x) => x.parents[0] === sys && x.name === c.name);
    if (!f) f = await drive.createText(sys, c.name, '{}');
    const original = await drive.readText(f.id);
    for (const bad of [...c.bad, { v: 2 }]) {
      const now = await drive.get(f.id);
      await drive.writeText(f.id, JSON.stringify(bad), now.modifiedTime);
      await vault.refresh();
      await expect(c.read(), c.name).rejects.toMatchObject({ name: 'BowerError', code: 'unknown', message: expect.stringMatching(/could not read|could not check/) });
    }
    const now = await drive.get(f.id);
    await drive.writeText(f.id, '{', now.modifiedTime);
    await vault.refresh();
    await expect(c.read(), `${c.name}: invalid JSON`).rejects.toMatchObject({ name: 'BowerError', code: 'unknown' });
    const latest = await drive.get(f.id);
    await drive.writeText(f.id, original, latest.modifiedTime);
  }
  await vault.refresh();
});

it('Open in Drive resolves the selected folder or file', async () => {
  const real = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), driveLinks: true });
  expect(real.driveLinks).toBe(true);
  expect(await real.driveLink()).toBe(`https://drive.google.com/drive/folders/${encodeURIComponent(root)}`);
  expect(await real.driveLink('Areas')).toBe(`https://drive.google.com/drive/folders/${encodeURIComponent(await idOf('Areas'))}`);
  expect(await real.driveLink(PASSPORT)).toBe(`https://drive.google.com/file/d/${encodeURIComponent(await idOf(PASSPORT))}/view`);
  expect(await real.driveLink('Missing.md')).toBeNull();
  expect(vault.driveLinks).toBe(false);
  expect(await vault.driveLink(PASSPORT)).toBeNull();
  real.dispose();
});

it('plain action names preserve dots in folder names', async () => {
  const folder = await vault.create('Projects', 'folder', 'Garden.md');
  expect((await vault.changes()).some((c) => c.what === 'New folder "Garden.md" in Projects')).toBe(true);
  await vault.move(folder, 'Areas');
  expect((await vault.changes()).some((c) => c.what === 'Moved Garden.md to Areas')).toBe(true);
  await vault.rename('Areas/Garden.md', 'Garden.2026');
  expect((await vault.changes()).some((c) => c.what === 'Renamed Garden.md to Garden.2026')).toBe(true);
});

it('search finds a full file name while showing its plain name', async () => {
  const hits = await vault.search('Lease draft.pdf');
  expect(hits.find((h) => h.path === 'Projects/Flat hunt/Lease draft.pdf')?.title).toBe('Lease draft');
});


describe('unreadable ownership notes do not block other notes', () => {
  const target = 'Resources/Target.md';
  const healthy = 'Resources/Healthy.md';
  const odd = 'Resources/Odd.md';
  const body = 'ownershipneedle [[Target]]';
  const formats = [
    { name: 'unsupported format', text: `---\nbower_format: obsidian-thing\n---\n${body}`, message: 'This note uses an unsupported format.', reason: 'note-format' },
    { name: 'damaged ownership/2', text: `---\nbower_format: ownership/2\n---\n${body}`, message: 'This note cannot be read safely.', reason: 'note-damaged' },
  ];

  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => undefined); });
  afterEach(() => { vi.restoreAllMocks(); });

  async function addNotes(text: string) {
    const resources = await idOf('Resources');
    await drive.createText(resources, 'Target.md', '# Target');
    await drive.createText(resources, 'Healthy.md', body);
    const bad = await drive.createText(resources, 'Odd.md', text);
    const inbox = await idOf('Inbox');
    const folder = await drive.createFolder(inbox, 'Unreadable pile');
    const context = await drive.createText(folder.id, 'Pile note.md', text);
    await drive.createText(folder.id, 'Input.md', 'Alex added a synthetic input.');
    const good = await drive.createFolder(inbox, 'Readable pile');
    await drive.createText(good.id, 'Pile note.md', 'Alex added readable context.');
    return { bad, folder, context, good };
  }

  it.each(formats)('search skips and logs $name while returning readable matches', async ({ text }) => {
    await addNotes(text);
    const before = await drive.snapshot();
    await expect(vault.search('ownershipneedle').then((hits) => hits.map((hit) => hit.path))).resolves.toEqual([healthy]);
    expect(console.error).toHaveBeenCalledWith(expect.any(BowerError));
    expect(await drive.snapshot()).toBe(before);
  });

  it.each(formats)('backlinks skip and log $name while the target still opens', async ({ text }) => {
    await addNotes(text);
    const before = await drive.snapshot();
    await expect(vault.note(target)).resolves.toMatchObject({ path: target, body: '# Target', backlinks: [healthy] });
    expect(console.error).toHaveBeenCalledWith(expect.any(BowerError));
    expect(await drive.snapshot()).toBe(before);
  });

  // pile-note-format-visible: the pile is no longer hidden; it stays, held, with its reason (TL-P2-08, TL-P2-11).
  it.each(formats)('Inbox holds and logs a pile with $name without hiding readable piles', async ({ text, reason }) => {
    const { folder, good } = await addNotes(text);
    const before = await drive.snapshot();
    await expect(vault.piles().then((piles) => piles.find((pile) => pile.id === good.id)?.text)).resolves.toBe('Alex added readable context.');
    expect((await vault.piles()).find((pile) => pile.id === folder.id)).toMatchObject({ setAside: reason, noteLocked: true });
    expect(console.error).toHaveBeenCalledWith(expect.any(BowerError));
    expect(await drive.snapshot()).toBe(before);
  });

  // Final delta review, Minor: a refused note opened on its screen reaches the console once until it changes.
  it.each(formats)('opening $name logs its refusal once until the note changes', async ({ text }) => {
    await addNotes(text);
    const errors = vi.mocked(console.error);
    errors.mockClear();
    for (let i = 0; i < 3; i++) await expect(vault.note(odd)).rejects.toMatchObject({ name: 'BowerError' });
    const refusals = (): unknown[] => errors.mock.calls.map(([e]) => e).filter((e) => e instanceof BowerError && noteRefusal(e) !== null);
    expect(refusals()).toHaveLength(1);
    const f = (await drive.listAll(root)).find((x) => drive.pathOf(x.id, root) === odd);
    await drive.writeText(f?.id ?? '', `${text}\nMore words`, f?.modifiedTime ?? '');
    await vault.refresh();
    for (let i = 0; i < 2; i++) await expect(vault.note(odd)).rejects.toMatchObject({ name: 'BowerError' });
    expect(refusals()).toHaveLength(2);
  });

  it.each(formats)('opening $name directly retains the short readable refusal', async ({ text, message }) => {
    await addNotes(text);
    const before = await drive.snapshot();
    await expect(vault.note(odd)).rejects.toMatchObject({ name: 'BowerError', code: 'unknown', message });
    await expect(vault.toggleTask(odd, 0)).rejects.toMatchObject({ name: 'BowerError', message });
    expect(await drive.snapshot()).toBe(before);
  });

  // The Inbox no longer does: a pile note Drive cannot give back holds only its pile (pile-note-read-isolation).
  it.each(['search', 'backlinks'] as const)('still propagates Drive read failures in %s', async (operation) => {
    const { bad, context } = await addNotes(body);
    const read = drive.readText.bind(drive);
    const error = new BowerError('offline', 'You appear to be offline.');
    vi.spyOn(drive, 'readText').mockImplementation(async (id) => {
      if (id === bad.id || id === context.id) throw error;
      return read(id);
    });
    const result = operation === 'search' ? vault.search('ownershipneedle') : vault.note(target);
    await expect(result).rejects.toBe(error);
  });

  it('a Drive read failure in the Inbox holds only the pile whose note it is', async () => {
    const { context, folder, good } = await addNotes(body);
    const read = drive.readText.bind(drive);
    const error = new BowerError('offline', 'You appear to be offline.');
    vi.spyOn(drive, 'readText').mockImplementation(async (id) => {
      if (id === context.id) throw error;
      return read(id);
    });
    const piles = await vault.piles();
    expect(piles.find((pile) => pile.id === folder.id)?.setAside).toBe('not-checked');
    expect(piles.find((pile) => pile.id === good.id)?.text).toBe('Alex added readable context.');
    expect(console.error).toHaveBeenCalledWith(error);
  });
});

describe('pile declarations', () => {
  const declaring = (): DriveVault => new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true });
  const pdf = (name: string): { name: string; kind: 'pdf'; origin: string; body: Blob } => ({ name, kind: 'pdf', origin: 'From this computer', body: new Blob([`%PDF ${name}`]) });
  const DECLARATION = /^declaration-[A-Za-z0-9_-]+-[0-9a-f]{64}\.json$/;

  async function declarations() {
    const files = (await drive.listAll(root)).filter((f) => !f.folder && drive.pathOf(f.id, root).startsWith('.bower/piles/'));
    return Promise.all(files.map(async (f) => ({ id: f.id, name: f.name, bytes: await drive.readBytes(f.id) })));
  }

  /** b.pdf does not get through until `heal` is called. */
  function failing(name: string): () => void {
    let fail = true;
    beforeUpload(drive, ({ name: n }) => {
      if (n === name && fail) throw driveError('offline');
    });
    return () => { fail = false; };
  }

  it('a declaration is written before any member and never rewritten', async () => {
    const order: string[] = [];
    const createText = drive.createText.bind(drive);
    const createFolder = drive.createFolder.bind(drive);
    drive.createText = async (parent, name, text, props) => { order.push(`text:${name}`); return createText(parent, name, text, props); };
    drive.createFolder = async (parent, name, props) => { order.push(`folder:${name}`); return createFolder(parent, name, props); };
    const heal = failing('b.pdf');
    beforeUpload(drive, ({ name }) => { order.push(`upload:${name}`); });
    const writeText = vi.spyOn(drive, 'writeText');
    const uploader = declaring();
    const pile = await uploader.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf'), pdf('b.pdf')] });
    await uploader.settled();
    const declared = await declarations();
    expect(declared.map((d) => d.name)).toEqual([expect.stringMatching(DECLARATION)]);
    const at = order.findIndex((x) => DECLARATION.test(x.replace(/^text:/, '')));
    expect(at).toBeGreaterThanOrEqual(0);
    const pileFolder = order.findIndex((x) => x.startsWith('folder:') && x.endsWith('Papers from Alex'));
    expect(pileFolder).toBeGreaterThan(at);
    expect(order.slice(0, at).some((x) => x.startsWith('upload:') || x === 'text:Pile note.md')).toBe(false);
    const parsed = await parsePileDeclaration(declared[0]?.bytes ?? new Uint8Array(), root);
    if (!parsed.ok) throw new Error(`declaration refused: ${parsed.reason}`);
    expect(parsed.value.pileId).toBe(pile.id);
    expect(parsed.value.members.map((m) => m.name)).toEqual(['a.pdf', 'b.pdf']);
    expect(declared[0]?.name).toBe(`declaration-${parsed.value.declarationId}-${parsed.sha256}.json`);
    heal();
    await uploader.retryPile(pile.id);
    await uploader.settled();
    expect(order.filter((x) => x.startsWith('upload:'))).toEqual(['upload:a.pdf', 'upload:b.pdf', 'upload:b.pdf']);
    expect(await declarations()).toEqual(declared);
    expect(writeText.mock.calls.filter(([id]) => id === declared[0]?.id)).toEqual([]);
  });

  it('a failed declaration write uploads nothing', async () => {
    const inboxBefore = (await drive.listAll(root)).filter((f) => drive.pathOf(f.id, root).startsWith('Inbox/')).map((f) => f.id).sort();
    const createText = drive.createText.bind(drive);
    drive.createText = async (parent, name, text, props) => {
      if (name.startsWith('declaration-')) throw driveError('offline');
      return createText(parent, name, text, props);
    };
    const upload = vi.spyOn(drive, 'openResumable');
    const uploader = declaring();
    await expect(uploader.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf'), pdf('b.pdf')] })).rejects.toMatchObject({ name: 'BowerError', code: 'offline' });
    await uploader.settled();
    expect(upload).not.toHaveBeenCalled();
    expect((await drive.listAll(root)).filter((f) => drive.pathOf(f.id, root).startsWith('Inbox/')).map((f) => f.id).sort()).toEqual(inboxBefore);
  });

  it('the uploader shows each missing member once', async () => {
    failing('b.pdf');
    const uploader = declaring();
    const pile = await uploader.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf'), pdf('b.pdf')] });
    await uploader.settled();
    const rows = async (): Promise<Array<[string, number | undefined]>> => ((await uploader.piles()).find((p) => p.id === pile.id)?.items ?? []).map((i) => [i.name, i.upload]);
    expect(await rows()).toEqual([['a.pdf', undefined], ['b.pdf', -1]]);
    await uploader.refresh();
    expect(await rows()).toEqual([['a.pdf', undefined], ['b.pdf', -1]]);
  });

  it('a conflicting declaration copy blocks the pile', async () => {
    failing('b.pdf');
    const uploader = declaring();
    const pile = await uploader.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf'), pdf('b.pdf')] });
    await uploader.settled();
    const declared = await declarations();
    expect(declared).toHaveLength(1);
    const parsed = await parsePileDeclaration(declared[0]?.bytes ?? new Uint8Array(), root);
    if (!parsed.ok) throw new Error(`declaration refused: ${parsed.reason}`);
    // Another client wrote a different body under the same declaration id.
    const other = { ...parsed.value, createdAt: parsed.value.createdAt + 1 };
    const bytes = canonicalRecordJson(other);
    const hash = await hashRecordJson(other);
    if (!bytes.ok || !hash.ok) throw new Error('no canonical copy');
    const parent = (await drive.get(declared[0]?.id ?? '')).parents[0] ?? '';
    await drive.createText(parent, `declaration-${other.declarationId}-${hash.value}.json`, new TextDecoder().decode(bytes.value));
    const second = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
    const seen = (await second.piles()).find((p) => p.id === pile.id);
    expect(seen?.items.map((i) => [i.name, i.upload])).toEqual([['a.pdf', undefined]]);
    const folder = (await drive.listAll(root)).find((f) => f.folder && f.appProperties?.pile === pile.id);
    if (!folder) throw new Error('no pile folder');
    const mine = new Set((await drive.listAll(folder.id)).map((f) => f.id).concat(folder.id));
    const before = await drive.snapshot();
    const out = await tidyUp(drive, root, 'all');
    if (out.phase !== 'done') throw new Error('failed');
    // On the B path a run holds it and says nothing of it; the Inbox says why (TL-P2-21).
    expect(out.manifest.capture.piles.map((p) => p.pileId)).not.toContain(pile.id);
    expect((await second.piles()).find((p) => p.id === pile.id)?.setAside).toBe('declaration');
    expect(out.report.filed.map((f) => f.name)).not.toContain('a.pdf');
    const after = JSON.parse(await drive.snapshot()) as { files: Array<{ meta: { id: string }; trashed: boolean }> };
    const was = JSON.parse(before) as { files: Array<{ meta: { id: string }; trashed: boolean }> };
    expect(after.files.filter((f) => mine.has(f.meta.id))).toEqual(was.files.filter((f) => mine.has(f.meta.id)));
  });

  /** The pile's folder, its note and its parsed declaration. */
  async function declaredParts(pileId: string) {
    const folder = (await drive.listAll(root)).find((f) => f.folder && f.appProperties?.pile === pileId);
    if (!folder) throw new Error('no pile folder');
    const note = (await drive.listAll(folder.id)).find((f) => f.name === 'Pile note.md');
    const [declared] = await declarations();
    const parsed = await parsePileDeclaration(declared?.bytes ?? new Uint8Array(), root);
    if (!parsed.ok) throw new Error('declaration refused');
    return { folder, note, declaration: parsed.value };
  }

  it('a new note for a declared pile carries its declared context key', async () => {
    const uploader = declaring();
    const pile = await uploader.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf'), pdf('b.pdf')] });
    await uploader.settled();
    const { note, declaration } = await declaredParts(pile.id);
    if (!note || declaration.context.kind !== 'text') throw new Error('no context');
    await drive.trash(note.id);
    await declaring().updatePile(pile.id, 'New words');
    const again = (await declaredParts(pile.id)).note;
    expect(again?.id).not.toBe(note.id);
    expect(again?.appProperties?.bowerItem).toBe(declaration.context.memberKey);
    expect(await drive.readText(again?.id ?? '')).toBe('New words');
  });

  it("clearing a declared pile's line keeps its note, empty", async () => {
    const uploader = declaring();
    const pile = await uploader.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf'), pdf('b.pdf')] });
    await uploader.settled();
    const { note } = await declaredParts(pile.id);
    const trash = vi.spyOn(drive, 'trash');
    const cleared = await declaring().updatePile(pile.id, '');
    expect(cleared.text).toBe('');
    expect(trash).not.toHaveBeenCalled();
    expect((await declaredParts(pile.id)).note?.id).toBe(note?.id);
    expect(await drive.readText(note?.id ?? '')).toBe('');
  });

  it('Try again on another client writes a missing note again, then asks for the file', async () => {
    failing('b.pdf');
    const uploader = declaring();
    const pile = await uploader.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf'), pdf('b.pdf')] });
    await uploader.settled();
    const { folder, note, declaration } = await declaredParts(pile.id);
    if (!note || declaration.context.kind !== 'text') throw new Error('no context');
    await contextNeverCreated([note.id]);
    const upload = vi.spyOn(drive, 'openResumable');
    await expect(declaring().retryPile(pile.id)).rejects.toMatchObject({ code: 'conflict', message: 'Choose b.pdf again on this device to send it.' });
    const again = (await drive.listAll(folder.id)).filter((f) => f.name === 'Pile note.md');
    expect(again.map((f) => f.appProperties?.bowerItem)).toEqual([declaration.context.memberKey]);
    expect(await drive.readText(again[0]?.id ?? '')).toBe('Papers from Alex');
    expect(upload).not.toHaveBeenCalled();
  });

  it('a missing link shows as you added it, and asks to paste it again', async () => {
    const createText = drive.createText.bind(drive);
    drive.createText = async (parent, name, text, props) => {
      if (name.endsWith('.url')) throw driveError('offline');
      return createText(parent, name, text, props);
    };
    const uploader = declaring();
    const pile = await uploader.addPile({ text: 'Reading from Alex', items: [pdf('a.pdf'), { name: 'source.example/path', kind: 'link', origin: 'A link you pasted', url: 'https://source.example/path' }] });
    await uploader.settled();
    const second = declaring();
    const seen = (await second.piles()).find((p) => p.id === pile.id);
    expect(seen?.items.map((i) => [i.name, i.kind, i.upload])).toEqual([['a.pdf', 'pdf', undefined], ['source.example/path', 'link', -1]]);
    await expect(second.retryPile(pile.id)).rejects.toMatchObject({ code: 'conflict', message: 'Paste the link again on this device to send it.' });
  });

  it('listing the inbox again reads no declaration twice and lists nothing again', async () => {
    failing('b.pdf');
    const uploader = declaring();
    const pile = await uploader.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf'), pdf('b.pdf')] });
    await uploader.settled();
    const second = declaring();
    expect((await second.piles()).find((p) => p.id === pile.id)?.items).toHaveLength(2);
    const listAll = vi.spyOn(drive, 'listAll');
    const readBytes = vi.spyOn(drive, 'readBytes');
    expect((await second.piles()).find((p) => p.id === pile.id)?.items).toHaveLength(2);
    expect(listAll).not.toHaveBeenCalled();
    expect(readBytes).not.toHaveBeenCalled();
  });

  it('a missing link keeps its slashes on another client', async () => {
    const createText = drive.createText.bind(drive);
    drive.createText = async (parent, name, text, props) => {
      if (name.endsWith('.url')) throw driveError('offline');
      return createText(parent, name, text, props);
    };
    const uploader = declaring();
    const pile = await uploader.addPile({ text: 'Reading from Alex', items: [pdf('a.pdf'), { name: 'https://example.com/page%2F1', kind: 'link', origin: 'A link you pasted', url: 'https://example.com/page%2F1' }] });
    await uploader.settled();
    const seen = (await declaring().piles()).find((p) => p.id === pile.id);
    expect(seen?.items.map((i) => i.name)).toEqual(['a.pdf', 'https://example.com/page%2F1']);
  });

  it('Try again writes no note while a tidy-up holds the pile, nor one already written again elsewhere', async () => {
    failing('b.pdf');
    const uploader = declaring();
    const pile = await uploader.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf'), pdf('b.pdf')] });
    await uploader.settled();
    const { folder, note, declaration } = await declaredParts(pile.id);
    if (!note || declaration.context.kind !== 'text') throw new Error('no context');
    await contextNeverCreated([note.id]);
    const createText = vi.spyOn(drive, 'createText');
    const busy = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set([pile.id]), declarePiles: true });
    await expect(busy.retryPile(pile.id)).rejects.toMatchObject({ code: 'conflict', message: 'Wait for the tidy-up to end.' });
    expect(createText).not.toHaveBeenCalled();
    const second = declaring();
    expect((await second.piles()).find((p) => p.id === pile.id)?.text).toBe('');
    // Someone else writes the note again after this client listed the pile.
    await drive.createText(folder.id, 'Pile note.md', 'Papers from Alex', { bowerItem: declaration.context.memberKey });
    await expect(second.retryPile(pile.id)).rejects.toMatchObject({ message: 'Choose b.pdf again on this device to send it.' });
    expect((await drive.listAll(folder.id)).filter((f) => f.name === 'Pile note.md')).toHaveLength(1);
  });

  it('a second note with the context key is never shown as a thing', async () => {
    const uploader = declaring();
    const pile = await uploader.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf'), pdf('b.pdf')] });
    await uploader.settled();
    const { folder, declaration } = await declaredParts(pile.id);
    if (declaration.context.kind !== 'text') throw new Error('no context');
    await drive.createText(folder.id, 'Pile note.md', 'Papers from Alex', { bowerItem: declaration.context.memberKey });
    const seen = (await declaring().piles()).find((p) => p.id === pile.id);
    expect(seen?.items.map((i) => i.name)).toEqual(['a.pdf', 'b.pdf']);
  });
});

describe('uploads survive a reload, through the vault', () => {
  const ACCOUNT_A = 'ACCOUNT_A';
  const ACCOUNT_B = 'ACCOUNT_B';
  const BYTES = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const scan = (): { name: string; kind: 'pdf'; origin: string; body: Blob } => ({ name: 'scan.pdf', kind: 'pdf', origin: 'From this computer', body: new Blob([BYTES], { type: 'application/pdf' }) });

  interface Page {
    drive: FakeDrive;
    queue: UploadQueue;
    vault: DriveVault;
  }

  /** One page load of the fake stack: the pretend Drive as it was kept, the device's IndexedDB, a fresh queue and vault. */
  function page(d: FakeDrive, idb: IDBFactory, account = ACCOUNT_A, storage?: StorageLike): Page {
    const queue = createUploadQueue({ drive: d, store: indexedDbUploadStore(idb), chunkSize: 4, ...(storage ? { storage } : {}) });
    const vault = new DriveVault({ drive: d, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true, uploads: { queue, account: async () => account } });
    return { drive: d, queue, vault };
  }

  async function fresh(): Promise<{ d: FakeDrive; idb: IDBFactory }> {
    const d = new FakeDrive({ chunkMultiple: 4 });
    root = (await seedFakeDrive(d, 'default', Date.now())) ?? '';
    return { d, idb: new IDBFactory() };
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
  const scans = async (d: FakeDrive, r = root): Promise<string[]> => (await d.listAll(r)).filter((f) => f.appProperties?.asAdded === 'scan.pdf').map((f) => f.id);
  const rowsOf = async (v: DriveVault, id: string): Promise<Array<[string, number | undefined]>> => ((await v.piles()).find((p) => p.id === id)?.items ?? []).map((i) => [i.name, i.upload]);

  it('a reload mid-upload resumes from where Drive stopped, and the thing arrives once', async () => {
    const { d, idb } = await fresh();
    const hold = holdAt(d, 4);
    const first = page(d, idb);
    const pile = await first.vault.addPile({ text: 'Receipts', items: [scan()] });
    await reached(d, 4);
    const sending = (await rowsOf(first.vault, pile.id))[0];
    expect(sending?.[0]).toBe('scan.pdf');
    expect(sending?.[1]).toBeGreaterThan(0);
    expect(sending?.[1]).toBeLessThan(1);
    const reserved = d.resumableCalls.find((c) => c.op === 'open')?.id;

    // The page goes away: the pretend Drive is kept as the fake source keeps it.
    const kept = await d.snapshot();
    first.queue.stop();
    first.vault.dispose();
    hold.open();

    const again = FakeDrive.restore(kept, { chunkMultiple: 4 });
    const second = page(again, idb);
    expect((await rowsOf(second.vault, pile.id)).map(([name]) => name)).toEqual(['scan.pdf']);
    await vi.waitFor(async () => expect(await scans(again)).toEqual([reserved]));
    expect(again.resumableCalls.map((c) => (c.op === 'put' ? `put@${c.start}` : c.op))).toEqual(['status', 'put@4', 'put@8']);
    expect(await rowsOf(second.vault, pile.id)).toEqual([['scan.pdf', undefined]]);
    expect([...(await again.readBytes(reserved ?? ''))]).toEqual([...BYTES]);
  });

  it('sign-out forgets the bytes for that account and folder; another account never sees or sends them', async () => {
    const { d, idb } = await fresh();
    const hold = holdAt(d, 4);
    const first = page(d, idb);
    const live = makeLiveSources({ drive: d, worker: new FakeWorker({ drive: d, runs: new FakeRunService({ drive: d, scale: 'instant' }), rootId: root, scenario: 'default' }), declarePiles: true, uploadQueue: first.queue });
    try {
      const account = await uploadAccount((await live.session.current())?.email ?? '');
      const pile = await live.vault.addPile({ text: 'Receipts', items: [scan()] });
      await reached(d, 4);
      const store = indexedDbUploadStore(idb);
      const kept = (await store.list(account, root))[0];
      expect(kept).toBeDefined();
      expect(kept && await store.body(kept)).toBeInstanceOf(Blob);
      await live.session.signOut();
      hold.open();
      await first.queue.idle();
      d.beforeChunk = null;
      expect(await store.list(account, root)).toEqual([]);
      expect(kept && await store.body(kept)).toBeNull();

      const calls = d.resumableCalls.length;
      const other = page(d, idb, ACCOUNT_B);
      const rows = await rowsOf(other.vault, pile.id);
      await other.queue.idle();
      expect(rows.filter(([, upload]) => upload !== undefined && upload >= 0)).toEqual([]);
      expect(other.queue.items()).toEqual([]);
      expect(d.resumableCalls).toHaveLength(calls);
      other.queue.stop();

      const back = page(d, idb, account);
      await back.vault.piles();
      await back.queue.idle();
      expect(await scans(d)).toHaveLength(0);
      expect(back.queue.items()).toEqual([]);
      expect(d.resumableCalls).toHaveLength(calls);
      back.queue.stop();
    } finally {
      hold.open();
      first.vault.dispose();
      live.dispose();
      sessionStorage.clear();
    }
  });

  it('leaving Bower removes the bytes this device kept', async () => {
    const backend = new FakeDrive({ chunkMultiple: 4 });
    const backendRoot = (await seedFakeDrive(backend, 'default', Date.now())) ?? '';
    const idb = new IDBFactory();
    const store = indexedDbUploadStore(idb);
    const queue = createUploadQueue({ drive: backend, store, chunkSize: 4 });
    const live = makeLiveSources({ drive: backend, worker: new FakeWorker({ drive: backend, runs: new FakeRunService({ drive: backend, scale: 'instant' }), rootId: backendRoot, scenario: 'default' }), declarePiles: true, uploadQueue: queue });
    const hold = holdAt(backend, 4);
    try {
      await live.vault.addPile({ text: 'Papers', items: [scan()] });
      await reached(backend, 4);
      const user = await live.session.current();
      const account = await uploadAccount(user?.email ?? '');
      expect(account).toMatch(/^[0-9a-f]{64}$/);
      expect(await store.list(account, backendRoot)).toHaveLength(1);
      await live.session.deleteAccount();
      hold.open();
      expect(await store.list(account, backendRoot)).toEqual([]);
      await queue.idle();
      expect(await scans(backend, backendRoot)).toEqual([]);
    } finally {
      hold.open();
      live.dispose();
      // The pretend Worker keeps "signed out" for this tab; the next test starts signed in.
      sessionStorage.clear();
    }
  });

  it('removing a pile on its way discards its bytes and makes nothing', async () => {
    const { d, idb } = await fresh();
    const hold = holdAt(d, 4);
    const tab = page(d, idb);
    const pile = await tab.vault.addPile({ text: 'Receipts', items: [scan()] });
    await reached(d, 4);
    // The chunk on its way settles (aborted) before the removal ends.
    const removing = tab.vault.removePile(pile.id);
    hold.open();
    await removing;
    await tab.vault.settled();
    await tab.queue.idle();
    expect(await indexedDbUploadStore(idb).list(ACCOUNT_A, root)).toEqual([]);
    expect(await scans(d)).toEqual([]);
  });

  it('removing a lone thing whose last answer was lost puts the file Drive made in the Bin', async () => {
    const { d, idb } = await fresh();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    d.beforeChunk = (call) => {
      if (call.start === 8) d.loseNextReply();
    };
    const tab = page(d, idb);
    const pile = await tab.vault.addPile({ text: '', items: [scan()] });
    await tab.vault.settled();
    await tab.queue.idle();
    expect(await scans(d)).toHaveLength(1);
    expect(d.resumableCalls.some((c) => c.op === 'open')).toBe(true);
    d.beforeChunk = null;
    await tab.vault.removePile(pile.id);
    expect(await scans(d)).toEqual([]);
    expect(await indexedDbUploadStore(idb).list(ACCOUNT_A, root)).toEqual([]);
    expect((await tab.vault.piles()).find((p) => p.id === pile.id)).toBeUndefined();
  });

  it('every app write of an existing file refuses one that changed name or place elsewhere: held upload (404/1030, 1708)', async () => {
    // A thing whose last answer was lost, then filed elsewhere in Drive before the pile is removed: it stays there.
    const { d, idb } = await fresh();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    d.beforeChunk = (call) => {
      if (call.start === 8) d.loseNextReply();
    };
    const tab = page(d, idb);
    const pile = await tab.vault.addPile({ text: '', items: [scan()] });
    await tab.vault.settled();
    await tab.queue.idle();
    d.beforeChunk = null;
    const [made] = (await d.listAll(root)).filter((f) => f.name === 'scan.pdf');
    if (!made) throw new Error('no scan');
    const projects = (await d.listAll(root)).find((f) => f.folder && d.pathOf(f.id, root) === 'Projects');
    await d.update(made.id, { addParent: projects?.id ?? '', ...(made.parents[0] ? { removeParent: made.parents[0] } : {}) });
    await tab.vault.removePile(pile.id).catch(() => undefined);
    expect((await d.get(made.id, { binned: true })).trashed).toBeFalsy();
    expect(d.pathOf(made.id, root)).toBe('Projects/scan.pdf');
  });

  it('a thing that waited for a connection is sent once on Try again', async () => {
    const { d, idb } = await fresh();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const tab = page(d, idb);
    const pile = await tab.vault.addPile({ text: 'Receipts', items: [scan()] });
    d.offline = true;
    await tab.vault.settled();
    d.offline = false;
    expect(await rowsOf(tab.vault, pile.id)).toEqual([['scan.pdf', -1]]);
    await tab.vault.retryPile(pile.id);
    await tab.vault.settled();
    await vi.waitFor(async () => expect(await rowsOf(tab.vault, pile.id)).toEqual([['scan.pdf', undefined]]));
    expect(await scans(d)).toHaveLength(1);
    expect(d.resumableCalls.filter((c) => c.op === 'open')).toHaveLength(1);
  });

  it('the declared hash keys the upload, so the bytes are not hashed again', async () => {
    const { d, idb } = await fresh();
    const tab = page(d, idb);
    const pile = await tab.vault.addPile({ text: 'Receipts', items: [scan()] });
    await tab.vault.settled();
    const [declared] = (await d.listAll(root)).filter((f) => d.pathOf(f.id, root).startsWith('.bower/piles/'));
    const parsed = await parsePileDeclaration(await d.readBytes(declared?.id ?? ''), root);
    if (!parsed.ok) throw new Error('declaration');
    const member = parsed.value.members[0];
    expect(tab.queue.items()[0]).toMatchObject({ pileId: pile.id, declarationId: parsed.value.declarationId, memberKey: member?.memberKey, sha256: member?.content.sha256 });
  });

  it('a browser that will not keep storage is told in plain words, only while something waits to be sent', async () => {
    const { d, idb } = await fresh();
    const hold = holdAt(d, 4);
    const tab = page(d, idb, ACCOUNT_A, { persist: async () => false });
    expect(tab.vault.uploadNotice()).toBeNull();
    await tab.vault.addPile({ text: 'Receipts', items: [scan()] });
    await vi.waitFor(() => expect(tab.vault.uploadNotice()).toBe('This browser may clear what Bower keeps here. Keep Bower open until everything is sent.'));
    // TL-P2-19 (4): once nothing is left to send, the notice goes, without a reload.
    hold.open();
    await tab.vault.settled();
    await tab.queue.idle();
    expect(tab.queue.persistence()).toBe('refused');
    await vi.waitFor(() => expect(tab.vault.uploadNotice()).toBeNull());
  });

  it('kept uploads this device cannot read are told once, and the things they held show as missing', async () => {
    const { d, idb } = await fresh();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const hold = holdAt(d, 4);
    const first = page(d, idb);
    const pile = await first.vault.addPile({ text: 'Receipts', items: [scan()] });
    await reached(d, 4);
    first.queue.stop();
    first.vault.dispose();
    hold.open();
    d.beforeChunk = null;
    const unreadable = { ...indexedDbUploadStore(idb), list: () => Promise.reject(new Error('IndexedDB list failed')) };
    const queue = createUploadQueue({ drive: d, store: unreadable, chunkSize: 4 });
    const vault = new DriveVault({ drive: d, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true, uploads: { queue, account: async () => ACCOUNT_A } });
    await vault.piles();
    await vi.waitFor(() => expect(vault.uploadNotice()).toBe("Bower couldn't read what it kept on this device. Choose those files again to send them."));
    expect(await rowsOf(vault, pile.id)).toEqual([['scan.pdf', -1]]);
  });

  it('every upload goes through the queue: live sources build one when given none', async () => {
    // A browser: IndexedDB is there. Signed in, as a fresh tab is.
    sessionStorage.clear();
    vi.stubGlobal('indexedDB', new IDBFactory());
    try {
      const backend = new FakeDrive();
      const backendRoot = (await seedFakeDrive(backend, 'default', Date.now())) ?? '';
      const upload = vi.spyOn(backend, 'upload');
      const live = makeLiveSources({ drive: backend, worker: new FakeWorker({ drive: backend, runs: new FakeRunService({ drive: backend, scale: 'instant' }), rootId: backendRoot, scenario: 'default' }), declarePiles: true });
      try {
        await live.vault.addPile({ text: 'Papers', items: [scan()] });
        await vi.waitFor(async () => expect(await scans(backend, backendRoot)).toHaveLength(1));
        expect(backend.resumableCalls.map((c) => c.op)).toEqual(expect.arrayContaining(['generateIds', 'open', 'put']));
        expect(upload).not.toHaveBeenCalled();
      } finally {
        live.dispose();
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /** A declared pile whose one thing arrived, its answer lost, and was then moved out of the pile. */
  async function arrivedAndMoved(): Promise<{ d: FakeDrive; idb: IDBFactory; tab: Page; pileId: string; fileId: string; projects: string }> {
    const { d, idb } = await fresh();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    d.beforeChunk = (call) => {
      if (call.start === 8) d.loseNextReply();
    };
    const tab = page(d, idb);
    const pile = await tab.vault.addPile({ text: 'Receipts', items: [scan()] });
    await tab.vault.settled();
    await tab.queue.idle();
    d.beforeChunk = null;
    const [fileId] = await scans(d);
    const projects = (await d.listAll(root)).find((f) => f.folder && d.pathOf(f.id, root) === 'Projects')?.id ?? '';
    const made = await d.get(fileId ?? '');
    await d.update(fileId ?? '', { addParent: projects, removeParent: made.parents[0] ?? '' });
    return { d, idb, tab, pileId: pile.id, fileId: fileId ?? '', projects };
  }

  it('removing a pile never bins its thing once it was filed elsewhere', async () => {
    const { d, idb, tab, pileId, fileId, projects } = await arrivedAndMoved();
    await tab.vault.removePile(pileId);
    expect((await d.listAll(root)).filter((f) => f.id === fileId).map((f) => f.parents)).toEqual([[projects]]);
    expect(await indexedDbUploadStore(idb).list(ACCOUNT_A, root)).toEqual([]);
  });

  it('Try again on a thing filed elsewhere after a lost answer ends it, without a Drive error', async () => {
    const { d, tab, pileId, fileId } = await arrivedAndMoved();
    // The session is gone too: the reserved id is read back where it is now.
    d.expireSessions();
    await tab.vault.retryPile(pileId);
    await tab.vault.settled();
    await tab.queue.idle();
    expect(tab.queue.items()[0]).toMatchObject({ state: 'done', file: { id: fileId } });
    expect(tab.queue.items()[0]?.error).toBeUndefined();
    expect(await scans(d)).toEqual([fileId]);
  });

  it('a pile whose removal fails keeps the bytes of its things', async () => {
    const { d, idb } = await fresh();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const hold = holdAt(d, 4);
    const tab = page(d, idb);
    const pile = await tab.vault.addPile({ text: 'Receipts', items: [scan()] });
    await reached(d, 4);
    vi.spyOn(d, 'trash').mockRejectedValueOnce(driveError('offline'));
    // The chunk on hold goes on once the removal has stopped the thing's upload, however long the listing took.
    const halt = tab.queue.halt.bind(tab.queue);
    vi.spyOn(tab.queue, 'halt').mockImplementation((id) => {
      const halted = halt(id);
      hold.open();
      return halted;
    });
    const removing = tab.vault.removePile(pile.id);
    await expect(removing).rejects.toMatchObject({ code: 'offline' });
    expect(await indexedDbUploadStore(idb).list(ACCOUNT_A, root)).toHaveLength(1);
  });

  it('a thing whose lost answer already shows in the folder is listed once', async () => {
    const { d, idb } = await fresh();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    d.beforeChunk = (call) => {
      if (call.start === 8) d.loseNextReply();
    };
    const tab = page(d, idb);
    const pile = await tab.vault.addPile({ text: 'Receipts', items: [scan()] });
    await tab.vault.settled();
    await tab.queue.idle();
    await tab.vault.refresh();
    expect((await rowsOf(tab.vault, pile.id)).map(([name]) => name)).toEqual(['scan.pdf']);
  });

  it('signed out, listing the inbox starts no upload queue and logs nothing', async () => {
    const { d, idb } = await fresh();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const queue = createUploadQueue({ drive: d, store: indexedDbUploadStore(idb), chunkSize: 4 });
    const start = vi.spyOn(queue, 'start');
    const vault = new DriveVault({ drive: d, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true, uploads: { queue, account: async () => { throw new BowerError('auth', 'Sign in again to keep going.'); } } });
    await vault.piles();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(start).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('coming back online asks the queue to retry only what waited for a connection', async () => {
    const backend = new FakeDrive({ chunkMultiple: 4 });
    const backendRoot = (await seedFakeDrive(backend, 'default', Date.now())) ?? '';
    const queue = createUploadQueue({ drive: backend, store: indexedDbUploadStore(new IDBFactory()), chunkSize: 4 });
    const retry = vi.spyOn(queue, 'retry');
    const live = makeLiveSources({ drive: backend, worker: new FakeWorker({ drive: backend, runs: new FakeRunService({ drive: backend, scale: 'instant' }), rootId: backendRoot, scenario: 'default' }), uploadQueue: queue });
    try {
      window.dispatchEvent(new Event('online'));
      expect(retry).toHaveBeenCalledWith('offline');
    } finally {
      live.dispose();
    }
  });

  it('a thing whose bytes this device no longer has is asked for again, as a missing one', async () => {
    const { d, idb } = await fresh();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const hold = holdAt(d, 4);
    const first = page(d, idb);
    const pile = await first.vault.addPile({ text: 'Receipts', items: [scan()] });
    await reached(d, 4);
    first.queue.stop();
    first.vault.dispose();
    hold.open();
    d.beforeChunk = null;
    const queue = createUploadQueue({ drive: d, store: { ...indexedDbUploadStore(idb), body: async () => null }, chunkSize: 4 });
    const vault = new DriveVault({ drive: d, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true, uploads: { queue, account: async () => ACCOUNT_A } });
    await vault.piles();
    await vi.waitFor(() => expect(queue.items()[0]?.state).toBe('failed'));
    expect(await rowsOf(vault, pile.id)).toEqual([['scan.pdf', -1]]);
    await expect(vault.retryPile(pile.id)).rejects.toThrow('Choose scan.pdf again on this device to send it.');
  });

  /**
   * c4-undo-withdraw round 2 (P4-56 minor, contract): the upload record is a keeper of write-once's withdraw, through
   * removePile's `withdrawPile`. Its last chunk lands with its reply lost while the removal holds it back; the file under
   * the reserved id goes to the Bin when it holds the bytes sent (`getUploaded`'s SHA-256), and stays where it is when not.
   */
  it.each(['the bytes sent', 'other bytes'] as const)('a pile removed after its upload landed with its reply lost: %s', async (held) => {
    const { d, idb } = await fresh();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    d.beforeChunk = (call) => {
      if (call.start === 8) d.loseNextReply();
    };
    const tab = page(d, idb);
    const pile = await tab.vault.addPile({ text: '', items: [scan()] });
    await tab.vault.settled();
    await tab.queue.idle();
    d.beforeChunk = null;
    const [fileId = ''] = await scans(d);
    expect(tab.queue.items()[0]).toMatchObject({ fileId });
    expect(tab.queue.items()[0]?.state).not.toBe('done');
    const uploaded = d.getUploaded.bind(d);
    vi.spyOn(d, 'getUploaded').mockImplementation(async (id) => {
      const f = await uploaded(id);
      return held === 'other bytes' ? { ...f, sha256: '0'.repeat(64) } : f;
    });
    await expect(tab.vault.removePile(pile.id)).resolves.toBeUndefined();
    expect((await d.get(fileId, { binned: true })).trashed === true).toBe(held === 'the bytes sent');
    expect(await indexedDbUploadStore(idb).list(ACCOUNT_A, root)).toEqual([]);
  });

  it('a thing filed elsewhere after a lost answer is not sent again when its binned pile comes back', async () => {
    const { d, tab, pileId, fileId, projects } = await arrivedAndMoved();
    const pile = (await tab.vault.piles()).find((p) => p.id === pileId);
    expect(pile?.path).toBeTruthy();
    await tab.vault.trash(pile?.path ?? '');
    const opens = d.resumableCalls.filter((c) => c.op === 'open').length;
    await tab.vault.restore(pile?.path ?? '');
    await tab.vault.settled();
    await tab.queue.idle();
    expect(d.resumableCalls.filter((c) => c.op === 'open')).toHaveLength(opens);
    expect(await scans(d)).toEqual([fileId]);
    expect((await d.get(fileId)).parents).toEqual([projects]);
  });
});

describe('a set-aside pile shows its reason in the inbox', () => {
  /** The approved sentences (TL-P2-11 (1)), as the tidy-up's report says them. */
  const SAID = {
    'not-arrived': 'Some of its things have not arrived yet.',
    'not-checked': 'Bower could not check some of its things. Try again.',
    unreadable: 'Bower could not read the list of what is in this pile. Try again.',
    changed: 'Some of its things changed after they were added. Remove it and add them again.',
    declaration: 'Bower found two different lists of what is in this pile. Remove it and add it again.',
    empty: 'Nothing is left in it. Remove it from your inbox.',
  } as const;
  const declaring = (): DriveVault => new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true });
  const pdf = (name: string): { name: string; kind: 'pdf'; origin: string; body: Blob } => ({ name, kind: 'pdf', origin: 'From this computer', body: new Blob([`%PDF ${name}`]) });
  const pileOn = async (v: DriveVault, id: string) => (await v.piles()).find((p) => p.id === id);
  const rows = async (v: DriveVault, id: string): Promise<Array<[string, number | undefined, boolean | undefined]>> =>
    ((await pileOn(v, id))?.items ?? []).map((i) => [i.name, i.upload, i.changed]);

  async function folderOf(pileId: string) {
    const folder = (await drive.listAll(root)).find((f) => f.folder && f.appProperties?.pile === pileId);
    if (!folder) throw new Error('no pile folder');
    return folder;
  }
  async function fileIn(pileId: string, name: string) {
    const folder = await folderOf(pileId);
    const f = (await drive.listAll(folder.id)).find((x) => x.name === name && x.parents[0] === folder.id);
    if (!f) throw new Error(`no ${name}`);
    return f;
  }
  /**
   * What a tidy-up does with the pile now: undefined when it takes it; when it holds it, the reason the Inbox shows
   * for it, since on the B path a run says nothing of a pile it holds (TL-P2-21).
   */
  async function runnerSays(pileId: string): Promise<string | undefined> {
    let taken = false;
    try {
      const out = await tidyUp(drive, root, 'all');
      if (out.phase !== 'done') throw new Error('the tidy-up failed');
      taken = out.manifest.capture.piles.some((p) => p.pileId === pileId);
    } catch (e) {
      // Only held piles waiting: nothing is admitted, the run's own refusal (TL-P2-21).
      if (!(e instanceof BowerError) || e.message !== 'Nothing in the inbox is ready yet.') throw e;
    }
    if (taken) return undefined;
    const why = (await pileOn(declaring(), pileId))?.setAside;
    return why ? SET_ASIDE_TEXT[why] : 'held, with no reason in the Inbox';
  }
  /** `name` does not get through until `heal` is called. */
  function failing(name: string): () => void {
    let fail = true;
    beforeUpload(drive, ({ name: n }) => {
      if (n === name && fail) throw driveError('offline');
    });
    return () => { fail = false; };
  }

  it('a thing that has not arrived: the reason on any device, after a run, until it arrives', async () => {
    const heal = failing('b.pdf');
    const uploader = declaring();
    const pile = await uploader.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf'), pdf('b.pdf')] });
    await uploader.settled();
    expect((await pileOn(uploader, pile.id))?.setAside).toBe('not-arrived');
    expect((await pileOn(declaring(), pile.id))?.setAside).toBe('not-arrived');
    expect(await rows(declaring(), pile.id)).toEqual([['a.pdf', undefined, undefined], ['b.pdf', -1, undefined]]);
    expect(await runnerSays(pile.id)).toBe(SAID['not-arrived']);
    // The reason stays after the run: it comes from Drive, not from the last report.
    expect((await pileOn(declaring(), pile.id))?.setAside).toBe('not-arrived');
    heal();
    await uploader.retryPile(pile.id);
    await uploader.settled();
    expect((await pileOn(declaring(), pile.id))?.setAside).toBeUndefined();
  });

  it('things still on their way from this device give no reason yet', async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => { open = r; });
    beforeUpload(drive, async () => { await gate; });
    const uploader = declaring();
    const pile = await uploader.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf')] });
    const sending = await pileOn(uploader, pile.id);
    expect(sending?.items.map((i) => i.upload)).toEqual([0]);
    expect(sending?.setAside).toBeUndefined();
    open();
    await uploader.settled();
    expect((await pileOn(uploader, pile.id))?.setAside).toBeUndefined();
  });

  it("a changed thing shows as changed, not as Didn't arrive, and the reason stays until the pile is removed", async () => {
    const uploader = declaring();
    const pile = await uploader.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf'), pdf('b.pdf')] });
    await uploader.settled();
    const b = await fileIn(pile.id, 'b.pdf');
    await drive.writeText(b.id, 'Edited somewhere else', b.modifiedTime);
    const other = declaring();
    expect((await pileOn(other, pile.id))?.setAside).toBe('changed');
    expect(await rows(other, pile.id)).toEqual([['a.pdf', undefined, undefined], ['b.pdf', undefined, true]]);
    expect(await runnerSays(pile.id)).toBe(SAID.changed);
    const after = declaring();
    expect((await pileOn(after, pile.id))?.setAside).toBe('changed');
    await after.removePile(pile.id);
    expect(await pileOn(declaring(), pile.id)).toBeUndefined();
  });

  it('a changed thing that left the pile is not listed again, and the pile still says why', async () => {
    const uploader = declaring();
    const pile = await uploader.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf'), pdf('b.pdf')] });
    await uploader.settled();
    const b = await fileIn(pile.id, 'b.pdf');
    const areas = await idOf('Areas');
    const moved = await drive.update(b.id, { addParent: areas, removeParent: b.parents[0] ?? '' });
    await drive.writeText(b.id, 'Edited somewhere else', moved.modifiedTime);
    const other = declaring();
    expect((await pileOn(other, pile.id))?.setAside).toBe('changed');
    // As the readiness entry pins it (fake-runner.test.ts): a changed thing that left is never asked for again.
    expect(await rows(other, pile.id)).toEqual([['a.pdf', undefined, undefined]]);
    expect(await runnerSays(pile.id)).toBe(SAID.changed);
  });

  it('two different lists of the pile: Remove it and add it again', async () => {
    const uploader = declaring();
    const pile = await uploader.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf')] });
    await uploader.settled();
    const [declared] = (await drive.listAll(root)).filter((f) => !f.folder && drive.pathOf(f.id, root).startsWith('.bower/piles/'));
    const parsed = await parsePileDeclaration(await drive.readBytes(declared?.id ?? ''), root);
    if (!parsed.ok) throw new Error('declaration refused');
    const other = { ...parsed.value, createdAt: parsed.value.createdAt + 1 };
    const bytes = canonicalRecordJson(other);
    const hash = await hashRecordJson(other);
    if (!bytes.ok || !hash.ok) throw new Error('no canonical copy');
    await drive.createText(declared?.parents[0] ?? '', `declaration-${other.declarationId}-${hash.value}.json`, new TextDecoder().decode(bytes.value));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await pileOn(declaring(), pile.id))?.setAside).toBe('declaration');
    expect(await runnerSays(pile.id)).toBe(SAID.declaration);
  });

  it('bytes it cannot check: Try again later; a list gone to the Bin leaves an ordinary pile', async () => {
    const uploader = declaring();
    const pile = await uploader.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf')] });
    await uploader.settled();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await pdfsUnlisted();
    const digest = vi.spyOn(drive, 'storedDigest').mockRejectedValue(driveError('offline'));
    expect((await pileOn(declaring(), pile.id))?.setAside).toBe('not-checked');
    expect(await runnerSays(pile.id)).toBe(SAID['not-checked']);
    digest.mockRestore();
    expect((await pileOn(declaring(), pile.id))?.setAside).toBeUndefined();
    const [declared] = (await drive.listAll(root)).filter((f) => !f.folder && drive.pathOf(f.id, root).startsWith('.bower/piles/'));
    await drive.trash(declared?.id ?? '');
    // TL-P2-31 amendment: with every copy of its list gone, it is an ordinary pile in the inbox and the run alike.
    expect((await pileOn(declaring(), pile.id))?.setAside).toBeUndefined();
    expect(await runnerSays(pile.id)).toBeUndefined();
  });

  it('Try again checks a pile Bower could not check again, now', async () => {
    const uploader = declaring();
    const pile = await uploader.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf')] });
    await uploader.settled();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await pdfsUnlisted();
    const digest = vi.spyOn(drive, 'storedDigest').mockRejectedValue(driveError('offline'));
    const other = declaring();
    expect((await pileOn(other, pile.id))?.setAside).toBe('not-checked');
    digest.mockRestore();
    const heard = vi.fn();
    other.subscribe(heard);
    await other.retryPile(pile.id);
    // The screen hears of it at once, and the next listing has checked again.
    expect(heard).toHaveBeenCalled();
    expect((await pileOn(other, pile.id))?.setAside).toBeUndefined();
  });

  /** A declared pile with words, whose things all left it and whose context write never landed. */
  async function noteToWriteAgain(text: string) {
    const uploader = declaring();
    const pile = await uploader.addPile({ text, items: [pdf(`${text}.pdf`)] });
    await uploader.settled();
    const thing = await fileIn(pile.id, `${text}.pdf`);
    await drive.update(thing.id, { addParent: await idOf('Areas'), removeParent: thing.parents[0] ?? '' });
    await contextNeverCreated([(await fileIn(pile.id, 'Pile note.md')).id]);
    return pile;
  }

  // TL-P2-32: a note to write again has not arrived; the tidy-up holds the pile until Try again writes it.
  it('pile-binned-context-hold: a Drive-binned note leaves ready things filed with no silent hold', async () => {
    const uploader = declaring();
    const pile = await uploader.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf'), pdf('b.pdf')] });
    await uploader.settled();
    const note = await fileIn(pile.id, 'Pile note.md');
    await drive.trash(note.id);
    const other = declaring();
    expect(await other.changes()).toEqual([]);
    const seen = await pileOn(other, pile.id);
    expect(seen?.items.map((i) => [i.name, i.upload])).toEqual([['a.pdf', undefined], ['b.pdf', undefined]]);
    expect(seen?.setAside).toBeUndefined();
    const folder = await folderOf(pile.id);
    const out = await tidyUp(drive, root, 'all');
    if (out.phase !== 'done') throw new Error('the tidy-up failed');
    expect.soft(out.manifest.capture.piles.map((p) => p.pileId)).toContain(pile.id);
    expect.soft(out.report.filed.map((f) => f.name)).toEqual(expect.arrayContaining(['a.pdf', 'b.pdf']));
    expect.soft((await drive.listAll(root)).filter((f) => f.parents.includes(folder.id) && ['a.pdf', 'b.pdf'].includes(f.name))).toEqual([]);
  });

  it('pile-binned-context-hold: journal trash still removes context for the app and the run', async () => {
    const uploader = declaring();
    const pile = await uploader.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf'), pdf('b.pdf')] });
    await uploader.settled();
    if (!pile.path) throw new Error('no pile path');
    // A stored journal line is the control; the app's Inbox trash command removes the whole pile.
    const note = await fileIn(pile.id, 'Pile note.md');
    await drive.trash(note.id);
    const listing = await drive.listAll(root);
    const bower = listing.find((f) => f.folder && f.parents.includes(root) && f.name === '.bower') ?? await drive.createFolder(root, '.bower');
    const changes = listing.find((f) => f.folder && f.parents.includes(bower.id) && f.name === 'changes') ?? await drive.createFolder(bower.id, 'changes');
    await drive.createText(changes.id, 'context-trash.json', JSON.stringify({ v: 1, id: 'context-trash', device: 'DEVICE', at: Date.now(), kind: 'trash', what: 'Put the pile note in the Bin', path: `${pile.path}/Pile note.md`, fileId: note.id }));
    const other = declaring();
    expect((await other.changes()).filter((c) => c.kind === 'trash')).toHaveLength(1);
    expect((await pileOn(other, pile.id))?.setAside).toBeUndefined();
    const out = await tidyUp(drive, root, 'all');
    if (out.phase !== 'done') throw new Error('the tidy-up failed');
    expect(out.manifest.capture.piles.map((p) => p.pileId)).toContain(pile.id);
    expect(out.report.filed.map((f) => f.name)).toEqual(expect.arrayContaining(['a.pdf', 'b.pdf']));
  });

  it.each(['ready things', 'one missing thing', 'things filed elsewhere', 'context only'] as const)(
    'pile-binned-context-hold: a never-landed context stays not-arrived with %s', async (shape) => {
      if (shape === 'one missing thing') failing('b.pdf');
      const uploader = declaring();
      const pile = await uploader.addPile({ text: 'Papers from Alex', items: shape === 'context only' ? [] : [pdf('a.pdf'), pdf('b.pdf')] });
      await uploader.settled();
      if (shape === 'things filed elsewhere') {
        for (const name of ['a.pdf', 'b.pdf']) {
          const thing = await fileIn(pile.id, name);
          await drive.update(thing.id, { addParent: await idOf('Areas'), removeParent: thing.parents[0] ?? '' });
        }
      }
      const note = await fileIn(pile.id, 'Pile note.md');
      const contextKey = note.appProperties?.bowerItem;
      if (!contextKey) throw new Error('no context key');
      await contextNeverCreated([note.id]);
      expect(await drive.binnedByItem(root, [contextKey])).toEqual([]);
      expect((await pileOn(declaring(), pile.id))?.setAside).toBe('not-arrived');
      expect(await runnerSays(pile.id)).toBe(SAID['not-arrived']);
    },
  );

  it('pile-binned-context-hold: missing context and member share one Bin listing and cached app readiness', async () => {
    const uploader = declaring();
    const pile = await uploader.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf'), pdf('b.pdf')] });
    await uploader.settled();
    const note = await fileIn(pile.id, 'Pile note.md');
    const member = await fileIn(pile.id, 'b.pdf');
    await drive.update(member.id, { addParent: await idOf('Areas'), removeParent: member.parents[0] ?? '' });
    await drive.trash(member.id);
    await drive.trash(note.id);
    const other = declaring();
    const lists = vi.spyOn(drive, 'listAll');
    const bins = vi.spyOn(drive, 'binnedByItem');
    expect((await pileOn(other, pile.id))?.setAside).toBeUndefined();
    expect((await pileOn(other, pile.id))?.setAside).toBeUndefined();
    expect(lists).toHaveBeenCalledTimes(1);
    expect(bins).toHaveBeenCalledTimes(1);
    expect(bins.mock.calls[0]?.[1].slice().sort()).toEqual([note.appProperties?.bowerItem, member.appProperties?.bowerItem].sort());
  });

  it('a note to write again is not an empty pile, for the inbox and the tidy-up alike', async () => {
    const pile = await noteToWriteAgain('Papers from Alex');
    const seen = await pileOn(declaring(), pile.id);
    expect(seen?.items).toEqual([]);
    expect(seen?.setAside).toBe('not-arrived');
    expect(await runnerSays(pile.id)).toBe(SAID['not-arrived']);
  });

  it('your changes are read once per listing, and one that cannot be read affects only its pile', async () => {
    const first = await noteToWriteAgain('Papers from Alex');
    const second = await noteToWriteAgain('Letters from Alex');
    await declaring().create('Areas', 'note', 'Shopping');
    const changes = new Set((await drive.listAll(root)).filter((f) => !f.folder && drive.pathOf(f.id, root).startsWith('.bower/changes/')).map((f) => f.id));
    expect(changes.size).toBeGreaterThan(0);
    const real = drive.readText.bind(drive);
    const readText = vi.spyOn(drive, 'readText');
    const reads = (): number => readText.mock.calls.filter(([id]) => changes.has(id)).length;
    const listed = await declaring().piles();
    expect([first.id, second.id].map((id) => listed.find((p) => p.id === id)?.setAside)).toEqual(['not-arrived', 'not-arrived']);
    expect(reads()).toBe(changes.size);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    readText.mockImplementation(async (id) => {
      if (changes.has(id)) throw driveError('offline');
      return real(id);
    });
    const broken = await declaring().piles();
    expect(broken.find((p) => p.id === first.id)?.setAside).toBe('not-checked');
    expect(broken.find((p) => p.id === second.id)?.setAside).toBe('not-checked');
    expect(broken.length).toBe(listed.length);
  });

  it('nothing left in it: Remove it from your inbox', async () => {
    const uploader = declaring();
    const pile = await uploader.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf')] });
    await uploader.settled();
    await uploader.updatePile(pile.id, '');
    const a = await fileIn(pile.id, 'a.pdf');
    await drive.update(a.id, { addParent: await idOf('Areas'), removeParent: a.parents[0] ?? '' });
    const other = declaring();
    const seen = await pileOn(other, pile.id);
    expect(seen?.setAside).toBe('empty');
    expect(seen?.items).toEqual([]);
    expect(await runnerSays(pile.id)).toBe(SAID.empty);
  });

  // declaration-read-isolation (TL-P2-08 (a)): one list that cannot be read, or is damaged, is a bulkhead of its own pile.
  it('an unreadable declaration affects only its own pile', async () => {
    const uploader = declaring();
    const healthy = await uploader.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf')] });
    const unreadable = await uploader.addPile({ text: 'Letters from Alex', items: [pdf('b.pdf')] });
    const damaged = await uploader.addPile({ text: 'Receipts from Alex', items: [pdf('c.pdf')] });
    await uploader.settled();
    const declarationOf = async (pileId: string) => {
      const id = (await folderOf(pileId)).appProperties?.bowerDeclaration;
      const f = (await drive.listAll(root)).find((x) => !x.folder && drive.pathOf(x.id, root).startsWith('.bower/piles/') && x.name.startsWith(`declaration-${id}-`));
      if (!id || !f) throw new Error('no declaration');
      return f;
    };
    const failure = driveError('offline');
    const unreadableId = (await declarationOf(unreadable.id)).id;
    const damagedFile = await declarationOf(damaged.id);
    await drive.writeText(damagedFile.id, '{"v":1,', damagedFile.modifiedTime);
    const real = drive.readBytes.bind(drive);
    vi.spyOn(drive, 'readBytes').mockImplementation(async (id) => {
      if (id === unreadableId) throw failure;
      return real(id);
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const other = declaring();
    const listing = other.piles();
    // The Inbox lists every pile: one list that cannot be read never fails the whole listing.
    await expect(listing).resolves.toBeInstanceOf(Array);
    const listed = await listing;
    expect([healthy.id, unreadable.id, damaged.id].map((id) => listed.find((p) => p.id === id)?.setAside)).toEqual([undefined, 'unreadable', 'unreadable']);
    // Never treated as undeclared: their things are listed as they are, with the reason and Try again.
    expect(listed.find((p) => p.id === unreadable.id)?.items.map((i) => [i.name, i.upload])).toEqual([['b.pdf', undefined]]);
    expect(listed.find((p) => p.id === damaged.id)?.items.map((i) => [i.name, i.upload])).toEqual([['c.pdf', undefined]]);
    // Listed again, and checked again on Try again: each failure is logged once, not on every listing.
    await other.refresh();
    await other.piles();
    await other.retryPile(unreadable.id);
    expect((await pileOn(other, unreadable.id))?.setAside).toBe('unreadable');
    expect(errors.mock.calls.filter(([e]) => e === failure)).toHaveLength(1);
    expect(errors.mock.calls.filter(([e]) => e instanceof BowerError && e !== failure && /declaration/.test(e.message))).toHaveLength(1);
    // A tidy-up takes the healthy pile, and leaves the two others and their things exactly as they were.
    const names = await Promise.all([unreadable.id, damaged.id].map(async (id) => (await folderOf(id)).name));
    const folders = await Promise.all([unreadable.id, damaged.id].map(folderOf));
    const theirs = new Set(folders.map((f) => f.id));
    for (const f of folders) for (const k of await drive.listAll(f.id)) theirs.add(k.id);
    type Snap = { files: Array<{ meta: { id: string }; trashed: boolean }> };
    const before = (JSON.parse(await drive.snapshot()) as Snap).files.filter((f) => theirs.has(f.meta.id));
    const out = await tidyUp(drive, root, 'all');
    expect(out.phase).toBe('done');
    if (out.phase !== 'done') return;
    expect(out.report.filed.map((f) => f.name)).toContain('a.pdf');
    expect(out.report.filed.map((f) => f.name)).not.toEqual(expect.arrayContaining(['b.pdf']));
    expect(out.report.filed.map((f) => f.name)).not.toEqual(expect.arrayContaining(['c.pdf']));
    expect(names).toHaveLength(2);
    for (const id of [unreadable.id, damaged.id]) expect(out.manifest.capture.piles.map((p) => p.pileId)).not.toContain(id);
    expect((JSON.parse(await drive.snapshot()) as Snap).files.filter((f) => theirs.has(f.meta.id))).toEqual(before);
  });

  // declared-pile-folder-lost, retired by TL-P2-30: a folder gone outside Bower takes its pile out of view, inertly.
  async function vanished(how: 'moved out of the inbox' | 'deleted for good'): Promise<void> {
    localStorage.clear();
    // A fresh Bower folder whose inbox a tidy-up can take on the B path.
    drive = new FakeDrive();
    const runs = new FakeRunService({ drive, clock: () => Date.now(), scale: 'instant' });
    root = (await new FakeWorker({ drive, scenario: 'first', rootId: null, runs }).createFolder()).id;
    const uploader = declaring();
    const ready = await uploader.addPile({ text: 'Papers about the lease', items: [pdf('lease.pdf')] });
    const pile = await uploader.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf')] });
    await uploader.settled();
    const folder = await folderOf(pile.id);
    const inside = (await drive.listAll(folder.id)).map((f) => f.id);
    const declarationsNow = async () => {
      const files = (await drive.listAll(root)).filter((f) => !f.folder && drive.pathOf(f.id, root).startsWith('.bower/piles/') && f.name.startsWith(`declaration-${folder.appProperties?.bowerDeclaration ?? ''}-`));
      return Promise.all(files.map(async (f) => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime, bytes: [...(await drive.readBytes(f.id))] })));
    };
    const declared = await declarationsNow();
    expect(declared).toHaveLength(1);
    const parsed = await parsePileDeclaration(new Uint8Array(declared[0]?.bytes ?? []), root);
    if (!parsed.ok) throw new Error('declaration refused');
    const memberKeys = parsed.value.members.map((m) => m.memberKey);

    if (how === 'moved out of the inbox') await drive.update(folder.id, { addParent: (await drive.createFolder(root, 'Elsewhere')).id, removeParent: folder.parents[0] ?? '' });
    else {
      // Gone from Drive and from its Bin: only a copy of Drive without it can say so.
      const gone = new Set([folder.id, ...inside]);
      const kept = JSON.parse(await drive.snapshot()) as { files: Array<{ meta: { id: string } }> };
      drive = FakeDrive.restore(JSON.stringify({ ...kept, files: kept.files.filter((f) => !gone.has(f.meta.id)) }));
    }
    type Snap = { files: Array<{ meta: { id: string }; trashed: boolean }> };
    const theirs = async (): Promise<Snap['files']> => (JSON.parse(await drive.snapshot()) as Snap).files.filter((f) => f.meta.id === folder.id || inside.includes(f.meta.id));
    const before = await theirs();

    // The Inbox does not show it; the other pile is listed as before.
    const listed = await declaring().piles();
    expect(listed.map((p) => p.id)).toContain(ready.id);
    expect(listed.find((p) => p.id === pile.id)).toBeUndefined();
    // A tidy-up's plan does not capture it, nor any of its things; it takes the other pile as usual.
    const planned = await planRun(drive, root, { scope: 'all', allowWeb: false, runId: 'run-plan', requestId: 'request-plan', requestedAt: Date.now() });
    expect(planned.manifest.capture.piles.map((p) => p.pileId)).toEqual([ready.id]);
    expect(planned.manifest.capture.piles.flatMap((p) => p.memberKeys).filter((k) => k !== null && memberKeys.includes(k))).toEqual([]);
    expect(planned.manifest.capture.members.map((m) => m.file.fileId).filter((id) => id === folder.id || inside.includes(id))).toEqual([]);
    // A whole tidy-up files nothing of it, retires nothing, and brings nothing back.
    const out = await tidyUp(drive, root, 'all');
    if (out.phase !== 'done') throw new Error('the tidy-up failed');
    expect(out.report.filed.map((f) => f.name)).toContain('lease.pdf');
    expect(out.report.filed.map((f) => f.name)).not.toContain('a.pdf');
    expect(out.report.setAside.map((s) => s.name)).not.toContain(folder.name);
    expect(await theirs()).toEqual(before);
    const dispositions = (await drive.listAll(root)).filter((f) => !f.folder && f.name.startsWith('disposition-'));
    for (const d of dispositions) expect(await drive.readText(d.id)).not.toContain(pile.id);
    expect((await drive.listAll(root)).filter((f) => f.appProperties?.pile === pile.id && drive.pathOf(f.id, root).startsWith('Inbox/'))).toEqual([]);
    expect((await declaring().piles()).find((p) => p.id === pile.id)).toBeUndefined();
    // Its declaration stays where it was, untouched: inert history.
    expect(await declarationsNow()).toEqual(declared);
  }

  it('a declared pile whose folder vanished is not silently retired', async () => {
    await vanished('moved out of the inbox');
    await vanished('deleted for good');
  });

  // pile-note-read-isolation (TL-P2-08 (a) applied to pile notes): a note Drive cannot read now holds only its own pile.
  it('an unreadable pile note affects only its own pile', async () => {
    const lease = await vault.addPile({ text: 'Papers about the lease', items: [pdf('lease.pdf')] });
    const ideas = await vault.addPile({ text: 'Ideas from Alex', items: [pdf('idea.pdf')] });
    await vault.settled();
    const noteOf = async (pileId: string) => {
      const f = (await drive.listAll(pileId)).find((x) => x.name === 'Pile note.md' && x.parents[0] === pileId);
      if (!f) throw new Error('no pile note');
      return f;
    };
    const leaseNote = await noteOf(lease.id);
    const notes = new Set((await drive.listAll(root)).filter((f) => f.name === 'Pile note.md').map((f) => f.id));
    expect(notes.size).toBeGreaterThan(1);
    const real = drive.readText.bind(drive);
    let failing = new Set([leaseNote.id]);
    let failure = driveError('offline');
    const readText = vi.spyOn(drive, 'readText').mockImplementation(async (id) => {
      if (failing.has(id)) throw failure;
      return real(id);
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logged = (): number => errors.mock.calls.filter(([e]) => e === failure).length;
    const reader = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });

    // Only that pile waits, with the existing reason and Try again; every other pile is listed as it is.
    const listing = reader.piles();
    await expect(listing).resolves.toBeInstanceOf(Array);
    const listed = await listing;
    const held = listed.find((p) => p.id === lease.id);
    expect(held).toMatchObject({ setAside: 'not-checked', text: '' });
    expect(held?.items.map((i) => i.name)).toEqual(['lease.pdf']);
    expect(listed.find((p) => p.id === ideas.id)).toMatchObject({ text: 'Ideas from Alex' });
    expect(listed.find((p) => p.id === ideas.id)?.setAside).toBeUndefined();
    // One BowerError per pile and listing.
    expect(logged()).toBe(1);
    // Words it could not read are never saved over.
    expect(held?.noteLocked).toBe(true);
    await expect(reader.updatePile(lease.id, 'New words')).rejects.toMatchObject({ name: 'BowerError', message: "Bower could not read this pile's note. Try again." });
    expect(await real(leaseNote.id)).toBe('Papers about the lease');

    // A tidy-up holds that pile and takes the rest.
    const out = await tidyUp(drive, root, 'all');
    if (out.phase !== 'done') throw new Error('the tidy-up failed');
    expect(out.report.filed.map((f) => f.name)).toContain('idea.pdf');
    expect(out.report.filed.map((f) => f.name)).not.toContain('lease.pdf');
    expect(out.manifest.capture.piles.map((p) => p.pileId)).not.toContain(lease.id);
    expect((await drive.listAll(lease.id)).map((f) => f.name).sort()).toEqual(['Pile note.md', 'lease.pdf']);

    // A failed read is never kept: once Drive answers, the pile is itself again.
    failing = new Set();
    expect((await reader.piles()).find((p) => p.id === lease.id)).toMatchObject({ text: 'Papers about the lease' });
    expect((await reader.piles()).find((p) => p.id === lease.id)?.setAside).toBeUndefined();

    // The whole app offline: every pile with a note waits, each logged once per listing.
    const third = await vault.addPile({ text: 'Receipts from Alex', items: [pdf('receipt.pdf')] });
    await vault.settled();
    failing = new Set((await drive.listAll(root)).filter((f) => f.name === 'Pile note.md').map((f) => f.id));
    failure = driveError('offline');
    // A fresh page: no note was read here before (a note read once is kept while it is unchanged).
    const fresh = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
    const offline = await fresh.piles();
    expect([lease.id, third.id].map((id) => offline.find((p) => p.id === id)?.setAside)).toEqual(['not-checked', 'not-checked']);
    const waiting = offline.filter((p) => p.setAside === 'not-checked').length;
    expect(logged()).toBe(waiting);
    await fresh.piles();
    expect(logged()).toBe(waiting * 2);

    // Signed out still stops everything.
    failure = driveError('auth');
    await expect(fresh.piles()).rejects.toBe(failure);
    readText.mockRestore();
  });

  // note-read-review-1 (Important): words typed over a note Bower never read would replace it once Drive answers.
  it('a pile note Bower could not read is never written over, even after Drive answers', async () => {
    const lease = await vault.addPile({ text: 'Papers about the lease', items: [pdf('lease.pdf')] });
    await vault.settled();
    const note = (await drive.listAll(lease.id)).find((f) => f.name === 'Pile note.md');
    if (!note) throw new Error('no pile note');
    const real = drive.readText.bind(drive);
    let failing = true;
    vi.spyOn(drive, 'readText').mockImplementation(async (id) => {
      if (failing && id === note.id) throw driveError('offline');
      return real(id);
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reader = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
    expect((await reader.piles()).find((p) => p.id === lease.id)).toMatchObject({ text: '', setAside: 'not-checked', noteLocked: true });
    // Drive answers again, but the person only ever saw no words: the edit is refused, the note kept.
    failing = false;
    await expect(reader.updatePile(lease.id, 'Fresh words')).rejects.toMatchObject({ name: 'BowerError', message: "Bower could not read this pile's note. Try again." });
    expect(await real(note.id)).toBe('Papers about the lease');
    // Try again reads it: the real words show, and the note can be edited again.
    await reader.retryPile(lease.id);
    const healed = (await reader.piles()).find((p) => p.id === lease.id);
    expect(healed).toMatchObject({ text: 'Papers about the lease' });
    expect(healed?.noteLocked).toBeUndefined();
    await reader.updatePile(lease.id, 'Papers about the new lease');
    expect(await real(note.id)).toBe('Papers about the new lease');
  });

  // note-read-review-1, Minor 3: the whole app offline logs one error per pile and listing, a declared pile too.
  it('offline, a declared pile logs one error per listing', async () => {
    localStorage.clear();
    drive = new FakeDrive();
    const runs = new FakeRunService({ drive, clock: () => Date.now(), scale: 'instant' });
    root = (await new FakeWorker({ drive, scenario: 'first', rootId: null, runs }).createFolder()).id;
    const pile = await declaring().addPile({ text: 'Papers from Alex', items: [pdf('a.pdf')] });
    await declaring().settled();
    const offline = driveError('offline');
    vi.spyOn(drive, 'readText').mockRejectedValue(offline);
    vi.spyOn(drive, 'readBytes').mockRejectedValue(offline);
    await pdfsUnlisted();
    vi.spyOn(drive, 'storedDigest').mockRejectedValue(offline);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reader = declaring();
    const listed = await reader.piles();
    expect(listed.map((p) => [p.id, p.setAside, p.noteLocked])).toEqual([[pile.id, 'not-checked', true]]);
    expect(errors.mock.calls).toHaveLength(1);
    await reader.piles();
    expect(errors.mock.calls).toHaveLength(2);
  });

  // note-read-review-1, Minor 2: the guards that keep a sign-out, or a session that changed, stopping the listing.
  it('a note read that fails as the session changes stops the listing', async () => {
    localStorage.clear();
    drive = new FakeDrive();
    const runs = new FakeRunService({ drive, clock: () => Date.now(), scale: 'instant' });
    root = (await new FakeWorker({ drive, scenario: 'first', rootId: null, runs }).createFolder()).id;
    const uploader = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
    await uploader.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf')] });
    await uploader.settled();
    let alive = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const real = drive.readText.bind(drive);
    vi.spyOn(drive, 'readText').mockImplementation(async (id) => {
      if ((await drive.get(id)).name === 'Pile note.md') {
        alive = false;
        throw driveError('offline');
      }
      return real(id);
    });
    const fresh = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() }, () => alive);
    await expect(fresh.piles()).rejects.toMatchObject({ name: 'BowerError' });
  });

  it('a sign-out on a bound pile note that is not listed first stops the listing', async () => {
    localStorage.clear();
    drive = new FakeDrive();
    const runs = new FakeRunService({ drive, clock: () => Date.now(), scale: 'instant' });
    root = (await new FakeWorker({ drive, scenario: 'first', rootId: null, runs }).createFolder()).id;
    const uploader = declaring();
    const pile = await uploader.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf')] });
    await uploader.settled();
    const folder = await folderOf(pile.id);
    const keyed = (await drive.listAll(folder.id)).find((f) => f.name === 'Pile note.md');
    if (!keyed) throw new Error('no pile note');
    await drive.createText(folder.id, 'Pile note.md', 'Soup recipes to try');
    const bound = await drive.createText(folder.id, 'Pile note.md', 'Papers from Alex', { ...keyed.appProperties });
    await drive.trash(keyed.id);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const real = drive.readText.bind(drive);
    const signedOut = driveError('auth');
    vi.spyOn(drive, 'readText').mockImplementation(async (id) => {
      if (id === bound.id) throw signedOut;
      return real(id);
    });
    await expect(declaring().piles()).rejects.toBe(signedOut);
  });

  // pile-note-format-visible (TL-P2-08 + TL-P2-11): a note Bower refuses to parse no longer hides its pile.
  it('a pile whose note Bower cannot parse stays visible', async () => {
    localStorage.clear();
    drive = new FakeDrive();
    const runs = new FakeRunService({ drive, clock: () => Date.now(), scale: 'instant' });
    root = (await new FakeWorker({ drive, scenario: 'first', rootId: null, runs }).createFolder()).id;
    const uploader = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
    const healthy = await uploader.addPile({ text: 'Papers about the lease', items: [pdf('lease.pdf')] });
    const newer = await uploader.addPile({ text: 'Receipts from Alex', items: [pdf('receipt.pdf')] });
    const damaged = await uploader.addPile({ text: 'Letters from Alex', items: [pdf('letter.pdf')] });
    await uploader.settled();
    const NOTES = { [newer.id]: '---\nbower_format: ownership/9\n---\nReceipts from Alex\n', [damaged.id]: '---\nbower_format: ownership/2\n---\nLetters from Alex\n' };
    for (const [id, text] of Object.entries(NOTES)) {
      const note = (await drive.listAll(id)).find((f) => f.name === 'Pile note.md');
      if (!note) throw new Error('no pile note');
      await drive.writeText(note.id, text, note.modifiedTime);
    }
    const kept = async () => Promise.all([newer.id, damaged.id].map(async (id) => Promise.all((await drive.listAll(id)).map(async (f) => [f.name, f.modifiedTime, await drive.readText(f.id)]))));
    const before = await kept();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reader = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
    const listed = await reader.piles();
    expect([healthy.id, newer.id, damaged.id].map((id) => listed.find((p) => p.id === id)?.setAside)).toEqual([undefined, 'note-format', 'note-damaged']);
    expect(listed.find((p) => p.id === newer.id)).toMatchObject({ noteLocked: true, items: [expect.objectContaining({ name: 'receipt.pdf' })] });
    expect(listed.find((p) => p.id === damaged.id)).toMatchObject({ noteLocked: true, items: [expect.objectContaining({ name: 'letter.pdf' })] });
    expect(listed.find((p) => p.id === healthy.id)).toMatchObject({ text: 'Papers about the lease' });
    // Nothing writes over it: retrying does not change a format, so the reason itself is the refusal.
    await expect(reader.updatePile(newer.id, 'Fresh words')).rejects.toMatchObject({ message: "This pile's note needs a newer Bower." });
    await expect(reader.updatePile(damaged.id, 'Fresh words')).rejects.toMatchObject({ message: "Bower can't read this pile's note." });
    // The tidy-up plans the rest and holds both.
    const planned = await planRun(drive, root, { scope: 'all', allowWeb: false, runId: 'run-plan', requestId: 'request-plan', requestedAt: Date.now() });
    expect(planned.manifest.capture.piles.map((p) => p.pileId)).toEqual([healthy.id]);
    const out = await tidyUp(drive, root, 'all');
    if (out.phase !== 'done') throw new Error('the tidy-up failed');
    expect(out.report.filed.map((f) => f.name)).toEqual(['lease.pdf']);
    expect(await kept()).toEqual(before);
  });

  // note-read-review-1, Minor 2: a vault that never listed still refuses to write over a note it cannot read.
  it('a vault that never listed refuses to write over a pile note Bower cannot parse', async () => {
    const pile = await vault.addPile({ text: 'Receipts from Alex', items: [pdf('receipt.pdf')] });
    await vault.settled();
    const note = (await drive.listAll(pile.id)).find((f) => f.name === 'Pile note.md');
    if (!note) throw new Error('no pile note');
    const text = '---\nbower_format: ownership/9\n---\nReceipts from Alex\n';
    await drive.writeText(note.id, text, note.modifiedTime);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const never = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
    await expect(never.updatePile(pile.id, 'Fresh words')).rejects.toMatchObject({ message: "This pile's note needs a newer Bower." });
    expect(await drive.readText(note.id)).toBe(text);
  });

  // note-read-review-1, Minor 3: a declared pile whose note cannot be read never shows its keyed pile note as a thing.
  it('a declared pile whose first note cannot be read does not list its keyed pile note as a thing', async () => {
    const uploader = declaring();
    const pile = await uploader.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf')] });
    await uploader.settled();
    const folder = await folderOf(pile.id);
    const keyed = (await drive.listAll(folder.id)).find((f) => f.name === 'Pile note.md');
    if (!keyed) throw new Error('no pile note');
    const first = await drive.createText(folder.id, 'Pile note.md', 'Soup recipes to try');
    await drive.createText(folder.id, 'Pile note.md', 'Papers from Alex', { ...keyed.appProperties });
    await drive.trash(keyed.id);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const real = drive.readText.bind(drive);
    vi.spyOn(drive, 'readText').mockImplementation(async (id) => {
      if (id === first.id) throw driveError('offline');
      return real(id);
    });
    const seen = (await declaring().piles()).find((p) => p.id === pile.id);
    expect(seen).toMatchObject({ setAside: 'not-checked', noteLocked: true });
    expect(seen?.items.map((i) => i.name)).toEqual(['a.pdf']);
  });

  // note-read-review-1, Minor 6 (TL-P2-08): a note Bower refuses is logged once per pile until it changes.
  it('a pile note Bower cannot parse is logged once until it changes', async () => {
    const pile = await vault.addPile({ text: 'Receipts from Alex', items: [pdf('receipt.pdf')] });
    await vault.settled();
    const note = (await drive.listAll(pile.id)).find((f) => f.name === 'Pile note.md');
    if (!note) throw new Error('no pile note');
    const written = await drive.writeText(note.id, '---\nbower_format: ownership/9\n---\nReceipts from Alex\n', note.modifiedTime);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reader = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
    for (let i = 0; i < 3; i++) expect((await reader.piles()).find((p) => p.id === pile.id)?.setAside).toBe('note-format');
    expect(errors.mock.calls).toHaveLength(1);
    expect(errors.mock.calls[0]?.[0]).toMatchObject({ name: 'BowerError', cause: { refusal: 'newer' } });
    // Changed, and still refused: logged once more.
    await drive.writeText(note.id, '---\nbower_format: ownership/2\n---\nReceipts from Alex\n', written.modifiedTime);
    await reader.refresh();
    for (let i = 0; i < 3; i++) expect((await reader.piles()).find((p) => p.id === pile.id)?.setAside).toBe('note-damaged');
    expect(errors.mock.calls).toHaveLength(2);
  });

  // note-read-review-1, Minor 5: the Inbox gives the refusal first, and the tidy-up holds the pile (TL-P2-21: the B
  // report says nothing of a pile it holds).
  it('a damaged pile note with text no record can carry says the same in the Inbox and the run', async () => {
    const pile = await vault.addPile({ text: 'Receipts from Alex', items: [pdf('receipt.pdf')] });
    await vault.settled();
    const note = (await drive.listAll(pile.id)).find((f) => f.name === 'Pile note.md');
    if (!note) throw new Error('no pile note');
    await drive.writeText(note.id, '---\nbower_format: ownership/2\n---\nReceipts \ud800 from Alex\n', note.modifiedTime);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reader = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
    expect((await reader.piles()).find((p) => p.id === pile.id)?.setAside).toBe('note-damaged');
    const out = await tidyUp(drive, root, 'all');
    if (out.phase !== 'done') throw new Error('the tidy-up failed');
    expect(out.manifest.capture.piles.map((p) => p.pileId)).not.toContain(pile.id);
    expect((await reader.piles()).find((p) => p.id === pile.id)?.setAside).toBe('note-damaged');
  });

  // TL-P2-36 (9): a plain pile note with text no record can carry is a damaged note, in the Inbox and the run alike.
  it.each([
    ['in its words', 'Receipts \ud800 from Alex\n'],
    ['in its front matter', '---\nsummary: Receipts \ud800\n---\nReceipts from Alex\n'],
  ])('a plain pile note with a lone surrogate %s is a damaged note, with Remove and no Try again', async (_where, text) => {
    const pile = await vault.addPile({ text: 'Receipts from Alex', items: [pdf('receipt.pdf')] });
    await vault.settled();
    const note = (await drive.listAll(pile.id)).find((f) => f.name === 'Pile note.md');
    if (!note) throw new Error('no pile note');
    await drive.writeText(note.id, text, note.modifiedTime);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reader = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
    expect((await reader.piles()).find((p) => p.id === pile.id)).toMatchObject({ setAside: 'note-damaged', noteLocked: true });
    await expect(reader.updatePile(pile.id, 'Fresh words')).rejects.toMatchObject({ message: "Bower can't read this pile's note." });
    expect(await drive.readText(note.id)).toBe(text);
    const out = await tidyUp(drive, root, 'all');
    if (out.phase !== 'done') throw new Error('the tidy-up failed');
    expect(out.manifest.capture.piles.map((p) => p.pileId)).not.toContain(pile.id);
    expect((await reader.piles()).find((p) => p.id === pile.id)?.setAside).toBe('note-damaged');
  });

  // Final delta review (Important): a draft is saved only over the words it started from (RFC 9110 §13.1.1).
  it('a note saved from a draft whose words changed elsewhere is refused, and the note kept', async () => {
    const pile = await vault.addPile({ text: 'Papers about the lease', items: [pdf('lease.pdf')] });
    await vault.settled();
    const note = (await drive.listAll(pile.id)).find((f) => f.name === 'Pile note.md');
    if (!note) throw new Error('no pile note');
    await drive.writeText(note.id, 'Changed elsewhere', note.modifiedTime);
    await vault.refresh();
    expect((await vault.piles()).find((p) => p.id === pile.id)?.text).toBe('Changed elsewhere');
    await expect(vault.updatePile(pile.id, 'My unsaved draft', 'Papers about the lease')).rejects.toMatchObject({ code: 'conflict', message: 'This changed somewhere else. Look again and try once more.' });
    expect(await drive.readText(note.id)).toBe('Changed elsewhere');
    await vault.updatePile(pile.id, 'My draft', 'Changed elsewhere');
    expect(await drive.readText(note.id)).toBe('My draft');
  });

  it('a pile with no declaration, and a ready one, have no reason', async () => {
    expect((await vault.piles()).map((p) => p.setAside)).toEqual((await vault.piles()).map(() => undefined));
    const uploader = declaring();
    const pile = await uploader.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf')] });
    await uploader.settled();
    expect((await pileOn(declaring(), pile.id))?.setAside).toBeUndefined();
    expect(await rows(declaring(), pile.id)).toEqual([['a.pdf', undefined, undefined]]);
  });

  it.each([
    ['storage refused', { persist: async (): Promise<boolean> => false }, 'This browser may clear what Bower keeps here. Keep Bower open until everything is sent.'],
    ['no copy kept', { persist: async (): Promise<boolean> => true, estimate: async (): Promise<{ quota: number; usage: number }> => ({ quota: 0, usage: 0 }) }, "This device couldn't keep a copy. Keep Bower open until everything is sent."],
  ] as const)('a storage notice shows only while this device has something to send (%s)', async (_label, storage, said) => {
    const d = new FakeDrive({ chunkMultiple: 4 });
    root = (await seedFakeDrive(d, 'default', Date.now())) ?? '';
    let open!: () => void;
    const gate = new Promise<void>((r) => { open = r; });
    d.beforeChunk = async (call) => { if (call.start >= 4) await gate; };
    const queue = createUploadQueue({ drive: d, store: indexedDbUploadStore(new IDBFactory()), chunkSize: 4, storage });
    const v = new DriveVault({ drive: d, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true, uploads: { queue, account: async () => 'ACCOUNT_A' } });
    await v.addPile({ text: 'Receipts', items: [{ name: 'scan.pdf', kind: 'pdf', origin: 'From this computer', body: new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])]) }] });
    await vi.waitFor(() => expect(v.uploadNotice()).toBe(said));
    const heard = vi.fn();
    v.subscribe(heard);
    open();
    await v.settled();
    await queue.idle();
    await vi.waitFor(() => expect(v.uploadNotice()).toBeNull());
    expect(heard).toHaveBeenCalled();
    v.dispose();
  });

  it.each([
    ['storage refused', { persist: async (): Promise<boolean> => false }, 'This browser may clear what Bower keeps here. Keep Bower open until everything is sent.'],
    ['no copy kept', { persist: async (): Promise<boolean> => true, estimate: async (): Promise<{ quota: number; usage: number }> => ({ quota: 0, usage: 0 }) }, "This device couldn't keep a copy. Keep Bower open until everything is sent."],
  ] as const)('a storage notice stays while a failed upload waits for Try again, and goes when it is discarded (%s)', async (_label, storage, said) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const d = new FakeDrive({ chunkMultiple: 4 });
    root = (await seedFakeDrive(d, 'default', Date.now())) ?? '';
    d.beforeChunk = (call) => {
      if (call.start >= 4) throw new BowerError('unknown', 'Drive said no.');
    };
    const queue = createUploadQueue({ drive: d, store: indexedDbUploadStore(new IDBFactory()), chunkSize: 4, storage });
    const v = new DriveVault({ drive: d, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true, uploads: { queue, account: async () => 'ACCOUNT_A' } });
    const pile = await v.addPile({ text: 'Receipts', items: [{ name: 'scan.pdf', kind: 'pdf', origin: 'From this computer', body: new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])]) }] });
    await vi.waitFor(() => expect(queue.items().map((i) => i.state)).toEqual(['failed']));
    // TL-P2-22 (2): the only copy is still on this device, so the warning stays.
    await vi.waitFor(() => expect(v.uploadNotice()).toBe(said));
    await v.removePile(pile.id);
    await vi.waitFor(() => expect(v.uploadNotice()).toBeNull());
    v.dispose();
  });

  it('a notice the upload queue tells with nothing held reaches the inbox', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const store = { ...indexedDbUploadStore(new IDBFactory()), list: () => Promise.reject(new Error('IndexedDB list failed')) };
    const queue = createUploadQueue({ drive, store, chunkSize: 4 });
    let account!: () => void;
    const signedIn = new Promise<void>((r) => { account = r; });
    const v = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true, uploads: { queue, account: async () => { await signedIn; return 'ACCOUNT_A'; } } });
    await v.piles();
    const heard = vi.fn();
    v.subscribe(heard);
    // The queue starts only now, after the inbox was listed: only a change can bring the notice to the screen.
    account();
    await vi.waitFor(() => expect(v.uploadNotice()).toBe("Bower couldn't read what it kept on this device. Choose those files again to send them."));
    await vi.waitFor(() => expect(heard).toHaveBeenCalled());
    v.dispose();
  });
});

describe('a reselected file must match its declared member', () => {
  const declaring = (opts: { running?: string } = {}): DriveVault => new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(opts.running ? [opts.running] : []), declarePiles: true });
  const pdf = (name: string, text = `%PDF ${name}`): { name: string; kind: 'pdf'; origin: string; body: Blob } => ({ name, kind: 'pdf', origin: 'From this computer', body: new Blob([text]) });
  const LINK = 'https://source.example/path';

  /** `name` does not get through, from this client, until the returned function is called. */
  function failing(on: { upload?: string | readonly string[]; link?: boolean }): () => void {
    const createText = drive.createText.bind(drive);
    const names: readonly (string | undefined)[] = typeof on.upload === 'string' || on.upload === undefined ? [on.upload] : on.upload;
    let fail = true;
    beforeUpload(drive, ({ name: n }) => {
      if (fail && names.includes(n)) throw driveError('offline');
    });
    drive.createText = async (parent, n, text, props) => {
      if (fail && on.link && n.endsWith('.url')) throw driveError('offline');
      return createText(parent, n, text, props);
    };
    return () => { fail = false; };
  }

  /** A pile whose `missing` thing never left the first client, which then went away. */
  async function leftBehind(items: NewPileItems, missing: { upload?: string | readonly string[]; link?: boolean }) {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const heal = failing(missing);
    const uploader = declaring();
    const pile = await uploader.addPile({ text: 'Papers from Alex', items });
    await uploader.settled();
    uploader.dispose();
    heal();
    const folder = (await drive.listAll(root)).find((f) => f.folder && f.appProperties?.pile === pile.id);
    const declared = (await drive.listAll(root)).find((f) => !f.folder && drive.pathOf(f.id, root).startsWith('.bower/piles/'));
    const parsed = await parsePileDeclaration(await drive.readBytes(declared?.id ?? ''), root);
    if (!folder || !parsed.ok) throw new Error('no declared pile');
    const first = typeof missing.upload === 'string' ? missing.upload : missing.upload?.[0];
    const member = parsed.value.members.find((m) => (missing.link ? m.kind === 'link' : m.name === first));
    if (!member) throw new Error('no member');
    return { pile, folder, declaration: parsed.value, member };
  }
  type NewPileItems = Parameters<DriveVault['addPile']>[0]['items'];

  const things = async (folderId: string) => (await drive.listAll(folderId)).filter((f) => !f.folder && f.parents[0] === folderId && f.name !== 'Pile note.md');

  it('the same file, chosen on a client without its bytes, is sent once under its declared member; its sibling is not sent again', async () => {
    const { pile, folder, declaration, member } = await leftBehind([pdf('a.pdf'), pdf('b.pdf')], { upload: 'b.pdf' });
    const second = declaring();
    const row = (await second.piles()).find((p) => p.id === pile.id)?.items.find((i) => i.name === 'b.pdf');
    expect(row).toMatchObject({ id: member.memberKey, upload: -1, chooseAgain: true });
    const upload = vi.spyOn(drive, 'openResumable');
    await expect(second.chooseAgain(pile.id, member.memberKey, { body: new Blob(['%PDF b.pdf']) })).resolves.toBeUndefined();
    await second.settled();
    expect(upload).toHaveBeenCalledTimes(1);
    const kids = await things(folder.id);
    expect(kids.map((f) => f.appProperties?.asAdded).sort()).toEqual(['a.pdf', 'b.pdf']);
    const sent = kids.find((f) => f.appProperties?.bowerItem === member.memberKey);
    expect(sent?.appProperties).toMatchObject({ asAdded: 'b.pdf', bowerItem: member.memberKey, bowerDeclaration: declaration.declarationId });
    expect(new TextDecoder().decode(await drive.readBytes(sent?.id ?? ''))).toBe('%PDF b.pdf');
    const now = (await declaring().piles()).find((p) => p.id === pile.id);
    expect(now?.items.map((i) => [i.name, i.upload, i.chooseAgain])).toEqual([['a.pdf', undefined, undefined], ['b.pdf', undefined, undefined]]);
    expect(now?.setAside).toBeUndefined();
  });

  it.each([
    ['other bytes of the same size', '%PDF c.pdf'],
    ['another size', '%PDF b-2.pdf'],
  ])('a different file (%s) is refused in one sentence, nothing is sent, and the thing stays missing and retryable', async (_label, text) => {
    const { pile, folder, member } = await leftBehind([pdf('a.pdf'), pdf('b.pdf')], { upload: 'b.pdf' });
    const second = declaring();
    const upload = vi.spyOn(drive, 'openResumable');
    const createText = vi.spyOn(drive, 'createText');
    await expect(second.chooseAgain(pile.id, member.memberKey, { body: new Blob([text]) })).rejects.toMatchObject({ code: 'conflict', message: NOT_THE_SAME_TEXT.file });
    await second.settled();
    expect(upload).not.toHaveBeenCalled();
    expect(createText).not.toHaveBeenCalled();
    expect((await things(folder.id)).map((f) => f.appProperties?.asAdded)).toEqual(['a.pdf']);
    const still = (await second.piles()).find((p) => p.id === pile.id);
    expect(still?.items.find((i) => i.id === member.memberKey)).toMatchObject({ upload: -1, chooseAgain: true });
    expect(still?.setAside).toBe('not-arrived');
    await expect(second.retryPile(pile.id)).rejects.toMatchObject({ message: 'Choose b.pdf again on this device to send it.' });
    // Still retryable: the right file afterwards is sent.
    await second.chooseAgain(pile.id, member.memberKey, { body: new Blob(['%PDF b.pdf']) });
    await second.settled();
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('a link pasted again is sent only when it is the same link', async () => {
    const { pile, folder, member } = await leftBehind([pdf('a.pdf'), { name: 'source.example/path', kind: 'link', origin: 'A link you pasted', url: LINK }], { link: true });
    const second = declaring();
    expect((await second.piles()).find((p) => p.id === pile.id)?.items.find((i) => i.kind === 'link')).toMatchObject({ id: member.memberKey, upload: -1, chooseAgain: true });
    const createText = vi.spyOn(drive, 'createText');
    await expect(second.chooseAgain(pile.id, member.memberKey, { url: 'https://source.example/other' })).rejects.toMatchObject({ code: 'conflict', message: NOT_THE_SAME_TEXT.link });
    await expect(second.chooseAgain(pile.id, member.memberKey, { body: new Blob([`[InternetShortcut]\nURL=${LINK}\n`]) })).rejects.toMatchObject({ message: NOT_THE_SAME_TEXT.link });
    expect(createText).not.toHaveBeenCalled();
    await expect(second.chooseAgain(pile.id, member.memberKey, { url: LINK })).resolves.toBeUndefined();
    await second.settled();
    expect(createText).toHaveBeenCalledTimes(1);
    const sent = (await things(folder.id)).filter((f) => f.appProperties?.bowerItem === member.memberKey);
    expect(sent).toHaveLength(1);
    expect(await drive.readText(sent[0]?.id ?? '')).toBe(`[InternetShortcut]\nURL=${LINK}\n`);
  });

  it('a thing that arrived meanwhile from another device is not sent again', async () => {
    const { pile, folder, member } = await leftBehind([pdf('a.pdf'), pdf('b.pdf')], { upload: 'b.pdf' });
    const second = declaring();
    await second.piles();
    // Another device sends it after this client listed the pile.
    await drive.upload(folder.id, 'b.pdf', new Blob(['%PDF b.pdf']), undefined, { asAdded: 'b.pdf', bowerItem: member.memberKey });
    const upload = vi.spyOn(drive, 'openResumable');
    await expect(second.chooseAgain(pile.id, member.memberKey, { body: new Blob(['%PDF b.pdf']) })).resolves.toBeUndefined();
    await second.settled();
    expect(upload).not.toHaveBeenCalled();
    expect((await things(folder.id)).filter((f) => f.appProperties?.bowerItem === member.memberKey)).toHaveLength(1);
  });

  it('while a tidy-up holds the pile, nothing is sent', async () => {
    const { pile, member } = await leftBehind([pdf('a.pdf'), pdf('b.pdf')], { upload: 'b.pdf' });
    const upload = vi.spyOn(drive, 'openResumable');
    await expect(declaring({ running: pile.id }).chooseAgain(pile.id, member.memberKey, { body: new Blob(['%PDF b.pdf']) })).rejects.toMatchObject({ code: 'conflict', message: 'Wait for the tidy-up to end.' });
    expect(upload).not.toHaveBeenCalled();
  });

  it('a file chosen for one thing that is another thing waiting to be chosen is sent as that one', async () => {
    const { pile, folder, declaration, member: c } = await leftBehind([pdf('a.pdf'), pdf('c.pdf'), pdf('d.pdf')], { upload: ['c.pdf', 'd.pdf'] });
    const d = declaration.members.find((m) => m.name === 'd.pdf');
    if (!d) throw new Error('no d.pdf');
    const second = declaring();
    const upload = vi.spyOn(drive, 'openResumable');
    await expect(second.chooseAgain(pile.id, c.memberKey, { body: new Blob(['%PDF d.pdf']) })).resolves.toBeUndefined();
    await second.settled();
    expect(upload).toHaveBeenCalledTimes(1);
    expect((await things(folder.id)).filter((f) => f.appProperties?.bowerItem === d.memberKey).map((f) => f.appProperties?.asAdded)).toEqual(['d.pdf']);
    expect((await things(folder.id)).filter((f) => f.appProperties?.bowerItem === c.memberKey)).toEqual([]);
    const rows = (await declaring().piles()).find((p) => p.id === pile.id)?.items ?? [];
    expect(rows.filter((i) => i.chooseAgain).map((i) => i.name)).toEqual(['c.pdf']);
  });

  it('a sibling already in Drive, chosen for the thing asked for, is refused and nothing is sent', async () => {
    const { pile, member } = await leftBehind([pdf('a.pdf'), pdf('b.pdf')], { upload: 'b.pdf' });
    const second = declaring();
    const upload = vi.spyOn(drive, 'openResumable');
    await expect(second.chooseAgain(pile.id, member.memberKey, { body: new Blob(['%PDF a.pdf']) })).rejects.toMatchObject({ code: 'conflict', message: NOT_THE_SAME_TEXT.file });
    await second.settled();
    expect(upload).not.toHaveBeenCalled();
    expect((await second.piles()).find((p) => p.id === pile.id)?.items.find((i) => i.id === member.memberKey)).toMatchObject({ upload: -1, chooseAgain: true });
  });

  it('the same file chosen twice at once is sent once', async () => {
    const { pile, folder, member } = await leftBehind([pdf('a.pdf'), pdf('b.pdf')], { upload: 'b.pdf' });
    const second = declaring();
    await second.piles();
    // Both choices are checked before either is sent: each looks at the folder at the same time.
    const listAll = drive.listAll.bind(drive);
    let looking = 0;
    let both!: () => void;
    const together = new Promise<void>((r) => { both = r; });
    vi.spyOn(drive, 'listAll').mockImplementation(async (id) => {
      if (id === folder.id && ++looking === 2) both();
      if (id === folder.id) await together;
      return listAll(id);
    });
    const upload = vi.spyOn(drive, 'openResumable');
    await Promise.all([1, 2].map(() => second.chooseAgain(pile.id, member.memberKey, { body: new Blob(['%PDF b.pdf']) })));
    await second.settled();
    expect(upload).toHaveBeenCalledTimes(1);
    expect((await things(folder.id)).filter((f) => f.appProperties?.bowerItem === member.memberKey)).toHaveLength(1);
  });

  it('a tidy-up that takes the pile while the file is checked: nothing is sent', async () => {
    const { pile, member } = await leftBehind([pdf('a.pdf'), pdf('b.pdf')], { upload: 'b.pdf' });
    const running = new Set<string>();
    const second = new DriveVault({ drive, rootId: async () => root, runningPiles: () => running, declarePiles: true });
    await second.piles();
    const listAll = drive.listAll.bind(drive);
    vi.spyOn(drive, 'listAll').mockImplementation(async (id) => {
      running.add(pile.id);
      return listAll(id);
    });
    const upload = vi.spyOn(drive, 'openResumable');
    await expect(second.chooseAgain(pile.id, member.memberKey, { body: new Blob(['%PDF b.pdf']) })).rejects.toMatchObject({ code: 'conflict', message: 'Wait for the tidy-up to end.' });
    await second.settled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('a send whose folder cannot be listed again tries each thing once, not again and again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const v = declaring();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let held = false;
    beforeUpload(drive, async () => {
      if (!held) {
        held = true;
        await gate;
      }
    });
    await v.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf'), pdf('b.pdf')] });
    await vi.waitFor(() => expect(held).toBe(true));
    // Drive stops listing while a.pdf is on its way, and the folder must be listed again.
    const listAll = drive.listAll.bind(drive);
    let lists = 0;
    vi.spyOn(drive, 'listAll').mockImplementation(async (id) => {
      lists += 1;
      if (lists <= 40) throw driveError('offline');
      return listAll(id);
    });
    await v.refresh().catch(() => undefined);
    release();
    await v.settled();
    expect(lists).toBeLessThanOrEqual(3);
    v.dispose();
  });

  it('through the upload queue: bytes this device lost are chosen again and sent once, under the file id reserved for them', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const BYTES = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const d = new FakeDrive({ chunkMultiple: 4 });
    root = (await seedFakeDrive(d, 'default', Date.now())) ?? '';
    const idb = new IDBFactory();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    d.beforeChunk = async (call) => { if (call.start >= 4) await gate; };
    const firstQueue = createUploadQueue({ drive: d, store: indexedDbUploadStore(idb), chunkSize: 4 });
    const first = new DriveVault({ drive: d, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true, uploads: { queue: firstQueue, account: async () => 'ACCOUNT_A' } });
    const pile = await first.addPile({ text: 'Receipts', items: [{ name: 'scan.pdf', kind: 'pdf', origin: 'From this computer', body: new Blob([BYTES], { type: 'application/pdf' }) }] });
    await vi.waitFor(() => expect(d.resumableCalls.some((c) => c.op === 'put' && c.start === 4)).toBe(true));
    const reserved = d.resumableCalls.find((c) => c.op === 'open')?.id;
    firstQueue.stop();
    first.dispose();
    release();
    d.beforeChunk = null;

    // The next page cannot read the bytes back: the thing is gone from this device.
    const queue = createUploadQueue({ drive: d, store: { ...indexedDbUploadStore(idb), body: async () => null }, chunkSize: 4 });
    const vault = new DriveVault({ drive: d, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true, uploads: { queue, account: async () => 'ACCOUNT_A' } });
    await vault.piles();
    await vi.waitFor(() => expect(queue.items()[0]).toMatchObject({ state: 'failed', gone: true }));
    const row = (await vault.piles()).find((p) => p.id === pile.id)?.items[0];
    expect(row).toMatchObject({ name: 'scan.pdf', upload: -1, chooseAgain: true });
    const opens = d.resumableCalls.filter((c) => c.op === 'open').length;
    await expect(vault.chooseAgain(pile.id, row?.id ?? '', { body: new Blob([new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9, 9, 9])]) })).rejects.toMatchObject({ message: NOT_THE_SAME_TEXT.file });
    await expect(vault.chooseAgain(pile.id, row?.id ?? '', { body: new Blob([BYTES], { type: 'application/pdf' }) })).resolves.toBeUndefined();
    await vault.settled();
    await queue.idle();
    const scans = (await d.listAll(root)).filter((f) => f.appProperties?.asAdded === 'scan.pdf');
    expect(scans.map((f) => f.id)).toEqual([reserved]);
    expect([...(await d.readBytes(reserved ?? ''))]).toEqual([...BYTES]);
    expect(d.resumableCalls.filter((c) => c.op === 'open')).toHaveLength(opens);
    expect(queue.items().map((i) => i.state)).toEqual(['done']);
    expect((await vault.piles()).find((p) => p.id === pile.id)?.items.map((i) => [i.name, i.upload])).toEqual([['scan.pdf', undefined]]);
    vault.dispose();
  });
});

// pile-accounting-shared (TL-P2-29 second amendment): the Inbox and the tidy-up account for filed members with
// one rule, consumed dispositions first and then the lookup, so they can never disagree.
describe('the inbox accounts for filed members like the tidy-up', () => {
  const pdf = (name: string): { name: string; kind: 'pdf'; origin: string; body: Blob } => ({ name, kind: 'pdf', origin: 'From this computer', body: new Blob([`%PDF ${name}`]) });

  it('shows what is left of a pile whose filed member was edited afterwards as ready, as the run takes it', async () => {
    localStorage.clear();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fake = new FakeDrive();
    const runs = new FakeRunService({ drive: fake, clock: () => Date.now(), scale: 'instant' });
    const worker = new FakeWorker({ drive: fake, scenario: 'first', rootId: null, runs });
    const at = (await worker.createFolder()).id;
    const reader = (): DriveVault => new DriveVault({ drive: fake, rootId: async () => at, runningPiles: () => new Set(), declarePiles: true, device: 'DEVICE_A' });
    const uploader = reader();
    const pile = await uploader.addPile({ text: 'Papers about the lease', items: [pdf('lease.pdf'), pdf('inventory.pdf')] });
    await uploader.settled();
    const folder = (await fake.listAll(at)).find((f) => f.folder && f.appProperties?.pile === pile.id);
    if (!folder) throw new Error('no pile folder');
    await fake.createText(folder.id, 'extra.txt', 'not one of its things');
    const first = (await worker.process('all')).run;
    await runs.settled();
    expect((await worker.status()).run).toMatchObject({ id: first.id, phase: 'done' });
    expect((await fake.listAll(at)).filter((f) => f.name.startsWith('disposition-'))).toHaveLength(1);

    // Alex edits the filed lease: the lookup alone would call it changed, but the run's disposition records it as filed.
    const lease = (await fake.listAll(at)).find((f) => f.name === 'lease.pdf');
    await fake.writeText(lease?.id ?? '', '%PDF lease, signed', lease?.modifiedTime ?? '');

    const shown = (await reader().piles()).find((p) => p.id === pile.id);
    expect(shown?.setAside).toBeUndefined();
    expect(shown?.items.map((i) => [i.name, i.changed, i.upload])).toEqual([['extra.txt', undefined, undefined]]);
    const planned = await planRun(fake, at, { scope: 'all', allowWeb: false, runId: 'run-plan', requestId: 'request-plan', requestedAt: Date.now() });
    expect(planned.path).toBe('b');
    if (planned.path !== 'b') return;
    expect(planned.manifest.capture.piles.map((p) => p.anchor?.fileId)).toEqual([folder.id]);
    errors.mockRestore();
  });
});

describe('a question about a thing that is gone (TL-P4-11 addendum)', () => {
  it('binning the only thing left in the inbox closes its question', async () => {
    for (const p of await vault.piles()) await vault.removePile(p.id);
    const pile = await vault.addPile({ text: '', items: [{ name: 'kitchen.jpg', kind: 'image', origin: 'x', body: new Blob(['kitchen']) }] });
    expect(pile.items).toHaveLength(1);
    await vault.settled();
    const thing = (await vault.piles())[0]?.items[0]?.id ?? '';
    const file = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === '.bower/questions.json');
    if (!file) throw new Error('no questions.json');
    const ask = { id: `q-ask-${thing}`, text: 'Is it from the viewing?', yes: 'Yes', no: 'No', subject: thing, askedAt: 1 };
    await drive.writeText(file.id, JSON.stringify({ v: 1, questions: [ask] }), (await drive.get(file.id)).modifiedTime);
    await vault.refresh();
    expect((await vault.questions()).map((q) => q.id)).toEqual([ask.id]);
    await vault.removePile((await vault.piles())[0]?.id ?? '');
    expect(await vault.piles()).toEqual([]);
    expect(await vault.questions()).toEqual([]);
  });
});

describe('a question whose subject is gone is not listed (TL-P4-19 addendum 10)', () => {
  it('a pair question whose other note is in the Bin is not listed', async () => {
    const OTHER = 'Resources/Cooking/Lemon tart.md';
    const pair = pairQuestionId(await idOf(PASSPORT), await idOf(OTHER));
    const file = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === '.bower/questions.json');
    if (!file) throw new Error('no questions.json');
    const ask = { id: pair, text: 'Passport renewal and Lemon tart look like one note. Keep one note?', yes: 'Yes, keep one', no: 'No, keep both', about: PASSPORT, askedAt: 1 };
    await drive.writeText(file.id, JSON.stringify({ v: 1, questions: [ask] }), (await drive.get(file.id)).modifiedTime);
    await vault.refresh();
    expect((await vault.questions()).map((q) => q.id)).toEqual([pair]);
    // The other note goes to the Bin from the app: nothing can be kept as one, so the question is not shown.
    await vault.trash(OTHER);
    expect(await vault.questions()).toEqual([]);
  });
});

describe('one Home load on a folder like the live one (TL-P4-11 addendum)', () => {
  const declaring = (): DriveVault => new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true });
  const hex = (n: number): string => n.toString(16).padStart(64, '0');

  /** Makes a folder, or finds it. */
  async function folderAt(path: string): Promise<string> {
    const all = await drive.listAll(root);
    const found = all.find((f) => f.folder && drive.pathOf(f.id, root) === path);
    if (found) return found.id;
    const cut = path.lastIndexOf('/');
    const parent = cut < 0 ? root : await folderAt(path.slice(0, cut));
    return (await drive.createFolder(parent, path.slice(cut + 1))).id;
  }

  /**
   * A declared pile made through the app, past runs' leftovers in .bower, a dozen changes and some archived ones,
   * questions and a last run; Drive says nothing of what it stored, so a check of a thing's bytes reads them, as on
   * Google Drive. Returns what one Home load reads, by path, and how many times it lists the folder.
   */
  async function homeLoad(): Promise<{ reads: string[]; lists: number }> {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (const p of await vault.piles()) await vault.removePile(p.id);
    const uploader = declaring();
    const pile = await uploader.addPile({ text: 'Papers from Alex', items: ['a', 'b', 'c', 'd'].map((n) => ({ name: `${n}.pdf`, kind: 'pdf' as const, origin: 'From this computer', body: new Blob([`%PDF ${n}`]) })) });
    await uploader.settled();
    const piles = await folderAt('.bower/piles');
    for (let i = 0; i < 20; i++) await drive.createText(piles, `disposition-${hex(i)}.json`, '{}');
    const bower = await folderAt('.bower');
    for (let i = 0; i < 4; i++) {
      await drive.createText(bower, `checkpoint-${i}.json`, '{}');
      await drive.createText(bower, `manifest-${i}.json`, '{}');
      await drive.createText(bower, `report-${i}.json`, '{}');
    }
    const archive = await folderAt('.bower/changes/archive');
    for (let i = 0; i < 5; i++) await drive.createText(archive, `old-${i}.json`, '{}');
    for (let i = 0; i < 12; i++) await uploader.addRequest(`Tidy shelf ${i}`);
    const q = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === '.bower/questions.json');
    const things = (await uploader.piles()).find((p) => p.id === pile.id)?.items ?? [];
    const asks = things.slice(0, 3).map((t, i) => ({ id: `q-ask-${t.id}`, text: `Is it from the viewing ${i}?`, yes: 'Yes', no: 'No', subject: t.id, askedAt: i }));
    if (q) await drive.writeText(q.id, JSON.stringify({ v: 1, questions: asks }), q.modifiedTime);
    else await drive.createText(bower, 'questions.json', JSON.stringify({ v: 1, questions: asks }));
    const fresh = declaring();
    drive.storedDigest = (id, known) => DriveHttp.prototype.storedDigest.call(drive, id, known);
    const names = new Map((await drive.listAll(root)).map((f) => [f.id, drive.pathOf(f.id, root)]));
    const reads: string[] = [];
    for (const m of ['readText', 'readBytes'] as const) {
      const real = drive[m].bind(drive) as (id: string) => Promise<unknown>;
      vi.spyOn(drive, m).mockImplementation((async (id: string) => { reads.push(names.get(id) ?? id); return real(id); }) as never);
    }
    const listAll = vi.spyOn(drive, 'listAll');
    await Promise.all([fresh.piles(), fresh.changes(), fresh.questions(), fresh.suggestions(), fresh.tree(), fresh.lastRun(), fresh.piles()]);
    return { reads, lists: listAll.mock.calls.length };
  }

  const twice = (reads: string[]): string[] => [...new Set(reads.filter((c, i) => reads.indexOf(c) !== i))];

  it('Home reads each file at most once', async () => {
    const { reads } = await homeLoad();
    expect(reads.length).toBeGreaterThan(0);
    expect(twice(reads)).toEqual([]);
  });

  it('Home Drive calls match the golden', async () => {
    const { reads, lists } = await homeLoad();
    const kind = (p: string): string => p.replace(/[0-9a-f]{64}/, '<hash>').replace(/-\d+\.json$/, '-<n>.json').replace(/changes\/[^/]*\.json$/, 'changes/<change>.json').replace(/Inbox\/[^/]*\//, 'Inbox/<pile>/').replace(/\/[^/]+\.pdf$/, '/<thing>.pdf').replace(/declaration-.*\.json$/, 'declaration-<id>.json');
    const tally = new Map<string, number>();
    for (const r of reads) tally.set(kind(r), (tally.get(kind(r)) ?? 0) + 1);
    // The golden: what one Home load reads, in total, by kind of file. Archived changes, past runs' checkpoints,
    // manifests and reports are never read.
    expect({ lists, reads: Object.fromEntries([...tally].sort(([a], [b]) => a.localeCompare(b))) }).toEqual({
      lists: 1,
      reads: {
        '.bower/changes/<change>.json': 12,
        '.bower/piles/declaration-<id>.json': 1,
        '.bower/questions.json': 1,
        '.bower/suggestions.json': 1,
        'Inbox/<pile>/Pile note.md': 1,
        'Rules.md': 1,
      },
    });
  });
});

describe('the inbox from the listing alone (home-inbox-first)', () => {
  it('lists the piles without reading a file, and concurrent digests of one file ask Drive once', async () => {
    const reads = vi.spyOn(drive, 'readText');
    const bytes = vi.spyOn(drive, 'readBytes');
    const listed = await vault.pilesListed();
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.every((p) => p.id && p.items.length > 0)).toBe(true);
    expect(reads).not.toHaveBeenCalled();
    expect(bytes).not.toHaveBeenCalled();
    const read = (await vault.piles()).map((p) => p.id).sort();
    expect(listed.map((p) => p.id).sort()).toEqual(read);
  });
});

describe('the Inbox count reads the listing, not every file (inbox-read-slow)', () => {
  const declaring = (): DriveVault => new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true });
  const pdf = (name: string): { name: string; kind: 'pdf'; origin: string; body: Blob } => ({ name, kind: 'pdf', origin: 'From this computer', body: new Blob([`%PDF ${name}`]) });
  const pileOn = async (v: DriveVault, id: string) => (await v.piles()).find((p) => p.id === id);
  const fileIn = async (pileId: string, name: string): Promise<DriveFile> => {
    const folder = (await drive.listAll(root)).find((f) => f.folder && f.appProperties?.pile === pileId);
    const f = folder && (await drive.listAll(folder.id)).find((x) => x.name === name && x.parents[0] === folder.id);
    if (!f) throw new Error(`no ${name}`);
    return f;
  };
  /** One declared pile of `n` things. */
  async function pileOf(n: number): Promise<string> {
    const uploader = declaring();
    const pile = await uploader.addPile({ text: 'Papers from Alex', items: Array.from({ length: n }, (_, i) => pdf(`p${i}.pdf`)) });
    await uploader.settled();
    return pile.id;
  }

  it('(a) a listing with checksums carries sha256 and size per content file; a plain one leaves them out', async () => {
    const pile = await pileOf(1);
    const f = await fileIn(pile, 'p0.pdf');
    const plain = (await drive.listAll(root)).find((x) => x.id === f.id);
    const checked = await drive.listAll(root, { checksums: true });
    expect(plain?.sha256).toBeUndefined();
    expect(checked.find((x) => x.id === f.id)?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(checked.find((x) => x.id === f.id)?.size).toBe(new TextEncoder().encode('%PDF p0.pdf').byteLength);
    expect(checked.filter((x) => x.folder).every((x) => x.sha256 === undefined)).toBe(true);
  });

  it('(b) a file Drive keeps no checksum of holds its pile, with no download and no waiting', async () => {
    const folder = await drive.createFolder(await idOf('Inbox'), 'Loose papers');
    const doc = await drive.createText(folder.id, 'Budget.pdf', 'a Google Doc, as far as Drive keeps a checksum');
    listedWithout([doc.id], true);
    const digest = vi.spyOn(drive, 'storedDigest');
    const bytes = vi.spyOn(drive, 'readBytes');
    expect((await vault.piles()).find((p) => p.id === folder.id)?.setAside).toBe('not-tidied');
    expect(digest).not.toHaveBeenCalled();
    expect(bytes.mock.calls.filter(([id]) => id === doc.id)).toEqual([]);
  });

  it('(c) a file not listed with a checksum yet asks Drive for its digest once', async () => {
    const pile = await pileOf(2);
    const fresh = await fileIn(pile, 'p1.pdf');
    listedWithout([fresh.id], false);
    const digest = vi.spyOn(drive, 'storedDigest');
    expect((await pileOn(declaring(), pile))?.setAside).toBeUndefined();
    expect(digest.mock.calls.filter(([id]) => id === fresh.id)).toHaveLength(1);
    expect(digest.mock.calls.filter(([id]) => id !== fresh.id)).toEqual([]);
  });

  it('(d) an edited file gets the digest of its new listing, not the one kept', async () => {
    const pile = await pileOf(2);
    const v = declaring();
    expect((await pileOn(v, pile))?.setAside).toBeUndefined();
    const b = await fileIn(pile, 'p1.pdf');
    await drive.writeText(b.id, 'Edited somewhere else', b.modifiedTime);
    await v.refresh();
    expect((await pileOn(v, pile))?.setAside).toBe('changed');
  });

  it('Home asks Drive the same number of times for 4 things as for 40, and downloads none of them', async () => {
    const calls = async (n: number): Promise<{ total: number; downloads: number }> => {
      drive = new FakeDrive();
      root = (await seedFakeDrive(drive, 'default', Date.now())) ?? '';
      const inbox = await idOf('Inbox');
      const names = new Set<string>();
      for (const pile of ['Pile one', 'Pile two']) {
        const folder = await drive.createFolder(inbox, pile);
        for (let i = 0; i < n / 2; i++) names.add((await drive.createText(folder.id, `t${i}.pdf`, `%PDF ${pile} ${i}`)).id);
      }
      let total = 0;
      let downloads = 0;
      const counted = new Proxy(drive, {
        get(target, key, receiver) {
          const value: unknown = Reflect.get(target, key, receiver);
          if (typeof value !== 'function') return value;
          return (...args: unknown[]): unknown => {
            total++;
            if (['readBytes', 'readText', 'readPrefix', 'storedDigest'].includes(String(key)) && names.has(String(args[0]))) downloads++;
            return Reflect.apply(value, target, args);
          };
        },
      });
      await new DriveVault({ drive: counted, rootId: async () => root, runningPiles: () => new Set() }).piles();
      return { total, downloads };
    };
    const few = await calls(4);
    const many = await calls(40);
    expect(few.downloads + many.downloads).toBe(0);
    expect(many.total).toBe(few.total);
  });
});

describe('c2-create-by-id: an app write whose answer was lost is found again by its reserved id or its stamp', () => {
  type Writes = 'createFolder' | 'createText' | 'trash' | 'untrash' | 'update';
  /** The first call of `k` that `when` picks lands, then its answer is lost; gives how many were lost. */
  function lose(k: Writes, when: (args: unknown[]) => boolean = () => true): () => number {
    const d = drive as unknown as Record<Writes, (...a: unknown[]) => Promise<unknown>>;
    const real = d[k].bind(drive);
    let lost = 0;
    d[k] = async (...a: unknown[]) => {
      const out = await real(...a);
      if (lost === 0 && when(a)) {
        lost++;
        throw driveError('offline');
      }
      return out;
    };
    return () => lost;
  }
  /** The next call of `k` never lands and gets no answer. */
  function refuse(k: Writes): void {
    const d = drive as unknown as Record<Writes, (...a: unknown[]) => Promise<unknown>>;
    const real = d[k];
    d[k] = async () => {
      d[k] = real;
      throw driveError('offline');
    };
  }
  const named = async (folder: string, start: string): Promise<string[]> =>
    (await drive.listAll(root)).filter((f) => f.name.startsWith(start) && drive.pathOf(f.id, root) === `${folder}/${f.name}`).map((f) => f.name);
  const declaring = (): DriveVault => new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true });
  const pdf = (name: string): { name: string; kind: 'pdf'; origin: string; body: Blob } => ({ name, kind: 'pdf', origin: 'From this computer', body: new Blob([`%PDF ${name}`]) });

  it('a create retried after a lost answer makes one file by its reserved id', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await vault.tree();
    await vault.create('Resources/Cooking', 'note');
    // Alex renames the first note in Drive itself; what Bower set on it stays with it.
    await drive.update(await idOf('Resources/Cooking/Untitled.md'), { name: 'Shopping.md' });
    await vault.refresh();
    const lost = lose('createText', (a) => a[1] === 'Untitled.md');
    const made = await vault.create('Resources/Cooking', 'note').catch(() => vault.create('Resources/Cooking', 'note'));
    expect(lost()).toBe(1);
    expect(made).toBe('Resources/Cooking/Untitled.md');
    expect(await named('Resources/Cooking', 'Untitled')).toEqual(['Untitled.md']);
    expect(await named('Resources/Cooking', 'Shopping')).toEqual(['Shopping.md']);
  });

  it("a person's retry after a double failure makes one file", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    /** The next read by id gets no answer: the read-back of a create whose answer was lost fails too. */
    const blind = (): true => {
      const real = drive.get.bind(drive);
      drive.get = async () => {
        drive.get = real;
        throw driveError('offline');
      };
      return true;
    };
    await vault.tree();
    lose('createText', (a) => a[1] === 'Untitled.md' && blind());
    await expect(vault.create('Resources/Cooking', 'note')).rejects.toMatchObject({ code: 'offline' });
    // Alex tries again: the same intended note, sent with the same reserved id, is found, not made twice.
    await expect(vault.create('Resources/Cooking', 'note')).resolves.toBe('Resources/Cooking/Untitled.md');
    expect(await named('Resources/Cooking', 'Untitled')).toEqual(['Untitled.md']);
    // A pile with no note given words: the same for its note.
    const pile = (await vault.piles()).find((p) => p.path && p.text.startsWith('Job offer'));
    if (!pile?.path) throw new Error('no pile');
    const folder = await idOf(pile.path);
    await contextNeverCreated((await drive.listAll(folder)).filter((f) => f.name === 'Pile note.md').map((f) => f.id));
    await vault.refresh();
    lose('createText', (a) => a[1] === 'Pile note.md' && blind());
    await expect(vault.updatePile(pile.id, 'Job offer papers')).rejects.toMatchObject({ code: 'offline' });
    await expect(vault.updatePile(pile.id, 'Job offer papers')).resolves.toMatchObject({ text: 'Job offer papers' });
    expect((await drive.listAll(folder)).filter((f) => f.name === 'Pile note.md')).toHaveLength(1);
  });

  it('a pile note retried with new words after a double failure is one note with the new words', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const blind = (): true => {
      const real = drive.get.bind(drive);
      drive.get = async () => {
        drive.get = real;
        throw driveError('offline');
      };
      return true;
    };
    await vault.tree();
    const pile = (await vault.piles()).find((p) => p.path && p.text.startsWith('Job offer'));
    if (!pile?.path) throw new Error('no pile');
    const folder = await idOf(pile.path);
    await contextNeverCreated((await drive.listAll(folder)).filter((f) => f.name === 'Pile note.md').map((f) => f.id));
    await vault.refresh();
    // The note lands with the first words; its answer and the read-back are both lost.
    lose('createText', (a) => a[1] === 'Pile note.md' && blind());
    await expect(vault.updatePile(pile.id, 'Job offer papers')).rejects.toMatchObject({ code: 'offline' });
    // Alex tries again with new words: they go into the same note, not a second one.
    await expect(vault.updatePile(pile.id, 'Job offer, signed papers')).resolves.toMatchObject({ text: 'Job offer, signed papers' });
    const notes = (await drive.listAll(folder)).filter((f) => f.name === 'Pile note.md');
    expect(notes).toHaveLength(1);
    expect(await drive.readText(notes[0]?.id ?? '')).toBe('Job offer, signed papers');
  });

  /** A pile note made with `words`, landed with its answer and its read-back both lost: Bower does not know it is there. */
  async function lostPileNote(words: string): Promise<{ pile: string; folder: string; note: string }> {
    const blind = (): true => {
      const real = drive.get.bind(drive);
      drive.get = async () => {
        drive.get = real;
        throw driveError('offline');
      };
      return true;
    };
    await vault.tree();
    const pile = (await vault.piles()).find((p) => p.path && p.text.startsWith('Job offer'));
    if (!pile?.path) throw new Error('no pile');
    const folder = await idOf(pile.path);
    await contextNeverCreated((await drive.listAll(folder)).filter((f) => f.name === 'Pile note.md').map((f) => f.id));
    await vault.refresh();
    lose('createText', (a) => a[1] === 'Pile note.md' && blind());
    await expect(vault.updatePile(pile.id, words)).rejects.toMatchObject({ code: 'offline' });
    const note = (await drive.listAll(folder)).find((f) => f.name === 'Pile note.md');
    if (!note) throw new Error('the note did not land');
    return { pile: pile.id, folder, note: note.id };
  }

  it('a pile note retried after a double failure never overwrites an edit made between tries', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { pile, folder, note } = await lostPileNote('Job offer papers');
    // Alex adds a line to the landed note on another device before this page lists the folder again.
    await drive.writeText(note, 'Job offer papers, and my own line', (await drive.get(note, {})).modifiedTime);
    const retried = await vault.updatePile(pile, 'Job offer, signed papers').then(() => 'saved', (e: unknown) => (e as BowerError).message);
    expect({ retried, text: await drive.readText(note) }).toEqual({ retried: CHANGED_ELSEWHERE, text: 'Job offer papers, and my own line' });
    // Looked at again, the pile shows Alex's words, and the next save goes into that one note.
    await vault.refresh();
    expect((await vault.piles()).find((p) => p.id === pile)?.text).toBe('Job offer papers, and my own line');
    await expect(vault.updatePile(pile, 'Job offer, signed papers', 'Job offer papers, and my own line')).resolves.toMatchObject({ text: 'Job offer, signed papers' });
    expect((await drive.listAll(folder)).filter((f) => f.name === 'Pile note.md').map((f) => f.id)).toEqual([note]);
  });

  // c2-create-by-id's verify names this test: since TL-P4-24 addendum 10 the retry is refused first, then made again.
  it('a pile note binned elsewhere after a double failure is refused first, then made with the new words', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { pile, folder, note } = await lostPileNote('Job offer papers');
    // Alex bins the landed note in Drive before this page lists the folder again: it stays in the Bin, untouched.
    await drive.trash(note);
    // Not as it was made (TL-P4-24 addendum 10): refused, nothing made on that press, and its id let go.
    const e: unknown = await vault.updatePile(pile, 'Job offer, signed papers').then(() => null, (err: unknown) => err);
    expect({ reason: notAsSeenReason(e), message: (e as BowerError | null)?.message }).toEqual({ reason: 'gone', message: CHANGED_ELSEWHERE });
    expect((await drive.listAll(folder)).filter((f) => f.name === 'Pile note.md')).toEqual([]);
    await expect(vault.updatePile(pile, 'Job offer, signed papers')).resolves.toMatchObject({ text: 'Job offer, signed papers' });
    const notes = (await drive.listAll(folder)).filter((f) => f.name === 'Pile note.md');
    expect(notes).toHaveLength(1);
    expect(notes[0]?.id).not.toBe(note);
    expect(await drive.readText(notes[0]?.id ?? '')).toBe('Job offer, signed papers');
    expect(await drive.get(note, { binned: true })).toMatchObject({ trashed: true });
    // Nothing is left stuck: the next words go into the new note.
    await expect(vault.updatePile(pile, 'Job offer, all signed')).resolves.toMatchObject({ text: 'Job offer, all signed' });
    expect((await drive.listAll(folder)).filter((f) => f.name === 'Pile note.md').map((f) => f.id)).toEqual([notes[0]?.id]);
  });

  it('a journal line whose changes folder is gone waits and is sent once the folder is found again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await vault.tree();
    await vault.create('Resources/Cooking', 'note');
    const stale = await idOf('.bower/changes');
    // The changes folder goes to the Bin elsewhere; Drive answers 404 for a file made in it.
    await drive.trash(stale);
    const create = drive.createText.bind(drive);
    drive.createText = async (...a: Parameters<FakeDrive['createText']>) => {
      if (a[0] === stale) throw driveError('not-found');
      return create(...a);
    };
    const made = vault.create('Resources/Cooking', 'note');
    await expect(made).resolves.toBe('Resources/Cooking/Untitled (2).md');
    expect(localStorage.getItem(`bower:outbox:${root}`)).toContain('Untitled (2)');
    // The next send lists the folder again and makes the changes folder anew: the line is not lost.
    await vault.flushJournal();
    expect(localStorage.getItem(`bower:outbox:${root}`)).toBeNull();
    const fresh = await idOf('.bower/changes');
    expect(fresh).not.toBe(stale);
    const lines = (await drive.listAll(fresh)).filter((f) => f.name.endsWith('.json'));
    expect(await Promise.all(lines.map(async (f) => (JSON.parse(await drive.readText(f.id)) as { path?: string }).path))).toEqual(['Resources/Cooking/Untitled (2).md']);
  });

  it('a create whose answer is lost and that never landed never takes an older file of that name', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await vault.tree();
    await vault.create('Resources/Cooking', 'note');
    await drive.update(await idOf('Resources/Cooking/Untitled.md'), { name: 'Shopping.md' });
    await vault.refresh();
    refuse('createText');
    await expect(vault.create('Resources/Cooking', 'note')).rejects.toMatchObject({ code: 'offline' });
    expect(await named('Resources/Cooking', 'Untitled')).toEqual([]);
  });

  it('a Bin whose answer was lost is resolved by its stamp', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await vault.tree();
    const lost = lose('trash');
    await expect(vault.trash(PASSPORT)).resolves.toBeUndefined();
    expect(lost()).toBe(1);
    expect(drive.dump(root).has(PASSPORT)).toBe(false);
  });

  it('a Bin of something renamed elsewhere since it was read, whose answer was lost, is a change elsewhere', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await vault.tree();
    await drive.update(await idOf(PASSPORT), { name: 'Passport.md' });
    refuse('trash');
    await expect(vault.trash(PASSPORT)).rejects.toMatchObject({ code: 'conflict' });
    expect(drive.dump(root).has('Areas/Documents/Passport.md')).toBe(true);
  });

  it('a restore whose answer was lost is resolved by its stamp', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await vault.tree();
    await vault.trash(PASSPORT);
    const lost = lose('untrash');
    await expect(vault.restore(PASSPORT)).resolves.toBeUndefined();
    expect(lost()).toBe(1);
    expect(drive.dump(root).has(PASSPORT)).toBe(true);
  });

  it('a restore under a free name whose rename answer was lost is resolved by its stamp', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await vault.tree();
    await vault.trash(PASSPORT);
    await vault.create('Areas/Documents', 'note', 'Passport renewal.md');
    // Out of the Bin under the free name in one write (TL-P4-24 addendum 7): that write's answer is the one lost.
    const lost = lose('untrash', (a) => typeof a[2] === 'string');
    await expect(vault.restore(PASSPORT)).resolves.toBeUndefined();
    expect(lost()).toBe(1);
    expect(await named('Areas/Documents', 'Passport renewal')).toHaveLength(2);
  });

  it('a lone thing given a note is made into its pile folder once, every answer lost', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const lone = (await vault.piles()).find((p) => p.path === 'Inbox/Dentist reminder.pdf');
    if (!lone) throw new Error('no lone pile');
    const lost = [lose('createFolder'), lose('update'), lose('createText', (a) => a[1] === 'Pile note.md')];
    await expect(vault.updatePile(lone.id, 'From the dentist')).resolves.toMatchObject({ path: expect.stringMatching(/From the dentist$/) });
    expect(lost.map((n) => n())).toEqual([1, 1, 1]);
    expect((await drive.listAll(root)).filter((f) => f.folder && f.name.endsWith('From the dentist'))).toHaveLength(1);
  });

  it('a pile renamed for its new words, its answer lost, is resolved by its stamp', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const pile = (await vault.piles()).find((p) => p.path && p.text.startsWith('Job offer'));
    if (!pile) throw new Error('no pile');
    const lost = lose('update', (a) => typeof (a[1] as { name?: string }).name === 'string');
    await expect(vault.updatePile(pile.id, 'Flat near the new job')).resolves.toMatchObject({ text: 'Flat near the new job' });
    expect(lost()).toBe(1);
  });

  it('a declared pile whose folder and note answers were lost is made once by their reserved ids', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const uploader = declaring();
    const lost = [lose('createFolder', (a) => typeof a[1] === 'string' && a[1].endsWith('Papers from Alex')), lose('createText', (a) => a[1] === 'Pile note.md')];
    await expect(uploader.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf'), pdf('b.pdf')] })).resolves.toMatchObject({ path: expect.stringMatching(/Papers from Alex$/) });
    await uploader.settled();
    expect(lost.map((n) => n())).toEqual([1, 1]);
    const folders = (await drive.listAll(root)).filter((f) => f.folder && f.name.endsWith('Papers from Alex'));
    expect(folders).toHaveLength(1);
    expect((await drive.listAll(folders[0]?.id ?? '')).filter((f) => f.name === 'Pile note.md')).toHaveLength(1);
  });

  it('a missing pile note written again, its answer lost, is made once by its reserved id', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const uploader = declaring();
    const pile = await uploader.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf'), pdf('b.pdf')] });
    await uploader.settled();
    const folder = (await drive.listAll(root)).find((f) => f.folder && f.name.endsWith('Papers from Alex'));
    const note = (await drive.listAll(folder?.id ?? '')).find((f) => f.name === 'Pile note.md');
    await contextNeverCreated([note?.id ?? '']);
    const lost = lose('createText', (a) => a[1] === 'Pile note.md');
    await expect(declaring().retryPile(pile.id)).resolves.toBeUndefined();
    expect(lost()).toBe(1);
    expect((await drive.listAll(folder?.id ?? '')).filter((f) => f.name === 'Pile note.md')).toHaveLength(1);
  });

  it('a link and an empty thing sent with lost answers arrive once by their reserved ids, with no second try', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const lost = [lose('createText', (a) => String(a[1]).endsWith('.url')), lose('createText', (a) => a[1] === 'blank.txt')];
    const p = await vault.addPile({
      text: 'Car insurance',
      items: [
        { name: 'insurer.example/renewal', kind: 'link', origin: 'A link you pasted', url: 'https://insurer.example/renewal' },
        { name: 'blank.txt', kind: 'other', origin: 'From this computer' },
      ],
    });
    await vault.settled();
    expect(lost.map((n) => n())).toEqual([1, 1]);
    expect((await vault.piles()).find((x) => x.id === p.id)?.items.map((i) => i.upload)).toEqual([undefined, undefined]);
    const all = await drive.listAll(root);
    expect(all.filter((f) => f.name.endsWith('.url') && f.name.startsWith('insurer.example'))).toHaveLength(1);
    expect(all.filter((f) => f.name === 'blank.txt')).toHaveLength(1);
  });

  it('a link refused with a 4xx lets its id go, and Try again sends it under a new one', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const create = drive.createText.bind(drive);
    const sentWith: Array<string | undefined> = [];
    let refuse = true;
    // Drive refuses the link's file outright the first time (a 4xx, permanent in the transport's table).
    drive.createText = async (...a: Parameters<FakeDrive['createText']>) => {
      if (a[1].endsWith('.url')) {
        sentWith.push(a[4]);
        if (refuse) {
          refuse = false;
          throw driveFailure('unknown', 'permanent');
        }
      }
      return create(...a);
    };
    const p = await vault.addPile({ text: 'Car insurance', items: [{ name: 'insurer.example/renewal', kind: 'link', origin: 'A link you pasted', url: 'https://insurer.example/renewal' }] });
    await vault.settled();
    expect((await vault.piles()).find((x) => x.id === p.id)?.items.map((i) => i.upload)).toEqual([-1]);
    await vault.retryPile(p.id);
    await vault.settled();
    // The refused id was let go (TL-P4-14 addendum 13): the try again carries a new one, and makes one file with it.
    expect(sentWith).toHaveLength(2);
    expect(sentWith.every((id) => typeof id === 'string')).toBe(true);
    expect(sentWith[1]).not.toBe(sentWith[0]);
    expect((await drive.listAll(root)).filter((f) => f.name.startsWith('insurer.example') && f.name.endsWith('.url')).map((f) => f.id)).toEqual([sentWith[1]]);
  });

  it('a system folder made with a lost answer is found by its reserved id', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const lost = lose('createFolder', (a) => a[1] === 'piles');
    const uploader = declaring();
    await expect(uploader.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf')] })).resolves.toMatchObject({ text: 'Papers from Alex' });
    await uploader.settled();
    expect(lost()).toBe(1);
    expect((await drive.listAll(root)).filter((f) => f.folder && f.name === 'piles')).toHaveLength(1);
  });
});

describe('c4-app-fence: every app write of an existing file is checked still as seen right before it is sent', () => {
  const ELSEWHERE = ['parents', 'name', 'gone', 'modified'];
  const declaring = (): DriveVault => new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true });
  const pdf = (name: string): { name: string; kind: 'pdf'; origin: string; body: Blob } => ({ name, kind: 'pdf', origin: 'From this computer', body: new Blob([`%PDF ${name}`]) });
  /** Moves a file into Projects directly in Drive, as another device would. */
  const moveElsewhere = async (id: string): Promise<void> => {
    const f = await drive.get(id);
    await drive.update(id, { addParent: await idOf('Projects'), ...(f.parents[0] ? { removeParent: f.parents[0] } : {}) });
  };
  /** Writes new words into a file directly in Drive, as another device would. */
  const editElsewhere = async (id: string, edit: (text: string) => string): Promise<void> => {
    await drive.writeText(id, edit(await drive.readText(id)), (await drive.get(id)).modifiedTime);
  };
  const declarationCopies = async (): Promise<string[]> => (await drive.listAll(root)).filter((f) => f.name.startsWith('declaration-')).map((f) => f.id);
  const lonePile = async (v: DriveVault = vault): Promise<{ id: string; path: string }> => {
    const p = (await v.piles()).find((x) => x.path === 'Inbox/Dentist reminder.pdf');
    if (!p?.path) throw new Error('no lone pile');
    return { id: p.id, path: p.path };
  };
  const textPile = async (): Promise<{ id: string; path: string; note: string }> => {
    const p = (await vault.piles()).find((x) => x.path && x.text.startsWith('Job offer'));
    if (!p?.path) throw new Error('no pile with a note');
    return { id: p.id, path: p.path, note: await idOf(`${p.path}/Pile note.md`) };
  };
  /** A declared loose thing, arrived, listed by `v`. */
  const declaredLoose = async (v: DriveVault): Promise<string> => {
    const p = await v.addPile({ text: '', items: [pdf('Lease scan.pdf')] });
    await v.settled();
    await v.flushJournal();
    await v.piles();
    return p.id;
  };

  interface Row {
    name: string;
    /** Passes today too: the method already checked its target before this entry. */
    control?: boolean;
    /** Lists, changes the target in Drive, and gives the write to try. */
    arrange: () => Promise<() => Promise<unknown>>;
  }
  const rows: Row[] = [
    { name: 'trash of a note (drive-vault 429)', arrange: async () => {
      await vault.tree();
      await moveElsewhere(await idOf(PASSPORT));
      return () => vault.trash(PASSPORT);
    } },
    { name: 'trash of an Inbox pile (drive-vault 400)', arrange: async () => {
      await vault.tree();
      await moveElsewhere(await idOf('Inbox/Dentist reminder.pdf'));
      return () => vault.trash('Inbox/Dentist reminder.pdf');
    } },
    { name: 'removePile (drive-vault 1024)', arrange: async () => {
      const p = await lonePile();
      await moveElsewhere(await idOf(p.path));
      return () => vault.removePile(p.id);
    } },
    { name: 'removePile of a declared thing: its declaration copies (drive-vault 703)', arrange: async () => {
      const v = declaring();
      const id = await declaredLoose(v);
      const [copy] = await declarationCopies();
      if (!copy) throw new Error('no declaration copy');
      await drive.update(copy, { name: 'declaration-renamed.json' });
      return () => v.removePile(id);
    } },
    { name: 'updatePile of a declared thing given words: its declaration copies (drive-vault 1089)', arrange: async () => {
      const v = declaring();
      const id = await declaredLoose(v);
      const [copy] = await declarationCopies();
      if (!copy) throw new Error('no declaration copy');
      await drive.update(copy, { name: 'declaration-renamed.json' });
      return () => v.updatePile(id, 'Lease for the new flat');
    } },
    { name: 'updatePile: its note renamed elsewhere, then its words cleared (drive-vault 1078/1112)', arrange: async () => {
      const p = await textPile();
      await drive.update(p.note, { name: 'Pile note (Alex).md' });
      return () => vault.updatePile(p.id, '');
    } },
    { name: 'updatePile: its note edited elsewhere (drive-vault 1078)', arrange: async () => {
      const p = await textPile();
      await editElsewhere(p.note, () => 'Job offer, words from another device');
      return () => vault.updatePile(p.id, 'Job offer and the flat');
    } },
    { name: 'restore (Undo of a Bin) of a file taken out of the Bin elsewhere (drive-vault 465)', arrange: async () => {
      await vault.tree();
      const id = await idOf(PASSPORT);
      await vault.trash(PASSPORT);
      await drive.untrash(id);
      return () => vault.restore(PASSPORT);
    } },
    { name: 'content write: a task ticked over a note edited elsewhere (drive-vault 493)', arrange: async () => {
      await vault.note(PASSPORT);
      await editElsewhere(await idOf(PASSPORT), (t) => t.replace('Photo form', 'Photo form (Alex)'));
      return () => vault.toggleTask(PASSPORT, 4);
    } },
    { name: 'move (control, drive-vault 326)', control: true, arrange: async () => {
      await vault.tree();
      await drive.update(await idOf(PASSPORT), { name: 'Passport.md' });
      return () => vault.move(PASSPORT, 'Projects');
    } },
    { name: 'rename (control, drive-vault 347)', control: true, arrange: async () => {
      await vault.tree();
      await moveElsewhere(await idOf(PASSPORT));
      return () => vault.rename(PASSPORT, 'Passport 2026');
    } },
  ];

  it.each(rows)('every app write of an existing file refuses one that changed name or place elsewhere: $name', async ({ arrange }) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const act = await arrange();
    const before = await drive.snapshot();
    const e: unknown = await act().then(() => null, (err: unknown) => err);
    expect(e).toBeInstanceOf(BowerError);
    expect(ELSEWHERE).toContain(notAsSeenReason(e));
    expect((e as BowerError).message).toBe('This changed somewhere else. Look again and try once more.');
    expect(await drive.snapshot()).toBe(before);
  });

  it('every app write of an existing file reads it fresh in the same call', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const d = drive as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
    // Since the last change sent to Drive, the ids read by id (`byId`: a get that sees the Bin too).
    let fresh = new Set<string>();
    const unread: string[] = [];
    const get = d.get?.bind(drive);
    if (!get) throw new Error('no get');
    d.get = async (...a: unknown[]) => {
      const out = await get(...a);
      if ((a[1] as { binned?: boolean } | undefined)?.binned) fresh.add(a[0] as string);
      return out;
    };
    for (const k of ['trash', 'untrash', 'update', 'writeText', 'createText', 'createFolder', 'upload']) {
      const real = d[k]?.bind(drive);
      if (!real) continue;
      d[k] = async (...a: unknown[]) => {
        if (['trash', 'untrash', 'update', 'writeText'].includes(k) && !fresh.has(a[0] as string)) unread.push(`${k} ${drive.pathOf(a[0] as string, root)}`);
        fresh = new Set();
        return real(...a);
      };
    }
    await vault.tree();
    await vault.move(PASSPORT, 'Projects');
    await vault.rename('Projects/Passport renewal.md', 'Passport 2026');
    await vault.toggleTask('Projects/Passport 2026.md', 4);
    await vault.trash('Projects/Passport 2026.md');
    await vault.restore('Projects/Passport 2026.md');
    const p = await textPile();
    await vault.updatePile(p.id, 'Job offer and the flat');
    await vault.removePile((await lonePile()).id);
    await vault.restore('Inbox/Dentist reminder.pdf');
    await vault.trash('Inbox/Dentist reminder.pdf');
    await vault.flushJournal();
    expect(unread).toEqual([]);
  });

  it('a fence read with no answer refuses with notReadError', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await vault.tree();
    const get = drive.get.bind(drive);
    drive.get = async () => {
      drive.get = get;
      throw driveError('offline');
    };
    const before = await drive.snapshot();
    const e: unknown = await vault.trash(PASSPORT).then(() => null, (err: unknown) => err);
    expect(notRead(e)).toBe(true);
    expect(notAsSeenReason(e)).toBeNull();
    expect(await drive.snapshot()).toBe(before);
  });

  it('a lost answer whose file already holds the write resolves without a resend', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await vault.tree();
    await vault.trash(PASSPORT);
    const untrash = drive.untrash.bind(drive);
    const get = drive.get.bind(drive);
    let sent = 0;
    // The restore lands, its answer is lost, and the read that would resolve it gets no answer either.
    const counted = async (...a: Parameters<FakeDrive['untrash']>): Promise<DriveFile> => {
      sent++;
      return untrash(...a);
    };
    drive.untrash = async (...a) => {
      await counted(...a);
      drive.untrash = counted;
      drive.get = async () => {
        drive.get = get;
        throw driveError('offline');
      };
      throw driveError('offline');
    };
    await expect(vault.restore(PASSPORT)).rejects.toMatchObject({ code: 'offline' });
    // Alex presses Undo again: the file holds that restore, so it resolves as landed and nothing is sent again.
    await expect(vault.restore(PASSPORT)).resolves.toBeUndefined();
    expect(sent).toBe(1);
    expect(drive.dump(root).has(PASSPORT)).toBe(true);
  });

  it('unbin expects the file in the Bin', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await vault.tree();
    const id = await idOf(PASSPORT);
    await vault.trash(PASSPORT);
    const untrash = vi.spyOn(drive, 'untrash');
    // Taken out of the Bin elsewhere: Undo must not act on it.
    await drive.untrash(id);
    untrash.mockClear();
    await expect(vault.restore(PASSPORT)).rejects.toSatisfy((e: unknown) => notAsSeenReason(e) === 'gone');
    expect(untrash).not.toHaveBeenCalled();
  });

  /**
   * The first call of `k` that `when` picks lands; its answer is lost, and so is the read that would find it. With
   * `meanwhile`, that read gets its answer instead, and `meanwhile` (a change elsewhere) runs before it.
   */
  function loseWithRead(k: 'update' | 'writeText' | 'trash' | 'untrash', when: (args: unknown[]) => boolean = () => true, meanwhile?: () => Promise<void>): () => number {
    const d = drive as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
    const real = d[k]?.bind(drive);
    if (!real) throw new Error(`no ${k}`);
    let lost = 0;
    d[k] = async (...a: unknown[]) => {
      const out = await real(...a);
      if (lost > 0 || !when(a)) return out;
      lost++;
      if (meanwhile) {
        await meanwhile();
        throw driveError('offline');
      }
      const get = drive.get.bind(drive);
      drive.get = async () => {
        drive.get = get;
        throw driveError('offline');
      };
      throw driveError('offline');
    };
    return () => lost;
  }

  it('every app write of an existing file refuses one that changed name or place elsewhere: restore rename (467)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await vault.tree();
    const id = await idOf(PASSPORT);
    await vault.trash(PASSPORT);
    await vault.create('Areas/Documents', 'note', 'Passport renewal.md');
    // Renamed in the Bin elsewhere before Bower takes it out under a free name (one write, TL-P4-24 addendum 7).
    await drive.untrash(id);
    await drive.update(id, { name: 'Passport (Alex).md' });
    await drive.trash(id);
    const e: unknown = await vault.restore(PASSPORT).then(() => null, (err: unknown) => err);
    expect(ELSEWHERE).toContain(notAsSeenReason(e));
    expect(await drive.get(id, { binned: true })).toMatchObject({ name: 'Passport (Alex).md', trashed: true });
  });

  it('every app write of an existing file refuses one that changed name or place elsewhere: late upload (1544)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let release: () => void = () => undefined;
    const slow = new Promise<void>((r) => (release = r));
    let lateId = '';
    let started: () => void = () => undefined;
    const onItsWay = new Promise<void>((r) => (started = r));
    holdChunks(drive, slow, true, (file) => { lateId = file.id; started(); });
    const p = await vault.addPile({ text: 'Late papers', items: [{ name: 'late.pdf', kind: 'pdf', origin: 'x', body: new Blob(['x']) }] });
    await onItsWay;
    await vault.trash(p.path ?? '');
    // Filed elsewhere in Drive before its answer comes: it is not Bower's to put in the Bin.
    await moveElsewhere(lateId);
    release();
    await vault.settled();
    expect((await drive.get(lateId, { binned: true })).trashed).toBeFalsy();
    expect(drive.pathOf(lateId, root)).toBe('Projects/late.pdf');
  });

  it('a restore whose rename landed but lost its answer resolves on the second press', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await vault.tree();
    await vault.trash(PASSPORT);
    await vault.create('Areas/Documents', 'note', 'Passport renewal.md');
    // The rename is the untrash's own name now (one write, TL-P4-24 addendum 7): that write's answer is the one lost.
    const lost = loseWithRead('untrash', (a) => typeof a[2] === 'string');
    await expect(vault.restore(PASSPORT)).rejects.toMatchObject({ code: 'offline' });
    expect(lost()).toBe(1);
    await expect(vault.restore(PASSPORT)).resolves.toBeUndefined();
    expect((await drive.listAll(root)).filter((f) => f.name.startsWith('Passport renewal') && drive.pathOf(f.id, root).startsWith('Areas/Documents/'))).toHaveLength(2);
  });

  it('an updatePile folder rename that landed but lost its answer lets the retry finish', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const p = await textPile();
    const lost = loseWithRead('update', (a) => typeof (a[1] as { name?: string }).name === 'string');
    await expect(vault.updatePile(p.id, 'Flat near the new job')).rejects.toMatchObject({ code: 'offline' });
    expect(lost()).toBe(1);
    await expect(vault.updatePile(p.id, 'Flat near the new job')).resolves.toMatchObject({ text: 'Flat near the new job' });
    expect((await drive.listAll(root)).filter((f) => f.folder && f.name.endsWith('Flat near the new job'))).toHaveLength(1);
  });

  it('clearing a pile\'s words that landed but lost its answer resolves on retry: an ordinary pile\'s note Bin', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const p = await textPile();
    const lost = loseWithRead('trash');
    await expect(vault.updatePile(p.id, '')).rejects.toMatchObject({ code: 'offline' });
    expect(lost()).toBe(1);
    await expect(vault.updatePile(p.id, '')).resolves.toMatchObject({ text: '' });
    expect((await drive.get(p.note, { binned: true })).trashed).toBe(true);
  });

  it('clearing a pile\'s words that landed but lost its answer resolves on retry: a declared pile\'s empty note', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const v = declaring();
    const made = await v.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf')] });
    await v.settled();
    await v.flushJournal();
    await v.piles();
    const note = await idOf(`${made.path ?? ''}/Pile note.md`);
    const lost = loseWithRead('writeText', (a) => a[0] === note);
    await expect(v.updatePile(made.id, '')).rejects.toMatchObject({ code: 'offline' });
    expect(lost()).toBe(1);
    await expect(v.updatePile(made.id, '')).resolves.toMatchObject({ text: '' });
    expect(await drive.readText(note)).toBe('');
  });

  it('an emptied pile note that landed and then moved elsewhere is refused on retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const v = declaring();
    const made = await v.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf')] });
    await v.settled();
    await v.flushJournal();
    await v.piles();
    const note = await idOf(`${made.path ?? ''}/Pile note.md`);
    const lost = loseWithRead('writeText', (a) => a[0] === note);
    await expect(v.updatePile(made.id, '')).rejects.toMatchObject({ code: 'offline' });
    expect(lost()).toBe(1);
    // Filed into Projects in Drive before the retry: no longer the pile's note, so the retry is no success.
    await moveElsewhere(note);
    const e: unknown = await v.updatePile(made.id, '').then(() => null, (err: unknown) => err);
    expect(ELSEWHERE).toContain(notAsSeenReason(e));
    expect(drive.pathOf(note, root)).toBe('Projects/Pile note.md');
  });

  it('a lost answer whose file changed before the recovery read is not reported as landed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // A restore under a free name lands, its answer is lost, and another device renames it before Bower reads it back.
    await vault.tree();
    const id = await idOf(PASSPORT);
    await vault.trash(PASSPORT);
    await vault.flushJournal();
    await vault.create('Areas/Documents', 'note', 'Passport renewal.md');
    const renamed = loseWithRead('untrash', (a) => a[0] === id && typeof a[2] === 'string', async () => {
      await drive.update(id, { name: 'Passport (Alex).md' });
    });
    await expect(vault.restore(PASSPORT)).rejects.toMatchObject({ code: 'conflict' });
    expect(renamed()).toBe(1);
    expect((await drive.get(id, { binned: true })).name).toBe('Passport (Alex).md');
    // A pile note emptied, its answer lost, and filed into Projects by another device before Bower reads it back.
    const v = declaring();
    const made = await v.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf')] });
    await v.settled();
    await v.flushJournal();
    await v.piles();
    const note = await idOf(`${made.path ?? ''}/Pile note.md`);
    const moved = loseWithRead('writeText', (a) => a[0] === note, () => moveElsewhere(note));
    await expect(v.updatePile(made.id, '')).rejects.toMatchObject({ code: 'conflict' });
    expect(moved()).toBe(1);
    expect(drive.pathOf(note, root)).toBe('Projects/Pile note.md');
  });

  /**
   * The fast-check trial (TL-P4-20): every app write of an existing file, its answer lost (or a later step of the same
   * press failing), with a move, a rename or a Bin in Drive before the write, between the lost answer and the read that
   * looks for it (TL-P4-24 addendum 8), or between the press and its retry. On
   * every press: success only when the file is in the state the write intends, and no write to a file that is not as
   * the press read it (by name, place and Bin, and for text by its modifiedTime). With no change elsewhere, the retry
   * of a landed write succeeds. Seeded and bounded, so every run is the same.
   */
  it('every app write, its answer lost, against a move, rename or Bin elsewhere: success only in the intended state', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    type Op = 'update' | 'writeText' | 'trash' | 'untrash';
    interface Press {
      vault: DriveVault;
      target: string;
      /** The write's own file as the press read it. */
      read: DriveFile;
      /** A content write: its modifiedTime is part of what it read. */
      withTime: boolean;
      act: () => Promise<unknown>;
      op: Op;
      /** Whether the file now is what this write makes it; `sent` is the last write to it this press sent. */
      final: (now: DriveFile, sent: unknown[] | undefined) => Promise<boolean>;
    }
    const kinds = ['text', 'empty text', 'rename', 'move', 'bin', 'unbin', 'restore', 'removePile'] as const;
    const stored = (id: string): Promise<DriveFile> => drive.get(id, { binned: true });
    const samePlace = (a: DriveFile, b: DriveFile): boolean => a.parents.length === b.parents.length && a.parents.every((p) => b.parents.includes(p));
    const asRead = (p: Press, now: DriveFile): boolean =>
      now.name === p.read.name && samePlace(now, p.read) && !!now.trashed === !!p.read.trashed && (!p.withTime || now.modifiedTime === p.read.modifiedTime);
    const out = (now: DriveFile, read: DriveFile, name = read.name): boolean => !now.trashed && now.name === name && samePlace(now, read);
    const binned = (now: DriveFile, read: DriveFile): boolean => !!now.trashed && now.name === read.name && samePlace(now, read);
    const press = async (kind: (typeof kinds)[number]): Promise<Press> => {
      await vault.tree();
      const passport = await idOf(PASSPORT);
      if (kind === 'text') {
        await vault.note(PASSPORT);
        const read = await stored(passport);
        return { vault, target: passport, read, withTime: true, act: () => vault.toggleTask(PASSPORT, 4), op: 'writeText',
          final: async (now, sent) => out(now, read) && sent !== undefined && (await drive.readText(passport)) === sent[1] };
      }
      if (kind === 'empty text') {
        const v = declaring();
        const made = await v.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf')] });
        await v.settled();
        await v.flushJournal();
        await v.piles();
        const note = await idOf(`${made.path ?? ''}/Pile note.md`);
        const read = await stored(note);
        return { vault: v, target: note, read, withTime: true, act: () => v.updatePile(made.id, ''), op: 'writeText', final: async (now) => out(now, read) && (await drive.readText(note)) === '' };
      }
      if (kind === 'rename' || kind === 'move' || kind === 'bin') {
        const read = await stored(passport);
        const projects = await idOf('Projects');
        const act = kind === 'rename' ? () => vault.rename(PASSPORT, 'Passport 2026') : kind === 'move' ? () => vault.move(PASSPORT, 'Projects') : () => vault.trash(PASSPORT);
        const final = async (now: DriveFile): Promise<boolean> =>
          kind === 'rename' ? out(now, read, 'Passport 2026.md') : kind === 'move' ? !now.trashed && now.name === read.name && samePlace(now, { ...read, parents: [projects] }) : binned(now, read);
        return { vault, target: passport, read, withTime: false, act, op: kind === 'bin' ? 'trash' : 'update', final };
      }
      if (kind === 'unbin' || kind === 'restore') {
        await vault.trash(PASSPORT);
        await vault.flushJournal();
        if (kind === 'restore') await vault.create('Areas/Documents', 'note', 'Passport renewal.md');
        const read = await stored(passport);
        const taken = kind === 'restore' ? await idOf(PASSPORT) : null;
        const final = async (now: DriveFile): Promise<boolean> => (taken ? !now.trashed && samePlace(now, read) && now.name !== read.name && now.name.startsWith('Passport renewal') : out(now, read));
        return { vault, target: passport, read, withTime: false, act: () => vault.restore(PASSPORT), op: 'untrash', final };
      }
      if (kind === 'removePile') {
        const p = await lonePile();
        const id = await idOf(p.path);
        const read = await stored(id);
        return { vault, target: id, read, withTime: false, act: () => vault.removePile(p.id), op: 'trash', final: async (now) => binned(now, read) };
      }
      throw new Error(`no press for ${kind}`);
    };
    /** The pretend Drive's own writes, as another device makes them: never lost, never counted as the press's. */
    type Raw = Pick<FakeDrive, 'update' | 'trash' | 'untrash'>;
    /** A move, a rename or a Bin of `id` directly in Drive, as another device would (a file in the Bin, renamed there). */
    const elsewhere = async (raw: Raw, change: 'none' | 'move' | 'rename' | 'bin', id: string): Promise<void> => {
      const now = await stored(id);
      if (change === 'none' || (change === 'bin' && now.trashed)) return;
      if (now.trashed) await raw.untrash(id);
      if (change === 'bin') await raw.trash(id);
      else await raw.update(id, change === 'move' ? { addParent: root, ...(now.parents[0] ? { removeParent: now.parents[0] } : {}) } : { name: `Changed elsewhere (Alex)${now.name.includes('.') ? now.name.slice(now.name.lastIndexOf('.')) : ''}` });
      if (now.trashed && change !== 'bin') await raw.trash(id);
    };
    /** How a press ended: done, refused as changed elsewhere (the person looks again, a new read), or failed. */
    const settle = (p: Promise<unknown>): Promise<'done' | 'refused' | 'failed'> => p.then(() => 'done' as const, (e: unknown) => {
      if (!(e instanceof BowerError)) throw e;
      return notAsSeenReason(e) === null ? 'failed' as const : 'refused' as const;
    });

    // Every case met: each kind, change and moment, and for a restore each loss (120 in all, for this seed).
    const met = new Set<string>();
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...kinds),
        fc.constantFrom('none', 'move', 'rename', 'bin'),
        fc.constantFrom('before the write', 'before the recovery read', 'before the retry'),
        fc.constantFrom('its answer', 'a later step'),
        async (kind, change, when, loss) => {
          met.add([kind, change, when, ...(kind === 'unbin' || kind === 'restore' ? [loss] : [])].join(' / '));
          localStorage.clear();
          drive = new FakeDrive();
          root = (await seedFakeDrive(drive, 'default', Date.now())) ?? '';
          vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
          const p = await press(kind);
          const raw: Raw = { update: drive.update.bind(drive), trash: drive.trash.bind(drive), untrash: drive.untrash.bind(drive) };
          // Every write to the file this press changes, as sent.
          const sends: unknown[][] = [];
          const d = drive as unknown as Record<Op, (...a: unknown[]) => Promise<unknown>>;
          for (const k of ['update', 'writeText', 'trash', 'untrash'] as const) {
            const real = d[k].bind(drive);
            d[k] = async (...a: unknown[]) => {
              if (a[0] === p.target) sends.push(a);
              return real(...a);
            };
          }
          if (loss === 'a later step' && p.op === 'untrash') {
            // The file comes out of the Bin; taking the change line back then gets no answer.
            const trash = d.trash;
            d.trash = async (...a: unknown[]) => {
              if (a[0] === p.target) return trash(...a);
              d.trash = trash;
              if (when === 'before the recovery read') await elsewhere(raw, change, p.target);
              throw driveError('offline');
            };
          } else if (when === 'before the recovery read') loseWithRead(p.op, (a) => a[0] === p.target, () => elsewhere(raw, change, p.target));
          else loseWithRead(p.op, (a) => a[0] === p.target);
          const tryOnce = async (): Promise<'done' | 'refused' | 'failed'> => {
            const before = await stored(p.target);
            const from = sends.length;
            const ended = await settle(p.act());
            const mine = sends.slice(from);
            // Not as the press read it: nothing is written to it.
            if (!asRead(p, before)) expect(mine).toEqual([]);
            // Success only in the state the write intends.
            if (ended === 'done') expect(await p.final(await stored(p.target), sends.at(-1))).toBe(true);
            return ended;
          };
          if (when === 'before the write') await elsewhere(raw, change, p.target);
          // Refused, the person looks again: what they press next is a new read, no retry of this one. Done (its lost
          // answer found again by the read that looks for it), there is nothing to retry.
          const first = await tryOnce();
          if (first === 'refused' || first === 'done') return;
          if (when === 'before the retry') await elsewhere(raw, change, p.target);
          const retried = await tryOnce();
          // A landed write, nothing changed elsewhere: the retry resolves (TL-P4-24 addendum 4).
          if (change === 'none') expect(retried).toBe('done');
        },
      ),
      { seed: 20261009, numRuns: 1200 },
    );
    expect(met.size).toBe(120);
  }, 60_000);
});

/**
 * c4-create-landed (TL-P4-24 addendum 10): an app create found again by its reserved id counts only when it `landed`,
 * at the name and place it was sent with, out of the Bin, with its bytes. One that happened and has since moved, been
 * renamed or binned elsewhere is refused (CHANGED_ELSEWHERE): nothing is written to it or moved into it, nothing is made
 * again on that press, and it stays where the person put it.
 */
describe('c4-create-landed: an app create found by its reserved id counts only as it was made', () => {
  afterEach(() => { vi.useRealTimers(); });

  type Made = 'createText' | 'createFolder';
  /** The first create `when` picks lands; its answer is lost and so is the read that would find it (or, with `meanwhile`, that runs first). */
  function loseCreate(k: Made, when: (args: unknown[]) => boolean, meanwhile?: (id: string) => Promise<void>): { lost: () => number; id: () => string | undefined } {
    const d = drive as unknown as Record<Made, (...a: unknown[]) => Promise<DriveFile>>;
    const real = d[k].bind(drive);
    let lost = 0;
    let made: string | undefined;
    d[k] = async (...a: unknown[]) => {
      const out = await real(...a);
      if (lost > 0 || !when(a)) return out;
      lost++;
      made = out.id;
      if (meanwhile) await meanwhile(out.id);
      else {
        const get = drive.get.bind(drive);
        drive.get = async () => {
          drive.get = get;
          throw driveError('offline');
        };
      }
      throw driveError('offline');
    };
    return { lost: () => lost, id: () => made };
  }
  const intoProjects = async (id: string): Promise<void> => {
    const f = await drive.get(id, { binned: true });
    await drive.update(id, { addParent: await idOf('Projects'), ...(f.parents[0] ? { removeParent: f.parents[0] } : {}) });
  };
  const failed = (p: Promise<unknown>): Promise<unknown> => p.then(() => null, (e: unknown) => e);

  it('a pile note whose create landed and then moved is refused on retry and not written in its new place', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await vault.tree();
    const pile = (await vault.piles()).find((p) => p.path && p.text.startsWith('Job offer'));
    if (!pile?.path) throw new Error('no pile');
    const folder = await idOf(pile.path);
    await contextNeverCreated((await drive.listAll(folder)).filter((f) => f.name === 'Pile note.md').map((f) => f.id));
    await vault.refresh();
    const lost = loseCreate('createText', (a) => a[1] === 'Pile note.md');
    await expect(vault.updatePile(pile.id, 'Job offer papers')).rejects.toMatchObject({ code: 'offline' });
    const note = lost.id() ?? '';
    // Alex files the landed note into Projects in Drive before this page lists the folder again.
    await intoProjects(note);
    const e = await failed(vault.updatePile(pile.id, 'Job offer, signed papers'));
    expect({ reason: notAsSeenReason(e), message: (e as BowerError | null)?.message }).toEqual({ reason: 'parents', message: CHANGED_ELSEWHERE });
    // It stays where Alex put it, with its first words; the pile gets no second note on that press.
    expect({ path: drive.pathOf(note, root), text: await drive.readText(note) }).toEqual({ path: 'Projects/Pile note.md', text: 'Job offer papers' });
    expect((await drive.listAll(folder)).filter((f) => f.name === 'Pile note.md' && !f.trashed)).toEqual([]);
  });

  it('a pile folder whose create landed and then moved is refused on retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await vault.tree();
    const lone = (await vault.piles()).find((x) => x.path === 'Inbox/Dentist reminder.pdf');
    if (!lone?.path) throw new Error('no lone pile');
    const thing = await idOf(lone.path);
    const lost = loseCreate('createFolder', (a) => typeof a[2] === 'object' && a[2] !== null && 'pile' in a[2]);
    await expect(vault.updatePile(lone.id, 'Dentist papers')).rejects.toMatchObject({ code: 'offline' });
    const made = lost.id() ?? '';
    expect(lost.lost()).toBe(1);
    // Alex moves the empty folder into Projects in Drive.
    await intoProjects(made);
    const e = await failed(vault.updatePile(lone.id, 'Dentist papers'));
    expect({ reason: notAsSeenReason(e), message: (e as BowerError | null)?.message }).toEqual({ reason: 'parents', message: CHANGED_ELSEWHERE });
    // Nothing moved into Alex's folder: the thing stays in the inbox, and the folder stays empty where Alex put it.
    expect(drive.pathOf(thing, root)).toBe('Inbox/Dentist reminder.pdf');
    expect(await drive.listAll(made)).toEqual([]);
    expect((await drive.get(made, { binned: true })).parents).toEqual([await idOf('Projects')]);
    // The id was let go: the next press makes a new folder in the inbox.
    await vault.refresh();
    await expect(vault.updatePile(lone.id, 'Dentist papers')).resolves.toMatchObject({ text: 'Dentist papers' });
    expect(drive.pathOf(thing, root)?.startsWith('Inbox/')).toBe(true);
    expect((await drive.get(thing)).parents).not.toEqual([made]);
  });
  // Fix round 1 (TL-P4-24 addendum 16): a retry resends the intent kept with the reserved id, never a name picked anew.
  it('a create whose answer and recovery read were lost is made once after a refresh and a retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await vault.tree();
    const cooking = await idOf('Resources/Cooking');
    const untitled = async (): Promise<string[]> => (await drive.listAll(cooking)).filter((f) => !f.trashed && f.name.startsWith('Untitled')).map((f) => f.name);
    expect(await untitled()).toEqual([]);
    const lost = loseCreate('createText', (a) => a[1] === 'Untitled.md');
    await expect(vault.create('Resources/Cooking', 'note')).rejects.toMatchObject({ code: 'offline' });
    expect(lost.lost()).toBe(1);
    // The folder is listed again: the landed note is in it, under the name it was sent with.
    await vault.refresh();
    await expect(vault.create('Resources/Cooking', 'note')).resolves.toBe('Resources/Cooking/Untitled.md');
    // One file, the one the first press made: not a second copy under the next free name.
    expect({ names: await untitled(), path: drive.pathOf(lost.id() ?? '', root) }).toEqual({ names: ['Untitled.md'], path: 'Resources/Cooking/Untitled.md' });
  });

  it('a pile-folder create resumed after a refresh across UTC midnight keeps its first name', async () => {
    vi.setSystemTime(new Date('2026-10-10T00:02:00Z'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    drive = new FakeDrive();
    root = (await seedFakeDrive(drive, 'default', Date.now())) ?? '';
    vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
    await vault.tree();
    const lone = (await vault.piles()).find((p) => p.path === 'Inbox/Dentist reminder.pdf');
    if (!lone?.path) throw new Error('no lone pile');
    const thing = await idOf(lone.path);
    const lost = loseCreate('createFolder', (a) => typeof a[2] === 'object' && a[2] !== null && 'pile' in a[2]);
    await expect(vault.updatePile(lone.id, 'Dentist papers')).rejects.toMatchObject({ code: 'offline' });
    expect(lost.lost()).toBe(1);
    const made = lost.id() ?? '';
    const firstName = (await drive.get(made)).name;
    expect(firstName).toBe('2026-10-09 Dentist papers');
    await vault.refresh();
    await expect(vault.updatePile(lone.id, 'Dentist papers')).resolves.toMatchObject({ text: 'Dentist papers' });
    const folders = (await drive.listAll(root)).filter((f) => f.folder && f.appProperties?.pile === lone.id);
    expect(folders.map((f) => ({ id: f.id, name: f.name }))).toEqual([{ id: made, name: firstName }]);
    expect((await drive.get(thing)).parents).toEqual([made]);
    expect(drive.pathOf(thing, root)).toBe(`Inbox/${firstName}/Dentist reminder.pdf`);
  });

  it.each(
    (['folder create', 'loose-file move', 'note create'] as const).flatMap((step) =>
      ['2026-10-09T23:59:00Z', '2026-10-10T00:02:00Z'].map((clock) => ({ step, clock })),
    ),
  )('a pile conversion interrupted at any step resumes there and keeps its first names ($step, $clock)', async ({ step, clock }) => {
    vi.setSystemTime(new Date(clock));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    drive = new FakeDrive();
    root = (await seedFakeDrive(drive, 'default', Date.now() - 20 * 60_000)) ?? '';
    vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
    await vault.tree();
    const lone = (await vault.piles()).find((p) => p.path === 'Inbox/Dentist reminder.pdf');
    if (!lone?.path) throw new Error('no lone pile');
    const thing = await idOf(lone.path);
    const createFolder = drive.createFolder.bind(drive);
    const createText = drive.createText.bind(drive);
    const update = drive.update.bind(drive);
    let interrupted = 0;
    let recoveryReadsLost = 0;
    const loseAnswer = (id: string): never => {
      interrupted++;
      const get = drive.get.bind(drive);
      drive.get = async (key, options) => {
        if (key !== id) return get(key, options);
        drive.get = get;
        recoveryReadsLost++;
        throw driveError('offline');
      };
      throw driveError('offline');
    };
    const folderCreates = vi.spyOn(drive, 'createFolder').mockImplementation(async (...args) => {
      const made = await createFolder(...args);
      if (step === 'folder create' && !interrupted && args[2]?.pile === lone.id) loseAnswer(made.id);
      return made;
    });
    const noteCreates = vi.spyOn(drive, 'createText').mockImplementation(async (...args) => {
      const made = await createText(...args);
      if (step === 'note create' && !interrupted && args[1] === 'Pile note.md') loseAnswer(made.id);
      return made;
    });
    const writes = vi.spyOn(drive, 'update').mockImplementation(async (id, patch) => {
      const made = await update(id, patch);
      if (step === 'loose-file move' && !interrupted && id === thing && patch.addParent) loseAnswer(id);
      return made;
    });
    await expect(vault.updatePile(lone.id, 'Dentist papers')).rejects.toMatchObject({ code: 'offline' });
    expect({ interrupted, recoveryReadsLost }).toEqual({ interrupted: 1, recoveryReadsLost: 1 });
    const firstFolder = (await drive.listAll(root)).find((f) => f.folder && f.appProperties?.pile === lone.id);
    if (!firstFolder) throw new Error('no conversion folder');
    expect(firstFolder.name).toBe('2026-10-09 Dentist papers');
    const firstNote = (await drive.listAll(firstFolder.id)).find((f) => f.name === 'Pile note.md');
    await vault.refresh();
    await expect(vault.updatePile(lone.id, 'Dentist papers')).resolves.toMatchObject({ text: 'Dentist papers' });
    const folders = (await drive.listAll(root)).filter((f) => f.folder && f.appProperties?.pile === lone.id);
    const notes = (await drive.listAll(firstFolder.id)).filter((f) => f.name === 'Pile note.md');
    expect({
      folders: folders.map((f) => ({ id: f.id, name: f.name })),
      parents: (await drive.get(thing)).parents,
      path: drive.pathOf(thing, root),
      notes: notes.map((f) => ({ id: firstNote ? f.id : undefined, name: f.name })),
      text: await Promise.all(notes.map((f) => drive.readText(f.id))),
      renames: writes.mock.calls.filter(([, patch]) => patch.name !== undefined),
      folderCreates: folderCreates.mock.calls.filter(([, , props]) => props?.pile === lone.id).length,
      noteCreates: noteCreates.mock.calls.filter(([, name]) => name === 'Pile note.md').length,
      moves: writes.mock.calls.filter(([id, patch]) => id === thing && patch.addParent !== undefined).length,
    }).toEqual({
      folders: [{ id: firstFolder.id, name: firstFolder.name }],
      parents: [firstFolder.id],
      path: `Inbox/${firstFolder.name}/Dentist reminder.pdf`,
      notes: [{ id: firstNote?.id, name: 'Pile note.md' }],
      text: ['Dentist papers'],
      renames: [],
      folderCreates: 1,
      noteCreates: 1,
      moves: 1,
    });
  });

  /** c4-create-newer-words: the first folder lands, but both its answer and recovery read are lost. */
  async function pendingConversionWithNewWords() {
    vi.setSystemTime(new Date('2026-10-10T00:02:00Z'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    drive = new FakeDrive();
    root = (await seedFakeDrive(drive, 'default', Date.now() - 20 * 60_000)) ?? '';
    vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
    await vault.tree();
    const lone = (await vault.piles()).find((p) => p.path === 'Inbox/Dentist reminder.pdf');
    if (!lone?.path) throw new Error('no lone pile');
    const thing = await idOf(lone.path);
    const lost = loseCreate('createFolder', (a) => typeof a[2] === 'object' && a[2] !== null && 'pile' in a[2]);
    await expect(vault.updatePile(lone.id, 'Dentist papers')).rejects.toMatchObject({ code: 'offline' });
    expect(lost.lost()).toBe(1);
    const folder = lost.id() ?? '';
    expect((await drive.get(folder)).name).toBe('2026-10-09 Dentist papers');
    expect(await drive.listAll(folder)).toEqual([]);
    await vault.refresh();
    const noteCreates = vi.spyOn(drive, 'createText');
    return { lone, thing, folder, noteCreates };
  }

  it('a retry with new words while the conversion is pending ends with the new words in Drive', async () => {
    const { lone, thing, folder, noteCreates } = await pendingConversionWithNewWords();
    const newWords = 'Dentist papers, signed';
    // Read Drive at resolution: success must wait for the newer words, not merely the held conversion.
    const atResolution = await vault.updatePile(lone.id, newWords).then(async (saved) => ({
      saved,
      words: await Promise.all((await drive.listAll(folder)).filter((f) => f.name === 'Pile note.md').map((f) => drive.readText(f.id))),
    }));
    expect(atResolution.words).toEqual([newWords]);
    expect(atResolution.saved.text).toBe(newWords);
    expect(noteCreates.mock.calls.filter(([, name]) => name === 'Pile note.md').map(([, , text]) => text)).toEqual(['Dentist papers']);
    const folders = (await drive.listAll(root)).filter((f) => f.folder && f.appProperties?.pile === lone.id);
    expect(folders.map((f) => ({ id: f.id, name: f.name }))).toEqual([{ id: folder, name: '2026-10-09 Dentist papers' }]);
    expect((await drive.get(thing)).parents).toEqual([folder]);
    expect(drive.pathOf(thing, root)).toBe('Inbox/2026-10-09 Dentist papers/Dentist reminder.pdf');
    expect((await drive.listAll(folder)).map((f) => f.name).sort()).toEqual(['Dentist reminder.pdf', 'Pile note.md']);
  });

  it('a retry with new words refuses an outside change between landing and updating', async () => {
    const { lone, thing, folder, noteCreates } = await pendingConversionWithNewWords();
    const newWords = 'Dentist papers, signed';
    const outsideWords = 'Dentist papers, edited on the laptop';
    const writeText = drive.writeText.bind(drive);
    let changed = false;
    let readTime: string | undefined;
    let outsideTime: string | undefined;
    vi.spyOn(drive, 'writeText').mockImplementation(async (...args) => {
      if (!changed && args[1] === newWords) {
        changed = true;
        readTime = args[2];
        const note = await drive.get(args[0]);
        expect(await drive.readText(note.id)).toBe('Dentist papers');
        expect((await drive.get(thing)).parents).toEqual([folder]);
        // Another device writes after the conversion lands and before the ordinary update reaches Drive.
        outsideTime = (await writeText(note.id, outsideWords, note.modifiedTime)).modifiedTime;
      }
      return writeText(...args);
    });
    await expect(vault.updatePile(lone.id, newWords)).rejects.toMatchObject({ code: 'conflict' });
    expect(changed).toBe(true);
    expect(readTime).toBeDefined();
    expect(outsideTime).not.toBe(readTime);
    expect(noteCreates.mock.calls.filter(([, name]) => name === 'Pile note.md').map(([, , text]) => text)).toEqual(['Dentist papers']);
    const notes = (await drive.listAll(folder)).filter((f) => f.name === 'Pile note.md');
    expect(notes).toHaveLength(1);
    expect(await drive.readText(notes[0]?.id ?? '')).toBe(outsideWords);
    expect((await drive.get(notes[0]?.id ?? '')).modifiedTime).toBe(outsideTime);
  });

  it('a pile-folder conversion whose file move failed after the folder landed keeps its first name and finishes', async () => {
    vi.setSystemTime(new Date('2026-10-10T00:02:00Z'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    drive = new FakeDrive();
    root = (await seedFakeDrive(drive, 'default', Date.now())) ?? '';
    vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
    await vault.tree();
    const lone = (await vault.piles()).find((p) => p.path === 'Inbox/Dentist reminder.pdf');
    if (!lone?.path) throw new Error('no lone pile');
    const thing = await idOf(lone.path);
    const lost = loseCreate('createFolder', (a) => typeof a[2] === 'object' && a[2] !== null && 'pile' in a[2]);
    await expect(vault.updatePile(lone.id, 'Dentist papers')).rejects.toMatchObject({ code: 'offline' });
    expect(lost.lost()).toBe(1);
    const made = lost.id() ?? '';
    const firstName = (await drive.get(made)).name;
    expect(firstName).toBe('2026-10-09 Dentist papers');

    await vault.refresh();
    const update = drive.update.bind(drive);
    let failedMove = false;
    const writes = vi.spyOn(drive, 'update').mockImplementation(async (id, patch) => {
      if (!failedMove && id === thing && patch.addParent === made) {
        failedMove = true;
        throw driveError('offline');
      }
      return update(id, patch);
    });
    // The folder is recovered, but the conversion's loose-file move never reaches Drive.
    await expect(vault.updatePile(lone.id, 'Dentist papers')).rejects.toMatchObject({ code: 'offline' });
    expect(failedMove).toBe(true);
    expect(drive.pathOf(thing, root)).toBe('Inbox/Dentist reminder.pdf');
    expect((await drive.get(made)).name).toBe(firstName);

    await vault.refresh();
    await expect(vault.updatePile(lone.id, 'Dentist papers')).resolves.toMatchObject({ text: 'Dentist papers' });
    const folders = (await drive.listAll(root)).filter((f) => f.folder && f.appProperties?.pile === lone.id);
    expect({
      folders: folders.map((f) => ({ id: f.id, name: f.name })),
      parents: (await drive.get(thing)).parents,
      path: drive.pathOf(thing, root),
      renames: writes.mock.calls.filter(([, patch]) => patch.name !== undefined),
    }).toEqual({
      folders: [{ id: made, name: firstName }],
      parents: [made],
      path: `Inbox/${firstName}/Dentist reminder.pdf`,
      renames: [],
    });
  });

  it('a change line whose create landed and then moved is refused, never made again, and stays where it was put', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await vault.tree();
    const lost = loseCreate('createText', (a) => String(a[1]).endsWith('.json'));
    await expect(vault.create('Resources/Cooking', 'note')).resolves.toBe('Resources/Cooking/Untitled.md');
    const line = lost.id() ?? '';
    expect(lost.lost()).toBe(1);
    await intoProjects(line);
    const name = (await drive.get(line)).name;
    // The next sends find it by its reserved id, no longer in the changes folder: refused for good, nothing made again.
    await vault.flushJournal().catch(() => undefined);
    await vault.flushJournal().catch(() => undefined);
    expect((await drive.listAll(root)).filter((f) => f.name === name).map((f) => drive.pathOf(f.id, root))).toEqual([`Projects/${name}`]);
    expect(localStorage.getItem(`bower:outbox:${root}`) ?? '').not.toContain(name.replace(/\.json$/, ''));
    // Kept among what failed, shown once (journal.ts), never counted as sent.
    expect(localStorage.getItem('bower:failed-lines') ?? '').toContain(name.replace(/\.json$/, ''));
  });

  /**
   * The fast-check trial gains the creates (TL-P4-24 addendum 10): every app create kept on its reserved id (a note, a
   * folder, a pile folder, a pile note tried again with the same words or new ones, a link), its answer lost, with a
   * move, a rename or a Bin in Drive at each moment: before the write (no file yet, so nothing to change), between the
   * lost answer and the read that looks for it, between the press and its retry, and after the folder is listed again before the retry (fix round 1). On every press: success only when
   * the file is at the name and place it was sent with, out of the Bin, with its bytes, and the path reported is where
   * it is; a file changed elsewhere is never written to, nor anything moved into it; a refused press makes nothing.
   */
  it('every app create, its answer lost, against a move, rename or Bin elsewhere: success only as it was made', async () => {
    vi.setSystemTime(new Date('2026-10-10T00:02:00Z'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const kinds = ['note', 'folder', 'pile folder', 'pile note', 'pile note, new words', 'link'] as const;
    type Kind = (typeof kinds)[number];
    type Change = 'none' | 'move' | 'rename' | 'bin';
    type When = 'before the write' | 'before the recovery read' | 'before the retry' | 'after a refresh, before the retry';
    interface Press {
      /** Which create call is this press's own. */
      mine: (k: Made, a: unknown[]) => boolean;
      /** The first press, then its retry: each resolves with the path it reports, when it reports one. */
      act: [() => Promise<string | undefined>, () => Promise<string | undefined>];
      /** The bytes each press means the file to hold, for text. */
      text?: [string, string];
    }
    const press = async (kind: Kind): Promise<Press> => {
      await vault.tree();
      if (kind === 'note' || kind === 'folder') {
        const go = (): Promise<string> => vault.create('Resources/Cooking', kind);
        return { mine: (k, a) => (kind === 'note' ? k === 'createText' && a[1] === 'Untitled.md' : k === 'createFolder' && a[1] === 'New folder'), act: [go, go], ...(kind === 'note' ? { text: ['', ''] as [string, string] } : {}) };
      }
      if (kind === 'pile folder') {
        const lone = (await vault.piles()).find((x) => x.path === 'Inbox/Dentist reminder.pdf');
        if (!lone) throw new Error('no lone pile');
        const go = async (): Promise<undefined> => void (await vault.updatePile(lone.id, 'Dentist papers'));
        return { mine: (k, a) => k === 'createFolder' && typeof a[2] === 'object' && a[2] !== null && 'pile' in a[2], act: [go, go] };
      }
      if (kind === 'link') {
        const sent = async (id: string, from: number): Promise<undefined> => {
          await vault.settled();
          // A thing on its way keeps its failure to itself (its upload mark); a refusal is the one it logged.
          const refused = logged.mock.calls.slice(from).flat().find((e) => notAsSeenReason(e) !== null);
          if (refused) throw refused;
          if ((await vault.piles()).find((x) => x.id === id)?.items.some((i) => i.upload === -1)) throw new BowerError('offline', 'Not sent.');
          return undefined;
        };
        let pile = '';
        const first = async (): Promise<undefined> => {
          const from = logged.mock.calls.length;
          pile = (await vault.addPile({ text: 'Car insurance', items: [{ name: 'insurer.example/renewal', kind: 'link', origin: 'A link you pasted', url: 'https://insurer.example/renewal' }] })).id;
          return sent(pile, from);
        };
        const again = async (): Promise<undefined> => {
          const from = logged.mock.calls.length;
          await vault.retryPile(pile);
          return sent(pile, from);
        };
        return { mine: (k, a) => k === 'createText' && String(a[1]).endsWith('.url'), act: [first, again] };
      }
      const pile = (await vault.piles()).find((p) => p.path && p.text.startsWith('Job offer'));
      if (!pile?.path) throw new Error('no pile');
      const folder = await idOf(pile.path);
      await contextNeverCreated((await drive.listAll(folder)).filter((f) => f.name === 'Pile note.md').map((f) => f.id));
      await vault.refresh();
      const words = kind === 'pile note' ? 'Job offer papers' : 'Job offer, signed papers';
      return {
        mine: (k, a) => k === 'createText' && a[1] === 'Pile note.md',
        act: [async () => void (await vault.updatePile(pile.id, 'Job offer papers')), async () => void (await vault.updatePile(pile.id, words))],
        text: ['Job offer papers', words],
      };
    };
    /** A move, a rename or a Bin of `id` directly in Drive, as another device would; nothing yet, nothing to change. */
    const elsewhere = async (raw: Pick<FakeDrive, 'update' | 'trash'>, change: Change, id: string | undefined): Promise<void> => {
      if (id === undefined || change === 'none') return;
      const now = await drive.get(id, { binned: true });
      if (change === 'bin') await raw.trash(id);
      else await raw.update(id, change === 'move' ? { addParent: root, ...(now.parents[0] ? { removeParent: now.parents[0] } : {}) } : { name: `Changed elsewhere (Alex)${now.name.includes('.') ? now.name.slice(now.name.lastIndexOf('.')) : ''}` });
    };
    const settle = (p: Promise<string | undefined>): Promise<{ ended: 'done' | 'refused' | 'failed'; path?: string }> =>
      p.then((path) => ({ ended: 'done' as const, ...(path !== undefined ? { path } : {}) }), (e: unknown) => {
        if (!(e instanceof BowerError)) throw e;
        return { ended: notAsSeenReason(e) === null ? ('failed' as const) : ('refused' as const) };
      });

    const met = new Set<string>();
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...kinds),
        fc.constantFrom<Change>('none', 'move', 'rename', 'bin'),
        fc.constantFrom<When>('before the write', 'before the recovery read', 'before the retry', 'after a refresh, before the retry'),
        async (kind, change, when) => {
          met.add([kind, change, when].join(' / '));
          localStorage.clear();
          drive = new FakeDrive();
          root = (await seedFakeDrive(drive, 'default', Date.now())) ?? '';
          vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
          const p = await press(kind);
          const raw = { update: drive.update.bind(drive), trash: drive.trash.bind(drive) };
          // The create this press means: where it was sent, under which name, and the ids of every file it made.
          let at: { parent: string; name: string } | undefined;
          const madeIds: string[] = [];
          for (const k of ['createText', 'createFolder'] as const) {
            const d = drive as unknown as Record<Made, (...a: unknown[]) => Promise<DriveFile>>;
            const real = d[k].bind(drive);
            d[k] = async (...a: unknown[]) => {
              const out = await real(...a);
              if (p.mine(k, a)) {
                at ??= { parent: String(a[0]), name: String(a[1]) };
                madeIds.push(out.id);
              }
              return out;
            };
          }
          const made: Made = kind === 'folder' || kind === 'pile folder' ? 'createFolder' : 'createText';
          const target = loseCreate(made, (a) => p.mine(made, a), when === 'before the recovery read' ? (id) => elsewhere(raw, change, id) : undefined);
          // Every write to the made file, and every move into it, as sent.
          const sends: unknown[][] = [];
          for (const k of ['update', 'writeText', 'trash', 'untrash'] as const) {
            const d = drive as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
            const real = d[k]?.bind(drive);
            if (!real) throw new Error(`no ${k}`);
            d[k] = async (...a: unknown[]) => {
              const id = target.id();
              const patch = a[1] as DrivePatch | undefined;
              if (id !== undefined && (a[0] === id || (k === 'update' && patch?.addParent === id))) sends.push(a);
              return real(...a);
            };
          }
          const asMade = async (i: 0 | 1): Promise<boolean> => {
            const id = target.id();
            if (id === undefined || at === undefined) return false;
            const now = await drive.get(id, { binned: true });
            return !now.trashed && now.name === at.name && now.parents.length === 1 && now.parents[0] === at.parent && (p.text === undefined || (await drive.readText(id)) === p.text[i]);
          };
          const tryOnce = async (i: 0 | 1): Promise<'done' | 'refused' | 'failed'> => {
            const id = target.id();
            const before = id === undefined ? null : await drive.get(id, { binned: true });
            const changed = before !== null && at !== undefined && (!!before.trashed || before.name !== at.name || before.parents[0] !== at.parent);
            const from = sends.length;
            const count = madeIds.length;
            const { ended, path } = await settle(p.act[i]());
            // Changed elsewhere before this press: nothing is written to it, nor moved into it.
            if (changed) expect(sends.slice(from)).toEqual([]);
            // Refused: nothing is made on that press.
            if (ended === 'refused') expect(madeIds.slice(count).filter((m) => m !== target.id())).toEqual([]);
            // Success only as it was made, and a path reported is where it is.
            if (ended === 'done') {
              expect(await asMade(i)).toBe(true);
              if (path !== undefined) expect(drive.pathOf(target.id() ?? '', root)).toBe(path);
            }
            return ended;
          };
          // A create has no file before its first send: a change then finds nothing to change.
          if (when === 'before the write') await elsewhere(raw, change, target.id());
          const first = await tryOnce(0);
          if (first !== 'failed') return;
          if (when === 'before the retry') await elsewhere(raw, change, target.id());
          // The folder listed again first (fix round 1): the retry still resends the name it was first sent with.
          if (when === 'after a refresh, before the retry') {
            await vault.refresh();
            await elsewhere(raw, change, target.id());
          }
          const retried = await tryOnce(1);
          if (change === 'none' || when === 'before the write') expect(retried).toBe('done');
        },
      ),
      { seed: 20261009, numRuns: 800 },
    );
    expect(met.size).toBe(96);
  }, 60_000);
});

/**
 * c4-retry-fence (TL-P4-24 finding 1): the app's move and rename through the Drive transport, answered 429 once while the
 * file changes elsewhere. The resend runs the app's fence again first; a change it finds sends nothing more.
 */
describe('a write resent after a rate limit', () => {
  const TART = 'Resources/Cooking/Lemon tart.md';
  const pacing = { baseMs: 0, sleep: async (): Promise<void> => undefined };
  /** `drive.update` goes over the real transport to a pretend Drive v3 that keeps `drive`; its first PATCH gets 429. */
  function rateLimitedOnce(elsewhere: (id: string, store: FakeDrive['update']) => Promise<void>): { patches: () => number } {
    const store = drive.update.bind(drive);
    let patches = 0;
    const http = new DriveHttp({
      token: async () => 'token',
      pacing,
      fetch: async (url, init) => {
        const u = new URL(url);
        const id = decodeURIComponent(u.pathname.split('/').pop() ?? '');
        if (++patches === 1) {
          await elsewhere(id, store);
          return new Response(JSON.stringify({ error: { code: 429, message: 'Slow down.', errors: [] } }), { status: 429 });
        }
        const body = JSON.parse(String(init?.body)) as { name?: string; appProperties?: Record<string, string> };
        const add = u.searchParams.get('addParents');
        const remove = u.searchParams.get('removeParents');
        const f = await store(id, { ...(body.name ? { name: body.name } : {}), ...(body.appProperties ? { appProperties: body.appProperties } : {}), ...(add ? { addParent: add } : {}), ...(remove ? { removeParent: remove } : {}) });
        return new Response(JSON.stringify({ ...f, mimeType: f.folder ? 'application/vnd.google-apps.folder' : 'text/markdown' }), { status: 200 });
      },
    });
    // The vault's port takes the write's options; the pretend Drive's own `update` has none to take.
    Object.assign(drive, { update: (id: string, patch: DrivePatch, opts?: WriteOptions) => http.update(id, patch, opts) });
    return { patches: () => patches };
  }

  it('a move answered 429 while the file was renamed elsewhere is not sent again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await vault.tree();
    const id = await idOf(TART);
    const sent = rateLimitedOnce(async (at, store) => void (await store(at, { name: 'Lemon tart (Alex).md' })));
    const e = await vault.move(TART, 'Areas').catch((x: unknown) => x);
    expect(notAsSeenReason(e)).toBe('name');
    expect(sent.patches()).toBe(1);
        expect(drive.pathOf(id, root)).toBe('Resources/Cooking/Lemon tart (Alex).md');
    expect((await vault.changes()).some((r) => r.kind === 'move')).toBe(false);
  });

  it('a rename answered 429 while the file was moved elsewhere is not sent again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await vault.tree();
    const id = await idOf(TART);
    const areas = await idOf('Areas');
    const sent = rateLimitedOnce(async (at, store) => {
      const f = await drive.get(at);
      await store(at, { addParent: areas, ...(f.parents[0] ? { removeParent: f.parents[0] } : {}) });
    });
    const e = await vault.rename(TART, 'Lemon cake').catch((x: unknown) => x);
    expect(notAsSeenReason(e)).toBe('parents');
    expect(sent.patches()).toBe(1);
    expect(drive.pathOf(id, root)).toBe('Areas/Lemon tart.md');
    expect((await vault.changes()).some((r) => r.kind === 'rename')).toBe(false);
  });

  it('a move answered 429 with nothing changed lands on the resend', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await vault.tree();
    const id = await idOf(TART);
    const sent = rateLimitedOnce(async () => undefined);
    await expect(vault.move(TART, 'Areas')).resolves.toBe('Areas/Lemon tart.md');
    expect(sent.patches()).toBe(2);
    expect(drive.pathOf(id, root)).toBe('Areas/Lemon tart.md');
  });
});

describe('audit-move-destination', () => {
  it('AC1 audit-move-destination-refuses-a-folder-in-the-bin: a move into a folder binned elsewhere writes nothing', async () => {
    const tart = 'Resources/Cooking/Lemon tart.md';
    await vault.tree();
    const id = await idOf(tart);
    const cooking = await idOf('Resources/Cooking');
    // Binned outside Bower after the listing: the folder itself, and a folder whose parent went to the Bin.
    await drive.trash(await idOf('Projects'));
    await drive.trash(await idOf('Areas'));
    await expect.soft(vault.move(tart, 'Projects')).rejects.toMatchObject({ code: 'not-found', message: 'That folder is no longer there.' });
    await expect.soft(vault.move(tart, 'Areas/Documents')).rejects.toMatchObject({ code: 'not-found', message: 'That folder is no longer there.' });
    expect((await drive.get(id)).parents).toEqual([cooking]);
  });

  /** The destination's read by id fails once with `failure`; every other read goes through. Nothing is written. */
  async function destinationReadFails(failure: BowerError): Promise<unknown> {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await vault.tree();
    const projects = await idOf('Projects');
    const get = drive.get.bind(drive);
    drive.get = async (id, opts) => {
      if (id !== projects) return get(id, opts);
      drive.get = get;
      throw failure;
    };
    const before = await drive.snapshot();
    const e = await vault.move('Resources/Cooking/Lemon tart.md', 'Projects').then(() => null, (x: unknown) => x);
    expect(await drive.snapshot()).toBe(before);
    return e;
  }

  it('AC1 audit-move-destination-unanswered-read: a destination read with no answer is not read, never a folder gone, and writes nothing', async () => {
    const e = await destinationReadFails(driveError('offline'));
    expect(notRead(e)).toBe(true);
    expect(notAsSeenReason(e)).toBeNull();
  });

  it('AC1 audit-move-destination-auth-read: a destination read refused for sign-in is thrown as it is and writes nothing', async () => {
    const signedOut = driveError('auth');
    expect(await destinationReadFails(signedOut)).toBe(signedOut);
  });
});
