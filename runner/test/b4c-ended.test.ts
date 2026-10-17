/** B4c-d through production main: a fact the person's words end leaves About me (owner ruling 2026-10-14, answer 4). */
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseObservations } from '../../src/data/contracts/observations';
import { parseOwnership } from '../../src/data/contracts/ownership-format';
import type { QuestionOption } from '../../src/data/contracts/questions';
import { parseTimelineLine, timelineLine } from '../../src/data/contracts/timeline-line';
import { parseRunManifestV2 } from '../../src/data/contracts/run-manifest';
import { BowerError, type RunReport } from '../../src/data/contracts/types';
import { PILE_NOTE } from '../../src/data/piles';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { canonical } from '../../src/data/spine/records';
import { RUNNER_WRITES, SYSTEM } from '../../src/data/vault/layout';
import type { ClaudeSpawn } from '../src/claude';
import type { LoadedCase } from '../src/corpus';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { promptOf, frameOf, redispatchCase, runOnDrive, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';

const DAY = Date.UTC(2026, 9, 7, 9);
const ABOUT = 'About me.md';
const LEDGER = '.bower/observations.jsonl';
const pacing = { baseMs: 0, sleep: async () => {} };
type Region = 'about-you' | 'about-working-on' | 'about-preferences';
type Frame = { piles: Array<{ pileId: string; words: string }>; sources?: Array<{ itemId: string }>;
  aboutMe?: { learned: { text: string; cut: boolean } } };

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

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const fact = (id: string, section: Region, text: string) => ({ v: 1, kind: 'observation', eventId: `event-${id}`, factId: id,
  date: '2026-10-05', section, text, category: section === 'about-preferences' ? 'preference' : 'biography',
  source: { fileId: `words-${id}`, sha256: sha(`${text}\n`) }, origin: { kind: 'words', runId: 'history-run', captureId: sha('history-run'), pileId: `pile-${id}` } });
const POT = fact('pot', 'about-you', 'I have potatoes in the garden.');
const TOM = fact('tom', 'about-you', 'I have tomatoes in the garden.');
const TEA = fact('tea', 'about-preferences', 'I prefer tea to coffee in the morning.');
const QUOTE = 'I no longer have potatoes in the garden.';
const WORDS = `${QUOTE} The tomatoes are still there.`;
/** An ending quote of exactly 200 characters, the longest one short line may be. */
const LONG = `${QUOTE.slice(0, -1)}, because the beds by the amber gate need a rest ${'and the soil there needs time to recover '.repeat(4)}`.slice(0, 199) + '.';
const END = { v: 1, kind: 'ended', eventId: 'ended-pot', date: '2026-10-06', at: Date.UTC(2026, 9, 6, 9), factId: 'pot', quote: QUOTE,
  source: { fileId: 'words-end-pot', sha256: sha(`${QUOTE}\n`) }, runId: 'ending-run' };
/** Long made-up habits, so that About me's learned text passes position 4's 4,000-character cut. */
const habit = (n: number) => fact(`h${n}`, 'about-you',
  `I keep garden habit ${n}: I water the beds slowly at dawn, check the soil by hand, and write down what grew so I can plan the rows with care.`);
const jsonl = (events: readonly unknown[]) => events.map((e) => JSON.stringify(e)).join('\n') + '\n';
const ledgerOf = (run: CaseRun) => parseObservations(new TextEncoder().encode(run.after[LEDGER] ?? ''));
const added = (run: CaseRun, seeded: readonly unknown[]) => ledgerOf(run).events.slice(seeded.length);
const kinds = (run: CaseRun, seeded: readonly unknown[]) => added(run, seeded).map((e) => [e.kind, (e as { factId?: string }).factId]);
const endedOf = (run: CaseRun) => ((ledgerOf(run) as unknown as { ended?: Array<{ fact: { factId: string } }> }).ended ?? []).map((e) => e.fact.factId);
/** main exits 0 for a failure the Worker accepted, so a finished run is one whose last status is done. */
const phase = (run: CaseRun) => run.wire?.statuses.at(-1)?.phase;
const report = (run: CaseRun): RunReport => (run.lastRun as { run?: { report?: RunReport } } | null)?.run?.report
  ?? { filed: [], created: [], updated: [], setAside: [], questions: [] };
const questions = (run: CaseRun) => (JSON.parse(run.after[SYSTEM.questions] ?? '{"questions":[]}') as { questions: Array<{ options?: QuestionOption[] }> }).questions;
const inboxWords = (run: CaseRun) => Object.entries(run.after).filter(([path]) => path.startsWith('Inbox/') && path.endsWith(PILE_NOTE)).map(([, text]) => text.trim());
const url = (input: Parameters<typeof fetch>[0]) => new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
const nothing = () => ({ kind: 'tidy-intent', v: 1, things: [] });

function about(regions: Partial<Record<Region, Array<{ date: string; text: string }>>>): string {
  const labels: Record<Region, string> = { 'about-you': 'About you', 'about-working-on': "What you're working on", 'about-preferences': 'How you like things' };
  return '---\nsummary: What Bower knows about you. Change it whenever you like.\n---\n\n## My words\n\nI keep my own notes here.\n\n## What Bower has learned\n'
    + (Object.keys(labels) as Region[]).map((r) => `<!-- bower:ownership/2 begin ${r} -->\n### ${labels[r]}\n`
      + (regions[r] ?? []).map((l) => timelineLine({ date: l.date, text: l.text, source: 'Your words' }) + '\n').join('')
      + `<!-- bower:ownership/2 end ${r} -->\n`).join('');
}
/** The learned texts one region of About me shows. */
function shownIn(text: string | undefined, region: Region): string[] {
  const bytes = new TextEncoder().encode(text ?? '');
  const owned = parseOwnership(bytes);
  const span = 'payloads' in owned ? owned.payloads?.[region] : undefined;
  if (!span) return [];
  return new TextDecoder().decode(bytes.subarray(span.start, span.end)).split('\n').flatMap((l) => parseTimelineLine(l)?.text ?? []);
}

/** A made-up folder holding this ledger and About me with the live facts; words piles are added per press. */
async function folder(events: ReadonlyArray<Record<string, unknown>>, extra: Record<string, string> = {}) {
  const gone = new Set(events.flatMap((e) => (e.kind === 'ended' ? [e.factId] : [])));
  const shown = (r: Region) => events.flatMap((e) => (e.kind === 'observation' && e.section === r && !gone.has(e.factId)
    ? [{ date: String(e.date), text: String(e.text) }] : []));
  const c: LoadedCase = { id: 'b4c-ended', capability: 'C05', title: 'Alex keeps learned facts', covers: 'model', source: 'new',
    scope: 'all', allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: [], journal: [],
    bowerOwned: [], inbox: [], inboxFiles: {}, folder: { [ABOUT]: about({ 'about-you': shown('about-you'), 'about-preferences': shown('about-preferences') }),
      [LEDGER]: jsonl(events), 'Projects/Garden/Garden.md': '---\nsummary: Alex plans the garden.\n---\n# Garden\n\n## Timeline\n', ...extra } };
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const id = async (path: string) => {
    const file = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === path);
    if (!file) throw new Error(`Missing made-up file ${path}`);
    return file.id;
  };
  return { c, drive, root, id, press: 0, events };
}
type Folder = Awaited<ReturnType<typeof folder>>;
type Make = (frame: Frame, attempt: number) => unknown;

