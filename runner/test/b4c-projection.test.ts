/** B4c-b through production main: About me shows the latest consolidation plus newer facts (owner rulings 2026-10-14). */
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseObservations } from '../../src/data/contracts/observations';
import { parseOwnership } from '../../src/data/contracts/ownership-format';
import { parseTimelineLine, timelineLine } from '../../src/data/contracts/timeline-line';
import { parseRunManifestV2 } from '../../src/data/contracts/run-manifest';
import { askId, type QuestionAnswer, type QuestionOption } from '../../src/data/contracts/questions';
import type { RunState } from '../../src/data/contracts/types';
import { PILE_NOTE } from '../../src/data/piles';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { canonical } from '../../src/data/spine/records';
import { RUNNER_WRITES, SYSTEM } from '../../src/data/vault/layout';
import type { ClaudeSpawn } from '../src/claude';
import type { LoadedCase } from '../src/corpus';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { runOnDrive, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';

const DAY = Date.UTC(2026, 9, 7, 9);
const ABOUT = 'About me.md';
const LEDGER = '.bower/observations.jsonl';
type Region = 'about-you' | 'about-working-on' | 'about-preferences';
type Frame = { piles: Array<{ pileId: string; words: string }>; aboutMe?: { learned: { text: string; cut: boolean; factIds: string[] } };
  learnedFacts?: Array<{ factId: string }> };

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
const fact = (id: string, section: Region, date: string, text: string, runId = 'history-run') => ({
  v: 1, kind: 'observation', eventId: `event-${id}`, factId: id, date, section, text,
  category: section === 'about-preferences' ? 'preference' : 'biography',
  source: { fileId: `words-${id}`, sha256: sha(`${text}\n`) },
  origin: { kind: 'words', runId, captureId: sha(runId), pileId: `pile-${id}` } });
const G1 = fact('g1', 'about-you', '2026-10-05', 'I grow beans on the north plot.');
const P1 = fact('p1', 'about-preferences', '2026-10-05', 'I like short written updates that say what changed and why.');
const P2 = fact('p2', 'about-preferences', '2026-10-05', 'I want a small list of roles with clear tasks.');
const P3 = fact('p3', 'about-preferences', '2026-10-05', 'I never want meetings before 9 on a Monday.');
const P4 = fact('p4', 'about-preferences', '2026-10-06', 'I prefer tea to coffee in the morning.');
const L1 = { text: 'I like short written updates and a small list of roles with clear tasks.', factIds: ['p1', 'p2'], form: 'current' };
const L2 = { text: 'I never want meetings before 9 on a Monday.', factIds: ['p3'], form: 'current' };
const C1 = { v: 1, kind: 'consolidation', eventId: 'c1', section: 'about-preferences', date: '2026-10-06', factIds: ['p1', 'p2', 'p3'],
  runId: 'consolidating-run', operationId: 'op-c1', successful: true, lines: [L1, L2], dropped: [] };
const BASE = [G1, P1, P2, P3, C1, P4];
/** A fact the person's words ended before a consolidation kept it as a past line; a live fact shares its words "blue mug". */
const MUG = fact('mug', 'about-you', '2026-10-04', 'I keep my blue mug on the shed shelf.');
const GAVE = 'I gave my blue mug to a neighbour.';
const MUG_END = { v: 1, kind: 'ended', eventId: 'ended-mug', date: '2026-10-05', factId: 'mug', quote: GAVE,
  source: { fileId: 'words-end-mug', sha256: sha(`${GAVE}\n`) }, runId: 'ending-run' };
const PAST = { text: 'I used to keep my blue mug on the shed shelf.', factIds: ['mug'], form: 'past' };
const CY = { v: 1, kind: 'consolidation', eventId: 'c-you', section: 'about-you', date: '2026-10-06', factIds: ['mug'],
  runId: 'consolidating-run', operationId: 'op-c-you', successful: true, lines: [PAST], dropped: [] };
const CUP = fact('cup', 'about-you', '2026-10-05', 'I keep a blue mug for guests.');
type Shown = { date: string; text: string };
const own = (f: { date: string; text: string }): Shown => ({ date: f.date, text: f.text });
const line = (l: { text: string }): Shown => ({ date: '2026-10-06', text: l.text });
const jsonl = (events: readonly unknown[]) => events.map((e) => JSON.stringify(e)).join('\n') + '\n';
const ledgerOf = (run: CaseRun) => parseObservations(new TextEncoder().encode(run.after[LEDGER] ?? ''));

/** About me with Bower's learned section holding exactly these lines per region. */
function about(regions: Partial<Record<Region, Shown[]>>): string {
  const labels: Record<Region, string> = { 'about-you': 'About you', 'about-working-on': "What you're working on", 'about-preferences': 'How you like things' };
  return '---\nsummary: What Bower knows about you. Change it whenever you like.\n---\n\n## My words\n\nI keep my own notes here.\n\n## What Bower has learned\n'
    + (Object.keys(labels) as Region[]).map((r) => `<!-- bower:ownership/2 begin ${r} -->\n### ${labels[r]}\n`
      + (regions[r] ?? []).map((l) => timelineLine({ date: l.date, text: l.text, source: 'Your words' }) + '\n').join('')
      + `<!-- bower:ownership/2 end ${r} -->\n`).join('');
}
/** The learned lines one region of About me shows. */
function shownIn(text: string | undefined, region: Region): Shown[] {
  const bytes = new TextEncoder().encode(text ?? '');
  const owned = parseOwnership(bytes);
  const span = 'payloads' in owned ? owned.payloads?.[region] : undefined;
  if (!span) return [];
  return new TextDecoder().decode(bytes.subarray(span.start, span.end)).split('\n').flatMap((l) => {
    const parsed = parseTimelineLine(l);
    return parsed ? [{ date: parsed.date, text: parsed.text }] : [];
  });
}

/** A made-up folder holding this ledger and About me; words piles are added per press. */
async function folder(events: readonly unknown[], aboutText: string, extra: Record<string, string> = {}) {
  const c: LoadedCase = { id: 'b4c-projection', capability: 'C05', title: 'Alex keeps learned facts', covers: 'model', source: 'new',
    scope: 'all', allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: [], journal: [],
    bowerOwned: [], inbox: [], inboxFiles: {}, folder: { [ABOUT]: aboutText, [LEDGER]: jsonl(events),
      'Projects/Garden/Garden.md': '---\nsummary: Alex plans the garden.\n---\n# Garden\n\n## Timeline\n', ...extra } };
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const id = async (path: string) => {
    const file = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === path);
    if (!file) throw new Error(`Missing made-up file ${path}`);
    return file.id;
  };
  return { c, drive, root, id, press: 0 };
}
type Folder = Awaited<ReturnType<typeof folder>>;

