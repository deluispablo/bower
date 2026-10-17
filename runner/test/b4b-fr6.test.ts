/** Addendum 18: Forget needs item-bound verbatim evidence and a unique live-fact match. */
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256Sync } from '../../src/data/contracts/hashes';
import { parseObservations, validLearnedBlock } from '../../src/data/contracts/observations';
import { ABOUT_REGIONS } from '../../src/data/contracts/ownership-format';
import type { QuestionOption } from '../../src/data/contracts/questions';
import { timelineLine } from '../../src/data/contracts/timeline-line';
import type { Question, RunReport } from '../../src/data/contracts/types';
import { PILE_NOTE } from '../../src/data/piles';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { SYSTEM } from '../../src/data/vault/layout';
import type { LoadedCase } from '../src/corpus';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { frameOf, runOnDrive, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';

const DAY = Date.UTC(2026, 9, 7, 9);
const ABOUT = 'About me.md';
const LEDGER = '.bower/observations.jsonl';
const SOURCE = 'Resources/Source.txt';
const REMOTE = 'Alex keeps a REMOTE   preference.';
const GARDEN = 'Alex keeps a gardening fact.';
type Fact = ReturnType<typeof parseObservations>['live'][number];
interface Frame {
  piles: Array<{ pileId: string; words: string }>;
  sources?: Array<{ itemId: string }>;
  aboutMe?: { learned: { factIds: string[] } };
}
const ledger = (run: CaseRun) => parseObservations(new TextEncoder().encode(run.after[LEDGER] ?? ''));
const report = (run: CaseRun): RunReport | undefined =>
  (run.lastRun as { run?: { report?: RunReport } } | null)?.run?.report;
const questions = (run: CaseRun) => (JSON.parse(run.after[SYSTEM.questions] ?? '{"questions":[]}') as {
  questions: Array<Omit<Question, 'options'> & { options?: QuestionOption[] }>;
}).questions;

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
  return '---\nsummary: Alex keeps personal context.\n---\n# About me\n\n## What Bower has learned\n'
    + ABOUT_REGIONS.map((region, i) => `<!-- bower:ownership/2 begin ${region} -->\n### ${labels[i]}\n`
      + facts.filter((fact) => fact.section === region).map((fact) =>
        timelineLine({ date: fact.date, text: fact.text, source: 'Source' }) + '\n').join('')
      + `<!-- bower:ownership/2 end ${region} -->\n`).join('');
}