/**
 * One press: words piles first (none: a request record and an instructions run, unless `scope` says otherwise), then
 * main with a scripted model. Execution inputs and the refusals they carry are kept; `note` is the first pile's note.
 */
async function press(f: Folder, words: string | readonly string[] | null, make: Make = nothing, o: { scope?: 'all' | 'instructions';
  text?: (words: string) => string; around?: (fetch: typeof globalThis.fetch) => typeof globalThis.fetch } = {}) {
  f.press++;
  const list = words === null ? [] : typeof words === 'string' ? [words] : words;
  let note = '';
  for (const [i, line] of list.entries()) {
    const pile = await f.drive.createFolder(await f.id('Inbox'), line.slice(0, 40).trim(), { pile: `words-${f.press}-${i + 1}` });
    const made = await f.drive.createText(pile.id, PILE_NOTE, o.text ? o.text(line) : `${line}\n`);
    if (i === 0) note = made.id;
  }
  if (words === null) {
    await f.drive.createText(await f.id(SYSTEM.changes), `press-${f.press}.json`, JSON.stringify({ v: 1, id: `press-${f.press}`, device: 'device-1',
      at: DAY + f.press, kind: 'request', what: 'Asked Bower to update the notes', text: 'Update these notes.' }));
  }
  const scope = o.scope ?? (words === null ? 'instructions' : 'all');
  const admission = await planAdmission(fakeRead(f.drive), f.root, { scope, clock: () => DAY + f.press, newId: () => `b4c-admission-${f.press}` });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  const calls: string[] = []; const inputs: string[] = []; const refusals: string[] = []; const frames: Frame[] = [];
  const garden = await f.id('Projects/Garden');
  const spawn: ClaudeSpawn = phaseAwareClaude(async (call, _step, attempt, kind) => {
    const frame = frameOf(call) as Frame;
    calls.push(kind);
    if (kind === 'selection') return reply({ items: (frame.sources ?? []).map((s) => ({ itemId: s.itemId, kind: 'unknown', destination: garden, wants: [] })), asks: [] });
    inputs.push(promptOf(call)); frames.push(frame);
    const refusal = /^Your reply was refused:.*$/m.exec(call.input)?.[0];
    if (refusal) refusals.push(refusal);
    return reply(make(frame, attempt));
  }, () => ({ drive: f.drive, root: f.root, admission: admission.manifest }), true);
  const run = await runOnDrive(f.c, f.drive, f.root, { claude: spawn, admission: admission.manifest, pacing,
    ...(o.around ? { around: o.around } : {}), answerStart: { scope, requestId: `b4c-run-${f.press}` } }, f.press);
  return { ...run, calls, inputs, refusals, frames, note };
}
const ending = (factId: string, quote = QUOTE) => () => ({ ...nothing(), ends: [{ factId, quote }] });
const errors = () => vi.mocked(console.error).mock.calls.length;
/** Every write to the file at `path` is refused as a change made elsewhere, until the returned restore. */
async function failing(f: Folder, path: string): Promise<() => number> {
  const target = await f.id(path); const original = f.drive.writeText.bind(f.drive); let attempts = 0;
  const fault = vi.spyOn(f.drive, 'writeText').mockImplementation(async (...args) => {
    if (args[0] === target) { attempts++; throw new BowerError('conflict', 'This file changed elsewhere.'); }
    return original(...args);
  });
  return () => { fault.mockRestore(); return attempts; };
}