/** One press over the folder: words piles first (none: an instructions run), then main with a scripted model; the execution frames are kept. */
async function press(f: Folder, words: string | readonly string[] | null, make: (frame: Frame) => unknown) {
  f.press++;
  for (const [i, line] of (words === null ? [] : typeof words === 'string' ? [words] : words).entries()) {
    const pile = await f.drive.createFolder(await f.id('Inbox'), line.slice(0, 40), { pile: `words-${f.press}-${i + 1}` });
    await f.drive.createText(pile.id, PILE_NOTE, `${line}\n`);
  }
  const scope = words === null ? 'instructions' : 'all';
  if (words === null) {
    await f.drive.createText(await f.id(SYSTEM.changes), `press-${f.press}.json`, JSON.stringify({ v: 1, id: `press-${f.press}`,
      device: 'device-1', at: DAY + f.press, kind: 'request', what: 'Asked Bower to update the notes', text: 'Update these notes.' }));
  }
  const admission = await planAdmission(fakeRead(f.drive), f.root, { scope, clock: () => DAY + f.press, newId: () => `b4c-admission-${f.press}` });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  const frames: Frame[] = [];
  const garden = await f.id('Projects/Garden');
  const spawn: ClaudeSpawn = phaseAwareClaude(async (call, _step, _attempt, phase) => {
    const frame = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as Frame & { sources?: Array<{ itemId: string }> };
    if (phase === 'selection') return reply({ items: (frame.sources ?? []).map((s) => ({ itemId: s.itemId, kind: 'unknown',
      destination: garden, wants: [] })), asks: [] });
    frames.push(frame);
    return reply(make(frame));
  }, () => ({ drive: f.drive, root: f.root, admission: admission.manifest }), true);
  const run = await runOnDrive(f.c, f.drive, f.root, { claude: spawn, admission: admission.manifest,
    pacing: { baseMs: 0, sleep: async () => {} }, answerStart: { scope, requestId: `b4c-run-${f.press}` } }, f.press);
  return { ...run, frames };
}
const nothing = () => ({ kind: 'tidy-intent', v: 1, things: [] });
const forgetting = (factId: string, quote: string) => () => ({ ...nothing(), forget: [{ factId, quote }] });
/** main exits 0 for a failure the Worker accepted, so a finished run is one whose last status is done. */
const phase = (run: CaseRun) => run.wire?.statuses.at(-1)?.phase;
/** Stored option actions stay in questions.json (`contracts/questions.ts`). */
type Stored = { id: string; options?: QuestionOption[] };
const questions = (run: CaseRun) => (JSON.parse(run.after[SYSTEM.questions] ?? '{"questions":[]}') as { questions: Stored[] }).questions;
const inboxWords = (run: CaseRun) => Object.entries(run.after).filter(([path]) => path.startsWith('Inbox/') && path.endsWith(PILE_NOTE)).map(([, text]) => text.trim());
/** Minimal runtime ports for the app's answer loop, imported as b4-incorporation's are (browser types stay out of the runner). */
type AnswerVault = { answer(id: string, answer: QuestionAnswer): Promise<void> };
type VaultClass = new (opts: { drive: ReturnType<typeof fixedDrive>; rootId: () => Promise<string>; runningPiles: () => Set<string>; device: string }) => AnswerVault;
type AnswerLoop = (vault: AnswerVault, runs: { start: (scope: 'all' | 'instructions', opts?: { requestId?: string; subject?: string }) => Promise<RunState> },
  id: string, answer: QuestionAnswer, opts: { allowWeb: boolean }) => Promise<{ outcome: { kind: string } } | null>;
