import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { driveError } from '../drive/drive-api';
import { FakeDrive } from '../drive/fake-drive';
import { DriveVault } from '../vault/drive-vault';
import { thingsIn } from '../piles';
import { seedFakeDrive } from './seed';
import { runFake, type FakeRunOptions } from './fake-runner';
import { BowerError, type RunPhase } from '../types';
import { PROP, SYSTEM } from '../vault/layout';

let drive: FakeDrive;
let root: string;
let vault: DriveVault;
const phases: RunPhase[] = [];
const opts = (more: Partial<FakeRunOptions> = {}): FakeRunOptions => ({
  scope: 'all',
  scale: 'instant',
  failOnce: false,
  onPhase: (p) => void phases.push(p),
  ...more,
});
const fresh = (): DriveVault => new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });

beforeEach(async () => {
  localStorage.clear();
  phases.length = 0;
  drive = new FakeDrive();
  root = (await seedFakeDrive(drive, 'default', Date.now())) ?? '';
  vault = fresh();
});

afterEach(() => vi.restoreAllMocks());

describe('the fake runner', () => {
  it('files every pile it took and empties the journal', async () => {
    const things = (await vault.piles()).reduce((n, p) => n + (p.items.length || 1), 0);
    await vault.move('Resources/Cooking/Lemon tart.md', 'Areas');
    const out = await runFake(drive, root, opts());
    expect(out.phase).toBe('done');
    if (out.phase !== 'done') return;
    expect(phases).toEqual(['queued', 'reading', 'writing', 'saving']);
    expect(out.report.filed).toHaveLength(things);
    expect(out.report.yourChanges).toBe(1);
    const after = fresh();
    expect(await after.piles()).toEqual([]);
    expect(await after.changes()).toEqual([]);
    const paths = (await drive.listAll(root)).map((f) => drive.pathOf(f.id, root));
    expect(paths).toContain('Areas/Money/Receipts/2026-09/Saltmere weekend, taxi, 13 Sep.pdf');
    expect(paths).toContain('Projects/Job hunt/Applications/Offer, Industrial Designer, Ferrowick.pdf');
    expect(paths.some((p) => p.startsWith('.bower/changes/archive/'))).toBe(true);
  });

  it('files things under names that say what they are and their date', async () => {
    const out = await runFake(drive, root, opts());
    if (out.phase !== 'done') throw new Error('failed');
    const receipts = out.report.filed.filter((f) => f.to.startsWith('Areas/Money/Receipts'));
    expect(receipts.length).toBeGreaterThan(0);
    for (const f of receipts) {
      expect(f.title, f.name).not.toMatch(/^(IMG_\d+|Taxi|Hotel invoice)/);
      expect(f.title, f.name).toMatch(/\d{1,2} [A-Z][a-z]{2}/);
    }
  });

  it('marks what it filed as new, and only that', async () => {
    const out = await runFake(drive, root, opts());
    if (out.phase !== 'done') throw new Error('failed');
    const all = await drive.listAll(root);
    const flagged = all.filter((f) => f.appProperties?.bowerNew === '1').map((f) => drive.pathOf(f.id, root));
    expect(flagged).toContain('Areas/Money/Receipts/2026-09/Saltmere weekend, taxi, 13 Sep.pdf');
    expect(flagged.every((p) => out.report.filed.some((x) => p.startsWith(x.to)) || out.report.updated.some((u) => u.path === p) || out.report.created.some((c) => c.path === p))).toBe(true);
  });

  it('a pile added during the run stays', async () => {
    const out = await runFake(
      drive,
      root,
      opts({
        onPhase: async (p) => {
          if (p === 'reading') await vault.addPile({ text: 'Late arrival', items: [] });
        },
      }),
    );
    expect(out.phase).toBe('done');
    expect((await fresh().piles()).map((p) => p.text)).toEqual(['Late arrival']);
  });

  it('failOnce leaves the inbox as it was', async () => {
    const before = (await vault.piles()).map((p) => p.id).sort();
    await vault.addRule('anything from the dentist goes in health');
    const out = await runFake(drive, root, opts({ failOnce: true }));
    expect(out).toEqual({ phase: 'failed', failure: 'Bower stopped while writing your notes. Nothing was moved; your inbox is as it was.' });
    const after = fresh();
    expect((await after.piles()).map((p) => p.id).sort()).toEqual(before);
    expect(await after.changes()).toHaveLength(1);
  });

  it('outbox: a line written twice is counted once, and both files are archived', async () => {
    await vault.addRule('anything from the dentist goes in health');
    const changes = [...drive.dump(root).entries()].filter(([p]) => p.startsWith('.bower/changes/') && p.endsWith('.json'));
    const [path, text] = changes[0] ?? ['', ''];
    // Its answer was lost, so the device wrote it again.
    const parent = (await drive.listAll(root)).find((f) => f.name === '.bower');
    const changesDir = (await drive.listAll(parent?.id ?? '')).find((f) => f.name === 'changes');
    await drive.createText(changesDir?.id ?? '', path.split('/').pop() ?? '', String(text));
    const out = await runFake(drive, root, opts({ scope: 'instructions' }));
    expect(out.phase === 'done' && out.report.rulesWorded).toBe(1);
    expect(out.phase === 'done' && out.report.yourChanges).toBe(0);
    expect([...drive.dump(root).keys()].filter((p) => /^\.bower\/changes\/[^/]+\.json$/.test(p))).toEqual([]);
  });

  it('links follow a rename: the tidy-up writes the new name into the notes that link', async () => {
    const to = await vault.rename('Projects/Flat hunt/Flat 7, Cobble Row.md', 'Cobble Row flat');
    await runFake(drive, root, opts({ scope: 'instructions' }));
    const text = (await fresh().note('Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md')).body;
    expect(text).toContain('[[Cobble Row flat]]');
    expect(text).not.toContain('[[Flat 7, Cobble Row]]');
    expect((await fresh().note(to)).backlinks).toContain('Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md');
  });

  it('a saved link searches by its address: filed as a note, it is a note with its address, not the link file', async () => {
    await runFake(drive, root, opts({ scope: 'all' }));
    for (const [path, text] of drive.dump(root)) if (path.endsWith('.md')) expect(String(text), path).not.toContain('[InternetShortcut]');
    expect(await fresh().search('internetshortcut')).toEqual([]);
    expect((await fresh().search('curry-clipping')).length).toBeGreaterThan(0);
  });

  it('a rule can be removed: the tidy-up takes it out of your rules', async () => {
    const r = (await vault.rules())[0];
    if (!r) throw new Error('no rule in the seed');
    await vault.removeRule(r.id);
    await runFake(drive, root, opts({ scope: 'instructions' }));
    expect((await fresh().rules()).some((x) => x.text === r.text)).toBe(false);
  });

  it('the report says what it did with your words', async () => {
    await vault.addRequest('Put my visa papers together');
    await vault.addRule('anything from the dentist goes in health');
    const out = await runFake(drive, root, opts({ scope: 'instructions' }));
    expect(out.phase === 'done' && out.report.requests).toEqual(['Put my visa papers together']);
    expect(out.phase === 'done' && out.report.rulesWorded).toBe(1);
  });

  it('the report counts each change once: a request and a rule are not among your other changes', async () => {
    await vault.addRequest('Put my visa papers together');
    await vault.addRule('anything from the dentist goes in health');
    await vault.rename('Resources/Cooking/Lemon tart.md', 'Lemon tart, best');
    const out = await runFake(drive, root, opts({ scope: 'instructions' }));
    expect(out.phase === 'done' && out.report.yourChanges).toBe(1);
  });

  it('a saved link is filed under a name that says what it is, with no query or .url in it', async () => {
    await vault.addPile({ text: '', items: [{ name: 'saved-page.example/article/42?ref=x', kind: 'link', origin: 'Pasted', url: 'https://saved-page.example/article/42?ref=x' }] });
    await vault.settled();
    const out = await runFake(drive, root, opts());
    if (out.phase !== 'done') throw new Error('failed');
    const f = out.report.filed.find((x) => x.kind === 'link' && x.name.startsWith('saved-page'));
    expect(f?.title).toBe('saved-page.example, article 42');
  });

  it('pending rules are worded with your words kept', async () => {
    await vault.addRule('anything from the dentist goes in health');
    await runFake(drive, root, opts({ scope: 'instructions' }));
    const r = (await fresh().rules())[0];
    expect(r?.pending).toBeFalsy();
    expect(r?.text).toMatch(/^Letters, reminders and invoices from the dentist/);
    expect(r?.yourWords).toBe('anything from the dentist goes in health');
  });

  it('a request is done after the run, and the inbox waits for a full tidy-up', async () => {
    const piles = (await vault.piles()).length;
    await vault.addRequest('Put my id papers together');
    const out = await runFake(drive, root, opts({ scope: 'instructions' }));
    if (out.phase !== 'done') throw new Error('failed');
    expect(out.report.filed).toEqual([]);
    const after = fresh();
    expect((await after.requests())[0]).toMatchObject({ text: 'Put my id papers together', done: expect.stringMatching(/^Done/) as unknown });
    expect(await after.piles()).toHaveLength(piles);
  });

  it('answered questions leave the list for good', async () => {
    const q = (await vault.questions())[0];
    if (!q) throw new Error('no question');
    await vault.answer(q.id, true);
    await runFake(drive, root, opts({ scope: 'instructions' }));
    expect((await fresh().questions()).some((x) => x.id === q.id)).toBe(false);
  });

  it('a note-only pile becomes a note where it belongs', async () => {
    await vault.addPile({ text: 'Bins go out on Tuesday nights, recycling every other week', items: [] });
    const out = await runFake(drive, root, opts());
    if (out.phase !== 'done') throw new Error('failed');
    const note = out.report.filed.find((f) => f.name === 'Your note');
    expect(note?.note).toMatch(/\.md$/);
    expect((await fresh().note(note?.note ?? '')).body).toContain('Bins go out on Tuesday nights');
  });

  it('knows what it filed by content, so Add can warn about it next time', async () => {
    await vault.addPile({ text: '', items: [{ name: 'scan.pdf', kind: 'pdf', origin: 'x', body: new Blob(['%PDF a made-up scan']) }] });
    await vault.settled();
    await runFake(drive, root, opts());
    expect(await fresh().duplicates([{ name: 'again.pdf', body: new Blob(['%PDF a made-up scan']) }])).toEqual([expect.stringMatching(/scan\.pdf$/) as unknown]);
  });

  it('the report lists the new questions it asked, not the old ones', async () => {
    const out = await runFake(drive, root, opts());
    if (out.phase !== 'done') throw new Error('failed');
    expect(out.report.questions.map((q) => q.id)).toEqual(['q-saltmere']);
    expect((await fresh().questions()).map((q) => q.id)).toEqual(['q1', 'q2', 'q-saltmere']);
  });
});

