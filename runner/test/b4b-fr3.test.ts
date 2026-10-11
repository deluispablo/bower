/** Addendum 15: consumed words and their parent stay visible when an item Bin cannot settle. */
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256Sync } from '../../src/data/contracts/hashes';
import { parseObservations, validLearnedBlock } from '../../src/data/contracts/observations';
import { ABOUT_REGIONS } from '../../src/data/contracts/ownership-format';
import { timelineLine } from '../../src/data/contracts/timeline-line';
import { BowerError, type RunReport } from '../../src/data/contracts/types';
import { PILE_NOTE } from '../../src/data/piles';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import type { RunManifest } from '../../src/data/spine/records';
import type { ClaudeSpawn } from '../src/claude';
import type { LoadedCase } from '../src/corpus';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { runOnDrive, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';

const DAY = Date.UTC(2026, 9, 7, 9);
const ABOUT = 'About me.md';
const LEDGER = '.bower/observations.jsonl';
const HUB = 'Projects/Job hunt/Job hunt.md';
const REMOTE = 'Alex prefers remote roles.';
const NEWS = 'Alex received a remote developer offer.';
const ADDED = 'Also remember Alex grows beans.\n';
const SOURCE = 'Resources/Source.txt';
const EMPTY = { kind: 'tidy-intent', v: 1, things: [] };
const kinds = ['memory', 'filing', 'Forget'] as const;
type Kind = typeof kinds[number];
type Fact = ReturnType<typeof parseObservations>['live'][number];
interface Frame {
  piles: Array<{ pileId: string; words: string }>;
  sources?: Array<{ itemId: string }>;
  notes?: Array<{ path: string }>;
}
const ledger = (run: CaseRun) => parseObservations(new TextEncoder().encode(run.after[LEDGER] ?? ''));
const report = (run: CaseRun): RunReport | undefined =>
  (run.lastRun as { run?: { report?: RunReport } } | null)?.run?.report;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  });
  vi.setSystemTime(DAY);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function learned(facts: readonly Fact[]): string {
  const labels = ['About you', "What you're working on", 'How you like things'];
  return '---\nsummary: Alex keeps personal context.\n---\n# About me\n\nAlex grows beans.\n\n'
    + '## What Bower has learned\n' + ABOUT_REGIONS.map((region, i) =>
      `<!-- bower:ownership/2 begin ${region} -->\n### ${labels[i]}\n`
      + facts.filter((fact) => fact.section === region).map((fact) =>
        timelineLine({ date: fact.date, text: fact.text, source: 'Source' }) + '\n').join('')
      + `<!-- bower:ownership/2 end ${region} -->\n`).join('');
}