/** The person picks the option that forgets `factId`, through the app's answer loop; the next press applies it. */
async function choose(f: Folder, q: Stored | undefined, factId: string): Promise<void> {
  const option = q?.options?.find((o) => o.action.kind === 'forget-fact' && o.action.factId === factId);
  if (!q || !option) throw new Error(`No offered option forgets ${factId}`);
  const loop = new URL('../../src/data/answer-loop.ts', import.meta.url).pathname;
  const store = new URL('../../src/data/vault/drive-vault.ts', import.meta.url).pathname;
  const { answerQuestion } = await import(/* @vite-ignore */ loop) as { answerQuestion: AnswerLoop };
  const { DriveVault } = await import(/* @vite-ignore */ store) as { DriveVault: VaultClass };
  const vault = new DriveVault({ drive: f.drive, rootId: async () => f.root, runningPiles: () => new Set(), device: 'device-1' });
  const answered = await answerQuestion(vault, { start: async (scope) => ({ id: 'answer-run', phase: 'queued', scope, requestedAt: DAY, phaseAt: DAY,
    seen: false }) }, q.id, { option: option.id }, { allowWeb: false });
  if (answered?.outcome.kind === 'failed') throw new Error('The made-up answer was not stored');
}

describe('B4c-b through production main', () => {
  it('AC9 b4c-maintain-projection: a run rebuilds About me from the latest consolidation plus newer facts, then writes nothing', async () => {
    const f = await folder(BASE, about({ 'about-you': [own(G1)], 'about-preferences': [own(P1), own(P2), own(P3), own(P4)] }));
    const first = await press(f, null, nothing);
    expect(phase(first), 'a ledger with consolidated lines is readable').toBe('done');
    expect(shownIn(first.after[ABOUT], 'about-preferences')).toEqual([line(L1), line(L2), own(P4)]);
    expect(shownIn(first.after[ABOUT], 'about-you')).toEqual([own(G1)]);
    expect(first.after[ABOUT]).toContain('## My words\n\nI keep my own notes here.\n');
    const aboutId = await f.id(ABOUT);
    const writes = vi.spyOn(f.drive, 'writeText');
    const second = await press(f, null, nothing);
    expect(phase(second)).toBe('done');
    expect(writes.mock.calls.filter(([id]) => id === aboutId), 'an unchanged projection writes nothing').toEqual([]);
    expect(second.after[ABOUT]).toBe(first.after[ABOUT]);
  });

  it('AC10 b4c-forget-member: a forgotten member\'s line falls back to its other facts; a retry is a no-op; the last member removes the line', async () => {
    const f = await folder(BASE, about({ 'about-you': [own(G1)], 'about-preferences': [line(L1), line(L2), own(P4)] }));
    const forgot = await press(f, `Forget that ${P2.text}`, forgetting('p2', P2.text));
    expect(phase(forgot)).toBe('done');
    expect(ledgerOf(forgot).tombstones.map((t) => [t.factId, t.reason])).toEqual([['p2', 'forget']]);
    expect(shownIn(forgot.after[ABOUT], 'about-preferences')).toEqual([own(P1), line(L2), own(P4)]);
    expect(forgot.after[ABOUT], 'the forgotten words appear nowhere in About me').not.toContain('small list of roles');
    const again = await press(f, `Forget that ${P2.text}`, forgetting('p2', P2.text));
    expect(phase(again)).toBe('done');
    expect(ledgerOf(again).tombstones, 'a retried Forget is a no-op success').toHaveLength(1);
    expect(again.after[ABOUT]).toBe(forgot.after[ABOUT]);
    const last = await press(f, `Forget that ${P3.text}`, forgetting('p3', P3.text));
    expect(shownIn(last.after[ABOUT], 'about-preferences')).toEqual([own(P1), own(P4)]);
  });

  it('AC10 b4c-forget-member: a quote that two Forget piles hold forgets nothing, as today', async () => {
    const f = await folder(BASE, about({ 'about-you': [own(G1)], 'about-preferences': [line(L1), line(L2), own(P4)] }));
    const run = await press(f, [`Forget that ${P2.text}`, `Please forget that ${P2.text}`], forgetting('p2', P2.text));
    expect(phase(run)).toBe('done');
    expect(ledgerOf(run).tombstones, 'the quote must sit in exactly one Forget pile').toEqual([]);
    expect(shownIn(run.after[ABOUT], 'about-preferences')).toEqual([line(L1), line(L2), own(P4)]);
  });

  it('AC10 b4c-forget-inside-broader-line: forgetting the potatoes turns "potatoes and tomatoes" back into the tomatoes fact', async () => {
    const POT = fact('pot', 'about-you', '2026-10-05', 'I have potatoes in the garden.');
    const TOM = fact('tom', 'about-you', '2026-10-05', 'I have tomatoes in the garden.');
    const BOTH = { text: 'I have potatoes and tomatoes in the garden.', factIds: ['pot', 'tom'], form: 'current' };
    const garden = { v: 1, kind: 'consolidation', eventId: 'c-garden', section: 'about-you', date: '2026-10-06', factIds: ['pot', 'tom'],
      runId: 'consolidating-run', operationId: 'op-garden', successful: true, lines: [BOTH], dropped: [] };
    const f = await folder([POT, TOM, garden, P4], about({ 'about-you': [line(BOTH)], 'about-preferences': [own(P4)] }));
    const run = await press(f, `Forget that ${POT.text}`, forgetting('pot', POT.text));
    expect(phase(run)).toBe('done');
    expect(ledgerOf(run).tombstones.map((t) => [t.factId, t.reason]), 'a fact behind a shown line can be forgotten').toEqual([['pot', 'forget']]);
    expect(shownIn(run.after[ABOUT], 'about-you')).toEqual([own(TOM)]);
    expect(run.after[ABOUT], 'the forgotten fact leaves About me').not.toContain('potatoes');
  });

  it('AC11 b4c-no-substring-freeze: a live fact holding a forgotten fact\'s words no longer freezes every run', async () => {
    const OLD = fact('old', 'about-you', '2026-10-04', 'I have potatoes');
    const BOTH = fact('both', 'about-you', '2026-10-06', 'I have potatoes and tomatoes in the garden.');
    const forgot = { v: 1, kind: 'tombstone', eventId: 'forget-old', date: '2026-10-05', factId: 'old', sourceId: 'words-old', reason: 'forget', runId: 'forget-run' };
    const f = await folder([OLD, forgot, BOTH, P4], about({ 'about-you': [own(BOTH)], 'about-preferences': [own(P4)] }));
    const run = await press(f, null, nothing);
    expect(phase(run), 'the run finishes').toBe('done');
    expect(shownIn(run.after[ABOUT], 'about-you'), 'the person\'s live words stay').toEqual([own(BOTH)]);
  });

  it('AC12 b4c-position-4: the model sees the projection in About me\'s order and the facts behind the lines it shows', async () => {
    const f = await folder(BASE, about({ 'about-you': [own(G1)], 'about-preferences': [line(L1), line(L2), own(P4)] }));
    const run = await press(f, null, nothing);
    expect(phase(run)).toBe('done');
    const learned = run.frames[0]?.aboutMe?.learned;
    expect(learned?.text.split('\n').map((l) => parseTimelineLine(l)?.text)).toEqual([G1.text, L1.text, L2.text, P4.text]);
    expect(learned?.text, 'a consolidated member is not shown in its own words').not.toContain('that say what changed and why');
    expect(learned?.factIds).toEqual(['g1', 'p1', 'p2', 'p3', 'p4']);
    expect(run.frames[0]?.learnedFacts?.map((x) => x.factId)).toEqual(['g1', 'p1', 'p2', 'p3', 'p4']);
  });

  it('AC12 AC13 b4c-cut: facts behind lines past the 4,000-character cut are neither listed nor forgotten by id', async () => {
    const many = Array.from({ length: 24 }, (_, i) => fact(`y${i}`, 'about-you', '2026-10-05',
      `I keep a long note number ${i + 1} about the garden, the beans on the north plot, the shed and the paths, so the list of my own words grows past what fits.`));
    const events = [...many, ...BASE.filter((e) => e !== G1)];
    const f = await folder(events, about({ 'about-you': many.map(own), 'about-preferences': [line(L1), line(L2), own(P4)] }));
    const run = await press(f, `Forget that ${P3.text}`, forgetting('p3', P3.text));
    expect(phase(run)).toBe('done');
    const learned = run.frames[0]?.aboutMe?.learned;
    expect(learned?.cut).toBe(true);
    expect(learned?.text.length).toBeLessThanOrEqual(4000);
    expect(learned?.factIds.some((id) => id.startsWith('p')), 'consolidated lines past the cut are not shown').toBe(false);
    expect(learned?.factIds.length).toBeGreaterThan(0);
    expect(ledgerOf(run).tombstones, 'a fact behind a cut line is not forgotten by id').toEqual([]);
    expect(questions(run).flatMap((q) => q.options ?? []).every((o) => o.action.kind === 'forget-fact'
      && learned?.factIds.includes(o.action.factId)), 'any choice offered is a shown fact').toBe(true);
  });

  it('AC13 b4c-cut-boundary: the facts listed are those behind the lines shown in full, by position, never by equal text', async () => {
    // Two shown fillers read exactly as lines past the cut, which falls inside L1: P4, a fact, and L2, a consolidated line.
    const filler = Array.from({ length: 26 }, (_, i) => fact(`z${i}`, 'about-you', '2026-10-05', i === 2 ? P4.text : i === 4 ? L2.text
      : `I keep a long note number ${i + 1} about the garden, the beans on the north plot, the shed and the paths, so the list of my own words grows long now.`));
    const f = await folder([...filler, ...BASE.filter((e) => e !== G1)], about({ 'about-you': filler.map(own), 'about-preferences': [line(L1), line(L2), own(P4)] }));
    const NO_TEA = 'I no longer prefer tea to coffee in the morning.';
    const run = await press(f, NO_TEA, () => ({ ...nothing(), ends: [{ factId: 'p4', quote: NO_TEA }] }));
    expect(phase(run)).toBe('done');
    const learned = run.frames[0]?.aboutMe?.learned;
    const order = [...filler.map((x) => ({ ...own(x), factIds: [x.factId] })), { ...line(L1), factIds: L1.factIds },
      { ...line(L2), factIds: L2.factIds }, { ...own(P4), factIds: ['p4'] }];
    const raw = (learned?.text ?? '').split('\n');
    expect(raw[0], 'position 4 shows a learned line with no citation (learned-lines-no-link)').toBe(timelineLine(own(filler[0] ?? P4)));
    const full = order.findIndex((l, i) => raw[i] !== timelineLine({ date: l.date, text: l.text }));
    expect(learned?.cut).toBe(true);
    expect(full, 'the fillers that read as P4 and L2 are shown in full; L2 and P4 themselves are not').toBeGreaterThan(4);
    expect(full).toBeLessThanOrEqual(order.length - 2);
    const listed = order.slice(0, full).flatMap((l) => l.factIds);
    expect(learned?.factIds, 'a line the cut truncates lists none of its facts, and equal words elsewhere list nothing').toEqual(listed);
    expect(run.frames[0]?.learnedFacts?.map((x) => x.factId)).toEqual(listed);
    expect(ledgerOf(run).events.filter((e) => e.kind === 'ended'), 'P4 is not shown, though its words are: it cannot end').toEqual([]);
  });

  it('AC12 b4c-ended-member-shown: an ended member of a shown past line is listed; a second ending of it writes nothing', async () => {
    const seeded = [G1, MUG, MUG_END, CY, P4];
    const f = await folder(seeded, about({ 'about-you': [line(PAST), own(G1)], 'about-preferences': [own(P4)] }));
    const errors = vi.mocked(console.error).mock.calls.length;
    const words = `I said it before: ${GAVE}`;
    const run = await press(f, words, () => ({ ...nothing(), ends: [{ factId: 'mug', quote: GAVE }] }));
    expect(phase(run), 'no frozen run').toBe('done');
    expect(run.frames, 'an unbound ending is no reason to ask again').toHaveLength(1);
    expect(run.frames[0]?.aboutMe?.learned.factIds, 'the ended member of a shown line is listed (R14)').toEqual(['mug', 'g1', 'p4']);
    expect(run.after[LEDGER], 'a fact ends once: no second ending').toBe(jsonl(seeded));
    expect(shownIn(run.after[ABOUT], 'about-you')).toEqual([line(PAST), own(G1)]);
    expect(vi.mocked(console.error).mock.calls.length, 'the unbound ending is logged').toBeGreaterThan(errors);
    expect(inboxWords(run), 'the words wait, as an unbound ending\'s words do').toEqual([words]);
  });

  it('AC12 b4c-ended-member-forget-choice: an ambiguous quote offers the shown ended member; choosing it forgets it once', async () => {
    const seeded = [G1, MUG, MUG_END, CY, CUP, P4];
    const f = await folder(seeded, about({ 'about-you': [line(PAST), own(G1), own(CUP)], 'about-preferences': [own(P4)] }));
    const asked = await press(f, 'Forget the blue mug.', forgetting('mug', 'blue mug'));
    expect(phase(asked)).toBe('done');
    expect(ledgerOf(asked).tombstones, 'the quote two facts hold forgets nothing').toEqual([]);
    const q = questions(asked)[0];
    expect(q?.options?.map((o) => (o.action.kind === 'forget-fact' ? o.action.factId : o.action.kind)),
      'the first four shown facts, in About me\'s order: the ended member of the past line first').toEqual(['mug', 'g1', 'cup', 'p4']);
    await choose(f, q, 'mug');
    const forgot = await press(f, [], nothing);
    expect(phase(forgot)).toBe('done');
    expect(ledgerOf(forgot).tombstones.map((t) => [t.factId, t.reason]), 'one tombstone for the chosen ended fact').toEqual([['mug', 'forget']]);
    expect(ledgerOf(forgot).ended, 'a forgotten fact is no longer ended').toEqual([]);
    expect(shownIn(forgot.after[ABOUT], 'about-you'), 'the past line goes with its only member').toEqual([own(G1), own(CUP)]);
    expect(inboxWords(forgot), 'the Forget words are used up').toEqual([]);
    const again = await press(f, null, nothing);
    expect(phase(again)).toBe('done');
    expect(again.after[LEDGER], 'a later run changes nothing').toBe(forgot.after[LEDGER]);
    expect(again.after[ABOUT]).toBe(forgot.after[ABOUT]);
  });

  it('AC12 b4c-ended-member-forget-quote: words that quote only the shown ended member forget it, and its past line goes', async () => {
    const f = await folder([G1, MUG, MUG_END, CY, CUP, P4], about({ 'about-you': [line(PAST), own(G1), own(CUP)], 'about-preferences': [own(P4)] }));
    const run = await press(f, `Forget that ${MUG.text}`, forgetting('mug', MUG.text));
    expect(phase(run)).toBe('done');
    expect(ledgerOf(run).tombstones.map((t) => [t.factId, t.reason])).toEqual([['mug', 'forget']]);
    expect(shownIn(run.after[ABOUT], 'about-you')).toEqual([own(G1), own(CUP)]);
  });

  it('AC12 b4c-ended-fact-late-answer: an answer to a question asked while the fact was live still forgets it after it ended', async () => {
    const POT = fact('pot', 'about-you', '2026-10-05', 'I have potatoes in the garden.');
    const CELLAR = fact('cellar', 'about-you', '2026-10-05', 'I keep potatoes in the cellar.');
    const NO_POT = 'I no longer have potatoes in the garden.';
    const POT_END = { v: 1, kind: 'ended', eventId: 'ended-pot', date: '2026-10-06', factId: 'pot', quote: NO_POT,
      source: { fileId: 'words-end-pot', sha256: sha(`${NO_POT}\n`) }, runId: 'ending-run' };
    // Asked the day before, while the potatoes were live and shown; the person's words ended them since.
    const asked: Stored & Record<string, unknown> = { id: askId('forget-pile'), subject: 'forget-pile', about: 'Alex\'s request', askedAt: DAY - 86_400_000,
      text: 'Which fact should Bower forget?', yes: 'Use this', no: 'Keep it', options: [
        { id: 'fact-1', label: POT.text, action: { kind: 'forget-fact', factId: 'pot' } },
        { id: 'fact-2', label: CELLAR.text, action: { kind: 'forget-fact', factId: 'cellar' } }] };
    const f = await folder([G1, POT, CELLAR, POT_END, P4], about({ 'about-you': [own(G1), own(CELLAR)], 'about-preferences': [own(P4)] }));
    // The seeded folder already holds the questions file: the asked question is written into it, never beside it.
    const file = (await f.drive.listAll(f.root)).find((x) => f.drive.pathOf(x.id, f.root) === SYSTEM.questions);
    if (!file) throw new Error('The made-up folder has no questions file');
    await f.drive.writeText(file.id, JSON.stringify({ v: 1, questions: [asked] }), file.modifiedTime);
    const pile = await f.drive.createFolder(await f.id('Inbox'), 'Forget the potatoes.', { pile: 'forget-pile' });
    await f.drive.createText(pile.id, PILE_NOTE, 'Forget the potatoes.\n');
    await choose(f, asked, 'pot');
    const run = await press(f, [], nothing);
    expect(phase(run)).toBe('done');
    expect(ledgerOf(run).tombstones.map((t) => [t.factId, t.reason]), 'the chosen fact is forgotten, ended or not').toEqual([['pot', 'forget']]);
    expect(ledgerOf(run).ended).toEqual([]);
    expect(shownIn(run.after[ABOUT], 'about-you')).toEqual([own(G1), own(CELLAR)]);
    expect(inboxWords(run)).toEqual([]);
  });

  it('AC15 b4c-manifest: the consolidation manifest shape is accepted; each broken rule is refused', async () => {
    const PREFS = [
      'I prefer remote roles, except when a role offers regular mentoring in Saltmere, so I can ask questions and learn with the team before I decide if it suits me.',
      'I like short written updates that say what changed, why it changed and what comes next, in plain words, so I can follow a change without opening other notes.',
      'I want a small list of roles with clear tasks and regular feedback, so I can compare each one with care before I draft a reply and keep it for later.',
      'I like garden plans that keep the path by the amber gate in Saltmere clear, with watering jobs said plainly and room to carry a can past the beds.',
      'I want recipe notes to keep each ingredient next to its step, say when to add it and keep the first amounts, and never guess a new serving size from a summary.',
      'I like travel notes that keep the meeting place and the first date, with any weather conditions, and never treat a maybe plan as a booked trip until I say so.',
      'I want comparisons that say what is missing and keep each source apart, so a choice that is not sure stays not sure until I add the words that settle it.',
    ];
    const EIGHTH = 'I prefer to keep the amber gate clear when I plan garden work in Saltmere, and I do not want tools left on the path by the beds at any time of day.';
    const seeded = PREFS.map((text, i) => fact(`pref-${i + 1}`, 'about-preferences', i < 3 ? '2026-10-05' : '2026-10-06', text));
    const frontier = { v: 1, kind: 'consolidation', eventId: 'frontier-1', section: 'about-preferences', date: '2026-10-05',
      factIds: ['pref-1', 'pref-2', 'pref-3'], runId: 'history-run', operationId: 'history-op', successful: true };
    const NINTH = 'I like plain labels on the seed boxes.';
    const f = await folder([...seeded.slice(0, 3), frontier, ...seeded.slice(3)], about({ 'about-preferences': seeded.map(own) }));
    const run = await press(f, `Remember this too: ${EIGHTH} ${NINTH}`, (frame) => ({ ...nothing(), observations: [EIGHTH, NINTH].map((text) => ({
      source: { pileId: frame.piles[0]?.pileId }, section: 'about-preferences', category: 'preference', text })) }));
    expect(phase(run)).toBe('done');
    const stored = JSON.parse(Object.entries(run.after).find(([path]) => /\/manifest-[^/]+\.json$/.test(path))?.[1] ?? '{}') as Manifest;
    const eighth = ledgerOf(run).live.find((x) => x.text === EIGHTH)?.factId ?? '';
    const ninth = ledgerOf(run).live.find((x) => x.text === NINTH)?.factId ?? '';
    expect((ledgerOf(run).events.at(-1) as { factId?: string } | undefined)?.factId, 'the run\'s last new fact is the ninth').toBe(ninth);
    const ids = [...seeded.map((x) => x.factId), eighth, ninth];
    const lines = [
      { text: 'I prefer remote roles, except when a role offers regular mentoring in Saltmere, before I decide if it suits me.', factIds: [ids[0]] },
      { text: 'I like short written updates that say what changed, why and what comes next, without opening other notes, and a small list of roles with clear tasks and regular feedback.', factIds: [ids[1], ids[2]] },
      { text: 'I like garden plans that keep the path by the amber gate in Saltmere clear, and when I plan garden work I do not want tools left on the path.', factIds: [ids[3], ids[7]] },
      { text: 'I want recipe notes to keep each ingredient next to its step and the first amounts, and never guess a new serving size.', factIds: [ids[4]] },
      { text: 'I like travel notes that keep the meeting place and the first date, with any weather conditions, and never treat a maybe plan as a booked trip.', factIds: [ids[5]] },
      { text: 'I want comparisons that say what is missing, so a choice that is not sure stays not sure until I add the words that settle it.', factIds: [ids[6]] },
    ].map((l) => ({ ...l, form: 'current' }));
    /** 'accepted', or why the manifest is refused: 'shape' is the artifact rules' refusal (the fixture checks its own seal). */
    const verdict = async (m: Manifest) => {
      const result = await parseRunManifestV2(new TextEncoder().encode(JSON.stringify(m)), f.root, RUNNER_WRITES);
      return result.ok ? 'accepted' : result.reason;
    };
    expect(await verdict(stored), 'the plain learning manifest parses').toBe('accepted');
    expect(await verdict(await consolidated(stored, lines, ids)), 'archive first, then the one ledger write with the consolidation event last, then maintain')
      .toBe('accepted');
    const numbered = lines.map((l, i) => (i === 3 ? { ...l, text: l.text.replace('the first amounts', 'the first 2 amounts') } : l));
    // Each variant breaks one rule and passes every other: built from the stored manifest and resealed on its own.
    const variants: Array<[string, () => Promise<Manifest>]> = [
      ['the archive after the ledger write, which does not depend on it', () => consolidated(stored, lines, ids, { archiveAfterLedger: true })],
      ['the archive before the ledger write, which does not depend on it', () => consolidated(stored, lines, ids, { noDependency: true })],
      ['the event naming a folder and no archive at all', () => consolidated(stored, lines, ids, { nameFolder: true })],
      ['archive bytes that differ from the section maintain read', () => consolidated(stored, lines, ids, { archiveText: (t) => t.replace('I prefer', 'I preferred') })],
      ['an archive named for another day', () => consolidated(stored, lines, ids, { archiveDate: '2026-10-06' })],
      ['an archive in another section', () => consolidated(stored, lines, ids, { section: 'about-you' })],
      ['an unsuccessful consolidation', () => consolidated(stored, lines, ids, { unsuccessful: true })],
      ['a line with a number its facts do not hold', () => consolidated(stored, numbered, ids)],
      ['the event before this run\'s last fact, valid on the ledger before it', () => consolidated(stored, lines, ids.slice(0, -1), { eventFirst: true })],
      ['an archive no consolidation names', () => consolidated(stored, lines, ids, { secondArchive: true })],
      ['an event listing a fact the input does not', () => consolidated(stored, lines, [...ids, 'not-in-input'])],
      ['a live fact dropped', () => consolidated(stored, lines.slice(0, 5), ids, { dropped: [ids[6] ?? ''] })],
    ];
    for (const [name, variant] of variants) expect(await verdict(await variant()), name).toBe('shape');
  });
});

