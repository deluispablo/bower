/**
 * audit-runner-maintain: a damaged About me is skipped like any damaged note, a note binned before lint's read leaves the
 * run's notes, and the health note resolves links in linear time (harnesses from b4c-projection, b8c-coverage and
 * b11-formula-values).
 */
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { noteRefusal } from '../../src/data/contracts/note-format';
import { parseObservations } from '../../src/data/contracts/observations';
import type { MaintenanceNote } from '../../src/data/contracts/run-manifest';
import { timelineLine } from '../../src/data/contracts/timeline-line';
import { PILE_NOTE } from '../../src/data/piles';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { SYSTEM } from '../../src/data/vault/layout';
import type { ClaudeSpawn } from '../src/claude';
import { loadCase, type LoadedCase } from '../src/corpus';
import { renderHealth } from '../src/lint';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { empty, observe, pacing, type Observation } from './b23-hot-observe';
import { AT, replySequence, runOnDrive, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive, paging } from './drive-v3';

const DAY = Date.UTC(2026, 9, 7, 9);
const ABOUT = 'About me.md';
const LEDGER = '.bower/observations.jsonl';
const HEALTH = 'Bower health.md';
const RETRIEVAL = '.bower/retrieval.json';
const phase = (run: CaseRun) => run.wire?.statuses.at(-1)?.phase;
const loggedRefusal = () => vi.mocked(console.error).mock.calls.some((args) => args.some((a) => noteRefusal(a) === 'damaged'));

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('AC1 a damaged About me', () => {
  const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
  const BEANS = 'I grow beans on the north plot.';
  const BARREL = 'I keep a rain barrel by the shed.';
  const G1 = { v: 1, kind: 'observation', eventId: 'event-g1', factId: 'g1', date: '2026-10-05', section: 'about-you', text: BEANS,
    category: 'biography', source: { fileId: 'words-g1', sha256: sha(`${BEANS}\n`) },
    origin: { kind: 'words', runId: 'history-run', captureId: sha('history-run'), pileId: 'pile-g1' } };
  // Bower's learned section with one region's end marker lost: the ownership check calls it damaged.
  const DAMAGED = '---\nsummary: What Bower knows about you. Change it whenever you like.\n---\n\n## My words\n\nI keep my own notes here.\n\n'
    + '## What Bower has learned\n<!-- bower:ownership/2 begin about-you -->\n### About you\n'
    + `${timelineLine({ date: '2026-10-05', text: BEANS, source: 'Your words' })}\n`
    + '<!-- bower:ownership/2 begin about-working-on -->\n### What you\'re working on\n<!-- bower:ownership/2 end about-working-on -->\n'
    + '<!-- bower:ownership/2 begin about-preferences -->\n### How you like things\n<!-- bower:ownership/2 end about-preferences -->\n';

  async function folder() {
    vi.setSystemTime(DAY);
    const c: LoadedCase = { id: 'audit-runner-maintain', capability: 'C05', title: 'Alex keeps learned facts', covers: 'model', source: 'new',
      scope: 'all', allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: [], journal: [],
      bowerOwned: [], inbox: [], inboxFiles: {}, folder: { [ABOUT]: DAMAGED, [LEDGER]: `${JSON.stringify(G1)}\n`,
        'Projects/Garden/Garden.md': '---\nsummary: Alex plans the garden.\n---\n# Garden\n\n## Timeline\n' } };
    const drive = fixedDrive();
    const root = await seedCase(drive, c);
    const id = async (path: string) => {
      const file = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === path);
      if (!file) throw new Error(`Missing made-up file ${path}`);
      return file.id;
    };
    return { c, drive, root, id };
  }

  it('AC1 audit-runner-maintain-about-damaged: the run shows no learned context, keeps About me as it is, and the ledger goes on', async () => {
    const f = await folder();
    const pile = await f.drive.createFolder(await f.id('Inbox'), 'Rain barrel', { pile: 'words-1' });
    await f.drive.createText(pile.id, PILE_NOTE, `${BARREL}\n`);
    const admission = await planAdmission(fakeRead(f.drive), f.root, { scope: 'all', clock: () => DAY + 1, newId: () => 'arm-admission-1' });
    if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
    const garden = await f.id('Projects/Garden');
    const frames: Array<Record<string, unknown>> = [];
    const spawn: ClaudeSpawn = phaseAwareClaude(async (call, _step, _attempt, step) => {
      const frame = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as Record<string, unknown> & { sources?: Array<{ itemId: string }>;
        piles?: Array<{ pileId: string }> };
      if (step === 'selection') return reply({ items: (frame.sources ?? []).map((s) => ({ itemId: s.itemId, kind: 'unknown', destination: garden, wants: [] })), asks: [] });
      frames.push(frame);
      return reply({ kind: 'tidy-intent', v: 1, things: [],
        observations: [{ source: { pileId: frame.piles?.[0]?.pileId }, section: 'about-you', category: 'biography', text: BARREL }] });
    }, () => ({ drive: f.drive, root: f.root, admission: admission.manifest }), true);
    const run = await runOnDrive(f.c, f.drive, f.root, { claude: spawn, admission: admission.manifest,
      pacing: { baseMs: 0, sleep: async () => {} }, answerStart: { scope: 'all', requestId: 'arm-run-1' } }, 1);
    expect(phase(run), 'a damaged About me never stops the run').toBe('done');
    expect(frames[0]?.aboutMe, 'the model is shown no learned context').toBeUndefined();
    expect(run.after[ABOUT], 'About me is left as it is').toBe(DAMAGED);
    expect(parseObservations(new TextEncoder().encode(run.after[LEDGER] ?? '')).live.map((fact) => fact.text), 'the ledger keeps the new fact')
      .toEqual(expect.arrayContaining([BEANS, BARREL]));
    expect(loggedRefusal(), 'logged as a damaged note').toBe(true);
  });

  it('AC1 audit-runner-maintain-about-damaged-idle: a run with nothing to file skips the damaged About me and ends well', async () => {
    const f = await folder();
    const run = await runOnDrive(f.c, f.drive, f.root, { admission: { v: 1, id: 'arm-idle', rootId: f.root, scope: 'all', at: DAY + 1, piles: [], journal: [] },
      pacing: { baseMs: 0, sleep: async () => {} }, answerStart: { scope: 'all', requestId: 'arm-idle' } }, 1);
    expect(phase(run), 'maintain skips About me and ends well').toBe('done');
    expect(run.after[ABOUT], 'About me is left as it is').toBe(DAMAGED);
    expect(run.after[SYSTEM.index], 'the rest of maintain goes on').toBeDefined();
    expect(loggedRefusal(), 'logged as a damaged note').toBe(true);
  });
});