async function fixture(kind: Kind) {
  const words = kind === 'memory' ? `Remember: ${REMOTE}` : kind === 'Forget'
    ? 'Forget my remote preference.' : `Update Job hunt: ${NEWS}`;
  const c: LoadedCase = {
    id: 'b4b-fr3-runtime', capability: 'C05', title: 'Alex adds words during a run', covers: 'model', source: 'new',
    scope: 'all', allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '',
    questions: [], journal: [], bowerOwned: [HUB], inbox: [{ line: words, files: [] }], inboxFiles: {},
    folder: { [ABOUT]: learned([]), [LEDGER]: '', [SOURCE]: REMOTE + '\n',
      [HUB]: '---\nby: bower\nsummary: Alex records job offers.\n---\n# Job hunt\n\n## Timeline\n' },
  };
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const id = async (path: string) => {
    const file = (await drive.listAll(root)).find((file) => drive.pathOf(file.id, root) === path);
    if (!file) throw new Error(`Missing synthetic fixture ${path}`);
    return file.id;
  };
  if (kind === 'Forget') {
    const fact: Fact = { v: 1, kind: 'observation', eventId: 'event-remote', factId: 'fact-remote',
      section: 'about-preferences', category: 'preference', date: '2026-10-06', text: REMOTE,
      source: { fileId: await id(SOURCE), sha256: sha256Sync(c.folder[SOURCE] ?? '') },
      origin: { kind: 'words', runId: 'historical-run', captureId: 'a'.repeat(64), pileId: 'history-remote' } };
    for (const [path, text] of [[LEDGER, JSON.stringify(fact) + '\n'], [ABOUT, learned([fact])]]) {
      const fileId = await id(path ?? '');
      await drive.writeText(fileId, text ?? '', (await drive.get(fileId)).modifiedTime);
    }
  }
  const wordsPath = `Inbox/${words.slice(0, 40)}/${PILE_NOTE}`;
  const wordsId = await id(wordsPath);
  const wordsFile = await drive.get(wordsId);
  const parentId = wordsFile.parents[0];
  if (!parentId) throw new Error('Synthetic words have no parent.');
  expect(validLearnedBlock(await drive.readText(await id(ABOUT)), parseObservations(
    new TextEncoder().encode(await drive.readText(await id(LEDGER))))), 'valid B4a seed').toBe(true);
  return { kind, c, drive, root, id, words, wordsPath, wordsId, wordsFile, parentId };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

async function execute(f: Fixture) {
  const admission = await planAdmission(fakeRead(f.drive), f.root, { scope: 'all', clock: () => DAY,
    newId: () => 'b4b-fr3-admission' });
  if (admission.kind !== 'manifest') throw new Error(`Fixture not admitted: ${admission.cause}`);
  const destination = await f.id('Projects/Job hunt');
  const hubId = await f.id(HUB);
  const frames: Frame[] = [];
  const refusals: string[] = [];
  const spawn: ClaudeSpawn = phaseAwareClaude(async (call, _step, _attempt, phase) => {
    const frame = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as Frame;
    if (phase === 'selection') return reply({ items: (frame.sources ?? []).map((source) => ({
      itemId: source.itemId, kind: 'unknown', destination, wants: f.kind === 'filing' ? [hubId] : [],
    })), asks: [] });
    frames.push(frame);
    const refusal = /^Your reply was refused:.*$/m.exec(call.input)?.[0];
    if (refusal) refusals.push(refusal);
    return reply(f.kind === 'memory' ? { ...EMPTY, observations: [{ source: { pileId: frame.piles[0]?.pileId },
      section: 'about-preferences', category: 'preference', text: REMOTE }] }
      : f.kind === 'Forget' ? { ...EMPTY, forget: [{ factId: 'fact-remote' }] }
        : { ...EMPTY, lines: [{ note: HUB, text: NEWS, cites: frame.piles[0]?.pileId }] });
  }, () => ({ drive: f.drive, root: f.root, admission: admission.manifest }), true);
  const run = await runOnDrive(f.c, f.drive, f.root, { claude: spawn, admission: admission.manifest,
    pacing: { baseMs: 0, sleep: async () => {} } }, 1);
  expect(refusals, 'the same supported intent reaches settlement, without model retry/refusal').toEqual([]);
  expect(frames[0]?.piles, 'main read only the original words').toEqual([{ pileId: 'p-1', words: f.words, things: [] }]);
  if (f.kind === 'filing') {
    expect(frames[0]?.notes?.some((note) => note.path === HUB), 'the actual filing target was selected').toBe(true);
    expect(run.after[HUB], 'the ordinary filing effect succeeded').toContain(NEWS);
    expect(run.after[LEDGER], 'ordinary filing does not learn a fact').toBe('');
  } else if (f.kind === 'memory') {
    expect(ledger(run).live.map((fact) => fact.text), 'the ledger append succeeded').toEqual([REMOTE]);
  } else {
    expect(ledger(run).tombstones.map((tombstone) => tombstone.factId), 'the Forget effect succeeded').toEqual(['fact-remote']);
    expect(ledger(run).live).toEqual([]);
  }
  return run;
}

function frozen(run: CaseRun): RunManifest {
  const text = Object.entries(run.after).find(([path]) => /\/manifest-[a-f0-9]+\.json$/.test(path))?.[1];
  expect(text, 'main persisted its real frozen manifest').toBeTypeOf('string');
  return JSON.parse(text ?? 'null') as RunManifest;
}

async function retained(f: Fixture, run: CaseRun) {
  const dispositions = JSON.parse(Object.entries(run.after).find(([path]) => path.endsWith('/dispositions.json'))?.[1]
    ?? '{"items":[]}') as { items: Array<{ fileId: string; disposition: string }> };
  return { code: run.code, phase: run.wire?.statuses.at(-1)?.phase, reportPublished: report(run) !== undefined,
    words: run.after[f.wordsPath], wordsBinned: (await f.drive.evidence(f.wordsId))?.trashed,
    parentBinned: (await f.drive.evidence(f.parentId))?.trashed,
    notDone: report(run)?.setAside,
    disposition: dispositions.items.filter((item) => item.fileId === f.wordsId).map((item) => item.disposition) };
}

async function control(kind: Kind) {
  const f = await fixture(kind);
  const run = await execute(f);
  expect(await retained(f, run), 'unchanged words really settle through main and both Bins').toEqual({
    code: 0, phase: 'done', reportPublished: true, words: undefined, wordsBinned: true, parentBinned: true,
    notDone: [], disposition: ['filed'],
  });
  if (kind === 'filing') expect(report(run)?.filed).toHaveLength(1);
  else expect(report(run)?.updated.filter((row) => row.path === ABOUT)).toHaveLength(1);
}

describe('B4b fix round 3, addendum 15', () => {
  for (const kind of kinds) {
    it(`control: b4b-fr3-stale-words-${kind}`, async () => { await control(kind); });

    it(`b4b-fr3-stale-words-${kind}`, async () => {
      const f = await fixture(kind);
      const effectId = await f.id(kind === 'filing' ? HUB : LEDGER);
      const write = f.drive.writeText.bind(f.drive);
      let appended = false;
      let changedTime: string | undefined;
      vi.spyOn(f.drive, 'writeText').mockImplementation(async (...args) => {
        const answer = await write(...args);
        // Reproduce the live race after the consumed effect lands, before the words Bin.
        if (args[0] === effectId && !appended) {
          appended = true;
          const changed = await write(f.wordsId, f.words + '\n' + ADDED, f.wordsFile.modifiedTime);
          changedTime = changed.modifiedTime;
        }
        return answer;
      });
      const bins = vi.spyOn(f.drive, 'trash');
      const run = await execute(f);
      expect(appended, 'the successful effect reached the injected post-read append').toBe(true);
      expect(changedTime).not.toBe(f.wordsFile.modifiedTime);
      const itemBin = frozen(run).operations.find((op) => op.effect.kind === 'bin' && op.effect.before.fileId === f.wordsId);
      expect(itemBin?.effect, 'the words Bin carries the version main consumed').toMatchObject({
        before: { modifiedTime: f.wordsFile.modifiedTime },
      });
      expect({ ...await retained(f, run), bins: bins.mock.calls.map(([id]) => id) },
        `${kind}: added words are unread, unconsumed and visibly not done; nothing goes to the Bin`).toEqual({
        code: 0, phase: 'done', reportPublished: true, words: f.words + '\n' + ADDED,
        wordsBinned: false, parentBinned: false, disposition: ['set-aside'], bins: [],
        notDone: [{ name: f.words.slice(0, 40), why: expect.stringMatching(/\S/) }],
      });
    });

    it(`control: b4b-fr3-item-bin-conflict-${kind}`, async () => { await control(kind); });

    it(`b4b-fr3-item-bin-conflict-${kind}`, async () => {
      const f = await fixture(kind);
      const trash = f.drive.trash.bind(f.drive);
      const bins = vi.spyOn(f.drive, 'trash').mockImplementation(async (...args) => {
        if (args[0] === f.wordsId) throw new BowerError('conflict', 'This file changed elsewhere.');
        return trash(...args);
      });
      const run = await execute(f);
      expect(bins.mock.calls.filter(([id]) => id === f.wordsId).length, 'main reached the item Bin conflict').toBeGreaterThan(0);
      const manifest = frozen(run);
      const itemBins = manifest.operations.filter((op) => op.effect.kind === 'bin'
        && op.effect.before.parents.includes(f.parentId));
      const parentBin = manifest.operations.find((op) => op.effect.kind === 'bin' && op.effect.before.fileId === f.parentId);
      expect(itemBins.map((op) => op.effect.kind === 'bin' ? op.effect.before.fileId : ''), 'the frozen child Bin is real').toContain(f.wordsId);
      expect(parentBin, 'the frozen parent Bin is real').toBeDefined();
      expect({ ...await retained(f, run), parentBinAttempted: bins.mock.calls.some(([id]) => id === f.parentId),
        parentDependencies: parentBin?.dependsOn, itemBinIds: itemBins.map((op) => op.operationId) },
        `${kind}: a parent waits for every child Bin, never the effect; a conflict publishes not done and ends`).toEqual({
        code: 0, phase: 'done', reportPublished: true, words: f.words + '\n',
        wordsBinned: false, parentBinned: false, disposition: ['set-aside'], parentBinAttempted: false,
        parentDependencies: itemBins.map((op) => op.operationId), itemBinIds: itemBins.map((op) => op.operationId),
        notDone: [{ name: f.words.slice(0, 40), why: expect.stringMatching(/\S/) }],
      });
    });
  }
});
