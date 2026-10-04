import { beforeEach, describe, expect, it } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { seedFakeDrive } from '../fake/seed';
import { findNode } from '../tree';
import { DriveVault } from './drive-vault';

const PASSPORT = 'Areas/Documents/Passport renewal.md';
let drive: FakeDrive;
let root: string;
let vault: DriveVault;

beforeEach(async () => {
  localStorage.clear();
  drive = new FakeDrive();
  root = (await seedFakeDrive(drive, 'default', Date.now())) ?? '';
  vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
});

const idOf = async (path: string): Promise<string> => {
  const all = await drive.listAll(root);
  const f = all.find((x) => drive.pathOf(x.id, root) === path);
  if (!f) throw new Error(`no ${path}`);
  return f.id;
};

describe('DriveVault files', () => {
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
    const real = drive.upload.bind(drive);
    drive.upload = async (parent, name, body, onProgress) => {
      if (name === 'b.jpg') throw new Error('network down');
      return real(parent, name, body, onProgress);
    };
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
    const real = drive.upload.bind(drive);
    let fail = true;
    drive.upload = async (parent, name, body, onProgress, props) => {
      if (name === 'b.jpg' && fail) throw new Error('network down');
      return real(parent, name, body, onProgress, props);
    };
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