describe('AC2 a note binned before its lint read', () => {
  const pageSize = paging.size;
  beforeEach(() => { paging.size = 1000; vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(AT); });
  afterEach(() => { paging.size = pageSize; });

  it('AC2 audit-runner-maintain-gone-at-lint: the note leaves the snapshot and listing; health and retrieval do not keep it', async () => {
    const LOOSE = 'Resources/Gardening/Loose thought';
    const c = await loadCase(resolve(import.meta.dirname, '../../testing/corpus/c17-b8-report-only-grammar'));
    const drive = fixedDrive();
    const root = await seedCase(drive, c);
    const traffic: Observation[] = [];
    const bin = { id: '' };
    const around = (fetch: typeof globalThis.fetch): typeof globalThis.fetch => {
      let seen = traffic.length;
      return observe(drive, root, traffic)(async (input, init = {}) => {
        const last = traffic.length > seen ? traffic.at(-1) : undefined;
        seen = traffic.length;
        if (bin.id && last?.media && last.path === `${LOOSE}.md`) {
          // The person bins the note between the listing and lint's read of it.
          await drive.trash(bin.id);
          return new Response(JSON.stringify({ error: { code: 404, message: 'File not found', errors: [{ reason: 'notFound' }] } }), { status: 404 });
        }
        return fetch(input, init);
      });
    };
    const press = (n: number) => runOnDrive(c, drive, root, { claude: replySequence([empty]), around, pacing,
      ...(n > 1 ? { request: { kind: 'tidy' as const, text: 'Check my notes again.' } } : {}) }, n);
    const first = await press(1);
    const id = Object.entries(first.pathsById).find(([, path]) => path === `${LOOSE}.md`)?.[0] ?? '';
    expect(id, 'the made-up note is there').not.toBe('');
    // An older retrieval file (b8c-coverage): no lint evidence, so the next run's lint reads the note.
    const retrievalId = Object.entries(first.pathsById).find(([, path]) => path === RETRIEVAL)?.[0] ?? '';
    const stored = JSON.parse(first.after[RETRIEVAL] ?? '{}') as { files: Record<string, Record<string, unknown>> };
    for (const file of Object.values(stored.files)) delete file.lint;
    await drive.writeText(retrievalId, JSON.stringify(stored), (await drive.get(retrievalId)).modifiedTime);
    bin.id = id;
    traffic.length = 0;
    const second = await press(2);
    expect(second.code).toBe(0);
    expect(traffic.some((e) => e.media && e.path === `${LOOSE}.md`), 'lint asked for the note').toBe(true);
    expect((second.after[HEALTH] ?? '').split('\n').filter((line) => line.includes('Loose thought')), 'health names no binned note').toEqual([]);
    const after = JSON.parse(second.after[RETRIEVAL] ?? '{}') as { files: Record<string, unknown>; listing?: Array<{ id: string }> };
    expect(after.files[id], 'retrieval keeps no record of the binned note').toBeUndefined();
    expect((after.listing ?? []).some((f) => f.id === id), 'nor a listing entry').toBe(false);
  });
});

