import { beforeEach, describe, expect, it } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { DriveVault } from '../vault/drive-vault';
import { seedFakeDrive } from './seed';
import { runFake, type FakeRunOptions } from './fake-runner';
import type { RunPhase } from '../types';

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
    expect(paths).toContain('Areas/Money/Receipts/2026-10/Taxi.pdf');
    expect(paths).toContain('Projects/Job hunt/Applications/Offer, Industrial Designer, Ferrowick.pdf');
    expect(paths.some((p) => p.startsWith('.bower/changes/archive/'))).toBe(true);
  });

  it('marks what it filed as new, and only that', async () => {
    const out = await runFake(drive, root, opts());
    if (out.phase !== 'done') throw new Error('failed');
    const all = await drive.listAll(root);
    const flagged = all.filter((f) => f.appProperties?.bowerNew === '1').map((f) => drive.pathOf(f.id, root));
    expect(flagged).toContain('Areas/Money/Receipts/2026-10/Taxi.pdf');
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
    expect(out.phase === 'done' && out.report.yourChanges).toBe(1);
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