async function fixture(words: string) {
  const c: LoadedCase = {
    id: 'b4b-fr6-runtime', capability: 'C05', title: 'Alex asks to forget a fact', covers: 'model', source: 'new',
    scope: 'all', allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '',
    questions: [], journal: [], bowerOwned: [], inbox: [{ line: words, files: [] }], inboxFiles: {},
    folder: { [ABOUT]: learned([]), [LEDGER]: '', [SOURCE]: REMOTE + '\n' + GARDEN + '\n' },
  };
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const id = async (path: string) => {
    const file = (await drive.listAll(root)).find((file) => drive.pathOf(file.id, root) === path);
    if (!file) throw new Error(`Missing synthetic fixture ${path}`);
    return file.id;
  };
  const facts: Fact[] = [
    { v: 1, kind: 'observation', eventId: 'event-remote', factId: 'fact-remote', section: 'about-preferences',
      category: 'preference', date: '2026-10-06', text: REMOTE,
      source: { fileId: await id(SOURCE), sha256: sha256Sync(c.folder[SOURCE] ?? '') },
      origin: { kind: 'words', runId: 'historical-run', captureId: 'a'.repeat(64), pileId: 'history-remote' } },
    { v: 1, kind: 'observation', eventId: 'event-garden', factId: 'fact-garden', section: 'about-you',
      category: 'biography', date: '2026-10-06', text: GARDEN,
      source: { fileId: await id(SOURCE), sha256: sha256Sync(c.folder[SOURCE] ?? '') },
      origin: { kind: 'words', runId: 'historical-run', captureId: 'a'.repeat(64), pileId: 'history-garden' } },
  ];
  const before = facts.map((fact) => JSON.stringify(fact)).join('\n') + '\n';
  for (const [path, text] of [[LEDGER, before], [ABOUT, learned(facts)]] as const) {
    const fileId = await id(path);
    await drive.writeText(fileId, text, (await drive.get(fileId)).modifiedTime);
  }
  expect(validLearnedBlock(await drive.readText(await id(ABOUT)), parseObservations(
    new TextEncoder().encode(before))), 'valid live remote and gardening facts').toBe(true);
  const wordsPath = `Inbox/${words.slice(0, 40)}/${PILE_NOTE}`;
  const wordsId = await id(wordsPath);
  const parentId = (await drive.get(wordsId)).parents[0];
  if (!parentId) throw new Error('Synthetic words have no parent.');
  return { c, drive, root, id, facts, before, words, wordsPath, wordsId, parentId };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

async function execute(f: Fixture, factId: string, quote?: string) {
  const admission = await planAdmission(fakeRead(f.drive), f.root, { scope: 'all', clock: () => DAY,
    newId: () => 'b4b-fr6-admission' });
  if (admission.kind !== 'manifest') throw new Error(`Fixture not admitted: ${admission.cause}`);
  const destination = await f.id('Resources');
  const frames: Frame[] = [];
  const refusals: string[] = [];
  const claude = phaseAwareClaude(async (call, _step, _attempt, phase) => {
    const frame = frameOf(call) as Frame;
    if (phase === 'selection') return reply({ items: (frame.sources ?? []).map((source) => ({
      itemId: source.itemId, kind: 'unknown', destination, wants: [],
    })), asks: [] });
    frames.push(frame);
    const refusal = /^Your reply was refused:.*$/m.exec(call.input)?.[0];
    if (refusal) refusals.push(refusal);
    return reply({ kind: 'tidy-intent', v: 1, things: [],
      forget: [{ factId, ...(quote === undefined ? {} : { quote }) }] });
  }, () => ({ drive: f.drive, root: f.root, admission: admission.manifest }), true);
  const run = await runOnDrive(f.c, f.drive, f.root, { claude, admission: admission.manifest,
    pacing: { baseMs: 0, sleep: async () => {} } }, 1);
  expect(frames[0]?.piles, 'main read the actual single Forget request').toEqual([
    { pileId: 'p-1', words: f.words, things: [] },
  ]);
  expect(frames[0]?.aboutMe?.learned.factIds, 'both live ids were shown to the model, in About me\'s order').toEqual(
    ABOUT_REGIONS.flatMap((region) => f.facts.filter((fact) => fact.section === region)).map((fact) => fact.factId));
  return { ...run, refusals };
}

async function asked(f: Fixture, run: CaseRun) {
  const open = questions(run).filter((question) => question.subject === 'p-1');
  return { code: run.code, phase: run.wire?.statuses.at(-1)?.phase,
    unchanged: run.after[LEDGER] === f.before, words: run.after[f.wordsPath]?.trim(),
    wordsBinned: (await f.drive.evidence(f.wordsId))?.trashed,
    parentBinned: (await f.drive.evidence(f.parentId))?.trashed,
    updated: report(run)?.updated ?? [], questions: open.length,
    choices: open.flatMap((question) => question.options?.map((option) => option.action) ?? []) };
}

async function expectAsk(f: Fixture, run: CaseRun, finding: string) {
  expect(await asked(f, run), finding).toEqual({ code: 0, phase: 'done', unchanged: true, words: f.words,
    wordsBinned: false, parentBinned: false, updated: [], questions: 1,
    choices: ABOUT_REGIONS.flatMap((region) => f.facts.filter((fact) => fact.section === region))
      .map((fact) => ({ kind: 'forget-fact', factId: fact.factId })) });
}

const cases = [
  { name: 'wrong-id', words: 'Forget my gardening fact', factId: 'fact-remote', quote: 'gardening',
    controlId: 'fact-garden', controlWords: 'Forget my gardening fact', controlQuote: 'gardening' },
  { name: 'quote-outside-words', words: 'Forget my remote preference', factId: 'fact-garden', quote: 'gardening',
    controlId: 'fact-garden', controlWords: 'Forget my gardening fact', controlQuote: 'gardening' },
  { name: 'two-live-matches', words: 'Forget my remote preference: Alex keeps it', factId: 'fact-remote', quote: 'Alex keeps',
    controlId: 'fact-remote', controlWords: 'Forget my remote preference: Alex keeps it', controlQuote: 'remote preference' },
  { name: 'single-request-no-quote', words: 'Forget my remote preference', factId: 'fact-remote', quote: undefined,
    controlId: 'fact-remote', controlWords: 'Forget my remote preference', controlQuote: 'remote preference' },
] as const;

describe('B4b fix round 6, addendum 18', () => {
  for (const scenario of cases) {
    it(`control: b4b-fr6-${scenario.name}`, async () => {
      const f = await fixture(scenario.controlWords);
      expect(f.words, 'control supplies a verbatim quote from this item').toContain(scenario.controlQuote);
      const run = await execute(f, scenario.controlId, scenario.controlQuote);
      expect({ code: run.code, phase: run.wire?.statuses.at(-1)?.phase, refusals: run.refusals,
        live: ledger(run).live.map((fact) => fact.factId), forgotten: ledger(run).tombstones.map((t) => t.factId),
        wordsBinned: (await f.drive.evidence(f.wordsId))?.trashed,
        parentBinned: (await f.drive.evidence(f.parentId))?.trashed, questions: questions(run).length,
        updated: report(run)?.updated.filter((row) => row.path === ABOUT).length ?? 0 },
      'a unique case- and space-normalized quote with its correct id forgets directly').toEqual({
        code: 0, phase: 'done', refusals: [], live: f.facts.filter((fact) => fact.factId !== scenario.controlId)
          .map((fact) => fact.factId), forgotten: [scenario.controlId], wordsBinned: true, parentBinned: true,
        questions: 0, updated: 1,
      });
    });

    it(`b4b-fr6-${scenario.name}`, async () => {
      const f = await fixture(scenario.words);
      const run = await execute(f, scenario.factId, scenario.quote);
      if (scenario.name === 'quote-outside-words') {
        expect(f.words).not.toContain(scenario.quote);
        const state = await asked(f, run);
        expect({ unchanged: state.unchanged, words: state.words, wordsBinned: state.wordsBinned,
          parentBinned: state.parentBinned, updated: state.updated,
          refusedOrAsked: run.refusals.length > 0 || state.questions === 1 && state.choices.length === 2
            && state.choices.every((choice) => choice.kind === 'forget-fact') },
        'an invented quote cannot authorize any Forget or settle its item').toEqual({ unchanged: true,
          words: f.words, wordsBinned: false, parentBinned: false, updated: [], refusedOrAsked: true });
      } else {
        await expectAsk(f, run, `${scenario.name}: evidence cannot authorize the named fact; ask without settlement`);
      }
    });
  }

  it('b4b-fr6-pass5-legacy-wrong-id', async () => {
    const f = await fixture('Forget my gardening fact');
    const run = await execute(f, 'fact-remote');
    const forgotten = ledger(run).tombstones.map((t) => t.factId);
    if (forgotten.length) {
      expect(forgotten, 'pass 5 must never forget the unrelated remote preference').toEqual(['fact-garden']);
      expect(ledger(run).live.map((fact) => fact.factId)).toEqual(['fact-remote']);
    } else {
      await expectAsk(f, run, 'the exact pass-5 reply asks through forget-fact without settling its words');
    }
  });
});