describe('AC3 health links in linear time', () => {
  it('AC3 audit-runner-maintain-health-linear: link resolution does a bounded number of comparisons per link', () => {
    const n = 400;
    const note = (path: string, links: string[]): MaintenanceNote => ({ path, version: '2026-10-01T09:00:00.000Z', summary: 'Alex keeps notes.',
      coverage: { kind: 'prefix', bytes: 100 }, owner: 'bower', lint: { links, tags: 1, summary: true } });
    // Each note links to the next by title, by folder path and with `.md`, and to one note that does not exist.
    const notes = Array.from({ length: n }, (_, i) => note(`Resources/Garden ${i}/Plot ${i}.md`,
      [`Plot ${(i + 1) % n}`, `Garden ${(i + 1) % n}/Plot ${(i + 1) % n}`, `Plot ${(i + 1) % n}.md`, `Lost plan ${i}`]));
    const byId = Object.fromEntries(notes.map((x, i) => [`id${i}`, x]));
    const files = [...notes.map((x) => x.path), ...Array.from({ length: n }, (_, i) => `Resources/Garden ${i}/photo ${i}.png`)];
    const after = Object.fromEntries(notes.map((x, i) => [`id${i}`, { path: x.path }]));
    const ends = vi.spyOn(String.prototype, 'endsWith');
    let out: string;
    let calls: number;
    // Counted before the restore, which clears the spy's calls.
    try { out = renderHealth(byId, files, after); } finally { calls = ends.mock.calls.length; ends.mockRestore(); }
    const findings = out.split('\n').filter((line) => line.startsWith('- '));
    expect(findings.filter((line) => line.startsWith('- Broken link')), 'every missing note is found, and only those').toHaveLength(n);
    expect(findings.filter((line) => line.startsWith('- Nothing links to')), 'each note has its inbound links').toEqual([]);
    expect(calls, `comparisons per link stay bounded (${calls} suffix checks for ${4 * n} links)`).toBeLessThan(20 * n);
  });
});