describe('B4c-d through production main', () => {
  it('AC30 b4c-ended-through-main: the words end a shown fact; About me stops showing it; nothing else changes', async () => {
    const seeded = [POT, TOM, TEA];
    const f = await folder(seeded);
    const run = await press(f, WORDS, ending('pot'));
    expect(phase(run), 'the reply may end a fact').toBe('done');
    expect(run.calls, 'no retry').toEqual(['selection', 'execution']);
    expect(run.inputs[0], 'the execution input names the field').toContain('ends:[{factId,quote}]');
    expect(added(run, seeded), 'one ended event, in the run\'s one ledger write').toEqual([{ v: 1, kind: 'ended', eventId: expect.any(String),
      date: '2026-10-07', at: expect.any(Number), factId: 'pot', quote: QUOTE, source: { fileId: run.note, sha256: sha(`${WORDS}\n`) },
      runId: run.dispatch?.runId }]);
    expect(ledgerOf(run).live.map((x) => x.factId), 'the ending words are no fact of their own').toEqual(['tom', 'tea']);
    expect(shownIn(run.after[ABOUT], 'about-you')).toEqual([TOM.text]);
    expect(shownIn(run.after[ABOUT], 'about-preferences')).toEqual([TEA.text]);
    expect(run.after[ABOUT]).toContain('## My words\n\nI keep my own notes here.\n');
    expect(Object.keys(run.after).filter((p) => p.startsWith('Inbox/')), 'the words are used up, as Forget words are').toEqual([]);
    expect(report(run).updated.filter((r) => r.path === ABOUT).map((r) => r.what)).toEqual(['Brought up to date.']);
    const again = await press(f, null);
    expect(phase(again)).toBe('done');
    expect(again.after[LEDGER], 'a later run changes nothing').toBe(run.after[LEDGER]);
    expect(again.after[ABOUT]).toBe(run.after[ABOUT]);
  });

  it.each<[string, ReadonlyArray<Record<string, unknown>>, () => unknown, ((words: string) => string)?]>([
    ['a quote not in the words', [POT, TOM, TEA], ending('pot', 'I gave my potatoes to a neighbour.')],
    ['a quote only in the words note\'s front matter', [POT, TOM, TEA], ending('pot'),
      () => `---\nsummary: ${QUOTE}\n---\nThe tomatoes are still there.\n`],
    ['a fact id Bower never showed', [POT, TOM, TEA], ending('nope')],
    ['a fact already ended', [POT, TOM, TEA, END], ending('pot')],
  ])('AC31 b4c-ended-refusals: %s writes no ending, keeps About me and is logged', async (_name, seeded, make, text) => {
    const f = await folder(seeded);
    const before = errors();
    const run = await press(f, WORDS, make, text ? { text } : {});
    expect(phase(run)).toBe('done');
    expect(run.calls, 'an unbound ending is no reason to ask again').toEqual(['selection', 'execution']);
    expect(added(run, seeded).filter((e) => (e as { kind: string }).kind === 'ended')).toEqual([]);
    const live = ledgerOf(run).live.filter((x) => x.section === 'about-you').map((x) => x.text);
    expect(shownIn(run.after[ABOUT], 'about-you')).toEqual(live);
    expect(errors(), 'the unbound ending is logged').toBeGreaterThan(before);
  });

  it('AC31 b4c-ended-refusals: a quote in two words piles of the run writes no ending', async () => {
    const seeded = [POT, TOM, TEA];
    const f = await folder(seeded);
    const before = errors();
    const run = await press(f, [WORDS, `I said it twice: ${QUOTE}`], ending('pot'));
    expect(phase(run)).toBe('done');
    expect(run.calls).toEqual(['selection', 'execution']);
    expect(added(run, seeded).filter((e) => (e as { kind: string }).kind === 'ended'), 'exactly one words pile must hold the quote').toEqual([]);
    expect(shownIn(run.after[ABOUT], 'about-you')).toEqual([POT.text, TOM.text]);
    expect(errors()).toBeGreaterThan(before);
  });

  it('AC31 b4c-ended-refusals: a live fact past position 4\'s cut writes no ending; the last shown fact can end', async () => {
    const many = Array.from({ length: 28 }, (_, i) => habit(i + 1));
    let target = '';
    /** End the first fact position 4 does not show, or the last one it shows in full. */
    const pick = (which: 'hidden' | 'shown') => (frame: Frame) => {
      const shown = new Set((frame.aboutMe?.learned.text ?? '').split('\n').flatMap((l) => parseTimelineLine(l)?.text ?? []));
      expect(frame.aboutMe?.learned.cut, 'the learned text passes the 4,000-character cut').toBe(true);
      target = (which === 'hidden' ? many.find((x) => !shown.has(x.text)) : many.filter((x) => shown.has(x.text)).at(-1))?.factId ?? '';
      expect(target, `a ${which} fact`).not.toBe('');
      return { ...nothing(), ends: [{ factId: target, quote: QUOTE }] };
    };
    const hidden = await folder(many);
    const before = errors();
    const past = await press(hidden, WORDS, pick('hidden'));
    expect(phase(past)).toBe('done');
    expect(kinds(past, many), `${target} is not shown, so it cannot end`).toEqual([]);
    expect(errors()).toBeGreaterThan(before);
    const shown = await folder(many);
    const last = await press(shown, WORDS, pick('shown'));
    expect(phase(last)).toBe('done');
    expect(kinds(last, many), 'the last line shown in full can end').toEqual([['ended', target]]);
  });

  it('AC31 b4c-ended-refusals: Forget wins over an ending of the same fact in one reply', async () => {
    const seeded = [POT, TOM, TEA];
    const f = await folder(seeded);
    const run = await press(f, `Forget that ${POT.text} ${QUOTE}`, () => ({ ...nothing(), forget: [{ factId: 'pot', quote: POT.text }],
      ends: [{ factId: 'pot', quote: QUOTE }] }));
    expect(phase(run)).toBe('done');
    expect(added(run, seeded).map((e) => (e as { kind: string }).kind), 'one tombstone, no ending').toEqual(['tombstone']);
    expect(ledgerOf(run).tombstones.map((t) => [t.factId, t.reason])).toEqual([['pot', 'forget']]);
  });

  it('AC32 b4c-ended-forget-and-bin: Forget and Bin reach an ended fact before any line could cite it', async () => {
    const seeded = [POT, TOM, TEA, END];
    const f = await folder(seeded);
    const forgot = await press(f, `Forget that ${POT.text}`, () => ({ ...nothing(), forget: [{ factId: 'pot', quote: POT.text }] }));
    expect(phase(forgot), 'a ledger with an ending is readable').toBe('done');
    expect(ledgerOf(forgot).tombstones.map((t) => [t.factId, t.reason]), 'Forget by quote binds the ended fact').toEqual([['pot', 'forget']]);
    expect((ledgerOf(forgot) as unknown as { ended?: unknown[] }).ended, 'a forgotten fact is no longer ended either').toEqual([]);
    const trash = JSON.stringify({ v: 1, id: 'trash-1', device: 'device-1', at: DAY - 1000, kind: 'trash', what: 'Put a note in the Bin', fileId: 'words-pot' });
    const binned = await folder(seeded, { '.bower/changes/trash-1.json': trash });
    const run = await press(binned, null);
    expect(phase(run)).toBe('done');
    expect(ledgerOf(run).tombstones.map((t) => [t.factId, t.reason]), 'the Bin of its source reaches the ended fact').toEqual([['pot', 'bin']]);
  });

  it('AC32 b4c-ended-forget-and-bin: a quote an ended and a live fact both hold forgets nothing and asks as today', async () => {
    const CELLAR = fact('cellar', 'about-you', 'I keep potatoes in the cellar.');
    const seeded = [POT, CELLAR, TOM, TEA, END];
    const f = await folder(seeded);
    const run = await press(f, 'Forget the potatoes.', () => ({ ...nothing(), forget: [{ factId: 'pot', quote: 'potatoes' }] }));
    expect(phase(run)).toBe('done');
    expect(ledgerOf(run).tombstones, 'an ambiguous quote forgets nothing').toEqual([]);
    expect(endedOf(run)).toEqual(['pot']);
    const offered = questions(run).flatMap((q) => q.options ?? []).map((o) => o.action.kind === 'forget-fact' ? o.action.factId : o.action.kind);
    expect(offered, 'the question offers shown facts, never an ended one no line cites').toEqual(['cellar', 'tom', 'tea']);
  });

  it('AC33 b4c-ended-manifest: the ending in the run\'s ledger write is accepted; each broken rule is refused', async () => {
    const seeded = [POT, TOM, TEA];
    const f = await folder(seeded);
    // The words note has front matter, so the body binding can be told from the whole file.
    const text = (words: string) => `---\nsummary: Notes about the garden plot.\n---\n${words}\n`;
    const run = await press(f, WORDS, ending('pot'), { text });
    expect(phase(run)).toBe('done');
    const stored = JSON.parse(Object.entries(run.after).find(([path]) => /\/manifest-[^/]+\.json$/.test(path))?.[1] ?? '{}') as Manifest;
    const ok = async (m: Manifest) => (await parseRunManifestV2(new TextEncoder().encode(JSON.stringify(m)), f.root, RUNNER_WRITES)).ok;
    const event = ledgerText(stored).split('\n').find((row) => row.includes('"kind":"ended"'));
    expect(event, 'the stored ledger write holds the ending').toBeDefined();
    expect(JSON.parse(event ?? '{}'), 'its source is the whole note as captured').toMatchObject({ source: { fileId: run.note, sha256: sha(text(WORDS)) } });
    expect(await ok(stored)).toBe(true);
    // Each variant is sealed again on its own from the stored manifest, so only its one change can refuse it.
    const variant = (change: Record<string, unknown>) => resealed(stored, (t) => t.replace(event ?? '-', JSON.stringify({ ...JSON.parse(event ?? '{}') as object, ...change })));
    expect(await ok(await variant({ runId: 'another-run' })), 'another run\'s ending').toBe(false);
    expect(await ok(await variant({ quote: 'I gave my potatoes to a neighbour.' })), 'a quote not in the words').toBe(false);
    expect(await ok(await variant({ quote: 'Notes about the garden plot.' })), 'a quote only in the note\'s front matter').toBe(false);
    expect(await ok(await variant({ factId: 'nope' })), 'a fact that is not live').toBe(false);
    expect(await ok(await variant({ source: { fileId: 'words-pot', sha256: sha(text(WORDS)) } })), 'a source that is not this run\'s words').toBe(false);
    expect(await ok(await variant({ source: { fileId: run.note, sha256: sha(`${WORDS}\n`) } })), 'the right note with a hash it does not have').toBe(false);
  });

  it.each<[string, Make, string, Array<[string, string]>]>([
    ['no ending', () => ({ ...nothing(), ends: [] }), WORDS, []],
    ['20 endings, one of them bound', () => ({ ...nothing(), ends: [{ factId: 'pot', quote: QUOTE },
      ...Array.from({ length: 19 }, (_, i) => ({ factId: `nope-${i + 1}`, quote: QUOTE }))] }), WORDS, [['ended', 'pot']]],
    ['a quote of exactly 200 characters', () => ({ ...nothing(), ends: [{ factId: 'pot', quote: LONG }] }), `${LONG} The tomatoes are still there.`,
      [['ended', 'pot']]],
  ])('AC37 b4c-ended-reply-grammar: %s is a valid reply', async (_name, make, words, expected) => {
    const seeded = [POT, TOM, TEA];
    const f = await folder(seeded);
    const run = await press(f, words, make);
    expect(phase(run)).toBe('done');
    expect(run.refusals, 'accepted without a retry').toEqual([]);
    expect(kinds(run, seeded)).toEqual(expected);
  });

  it.each<[string, (frame: Frame) => unknown]>([
    ['21 endings', () => ({ ...nothing(), ends: Array.from({ length: 21 }, (_, i) => ({ factId: i ? `nope-${i}` : 'pot', quote: QUOTE })) })],
    ['an ending without its quote', () => ({ ...nothing(), ends: [{ factId: 'pot' }] })],
    ['an ending with another key', () => ({ ...nothing(), ends: [{ factId: 'pot', quote: QUOTE, why: 'a newer fact' }] })],
    ['a blank quote', () => ({ ...nothing(), ends: [{ factId: 'pot', quote: '  ' }] })],
    ['a quote with a line break', () => ({ ...nothing(), ends: [{ factId: 'pot', quote: 'I no longer have\npotatoes in the garden.' }] })],
    ['a quote over 200 characters', () => ({ ...nothing(), ends: [{ factId: 'pot', quote: `${QUOTE} ${'x'.repeat(200 - QUOTE.length)}` }] })],
    ['two endings of one fact', () => ({ ...nothing(), ends: [{ factId: 'pot', quote: QUOTE }, { factId: 'pot', quote: 'The tomatoes are still there.' }] })],
    ['an ending whose words are also written as a fact', (frame) => ({ ...nothing(), ends: [{ factId: 'pot', quote: QUOTE }],
      observations: [{ source: { pileId: frame.piles[0]?.pileId }, section: 'about-you', category: 'biography', text: QUOTE }] })],
  ])('AC37 b4c-ended-reply-grammar: %s refuses the reply once, by its own reason', async (_name, bad) => {
    const seeded = [POT, TOM, TEA];
    const f = await folder(seeded);
    const run = await press(f, WORDS, (frame, attempt) => attempt ? ending('pot')() : bad(frame));
    expect(phase(run)).toBe('done');
    expect(run.calls, 'one retry').toEqual(['selection', 'execution', 'execution']);
    expect(run.refusals).toHaveLength(1);
    expect(run.refusals[0], 'a named reason, not the generic envelope refusal').not.toContain('not a tidy-up intent');
    expect(kinds(run, seeded), 'the corrected reply ends the fact once and writes no fact of its words').toEqual([['ended', 'pot']]);
  });

  it('AC38 b4c-ended-recovery: a refused ledger write writes no ending and keeps the words; the next run ends the fact once', async () => {
    const seeded = [POT, TOM, TEA];
    const f = await folder(seeded);
    const restore = await failing(f, LEDGER);
    const refused = await press(f, WORDS, ending('pot'));
    expect(restore(), 'the ledger write fault was reached through main').toBeGreaterThan(0);
    expect(phase(refused)).toBe('done');
    expect(refused.after[LEDGER], 'no ending without its ledger line').toBe(jsonl(seeded));
    expect(shownIn(refused.after[ABOUT], 'about-you')).toEqual([POT.text, TOM.text]);
    expect(inboxWords(refused), 'the words wait in the Inbox').toEqual([WORDS]);
    const retry = await press(f, [], ending('pot'), { scope: 'all' });
    expect(phase(retry)).toBe('done');
    expect(kinds(retry, seeded)).toEqual([['ended', 'pot']]);
    expect(shownIn(retry.after[ABOUT], 'about-you')).toEqual([TOM.text]);
    expect(inboxWords(retry)).toEqual([]);
  });

  it('AC38 b4c-ended-recovery: a failed About me rebuild keeps the settled ending; the next run hides the fact', async () => {
    const seeded = [POT, TOM, TEA];
    const f = await folder(seeded);
    const restore = await failing(f, ABOUT);
    const run = await press(f, WORDS, ending('pot'));
    expect(restore(), 'the About me write fault was reached through main').toBeGreaterThan(0);
    expect(phase(run)).toBe('done');
    expect(kinds(run, seeded), 'the ending settled').toEqual([['ended', 'pot']]);
    expect(shownIn(run.after[ABOUT], 'about-you'), 'the failed rebuild left the old lines').toEqual([POT.text, TOM.text]);
    expect(inboxWords(run), 'settled words are used up').toEqual([]);
    expect(report(run).updated.filter((r) => r.path === ABOUT), 'the settled ledger line earns the row').toHaveLength(1);
    const next = await press(f, null);
    expect(phase(next)).toBe('done');
    expect(next.after[LEDGER], 'no second ending').toBe(run.after[LEDGER]);
    expect(shownIn(next.after[ABOUT], 'about-you'), 'maintain catches up').toEqual([TOM.text]);
  });

  it('AC38 b4c-ended-recovery: a crash after the ledger write completes once on redispatch, without a model call', async () => {
    const seeded = [POT, TOM, TEA];
    const f = await folder(seeded);
    const ledgerId = await f.id(LEDGER);
    let crashed = false;
    const run = await press(f, WORDS, ending('pot'), { around: (next) => async (input, init) => {
      if (crashed && url(input).origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost.');
      if (init?.method === 'PATCH' && url(input).pathname === `/upload/drive/v3/files/${ledgerId}`) {
        const response = await next(input, init);
        crashed = response.ok;
        throw new TypeError('Made-up crash after the ledger write.');
      }
      return next(input, init);
    } });
    expect(crashed, 'main reached the ledger write').toBe(true);
    const model = vi.fn(() => { throw new Error('Recovery uses the stored manifest, not a new model call.'); });
    const resumed = await redispatchCase(f.c, run, 2, { claude: model, pacing });
    expect(phase(resumed)).toBe('done');
    expect(model).not.toHaveBeenCalled();
    expect(kinds(resumed, seeded), 'one ending').toEqual([['ended', 'pot']]);
    expect(shownIn(resumed.after[ABOUT], 'about-you')).toEqual([TOM.text]);
    const done = await redispatchCase(f.c, resumed, 3, { claude: model, pacing });
    expect(model).not.toHaveBeenCalled();
    expect(done.after[LEDGER], 'a done run writes nothing').toBe(resumed.after[LEDGER]);
    expect(done.after[ABOUT]).toBe(resumed.after[ABOUT]);
  });
});

type Op = { operationId: string; ordinal: number; dependsOn: string[]; effect: Record<string, unknown> & { kind: string } };
type Manifest = { runId: string; captureId: string; operations: Op[] } & Record<string, unknown>;
const raw = (text: string) => ({ encoding: 'utf8', size: new TextEncoder().encode(text).length, sha256: sha(text) });
const ledgerText = (m: Manifest) => String(m.operations.find((op) => op.effect.kind === 'write-runner-json' && op.effect.path === LEDGER)?.effect.text ?? '');

/** The stored manifest with its ledger write changed, every id sealed again in order as withMaintenance does. */
async function resealed(stored: Manifest, change: (text: string) => string): Promise<Manifest> {
  const m = JSON.parse(JSON.stringify(stored)) as Manifest;
  const ledger = m.operations.find((op) => op.effect.kind === 'write-runner-json' && op.effect.path === LEDGER);
  if (!ledger) throw new Error('The manifest has no ledger write');
  ledger.effect.text = change(String(ledger.effect.text));
  ledger.effect.content = raw(String(ledger.effect.text));
  const renamed = new Map<string, string>();
  const swap = (id: string) => renamed.get(id) ?? id;
  for (const [ordinal, op] of m.operations.entries()) {
    op.dependsOn = op.dependsOn.map(swap);
    const parent = op.effect.parent as { createdBy?: string } | undefined;
    if (parent?.createdBy) parent.createdBy = swap(parent.createdBy);
    if (op.effect.kind === 'maintain') (op.effect.inputs as { operationIds: string[] }).operationIds = m.operations.slice(0, ordinal).map((x) => x.operationId);
    const id = (await canonical({ runId: m.runId, captureId: m.captureId, ordinal, effect: op.effect })).hash;
    renamed.set(op.operationId, id);
    op.operationId = id;
  }
  const json = JSON.stringify({ ...m, operations: undefined });
  const remapped = JSON.parse([...renamed].reduce((s, [from, to]) => s.split(from).join(to), json)) as Manifest;
  return { ...remapped, operations: m.operations };
}