describe('request history preflight', () => {
  const marker = 'SYNTHETIC_PRIVATE_HISTORY';
  const prior = { id: 'earlier', text: 'Keep the earlier request.', at: -0.5, done: 'Earlier completion.' };
  const malformed = [
    { name: 'syntax', text: `{ "v": 1, "done": [ "${marker}"\n`, category: 'is not valid JSON' },
    { name: 'nested record', text: JSON.stringify({ v: 1, done: [{ id: marker, text: 123, at: 'later', done: [] }] }), category: 'has an unsupported shape' },
    { name: 'container', text: JSON.stringify({ v: 1, done: { [marker]: prior } }), category: 'has an unsupported shape' },
  ];

  async function prepare(history: string | null, pending: boolean) {
    // Small public-API world: snapshots include every byte, parent, mark and Bin entry.
    drive = new FakeDrive();
    root = (await drive.createFolder('root', 'Bower')).id;
    for (const name of ['Inbox', 'Projects', 'Areas', 'Resources', 'Archive']) await drive.createFolder(root, name);
    const system = await drive.createFolder(root, SYSTEM.dir);
    await drive.createFolder(system.id, 'changes');
    const file = history === null ? null : await drive.createText(system.id, 'requests.json', '{"v":1,"done":[]}\n');
    if (file && history !== null) await drive.writeText(file.id, history, (await drive.get(file.id)).modifiedTime);
    const marked = await drive.createText(root, 'Earlier.md', 'Earlier note café.\r\n', { [PROP.isNew]: '1' });
    const binned = await drive.createText(root, 'Discarded.md', 'Existing Bin bytes.\r\n');
    await drive.trash(binned.id);
    vault = fresh();
    const pile = await vault.addPile({ text: 'Synthetic garden observation', items: [] });
    const request = pending ? await vault.addRequest('Describe the synthetic garden.') : null;
    if (!pending) await vault.addRule('Keep garden observations together');
    await vault.settled();
    const journal = [...drive.dump(root)].filter(([path]) => /^\.bower\/changes\/[^/]+\.json$/.test(path));
    expect(journal).toHaveLength(1);
    const paths = (await drive.listAll(root)).map((f) => drive.pathOf(f.id, root));
    expect(paths).not.toContain('Resources/Ideas');
    expect(paths).not.toContain(SYSTEM.archive);
    expect(paths).not.toContain(SYSTEM.hashes);
    return { file, marked, pile, request, journal };
  }

  for (const scope of ['all', 'instructions'] as const) for (const pending of [true, false]) {
    it.each(malformed)(`malformed request history stops a tidy-up before effects (${scope}, pending request ${pending}, $name)`, async ({ text, category }) => {
      const { file, marked, pile, request, journal } = await prepare(text, pending);
      if (!file) throw new Error('Expected the history file');
      const before = await drive.snapshot();
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const refused = runFake(drive, root, opts({ scope }));
      await expect(refused).rejects.toBeInstanceOf(BowerError);
      await expect(refused).rejects.toMatchObject({ code: 'unknown', message: 'Bower could not read its latest update. Try again.' });
      expect(await drive.snapshot()).toBe(before);
      expect(await drive.readText(file.id)).toBe(text);
      expect(await drive.get(marked.id)).toMatchObject({ appProperties: { [PROP.isNew]: '1' } });
      expect(phases).toEqual(['queued', 'reading', 'writing', 'saving']);
      expect(error.mock.calls).toEqual([[`${SYSTEM.requests} ${category}`]]);
      expect(JSON.stringify(error.mock.calls)).not.toContain(marker);
      error.mockClear();
      await expect(fresh().requests()).rejects.toMatchObject({ code: 'unknown', message: 'Bower could not read its latest update. Try again.' });
      expect(error.mock.calls).toEqual([[`${SYSTEM.requests} ${category}`]]);
      expect(await drive.snapshot()).toBe(before);

      // Repair with the version actually read; no failed run's intent was lost.
      await drive.writeText(file.id, JSON.stringify({ v: 1, done: [prior] }), (await drive.get(file.id)).modifiedTime);
      const out = await runFake(drive, root, opts({ scope }));
      expect(out.phase).toBe('done');
      if (out.phase !== 'done') throw new Error('Expected a completed retry');
      expect(out.report.filed).toHaveLength(scope === 'all' ? 1 : 0);
      expect(out.report.requests).toEqual(pending ? ['Describe the synthetic garden.'] : undefined);
      expect(await fresh().changes()).toEqual([]);
      const archived = [...drive.dump(root)].filter(([path]) => path.startsWith(`${SYSTEM.archive}/`));
      expect(archived).toHaveLength(1);
      expect(archived.map(([, bytes]) => bytes)).toEqual(journal.map(([, bytes]) => bytes));
      const done = await fresh().requests();
      expect(done).toContainEqual(prior);
      expect(done.filter((r) => r.id === request?.id)).toHaveLength(pending ? 1 : 0);
      expect(await drive.get(marked.id)).not.toMatchObject({ appProperties: { [PROP.isNew]: '1' } });
      // A second full run files the waiting pile only for an instructions retry.
      const again = await runFake(drive, root, opts());
      expect(again.phase === 'done' && again.report.filed.length).toBe(scope === 'all' ? 0 : 1);
      expect((await fresh().requests()).filter((r) => r.id === request?.id)).toHaveLength(pending ? 1 : 0);
      expect([...drive.dump(root)].filter(([path]) => path.startsWith(`${SYSTEM.archive}/`))).toEqual(archived);
      expect(await fresh().piles()).toEqual([]);
      const saved = JSON.parse(await drive.snapshot()) as { files: Array<{ meta: { id: string }; trashed: boolean }> };
      expect(saved.files.find((f) => f.meta.id === pile.id)?.trashed).toBe(true);
      expect([...drive.dump(root).keys()].filter((path) => path === 'Resources/Ideas/Synthetic garden observation.md')).toHaveLength(1);
    });
  }

  it.each([
    { name: 'missing history', history: null, retained: [] },
    { name: 'empty history', history: JSON.stringify({ v: 1, done: [] }), retained: [] },
    { name: 'optional completion', history: JSON.stringify({ v: 1, done: [{ id: '', text: '', at: 0.25 }] }), retained: [{ id: '', text: '', at: 0.25 }] },
    { name: 'additive fields and finite timestamps', history: JSON.stringify({ v: 1, extra: marker, done: [{ ...prior, extra: marker }] }), retained: [{ ...prior, extra: marker }] },
  ])('malformed request history stops a tidy-up before effects (valid $name remains compatible)', async ({ history, retained }) => {
    const { request } = await prepare(history, true);
    const out = await runFake(drive, root, opts());
    expect(out.phase === 'done' && out.report.filed).toHaveLength(1);
    const done = await fresh().requests();
    expect(done.filter((r) => r.id === request?.id)).toHaveLength(1);
    expect(done.slice(1)).toEqual(retained);
    expect(await fresh().piles()).toEqual([]);
    expect(await fresh().changes()).toEqual([]);
  });

  it('malformed request history stops a tidy-up before effects (Drive read failures propagate)', async () => {
    const { file } = await prepare(JSON.stringify({ v: 1, done: [] }), true);
    const before = await drive.snapshot();
    const read = drive.readText.bind(drive);
    const failure = driveError('offline');
    vi.spyOn(drive, 'readText').mockImplementation((id) => id === file?.id ? Promise.reject(failure) : read(id));
    await expect(runFake(drive, root, opts())).rejects.toBe(failure);
    expect(await drive.snapshot()).toBe(before);
  });
});