describe('AC4 removals keep behaviour', () => {
  const HUNT = 'Projects/Flat hunt';
  const FLATS = { v: 1, id: 'flat-metrics', kind: 'formula', type: 'flat', outputs: [
    { property: 'price_per_area', type: 'money', expr: { op: '/', left: { property: 'rent' }, right: { property: 'area' } } }] };
  const row = { id: 'flat', match: ['flat listing'], template: 'source', properties: { rent: { type: 'money' }, area: { type: 'number' },
    price_per_area: { type: 'money' } }, table: ['rent', 'area'], views: [FLATS] };
  const flat = (i: number) => `---\nsummary: Flat ${i} is in Saltmere.\ntype: flat\nby: bower\ncreated: 2026-10-01\n`
    + `rent: ${JSON.stringify({ amount: 1000, currency: 'EUR' })}\narea: 50\n---\n\nFlat ${i} is in Saltmere.\n`;
  const pageSize = paging.size;
  beforeEach(() => { paging.size = 1000; vi.setSystemTime(DAY); });
  afterEach(() => { paging.size = pageSize; });

  it.each([[200, 'computes'], [201, 'computes none and leaves every note as it was']])(
    'AC4 audit-runner-maintain-formula-bound guard: with %i notes of its type a formula %s', async (count) => {
      const files = Object.fromEntries(Array.from({ length: count }, (_, i) => [`${HUNT}/Flat ${i}.md`, flat(i)]));
      const c: LoadedCase = { id: 'audit-runner-maintain-bound', capability: 'C05', title: 'Alex compares flats', covers: 'model', source: 'new',
        scope: 'all', allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: [], journal: [],
        bowerOwned: [], inbox: [], inboxFiles: {}, folder: { [SYSTEM.typeTable]: JSON.stringify({ v: 1, rows: [row] }, null, 2), 'Rules.md': '# Rules\n',
          [`${HUNT}/Flat hunt.md`]: '---\nby: bower\ntype: moc\nsummary: Flat hunt reference notes.\n---\n# Flat hunt\n', ...files } };
      const drive = fixedDrive();
      const root = await seedCase(drive, c);
      const changes = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === SYSTEM.changes)?.id ?? '';
      // Instructions runs with nothing to file (b11-formula-values' press); the first catches up NOTE_READS notes, the second the rest.
      const press = async (n: number): Promise<CaseRun> => {
        await drive.createText(changes, `press-${n}.json`, JSON.stringify({ v: 1, id: `press-${n}`, device: 'device-1', at: DAY + n, kind: 'request',
          what: 'Asked Bower to update the notes', text: 'Update these notes.' }));
        const admission = await planAdmission(fakeRead(drive), root, { scope: 'instructions', clock: () => DAY + n, newId: () => `arm-bound-${n}` });
        if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
        const spawn: ClaudeSpawn = phaseAwareClaude(async (_call, _step, _attempt, step) =>
          reply(step === 'selection' ? { items: [], asks: [] } : { kind: 'tidy-intent', v: 1, things: [] }),
        () => ({ drive, root, admission: admission.manifest }), true);
        const run = await runOnDrive(c, drive, root, { claude: spawn, admission: admission.manifest, pacing: { baseMs: 0, sleep: async () => {} },
          answerStart: { scope: 'instructions', requestId: `arm-bound-${n}` } }, n);
        expect(phase(run)).toBe('done');
        return run;
      };
      await press(1);
      const run = await press(2);
      const written = Object.entries(files).filter(([path, text]) => run.after[path] !== text).length;
      // At the bound the formula computes (writes are paced over runs, so some, not all, land by now); past it, none does.
      if (count > 200) expect(written, 'no flat gets computed values').toBe(0);
      else expect(written, 'the formula computes at the bound').toBeGreaterThan(0);
    }, 120_000);
});
