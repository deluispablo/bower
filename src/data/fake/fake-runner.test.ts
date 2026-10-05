import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { driveError } from '../drive/drive-api';
import { FakeDrive } from '../drive/fake-drive';
import { DriveVault } from '../vault/drive-vault';
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
