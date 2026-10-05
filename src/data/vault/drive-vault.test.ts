import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { seedFakeDrive } from '../fake/seed';
import { findNode } from '../tree';
import { DriveVault } from './drive-vault';
import { runFake } from '../fake/fake-runner';

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

describe('what the review found', () => {
  it("Bower's own root names cannot be made, renamed into or moved to", async () => {
    await expect(vault.create('', 'note', 'index.md')).rejects.toMatchObject({ code: 'conflict' });
    const plan = await vault.create('', 'note', 'Plan.md');
    await expect(vault.rename(plan, 'Log')).rejects.toMatchObject({ code: 'conflict' });
    const inner = await vault.create('Resources', 'note', 'hot.md');
    await expect(vault.move(inner, '')).rejects.toMatchObject({ code: 'conflict' });
    expect(drive.dump(root).has('index.md')).toBe(false);
  });

  it('a retry never sends twice a thing that arrived but whose answer was lost', async () => {
    const real = drive.upload.bind(drive);
    let lose = true;
    drive.upload = async (parent, name, body, onProgress, props) => {
      const f = await real(parent, name, body, onProgress, props);
      if (name === 'b.jpg' && lose) {
        lose = false;
        throw new TypeError('Failed to fetch');
      }
      return f;
    };
    const p = await vault.addPile({ text: 'Two photos', items: [{ name: 'a.jpg', kind: 'image', origin: 'x', body: new Blob(['a']) }, { name: 'b.jpg', kind: 'image', origin: 'x', body: new Blob(['b']) }] });
    await vault.settled();
    await vault.retryPile(p.id);
    await vault.settled();
    expect((await drive.listAll(root)).filter((f) => f.name.startsWith('b'))).toHaveLength(1);
    expect((await vault.piles()).find((x) => x.id === p.id)?.items.map((i) => i.upload)).toEqual([undefined, undefined]);
  });

  it('Try again works while another pile is still on its way', async () => {
    const real = drive.upload.bind(drive);
    let failA = true;
    let release: () => void = () => undefined;
    const slow = new Promise<void>((r) => (release = r));
    drive.upload = async (parent, name, body, onProgress, props) => {
      if (name === 'a.jpg' && failA) {
        failA = false;
        throw new Error('network down');
      }
      if (name === 'slow.jpg') await slow;
      return real(parent, name, body, onProgress, props);
    };
    const a = await vault.addPile({ text: 'Pile A', items: [{ name: 'a.jpg', kind: 'image', origin: 'x', body: new Blob(['a']) }] });
    await new Promise((r) => setTimeout(r, 0));
    await vault.addPile({ text: 'Pile B', items: [{ name: 'slow.jpg', kind: 'image', origin: 'x', body: new Blob(['s']) }] });
    for (let i = 0; i < 20 && (await vault.piles()).find((x) => x.id === a.id)?.items[0]?.upload !== -1; i++) await new Promise((r) => setTimeout(r, 0));
    await vault.retryPile(a.id);
    for (let i = 0; i < 50 && (await vault.piles()).find((x) => x.id === a.id)?.items[0]?.upload !== undefined; i++) await new Promise((r) => setTimeout(r, 0));
    expect((await vault.piles()).find((x) => x.id === a.id)?.items[0]?.upload).toBeUndefined();
    release();
    await vault.settled();
  });

  it('backlinks are only notes that really link here', async () => {
    const all = await drive.listAll(root);
    drive.fullText = async () => all.filter((f) => f.name.endsWith('.md'));
    const back = (await vault.note('Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md')).backlinks;
    expect(back).toContain('Projects/Flat hunt/Flat hunt.md');
    expect(back).not.toContain('Resources/Cooking/Lemon tart.md');
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
    const real = drive.upload.bind(drive);
    let release: () => void = () => undefined;
    const slow = new Promise<void>((r) => (release = r));
    drive.upload = async (parent, name, body, onProgress, props) => {
      await slow;
      return real(parent, name, body, onProgress, props);
    };
    const p = await vault.addPile({ text: '', items: [{ name: 'late.pdf', kind: 'pdf', origin: 'x', body: new Blob(['x']) }] });
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
      let lost = 2;
      fresh.createText = async (parent, name, text, props) => {
        const made = await create(parent, name, text, props);
        if (name.endsWith('.json') && lost-- > 0) throw new TypeError('The write answer was lost');
        return made;
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
      const out = await runFake(fresh, r, { scope: 'instructions', scale: 'instant', failOnce: false, onPhase: () => undefined });
      expect(out).toMatchObject({ phase: 'done', report: { rulesWorded: 2 } });
      await a.flushJournal();
      await Promise.all([a.refresh(), b.refresh()]);
      expect(await a.changes()).toEqual([]);
      expect(await b.changes()).toEqual([]);
      const after = await fresh.listAll(r);
      const lines = after.filter((f) => !f.folder && f.name.endsWith('.json'));
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
    let lose = true;
    drive.createText = async (parent, name, text, props) => {
      const f = await real(parent, name, text, props);
      if (lose && name.endsWith('.json') && text.includes('"kind":"rule"')) {
        lose = false;
        throw new TypeError('Failed to fetch');
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
    const real = drive.upload.bind(drive);
    let release: () => void = () => undefined;
    const slow = new Promise<void>((r) => (release = r));
    drive.upload = async (parent, name, body, onProgress, props) => {
      await slow;
      return real(parent, name, body, onProgress, props);
    };
    const p = await vault.addPile({ text: 'Late papers', items: [{ name: 'late.pdf', kind: 'pdf', origin: 'x', body: new Blob(['x']) }] });
    await vault.trash(p.path ?? '');
    release();
    await vault.settled();
    await vault.restore(p.path ?? '');
    await vault.settled();
    expect((await vault.piles()).find((x) => x.id === p.id)?.items.map((i) => [i.name, i.upload])).toEqual([['late.pdf', undefined]]);
    expect((await drive.listAll(root)).filter((f) => f.name === 'late.pdf')).toHaveLength(1);
  });

  it('a late file still goes to the Bin when the first Bin fails, and comes back on Undo', async () => {
    const real = drive.upload.bind(drive);
    const realTrash = drive.trash.bind(drive);
    let release: () => void = () => undefined;
    const slow = new Promise<void>((r) => (release = r));
    let lateId = '';
    let started: () => void = () => undefined;
    const onItsWay = new Promise<void>((r) => (started = r));
    drive.upload = async (parent, name, body, onProgress, props) => {
      // It arrives in Drive, but its answer comes only after the pile went to the Bin.
      const made = await real(parent, name, body, onProgress, props);
      lateId = made.id;
      started();
      await slow;
      return made;
    };
    let failOnce = true;
    drive.trash = async (id) => {
      if (id === lateId && failOnce) {
        failOnce = false;
        throw new TypeError('Failed to fetch');
      }
      return realTrash(id);
    };
    const p = await vault.addPile({ text: 'Late papers', items: [{ name: 'late.pdf', kind: 'pdf', origin: 'x', body: new Blob(['x']) }] });
    // The file is on its way when the pile goes to the Bin.
    await onItsWay;
    await vault.trash(p.path ?? '');
    release();
    await vault.settled();
    expect(failOnce).toBe(false);
    // In the Bin itself, not only inside a binned folder.
    await expect(drive.get(lateId)).rejects.toThrow();
    await vault.restore(p.path ?? '');
    await vault.settled();
    expect((await drive.listAll(root)).filter((f) => f.name === 'late.pdf')).toHaveLength(1);
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