type Op = { operationId: string; ordinal: number; dependsOn: string[]; effect: Record<string, unknown> & { kind: string } };
type Manifest = { runId: string; captureId: string; requestedAt: number; operations: Op[]; reportPlan: unknown[]; satisfiedAppends?: unknown[];
  capture: { places: Array<{ path: string; file: { fileId: string } }> } } & Record<string, unknown>;
const raw = (text: string) => ({ encoding: 'utf8', size: new TextEncoder().encode(text).length, sha256: sha(text) });

/**
 * The stored learning manifest turned into B4c's shape: the archive folders and the archive before the run's one ledger
 * write, the consolidation event as its last line naming the archive, every id sealed again as withMaintenance does.
 */
async function consolidated(stored: Manifest, lines: Array<{ text: string; factIds: Array<string | undefined>; form: string }>, factIds: string[], o: {
  archiveAfterLedger?: boolean; noDependency?: boolean; nameFolder?: boolean; archiveText?: (text: string) => string; archiveDate?: string; section?: Region;
  unsuccessful?: boolean; eventFirst?: boolean; secondArchive?: boolean; dropped?: string[] } = {}): Promise<Manifest> {
  const m = JSON.parse(JSON.stringify(stored)) as Manifest;
  const ledgerAt = m.operations.findIndex((op) => op.effect.kind === 'write-runner-json' && op.effect.path === LEDGER);
  const maintain = m.operations.at(-1);
  const declared = (maintain?.effect.inputs as { targets: Array<{ kind?: string; declaration?: { sources: Array<{ path: string; text: string }> } }> })
    .targets.find((t) => t.kind === 'about')?.declaration?.sources.find((s) => s.path === ABOUT)?.text ?? '';
  const section = o.section ?? 'about-preferences';
  const bytes = new TextEncoder().encode(declared);
  const owned = parseOwnership(bytes);
  const span = 'payloads' in owned ? owned.payloads?.['about-preferences'] : undefined;
  const payload = span ? new TextDecoder().decode(bytes.subarray(span.start, span.end)) : '';
  const sys = m.capture.places.find((p) => p.path === '.bower')?.file.fileId ?? '';
  const date = o.archiveDate ?? '2026-10-07';
  const folderOp = (name: string, parent: Record<string, string>): Op => ({ operationId: `new-${name}`, ordinal: 0, dependsOn: parent.createdBy ? [parent.createdBy] : [],
    effect: { kind: 'create-folder', parent, name, createKey: `b4c-folder-${name}` } });
  const archive = (key: string, parent: string): Op => ({ operationId: `new-${key}`, ordinal: 0, dependsOn: [parent], effect: { kind: 'create-text',
    parent: { createdBy: parent }, name: `${date}-${key}.md`, createKey: key, purpose: 'about-archive',
    text: o.archiveText ? o.archiveText(payload) : payload, content: raw(o.archiveText ? o.archiveText(payload) : payload) } });
  const added = [folderOp('archive', { fileId: sys }), folderOp('about-me', { createdBy: 'new-archive' }), folderOp(section, { createdBy: 'new-about-me' }),
    ...(o.nameFolder ? [] : [archive('b4c-archive-1', `new-${section}`)]), ...(o.secondArchive ? [archive('b4c-archive-2', `new-${section}`)] : [])];
  // The event names its archive; the folder variant names the archive's folder instead, and creates no archive.
  const named = o.nameFolder ? `new-${section}` : 'new-b4c-archive-1';
  const ledger = m.operations[ledgerAt];
  if (!ledger) throw new Error('The learning manifest has no ledger write');
  const text = String(ledger.effect.text);
  const event = { v: 1, kind: 'consolidation', eventId: 'b4c-consolidation-1', section: 'about-preferences', date: '2026-10-07',
    factIds, runId: m.runId, operationId: named,
    successful: !o.unsuccessful, lines, dropped: o.dropped ?? [] };
  const rows = text.slice(0, -1).split('\n');
  ledger.effect.text = (o.eventFirst ? [...rows.slice(0, -1), JSON.stringify(event), rows.at(-1)] : [...rows, JSON.stringify(event)]).join('\n') + '\n';
  ledger.effect.content = raw(String(ledger.effect.text));
  ledger.dependsOn = [...ledger.dependsOn, ...(o.archiveAfterLedger || o.noDependency ? [] : [named])];
  // An archive after the ledger write is the last memory write, so maintain depends on it: only the ledger's dependency breaks.
  if (o.archiveAfterLedger && maintain) maintain.dependsOn = [...maintain.dependsOn, named];
  const ops = o.archiveAfterLedger
    ? [...m.operations.slice(0, ledgerAt + 1), ...added, ...m.operations.slice(ledgerAt + 1)]
    : [...m.operations.slice(0, ledgerAt), ...added, ...m.operations.slice(ledgerAt)];
  // Seal again in order, as withMaintenance does: each id is the canonical hash of its run, capture, ordinal and effect.
  // A first pass on a copy gives the ids that never depend on the ledger (the archive's among them), so the event names
  // its archive's sealed id wherever the archive stands.
  const at = ops.indexOf(ledger);
  const EVENT = '"eventId":"b4c-consolidation-1"';
  const seal = async (list: Op[], known: ReadonlyMap<string, string>) => {
    const renamed = new Map<string, string>();
    const swap = (id: string) => renamed.get(id) ?? known.get(id) ?? id;
    for (const [ordinal, op] of list.entries()) {
      op.ordinal = ordinal;
      op.dependsOn = op.dependsOn.map(swap);
      const parent = op.effect.parent as { createdBy?: string } | undefined;
      if (parent?.createdBy) parent.createdBy = swap(parent.createdBy);
      if (ordinal === at) {
        op.effect.text = String(op.effect.text).split('\n').map((row) => {
          if (!row.includes(EVENT)) return row;
          const value = JSON.parse(row) as { operationId: string };
          return JSON.stringify({ ...value, operationId: swap(value.operationId) });
        }).join('\n');
        op.effect.content = raw(String(op.effect.text));
      }
      if (op.effect.kind === 'maintain') (op.effect.inputs as { operationIds: string[] }).operationIds = list.slice(0, ordinal).map((x) => x.operationId);
      const id = (await canonical({ runId: m.runId, captureId: m.captureId, ordinal, effect: op.effect })).hash;
      renamed.set(op.operationId, id);
      op.operationId = id;
    }
    return renamed;
  };
  const renamed = await seal(ops, await seal(structuredClone(ops), new Map()));
  // The fixture breaks only its variant's rule: every id sealed, every dependency earlier, the event naming an operation.
  const pointed = (JSON.parse(String(ops[at]?.effect.text).split('\n').find((row) => row.includes(EVENT)) ?? '{}') as { operationId?: string }).operationId;
  if (!ops.some((op) => op.operationId === pointed)) throw new Error('The fixture\'s consolidation event names no operation');
  for (const [ordinal, op] of ops.entries()) {
    if ((await canonical({ runId: m.runId, captureId: m.captureId, ordinal, effect: op.effect })).hash !== op.operationId
      || !op.dependsOn.every((dep) => ops.slice(0, ordinal).some((x) => x.operationId === dep))) throw new Error('The fixture left an operation unsealed');
  }
  m.operations = ops;
  const json = JSON.stringify({ ...m, operations: undefined });
  const remapped = JSON.parse([...renamed].reduce((s, [from, to]) => s.split(from).join(to), json)) as Manifest;
  return { ...remapped, operations: ops };
}