describe('an incomplete pile retains every member across tidy-up and retry', () => {
  const declaring = (): DriveVault => new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true });
  const pdf = (name: string): { name: string; kind: 'pdf'; origin: string; body: Blob } => ({ name, kind: 'pdf', origin: 'From this computer', body: new Blob([`%PDF ${name}`]) });

  /** Alex adds arrived.pdf and missing.pdf to one pile; missing.pdf does not get through. */
  async function incompletePile(uploader: DriveVault) {
    const real = drive.upload.bind(drive);
    let fail = true;
    drive.upload = async (parent, name, body, onProgress, props) => {
      if (name === 'missing.pdf' && fail) throw driveError('offline');
      return real(parent, name, body, onProgress, props);
    };
    const pile = await uploader.addPile({ text: 'Papers from Alex', items: [pdf('arrived.pdf'), pdf('missing.pdf')] });
    await uploader.settled();
    return { pile, heal: (): void => { fail = false; } };
  }

  /** The pile's folder in Drive, found by the pile's id. */
  async function folderOf(pileId: string) {
    const f = (await drive.listAll(root)).find((x) => x.folder && (x.id === pileId || x.appProperties?.[PROP.pile] === pileId));
    if (!f) throw new Error('no pile folder');
    return f;
  }

  /** Every byte, name, place and mark of the folder and what is in it. */
  async function stateOf(folderId: string) {
    const top = await drive.get(folderId);
    const under = await drive.listAll(folderId);
    const files = await Promise.all(under.map(async (f) => ({ id: f.id, name: f.name, parents: f.parents, appProperties: f.appProperties ?? null, bytes: f.folder ? null : [...(await drive.readBytes(f.id))] })));
    return { top: { id: top.id, name: top.name, parents: top.parents, appProperties: top.appProperties ?? null }, files: files.sort((a, b) => a.id.localeCompare(b.id)) };
  }

  async function declarations() {
    const files = (await drive.listAll(root)).filter((f) => !f.folder && drive.pathOf(f.id, root).startsWith('.bower/piles/'));
    return Promise.all(files.map(async (f) => ({ id: f.id, name: f.name, text: await drive.readText(f.id) })));
  }

  it('a second client lists the declared missing member', async () => {
    const { pile } = await incompletePile(declaring());
    const seen = (await fresh().piles()).find((p) => p.id === pile.id);
    expect(seen?.items.map((i) => [i.name, i.upload])).toEqual([
      ['arrived.pdf', undefined],
      ['missing.pdf', -1],
    ]);
  });

  it('a tidy-up keeps an unready pile untouched and names it set aside', async () => {
    const { pile } = await incompletePile(declaring());
    const folder = await folderOf(pile.id);
    const before = await stateOf(folder.id);
    const others = (await fresh().piles()).filter((p) => p.id !== pile.id && p.path).reduce((n, p) => n + thingsIn(p), 0);
    const trash = vi.spyOn(drive, 'trash');
    const update = vi.spyOn(drive, 'update');
    const took: string[] = [];
    let reading = -1;
    const out = await runFake(drive, root, opts({ took: (ids) => took.push(...ids), onPhase: (p, total) => { if (p === 'reading') reading = total ?? -1; } }));
    if (out.phase !== 'done') throw new Error('failed');
    expect(out.report.setAside).toContainEqual({ name: folder.name, why: 'Some of its things have not arrived yet.' });
    expect(out.report.filed.map((f) => f.name)).not.toContain('arrived.pdf');
    expect(took).not.toContain(pile.id);
    expect(reading).toBe(others);
    const touched = new Set([folder.id, ...before.files.map((f) => f.id)]);
    expect(trash.mock.calls.filter(([id]) => touched.has(id))).toEqual([]);
    expect(update.mock.calls.filter(([id]) => touched.has(id))).toEqual([]);
    expect(await stateOf(folder.id)).toEqual(before);
    const seen = (await fresh().piles()).find((p) => p.id === pile.id);
    expect(seen?.items.map((i) => [i.name, i.upload])).toEqual([
      ['arrived.pdf', undefined],
      ['missing.pdf', -1],
    ]);
  });

  it('a client without the file is asked to choose it again, and sends nothing', async () => {
    const { pile } = await incompletePile(declaring());
    const second = fresh();
    const upload = vi.spyOn(drive, 'upload');
    await expect(second.retryPile(pile.id)).rejects.toMatchObject({ name: 'BowerError', code: 'conflict', message: 'Choose missing.pdf again on this device to send it.' });
    await second.settled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('retry then tidy-up files each member once and Bins the pile once, its declaration unchanged', async () => {
    const uploader = declaring();
    const { pile, heal } = await incompletePile(uploader);
    const first = await runFake(drive, root, opts());
    if (first.phase !== 'done') throw new Error('failed');
    expect(first.report.filed.map((f) => f.name)).not.toContain('arrived.pdf');
    const declared = await declarations();
    expect(declared).toHaveLength(1);
    heal();
    const upload = vi.spyOn(drive, 'upload');
    await uploader.retryPile(pile.id);
    await uploader.settled();
    expect(upload.mock.calls.map((c) => c[1])).toEqual(['missing.pdf']);
    const folder = await folderOf(pile.id);
    const trash = vi.spyOn(drive, 'trash');
    const out = await runFake(drive, root, opts());
    if (out.phase !== 'done') throw new Error('failed');
    expect(out.report.filed.filter((f) => f.name === 'arrived.pdf')).toHaveLength(1);
    expect(out.report.filed.filter((f) => f.name === 'missing.pdf')).toHaveLength(1);
    expect(out.report.setAside).toEqual([]);
    expect(trash.mock.calls.filter(([id]) => id === folder.id)).toHaveLength(1);
    const live = await drive.listAll(root);
    for (const name of ['arrived.pdf', 'missing.pdf']) {
      const copies = await Promise.all(live.filter((f) => !f.folder).map(async (f) => new TextDecoder().decode(await drive.readBytes(f.id))));
      expect(copies.filter((t) => t === `%PDF ${name}`)).toHaveLength(1);
    }
    expect(await declarations()).toEqual(declared);
    expect((await fresh().piles()).some((p) => p.id === pile.id)).toBe(false);
  });

  // loose-pile-declaration (TL-P2-06 §6.2, fixture 07): one loose file, no folder, declared before it is sent.
  it('a declared loose file stays pending until it arrives', async () => {
    const uploader = declaring();
    const real = drive.upload.bind(drive);
    let fail = true;
    drive.upload = async (parent, name, body, onProgress, props) => {
      if (name === 'loose.pdf' && fail) throw driveError('offline');
      return real(parent, name, body, onProgress, props);
    };
    const pile = await uploader.addPile({ text: '', items: [pdf('loose.pdf')] });
    await uploader.settled();
    const inbox = (await drive.listAll(root)).find((f) => f.folder && drive.pathOf(f.id, root) === 'Inbox');
    const copies = async (): Promise<number> => {
      const live = (await drive.listAll(root)).filter((f) => !f.folder);
      const texts = await Promise.all(live.map(async (f) => new TextDecoder().decode(await drive.readBytes(f.id))));
      return texts.filter((t) => t === '%PDF loose.pdf').length;
    };

    // Declared before anything was sent: a loose anchor in the inbox, one member, no folder made for it.
    const declared = await declarations();
    expect(declared).toHaveLength(1);
    expect(JSON.parse(declared[0]?.text ?? '{}')).toMatchObject({ pileId: pile.id, anchor: { kind: 'loose', inboxId: inbox?.id }, members: [{ name: 'loose.pdf' }], context: { kind: 'absent' } });
    expect((await drive.listAll(root)).some((f) => f.folder && f.appProperties?.[PROP.pile] === pile.id)).toBe(false);
    expect(await copies()).toBe(0);

    // A second client sees it missing, to be chosen again there.
    const seen = (await fresh().piles()).find((p) => p.id === pile.id);
    expect(seen?.path).toBeUndefined();
    expect(seen?.items.map((i) => [i.name, i.upload, i.chooseAgain])).toEqual([['loose.pdf', -1, true]]);

    // A tidy-up takes nothing for it: nothing filed, nothing moved, no disposition, still pending.
    const took: string[] = [];
    const first = await runFake(drive, root, opts({ took: (ids) => took.push(...ids) }));
    if (first.phase !== 'done') throw new Error('failed');
    expect(took).not.toContain(pile.id);
    expect(first.report.filed.map((f) => f.name)).not.toContain('loose.pdf');
    expect(await declarations()).toEqual(declared);
    expect((await fresh().piles()).find((p) => p.id === pile.id)?.items.map((i) => [i.name, i.upload])).toEqual([['loose.pdf', -1]]);

    // Try again from the uploader: sent once, under its declared key, straight into the inbox.
    fail = false;
    const upload = vi.spyOn(drive, 'upload');
    await uploader.retryPile(pile.id);
    await uploader.settled();
    expect(upload.mock.calls.map((c) => c[1])).toEqual(['loose.pdf']);
    const member = (JSON.parse(declared[0]?.text ?? '{}') as { members: Array<{ memberKey: string }> }).members[0]?.memberKey;
    const arrived = (await drive.listAll(root)).filter((f) => f.appProperties?.[PROP.item] === member);
    expect(arrived.map((f) => f.parents)).toEqual([[inbox?.id]]);
    expect((await fresh().piles()).find((p) => p.id === pile.id)?.items.map((i) => [i.name, i.upload])).toEqual([['loose.pdf', undefined]]);

    // The next tidy-up files it once, and nothing of it is pending any more.
    const out = await runFake(drive, root, opts());
    if (out.phase !== 'done') throw new Error('failed');
    expect(out.report.filed.filter((f) => f.name === 'loose.pdf')).toHaveLength(1);
    expect(await copies()).toBe(1);
    expect(await declarations()).toEqual(declared);
    expect((await fresh().piles()).some((p) => p.id === pile.id)).toBe(false);
  });

  it('a declared loose file removed before it arrives is gone from every device, its declaration in the Bin', async () => {
    const uploader = declaring();
    drive.upload = async () => {
      throw driveError('offline');
    };
    const pile = await uploader.addPile({ text: '', items: [pdf('loose.pdf')] });
    await uploader.settled();
    const [declaration] = await declarations();
    expect((await fresh().piles()).some((p) => p.id === pile.id)).toBe(true);
    await fresh().removePile(pile.id);
    expect((await fresh().piles()).some((p) => p.id === pile.id)).toBe(false);
    expect((await uploader.piles()).some((p) => p.id === pile.id && p.items.some((i) => i.upload === -1 && i.chooseAgain))).toBe(false);
    // In the Bin, never deleted: it is no longer listed, and it can come back.
    expect(await declarations()).toEqual([]);
    await expect(drive.untrash(declaration?.id ?? '')).resolves.toMatchObject({ id: declaration?.id });
  });

  // TL-P2-31: the person's Remove sends a pile's folder (if any) and every copy of its declaration to the Bin; Undo restores both.
  describe('removing a declared pile bins its declaration copies too', () => {
    /** A second, identical copy of the one declaration, as another device's retried write leaves it. */
    async function twoCopies(): Promise<Array<{ id: string; name: string; text: string }>> {
      const [first] = await declarations();
      if (!first) throw new Error('no declaration');
      await drive.createText((await drive.get(first.id)).parents[0] ?? '', first.name, first.text);
      const all = await declarations();
      expect(all).toHaveLength(2);
      return all;
    }
    const ids = (list: Array<{ id: string }>): string[] => list.map((d) => d.id).sort();

    it('a folder pile: its folder and every declaration copy go to the Bin, and Undo restores both', async () => {
      const uploader = declaring();
      const pile = await uploader.addPile({ text: 'Papers from Alex', items: [pdf('one.pdf'), pdf('two.pdf')] });
      await uploader.settled();
      const folder = await folderOf(pile.id);
      const copies = await twoCopies();
      const vault = declaring();
      await vault.trash(pile.path ?? '');
      expect(await declarations()).toEqual([]);
      expect((await drive.listAll(root)).some((f) => f.id === folder.id)).toBe(false);
      expect((await fresh().piles()).some((p) => p.id === pile.id)).toBe(false);
      await vault.restore(pile.path ?? '');
      expect(ids(await declarations())).toEqual(ids(copies));
      expect((await fresh().piles()).find((p) => p.id === pile.id)?.items.map((i) => i.name)).toEqual(['one.pdf', 'two.pdf']);

      // Remove the pile does the same, and Undo from where it was brings both back.
      await vault.removePile(pile.id);
      expect(await declarations()).toEqual([]);
      expect((await fresh().piles()).some((p) => p.id === pile.id)).toBe(false);
      await vault.restore(pile.path ?? '');
      expect(ids(await declarations())).toEqual(ids(copies));
      expect((await fresh().piles()).some((p) => p.id === pile.id)).toBe(true);
    });

    it('a loose pile: the arrived file and every declaration copy go to the Bin, and Undo restores both', async () => {
      const uploader = declaring();
      const pile = await uploader.addPile({ text: '', items: [pdf('loose.pdf')] });
      await uploader.settled();
      const copies = await twoCopies();
      const shown = (await fresh().piles()).find((p) => p.id === pile.id);
      if (!shown?.path) throw new Error('no loose file');
      const vault = declaring();
      await vault.trash(shown.path);
      expect(await declarations()).toEqual([]);
      expect((await fresh().piles()).some((p) => p.id === pile.id)).toBe(false);
      await vault.restore(shown.path);
      expect(ids(await declarations())).toEqual(ids(copies));
      expect((await fresh().piles()).find((p) => p.id === pile.id)?.items.map((i) => [i.name, i.upload])).toEqual([['loose.pdf', undefined]]);
    });

    it('a loose pile that never arrived: every declaration copy goes to the Bin, and Undo restores them', async () => {
      const uploader = declaring();
      drive.upload = async () => {
        throw driveError('offline');
      };
      const pile = await uploader.addPile({ text: '', items: [pdf('loose.pdf')] });
      await uploader.settled();
      const copies = await twoCopies();
      const vault = fresh();
      await vault.removePile(pile.id);
      expect(await declarations()).toEqual([]);
      expect((await fresh().piles()).some((p) => p.id === pile.id)).toBe(false);
      // It had no place: Undo finds it by the pile's id.
      await expect(vault.restore(pile.id)).resolves.toBeUndefined();
      expect(ids(await declarations())).toEqual(ids(copies));
      expect((await fresh().piles()).find((p) => p.id === pile.id)?.items.map((i) => [i.name, i.upload])).toEqual([['loose.pdf', -1]]);
    });

    it('a declaration copy in the Bin is ignored by the inbox and the runner', async () => {
      const uploader = declaring();
      const pile = await uploader.addPile({ text: 'Papers from Alex', items: [pdf('one.pdf'), pdf('two.pdf')] });
      await uploader.settled();
      const [binned, kept] = await twoCopies();
      // As on a real Drive, the listing leaves out what is in the Bin: the other copy still declares the pile.
      await drive.trash(binned?.id ?? '');
      const seen = (await fresh().piles()).find((p) => p.id === pile.id);
      expect(seen?.setAside).toBeUndefined();
      expect(seen?.items.map((i) => i.name)).toEqual(['one.pdf', 'two.pdf']);
      const out = await runFake(drive, root, opts());
      if (out.phase !== 'done') throw new Error('failed');
      expect(out.report.filed.map((f) => f.name)).toEqual(expect.arrayContaining(['one.pdf', 'two.pdf']));
      expect(out.report.setAside).toEqual([]);
      expect(await declarations()).toEqual([kept]);
    });
  });

  /** A declared pile whose things all arrived. */
  async function readyPile(text = 'Papers from Alex', items = [pdf('arrived.pdf'), pdf('missing.pdf')]) {
    const uploader = declaring();
    const pile = await uploader.addPile({ text, items });
    await uploader.settled();
    return { pile, folder: await folderOf(pile.id) };
  }

  /** Run 1 files both members while a late child keeps the folder. */
  async function filedWithLateChild() {
    const { pile, folder } = await readyPile();
    const out = await runFake(drive, root, opts({ onPhase: async (p) => { if (p === 'writing') await drive.createText(folder.id, 'later.txt', 'later'); } }));
    if (out.phase !== 'done') throw new Error('failed');
    return { pile, folder, out };
  }

  it('a child added to a ready pile keeps its folder, and the next run files only that child', async () => {
    const { pile, folder, out } = await filedWithLateChild();
    expect(out.report.filed.filter((f) => f.name === 'arrived.pdf' || f.name === 'missing.pdf')).toHaveLength(2);
    const live = await drive.listAll(root);
    expect(live.some((f) => f.id === folder.id)).toBe(true);
    expect(live.filter((f) => f.parents[0] === folder.id).map((f) => f.name).sort()).toEqual(['Pile note.md', 'later.txt']);
    // A fresh client sees what is left, not the members already filed.
    const seen = (await fresh().piles()).find((p) => p.id === pile.id);
    expect(seen?.items.map((i) => [i.name, i.upload])).toEqual([['later.txt', undefined]]);
    expect(seen?.text).toBe('Papers from Alex');
    const trash = vi.spyOn(drive, 'trash');
    const next = await runFake(drive, root, opts());
    if (next.phase !== 'done') throw new Error('failed');
    expect(next.report.filed.map((f) => f.name)).toEqual(['later.txt']);
    expect(next.report.setAside).toEqual([]);
    expect(trash.mock.calls.filter(([id]) => id === folder.id)).toHaveLength(1);
    expect((await drive.listAll(root)).some((f) => f.id === folder.id)).toBe(false);
  });

  it('a filed member later put in the Bin stays filed: only the late child is left', async () => {
    const { pile, folder } = await filedWithLateChild();
    const filed = (await drive.listAll(root)).find((f) => f.appProperties?.[PROP.item] && f.name === 'arrived.pdf' && f.parents[0] !== folder.id);
    if (!filed) throw new Error('arrived.pdf was not filed');
    await drive.trash(filed.id);
    const seen = (await fresh().piles()).find((p) => p.id === pile.id);
    expect(seen?.items.map((i) => [i.name, i.upload])).toEqual([['later.txt', undefined]]);
    const trash = vi.spyOn(drive, 'trash');
    const untrash = vi.spyOn(drive, 'untrash');
    const next = await runFake(drive, root, opts());
    if (next.phase !== 'done') throw new Error('failed');
    expect(next.report.filed.map((f) => f.name)).toEqual(['later.txt']);
    expect(next.report.setAside).toEqual([]);
    expect(trash.mock.calls.filter(([id]) => id === folder.id)).toHaveLength(1);
    expect(untrash).not.toHaveBeenCalled();
  });

  it('two filed members later put in the Bin are found with one lookup', async () => {
    const { pile, folder } = await filedWithLateChild();
    for (const f of (await drive.listAll(root)).filter((x) => x.appProperties?.[PROP.item] && x.name.endsWith('.pdf') && x.parents[0] !== folder.id)) await drive.trash(f.id);
    // Counts calls to the optional Bin lookup, when the pretend Drive has one.
    const lookups: unknown[][] = [];
    const lookup: unknown = Reflect.get(drive, 'binnedByItem');
    if (typeof lookup === 'function') Reflect.set(drive, 'binnedByItem', (...args: unknown[]): unknown => { lookups.push(args); return Reflect.apply(lookup, drive, args); });
    const seen = (await fresh().piles()).find((p) => p.id === pile.id);
    expect(seen?.items.map((i) => [i.name, i.upload])).toEqual([['later.txt', undefined]]);
    expect(lookups).toHaveLength(1);
    expect((lookups[0]?.[1] as string[] | undefined)?.length).toBe(2);
  });

  it('a matching file in the Bin outside the Bower folder does not count', async () => {
    const { pile } = await incompletePile(declaring());
    const [declared] = await declarations();
    const member = (JSON.parse(declared?.text ?? '{}') as { members: Array<{ memberKey: string; name: string }> }).members.find((m) => m.name === 'missing.pdf');
    if (!member) throw new Error('no member');
    const outside = await drive.createText('root', 'missing.pdf', '%PDF missing.pdf', { [PROP.item]: member.memberKey });
    await drive.trash(outside.id);
    const seen = (await fresh().piles()).find((p) => p.id === pile.id);
    expect(seen?.items.map((i) => [i.name, i.upload])).toEqual([['arrived.pdf', undefined], ['missing.pdf', -1]]);
    const out = await runFake(drive, root, opts());
    if (out.phase !== 'done') throw new Error('failed');
    expect(out.report.filed.map((f) => f.name)).not.toContain('arrived.pdf');
  });

  it('a filed member whose bytes changed blocks what is left of its pile', async () => {
    const { pile, folder } = await filedWithLateChild();
    const filed = (await drive.listAll(root)).find((f) => f.appProperties?.[PROP.item] && f.name === 'arrived.pdf' && f.parents[0] !== folder.id);
    if (!filed) throw new Error('arrived.pdf was not filed');
    await drive.writeText(filed.id, 'changed elsewhere', filed.modifiedTime);
    const second = fresh();
    const seen = (await second.piles()).find((p) => p.id === pile.id);
    // Changed is not "didn't arrive": nothing asks to send it again.
    expect(seen?.items.map((i) => [i.name, i.upload])).toEqual([['later.txt', undefined]]);
    await expect(second.retryPile(pile.id)).resolves.toBeUndefined();
    const before = await stateOf(folder.id);
    const next = await runFake(drive, root, opts());
    if (next.phase !== 'done') throw new Error('failed');
    expect(next.report.setAside).toContainEqual({ name: folder.name, why: 'Some of its things changed after they were added. Remove it and add them again.' });
    expect(next.report.filed.map((f) => f.name)).not.toContain('later.txt');
    expect(await stateOf(folder.id)).toEqual(before);
    expect(await drive.readText(filed.id)).toBe('changed elsewhere');
  });

  it('a line added to a declared pile is its context, and the pile is filed', async () => {
    const { pile, folder } = await readyPile('');
    await fresh().updatePile(pile.id, 'Receipts from Alex');
    const trash = vi.spyOn(drive, 'trash');
    const out = await runFake(drive, root, opts());
    if (out.phase !== 'done') throw new Error('failed');
    expect(out.report.filed.filter((f) => f.name === 'arrived.pdf' || f.name === 'missing.pdf')).toHaveLength(2);
    expect(out.report.setAside).toEqual([]);
    expect(trash.mock.calls.filter(([id]) => id === folder.id)).toHaveLength(1);
    expect((await fresh().piles()).some((p) => p.id === pile.id)).toBe(false);
  });

  it('a cleared line keeps an empty note, and the pile is filed', async () => {
    const { pile, folder } = await readyPile();
    const note = (await drive.listAll(folder.id)).find((f) => f.name === 'Pile note.md');
    await fresh().updatePile(pile.id, '');
    expect((await drive.listAll(folder.id)).filter((f) => f.name === 'Pile note.md').map((f) => f.id)).toEqual([note?.id]);
    expect(note && (await drive.readText(note.id))).toBe('');
    const trash = vi.spyOn(drive, 'trash');
    const out = await runFake(drive, root, opts());
    if (out.phase !== 'done') throw new Error('failed');
    expect(out.report.filed.filter((f) => f.name === 'arrived.pdf' || f.name === 'missing.pdf')).toHaveLength(2);
    expect(trash.mock.calls.filter(([id]) => id === folder.id)).toHaveLength(1);
  });

  /** Another client put the pile's note in the Bin through Bower, and said so in your changes. */
  async function noteBinnedByYou(folder: { id: string; name: string }) {
    const note = (await drive.listAll(folder.id)).find((f) => f.name === 'Pile note.md');
    if (!note) throw new Error('no note');
    await drive.trash(note.id);
    const changes = (await drive.listAll(root)).find((f) => f.folder && drive.pathOf(f.id, root) === '.bower/changes');
    if (!changes) throw new Error('no changes folder');
    const line = { v: 1, id: 'c-note-binned', device: 'device-other', at: Date.now(), kind: 'trash', what: 'Put Pile note in the Bin', path: `Inbox/${folder.name}/Pile note.md`, fileId: note.id };
    await drive.createText(changes.id, 'c-note-binned.json', JSON.stringify(line));
  }

  it('a note you put in the Bin through Bower leaves the pile ready without it', async () => {
    await fresh().addRule('anything from the dentist goes in health');
    const { folder } = await readyPile();
    await noteBinnedByYou(folder);
    const createText = vi.spyOn(drive, 'createText');
    const trash = vi.spyOn(drive, 'trash');
    const out = await runFake(drive, root, opts());
    if (out.phase !== 'done') throw new Error('failed');
    expect(out.report.filed.filter((f) => f.name === 'arrived.pdf' || f.name === 'missing.pdf')).toHaveLength(2);
    expect(createText.mock.calls.filter((c) => c[0] === folder.id)).toEqual([]);
    expect(trash.mock.calls.filter(([id]) => id === folder.id)).toHaveLength(1);
  });

  it('a pile left with nothing is offered for removal, never filed', async () => {
    const { pile, folder } = await readyPile('Only a line', []);
    await noteBinnedByYou(folder);
    const before = await stateOf(folder.id);
    const out = await runFake(drive, root, opts());
    if (out.phase !== 'done') throw new Error('failed');
    expect(out.report.setAside).toContainEqual({ name: folder.name, why: 'Nothing is left in it. Remove it from your inbox.' });
    expect(out.report.filed.map((f) => f.name)).not.toContain('Your note');
    expect(await stateOf(folder.id)).toEqual(before);
    expect((await fresh().piles()).some((p) => p.id === pile.id)).toBe(true);
  });

  // TL-P2-32: the runner never writes into the Inbox; the pile waits until the app writes its note again (TL-P2-08 b).
  it('a note missing for no reason you gave holds the pile until it is written again', async () => {
    const { folder } = await readyPile();
    const note = (await drive.listAll(folder.id)).find((f) => f.name === 'Pile note.md');
    if (!note) throw new Error('no note');
    await drive.trash(note.id);
    const before = await stateOf(folder.id);
    const createText = vi.spyOn(drive, 'createText');
    const trash = vi.spyOn(drive, 'trash');
    const out = await runFake(drive, root, opts());
    if (out.phase !== 'done') throw new Error('failed');
    expect(createText.mock.calls.filter((c) => c[0] === folder.id)).toEqual([]);
    expect(out.report.filed.filter((f) => f.name === 'arrived.pdf' || f.name === 'missing.pdf')).toEqual([]);
    expect(out.report.setAside).toContainEqual({ name: folder.name, why: 'Some of its things have not arrived yet.' });
    expect(trash.mock.calls.filter(([id]) => id === folder.id)).toEqual([]);
    expect(await stateOf(folder.id)).toEqual(before);
  });

  it('a big declared file is still checked after the pretend Drive is reloaded', async () => {
    const big = { name: 'big scan.pdf', kind: 'pdf' as const, origin: 'From this computer', body: new Blob([new Uint8Array(300 * 1024).fill(7)]) };
    const { pile, folder } = await readyPile('Papers from Alex', [big, pdf('arrived.pdf')]);
    const out = await runFake(drive, root, opts({ onPhase: async (p) => { if (p === 'writing') await drive.createText(folder.id, 'later.txt', 'later'); } }));
    if (out.phase !== 'done') throw new Error('failed');
    expect(out.report.filed.map((f) => f.name).sort()).toEqual(expect.arrayContaining(['arrived.pdf', 'big scan.pdf']));
    // A reload keeps a big file's name, size and hash, not its bytes.
    drive = FakeDrive.restore(await drive.snapshot());
    const seen = (await fresh().piles()).find((p) => p.id === pile.id);
    expect(seen?.items.map((i) => [i.name, i.upload])).toEqual([['later.txt', undefined]]);
    const next = await runFake(drive, root, opts());
    if (next.phase !== 'done') throw new Error('failed');
    expect(next.report.setAside).toEqual([]);
    expect(next.report.filed.map((f) => f.name)).toEqual(['later.txt']);
  });

  it('a big file reloaded without its hash is set aside as not checked', async () => {
    const big = { name: 'big scan.pdf', kind: 'pdf' as const, origin: 'From this computer', body: new Blob([new Uint8Array(300 * 1024).fill(7)]) };
    const { folder } = await readyPile('Papers from Alex', [big, pdf('arrived.pdf')]);
    // An older snapshot kept only the name and size of a big file.
    const old = JSON.parse(await drive.snapshot()) as { files: Array<Record<string, unknown>> };
    for (const f of old.files) delete f.sha256;
    drive = FakeDrive.restore(JSON.stringify(old));
    const out = await runFake(drive, root, opts());
    if (out.phase !== 'done') throw new Error('failed');
    expect(out.report.setAside).toContainEqual({ name: folder.name, why: 'Bower could not check some of its things. Try again.' });
    expect(out.report.filed.map((f) => f.name)).not.toContain('arrived.pdf');
    expect((await drive.listAll(folder.id)).map((f) => f.name).sort()).toEqual(['Pile note.md', 'arrived.pdf', 'big scan.pdf']);
  });

  it('a cleared line with every member gone is offered for removal, never filed', async () => {
    const { pile, folder } = await readyPile();
    await fresh().updatePile(pile.id, '');
    // The members leave the pile directly in Drive, their bytes unchanged.
    const elsewhere = (await drive.listAll(root)).find((f) => f.folder && drive.pathOf(f.id, root) === 'Resources');
    if (!elsewhere) throw new Error('no Resources');
    for (const f of (await drive.listAll(folder.id)).filter((x) => x.name.endsWith('.pdf'))) await drive.update(f.id, { addParent: elsewhere.id, removeParent: folder.id });
    const before = await stateOf(folder.id);
    const createText = vi.spyOn(drive, 'createText');
    const out = await runFake(drive, root, opts());
    if (out.phase !== 'done') throw new Error('failed');
    expect(out.report.setAside).toContainEqual({ name: folder.name, why: 'Nothing is left in it. Remove it from your inbox.' });
    expect(out.report.filed.map((f) => f.name)).not.toContain('Your note');
    expect(createText.mock.calls.filter((c) => c[1].endsWith('.md') && c[1] !== 'Pile note.md')).toEqual([]);
    expect(await stateOf(folder.id)).toEqual(before);
    expect((await drive.listAll(root)).some((f) => f.name === '.md')).toBe(false);
  });

  it('a note written again by someone else during the run is not written twice', async () => {
    const { folder } = await readyPile();
    const note = (await drive.listAll(folder.id)).find((f) => f.name === 'Pile note.md');
    if (!note) throw new Error('no note');
    const key = note.appProperties?.[PROP.item] ?? '';
    await drive.trash(note.id);
    let other = '';
    const out = await runFake(drive, root, opts({ onPhase: async (p) => { if (p === 'writing') other = (await drive.createText(folder.id, 'Pile note.md', 'Papers from Alex', { [PROP.item]: key })).id; } }));
    if (out.phase !== 'done') throw new Error('failed');
    // The run held the pile: the one note is the one written meanwhile, and the next run files the pile with it.
    expect(out.report.filed.filter((f) => f.name === 'arrived.pdf' || f.name === 'missing.pdf')).toEqual([]);
    const notes = (await drive.listAll(root)).filter((f) => f.name === 'Pile note.md' && f.appProperties?.[PROP.item] === key);
    expect(notes.map((f) => f.id)).toEqual([other]);
    const next = await runFake(drive, root, opts());
    if (next.phase !== 'done') throw new Error('failed');
    expect(next.report.filed.filter((f) => f.name === 'arrived.pdf' || f.name === 'missing.pdf')).toHaveLength(2);
  });

  it('an unmarked pile is filed as before', async () => {
    const pile = await vault.addPile({ text: 'Papers from Alex', items: [pdf('arrived.pdf'), pdf('missing.pdf')] });
    await vault.settled();
    const folder = await folderOf(pile.id);
    expect(folder.appProperties?.[PROP.declaration]).toBeUndefined();
    const trash = vi.spyOn(drive, 'trash');
    const out = await runFake(drive, root, opts());
    if (out.phase !== 'done') throw new Error('failed');
    expect(out.report.filed.filter((f) => f.name === 'arrived.pdf' || f.name === 'missing.pdf')).toHaveLength(2);
    expect(out.report.setAside).toEqual([]);
    expect(trash.mock.calls.filter(([id]) => id === folder.id)).toHaveLength(1);
    expect((await drive.listAll(root)).some((f) => f.id === folder.id)).toBe(false);
  });

  it('an unmarked pile keeps its folder when a child arrives after the run took it', async () => {
    const pile = await vault.addPile({ text: 'Papers from Alex', items: [pdf('arrived.pdf'), pdf('missing.pdf')] });
    await vault.settled();
    const folder = await folderOf(pile.id);
    const out = await runFake(drive, root, opts({ onPhase: async (p) => { if (p === 'writing') await drive.createText(folder.id, 'later.txt', 'later'); } }));
    if (out.phase !== 'done') throw new Error('failed');
    expect(out.report.filed.filter((f) => f.name === 'arrived.pdf' || f.name === 'missing.pdf')).toHaveLength(2);
    const live = await drive.listAll(root);
    expect(live.some((f) => f.id === folder.id)).toBe(true);
    expect(live.filter((f) => f.parents[0] === folder.id).map((f) => f.name).sort()).toEqual(['Pile note.md', 'later.txt']);
  });
});
