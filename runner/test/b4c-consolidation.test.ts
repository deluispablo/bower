/** B4c-c through production main: the consolidation call, its judge, the archive first, recovery and cost (owner rulings 2026-10-14). */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { format } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseObservations } from '../../src/data/contracts/observations';
import { parseOwnership } from '../../src/data/contracts/ownership-format';
import { parseTimelineLine, timelineLine } from '../../src/data/contracts/timeline-line';
import type { RunReport } from '../../src/data/contracts/types';
import { PILE_NOTE } from '../../src/data/piles';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { SYSTEM } from '../../src/data/vault/layout';
import type { ClaudeCall, ClaudeExit, ClaudeSpawn } from '../src/claude';
import { loadCase, type LoadedCase } from '../src/corpus';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { redispatchCase, replySequence, runOnDrive, runWithClaude, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';

const DAY = Date.UTC(2026, 9, 7, 9);
const ABOUT = 'About me.md';
const LEDGER = '.bower/observations.jsonl';
const SECTION = '.bower/archive/about-me/about-preferences';
const pacing = { baseMs: 0, sleep: async () => {} };
type Region = 'about-you' | 'about-working-on' | 'about-preferences';
type Kind = 'selection' | 'execution' | 'consolidation' | 'judge';
type Fact = { date: string; text: string; status: 'live' | 'ended'; ended?: string; evidence?: string };
type Consolidation = { section: string; label: string; budget: number; words: number; facts: Array<Fact & { n: number }> };
type Judge = { lines: Array<{ n: number; text: string; form: string; facts: Fact[] }> };
type Line = { text: string; facts: number[]; form?: 'current' | 'past' };

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

/** The C17 gate case's eight preferences: seven are 213 words, eight are 246 (budget 200). */
const PREFS = [
  'I prefer remote roles, except when a role offers regular mentoring in Saltmere, so I can ask questions and learn with the team before I decide if it suits me.',
  'I like short written updates that say what changed, why it changed and what comes next, in plain words, so I can follow a change without opening other notes.',
  'I want a small list of roles with clear tasks and regular feedback, so I can compare each one with care before I draft a reply and keep it for later.',
  'I like garden plans that keep the path by the amber gate in Saltmere clear, with watering jobs said plainly and room to carry a can past the beds.',
  'I want recipe notes to keep each ingredient next to its step, say when to add it and keep the first amounts, and never guess a new serving size from a summary.',
  'I like travel notes that keep the meeting place and the first date, with any weather conditions, and never treat a maybe plan as a booked trip until I say so.',
  'I want comparisons that say what is missing and keep each source apart, so a choice that is not sure stays not sure until I add the words that settle it.',
  'I prefer to keep the amber gate clear when I plan garden work in Saltmere, and I do not want tools left on the path by the beds at any time of day.',
];
/** Each preference's date: three seeded before the frontier, three after, the seventh and eighth from presses on DAY. */
const DATES = ['2026-10-05', '2026-10-05', '2026-10-05', '2026-10-06', '2026-10-06', '2026-10-06', '2026-10-07', '2026-10-07'];
const LATER = [
  'I want the bins out on Thursday night, never on Wednesday, so the lane stays clear for the school bus in the morning.',
  'I like my week planned on Sunday evening, with the garden jobs first and the paperwork after, so nothing waits too long.',
  'I prefer to read long notes on paper, not on the phone, and I want short notes on the phone only when I am out.',
  'I want reminders about the plot rent a week early, so I can pay it before the end of the month without a rush.',
  'I like to keep spare seeds in the blue tin by the shed door, and I do not want them moved to the kitchen.',
];
/** A faithful, freely reworded reply for facts 1-8, by fact number (the B contract red's line checks accept it). */
const REPLY: Line[] = [
  { text: 'I prefer remote roles, except when a role offers regular mentoring in Saltmere, before I decide if it suits me.', facts: [1] },
  { text: 'I like short written updates that say what changed, why and what comes next, without opening other notes, and a small list of roles with clear tasks and regular feedback.', facts: [2, 3] },
  { text: 'I like garden plans that keep the path by the amber gate in Saltmere clear, and when I plan garden work I do not want tools left on the path.', facts: [4, 8] },
  { text: 'I want recipe notes to keep each ingredient next to its step and the first amounts, and never guess a new serving size.', facts: [5] },
  { text: 'I like travel notes that keep the meeting place and the first date, with any weather conditions, and never treat a maybe plan as a booked trip.', facts: [6] },
  { text: 'I want comparisons that say what is missing, so a choice that is not sure stays not sure until I add the words that settle it.', facts: [7] },
];
const BINS: Line = { text: 'I want the bins out on Thursday night, never on Wednesday.', facts: [9] };
const SECOND: Line[] = [...REPLY, BINS,
  { text: 'I like my week planned on Sunday evening, with the garden jobs first.', facts: [10] },
  { text: 'I prefer to read long notes on paper, not on the phone, and short notes on the phone only when I am out.', facts: [11] },
  { text: 'I want reminders about the plot rent a week early, without a rush.', facts: [12] },
  { text: 'I like to keep spare seeds in the blue tin by the shed door, and I do not want them moved.', facts: [13] },
];
const FORGOTTEN = 'I want long meetings on Friday afternoons.';
const GARDEN = 'I grow beans on the north plot.';
const OLD_ARCHIVE = '### How you like things\n- 2026-10-05 · I used to like lanterns by the door. · [[Your words]]\n';
/** A preference the person's words ended after the frontier: the input lists it after the live facts, as fact 9. */
const MUG = 'I want my tea in the blue mug.';
const NO_MUG = 'I no longer want my tea in the blue mug.';
const PAST_MUG: Line = { text: 'I wanted my tea in the blue mug.', facts: [9], form: 'past' };
/** Long facts for About you (budget 400): thirteen and the garden fact are 397 words, a fourteenth makes 427. */
const HABIT = (n: number) => `I keep garden habit ${n}: I water the beds slowly at dawn, check the soil by hand, and write down what grew so I can plan the rows with care.`;
/** Long facts for What you're working on (budget 400): fourteen are 406 words, a fifteenth makes 435. */
const PROJECT = (n: number) => `I am working on garden project ${n}: I measure the beds each week, note what the seedlings need, and plan the next sowing with my neighbour in the lane.`;
/** A 200-character rewording of facts 2 and 3, the longest line the grammar allows. */
const WIDE = 'I like short written updates that say what changed, why it changed and what comes next, in plain words, without opening my other notes, and a small list of roles with clear tasks and regular feedback.';
/** The made-up credential `corpus-run` gives every run (`CLAUDE_CODE_OAUTH_TOKEN`). */
const TOKEN = 'made-up-token-for-tests-only';

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const fact = (id: string, section: Region, date: string, text: string) => ({ v: 1, kind: 'observation', eventId: `event-${id}`, factId: id,
  date, section, text, category: section === 'about-preferences' ? 'preference' : 'biography',
  source: { fileId: `words-${id}`, sha256: sha(`${text}\n`) }, origin: { kind: 'words', runId: 'history-run', captureId: sha('history'), pileId: `pile-${id}` } });
const habits = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => fact(`habit-${from + i}`, 'about-you', '2026-10-06', HABIT(from + i)));
const projects = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => fact(`project-${from + i}`, 'about-working-on', '2026-10-06', PROJECT(from + i)));
const mugEvents = () => [fact('mug', 'about-preferences', '2026-10-05', MUG), { v: 1, kind: 'ended', eventId: 'ended-mug', date: '2026-10-06',
  factId: 'mug', quote: NO_MUG, source: { fileId: 'words-end-mug', sha256: sha(`${NO_MUG}\n`) }, runId: 'ending-run' }];
const jsonl = (events: readonly unknown[]) => events.map((e) => JSON.stringify(e)).join('\n') + '\n';
const ledgerOf = (run: CaseRun) => parseObservations(new TextEncoder().encode(run.after[LEDGER] ?? ''));
/** main exits 0 for a failure the Worker accepted, so a finished run is one whose last status is done. */
const phase = (run: CaseRun) => run.wire?.statuses.at(-1)?.phase;
const report = (run: CaseRun): RunReport => (run.lastRun as { run?: { report?: RunReport } } | null)?.run?.report
  ?? { filed: [], created: [], updated: [], setAside: [], questions: [] };
const archives = (run: CaseRun) => Object.keys(run.after).filter((p) => p.startsWith(`${SECTION}/2026-10-07-`)).sort();
type Op = { operationId: string; dependsOn: string[]; effect: Record<string, unknown> & { kind: string } };
const manifestOf = (run: CaseRun) => JSON.parse(Object.entries(run.after)
  .find(([p]) => p.startsWith(`.bower/runs/${run.dispatch?.runId ?? '-'}/manifest-`))?.[1] ?? '{"operations":[]}') as { operations: Op[] };

function about(regions: Partial<Record<Region, Array<{ date: string; text: string }>>>): string {
  const labels: Record<Region, string> = { 'about-you': 'About you', 'about-working-on': "What you're working on", 'about-preferences': 'How you like things' };
  return '---\nsummary: What Bower knows about you. Change it whenever you like.\n---\n\n## My words\n\nI keep my own notes here.\n\n## What Bower has learned\n'
    + (Object.keys(labels) as Region[]).map((r) => `<!-- bower:ownership/2 begin ${r} -->\n### ${labels[r]}\n`
      + (regions[r] ?? []).map((l) => timelineLine({ date: l.date, text: l.text, source: 'Your words' }) + '\n').join('')
      + `<!-- bower:ownership/2 end ${r} -->\n`).join('');
}
/** One region of About me: its exact bytes between the markers, and its learned lines. */
function region(text: string | undefined, name: Region): { payload: string; lines: Array<{ date: string; text: string }> } {
  const bytes = new TextEncoder().encode(text ?? '');
  const owned = parseOwnership(bytes);
  const span = 'payloads' in owned ? owned.payloads?.[name] : undefined;
  const payload = span ? new TextDecoder().decode(bytes.subarray(span.start, span.end)) : '';
  return { payload, lines: payload.split('\n').flatMap((l) => { const p = parseTimelineLine(l); return p ? [{ date: p.date, text: p.text }] : []; }) };
}
const shownPrefs = (run: CaseRun) => region(run.after[ABOUT], 'about-preferences').lines.map((l) => l.text);

/**
 * A made-up folder: a forgotten preference, a fact about you, the first `seeded` preferences with a successful frontier
 * after the first three, then `extra` events. About me shows each region's facts that are neither forgotten nor ended.
 */
async function folder(o: { oldArchive?: boolean; seeded?: number; extra?: ReadonlyArray<Record<string, unknown>> } = {}) {
  const prefs = PREFS.slice(0, o.seeded ?? 6).map((text, i) => fact(`pref-${i + 1}`, 'about-preferences', DATES[i] ?? '', text));
  const g1 = fact('g1', 'about-you', '2026-10-05', GARDEN);
  const frontier = { v: 1, kind: 'consolidation', eventId: 'frontier-1', section: 'about-preferences', date: '2026-10-05',
    factIds: ['pref-1', 'pref-2', 'pref-3'], runId: 'history-run', operationId: 'history-op', successful: true };
  const events: ReadonlyArray<Record<string, unknown>> = [g1, fact('pref-x', 'about-preferences', '2026-10-04', FORGOTTEN), { v: 1, kind: 'tombstone', eventId: 'forget-x', date: '2026-10-04',
    factId: 'pref-x', sourceId: 'words-pref-x', reason: 'forget', runId: 'forget-run' }, ...prefs.slice(0, 3), frontier, ...prefs.slice(3), ...(o.extra ?? [])];
  const gone = new Set(events.flatMap((e) => (e.kind === 'tombstone' || e.kind === 'ended' ? [e.factId] : [])));
  const shown = (r: Region) => events.flatMap((e) => (e.kind === 'observation' && e.section === r && !gone.has(e.factId)
    ? [{ date: String(e.date), text: String(e.text) }] : []));
  const c: LoadedCase = { id: 'b4c-consolidation', capability: 'C05', title: 'Alex keeps learned facts', covers: 'model', source: 'new',
    scope: 'all', allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: [], journal: [],
    bowerOwned: [], inbox: [], inboxFiles: {}, folder: { [LEDGER]: jsonl(events),
      [ABOUT]: about({ 'about-you': shown('about-you'), 'about-working-on': shown('about-working-on'), 'about-preferences': shown('about-preferences') }),
      'Projects/Garden/Garden.md': '---\nsummary: Alex plans the garden.\n---\n# Garden\n\nThe garden note text stays out of memory calls.\n\n## Timeline\n',
      ...(o.oldArchive ? { [`${SECTION}/2026-10-05-history-op.md`]: OLD_ARCHIVE } : {}) } };
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
type Answer = (context: Consolidation, call: ClaudeCall) => ClaudeExit | Promise<ClaudeExit>;
type Verdicts = (context: Judge, call: ClaudeCall) => ClaudeExit | Promise<ClaudeExit>;
const answer = (lines: Line[] = REPLY, dropped?: number[]): Answer => () =>
  reply({ lines: lines.map((l) => ({ text: l.text, facts: l.facts, form: l.form ?? 'current' })), ...(dropped ? { dropped } : {}) });
const verdicts = (supported: (n: number) => boolean, reason = 'Made-up reason: every part follows from its facts.'): Verdicts => (context) =>
  reply({ verdicts: context.lines.map((l) => ({ n: l.n, supported: supported(l.n), reason })) });
const approve = verdicts(() => true);
const remember = (text: string) => `Remember this: ${text}`;
const modelOf = (call: ClaudeCall) => call.args[call.args.indexOf('--model') + 1];
const failed = (): ClaudeExit => ({ code: 1, stderr: 'Made-up model failure.', cut: null, stdout: '' });
const malformed = (): ClaudeExit => ({ code: 0, stderr: '', cut: null, stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'not json' }) });

/**
 * One press: optional words first (else a request record), then main with a scripted model that files nothing, says
 * what the words remember, answers a consolidation call with `consolidate` and a judge call with `judge`. Every call is
 * recorded in order with its input and model.
 */
async function press(f: Folder, words: string | null, o: { section?: Region; observe?: ReadonlyArray<{ section: Region; text: string }>;
  consolidate?: Answer; judge?: Verdicts; env?: Record<string, string>; onCall?: (kind: Kind) => void;
  around?: (fetch: typeof globalThis.fetch) => typeof globalThis.fetch } = {}) {
  f.press++;
  if (words !== null) {
    const pile = await f.drive.createFolder(await f.id('Inbox'), words.slice(0, 40).trim(), { pile: `words-${f.press}` });
    await f.drive.createText(pile.id, PILE_NOTE, `${words}\n`);
  } else {
    await f.drive.createText(await f.id(SYSTEM.changes), `press-${f.press}.json`, JSON.stringify({ v: 1, id: `press-${f.press}`, device: 'device-1',
      at: DAY + f.press, kind: 'request', what: 'Asked Bower to update the notes', text: 'Update these notes.' }));
  }
  const scope = (await f.drive.listAll(f.root)).some((x) => f.drive.pathOf(x.id, f.root).startsWith('Inbox/')) ? 'all' : 'instructions';
  const admission = await planAdmission(fakeRead(f.drive), f.root, { scope, clock: () => DAY + f.press, newId: () => `b4c-admission-${f.press}` });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  const calls: Kind[] = []; const inputs = new Map<Kind, string>(); const models = new Map<Kind, string | undefined>();
  const garden = await f.id('Projects/Garden');
  const spawn: ClaudeSpawn = phaseAwareClaude(async (call, _step, _attempt, phase) => {
    const context = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as { consolidation?: Consolidation; judge?: Judge;
      sources?: Array<{ itemId: string }>; piles?: Array<{ pileId: string; words: string }> };
    const kind: Kind = context.consolidation ? 'consolidation' : context.judge ? 'judge' : phase;
    calls.push(kind); inputs.set(kind, call.input); models.set(kind, modelOf(call)); o.onCall?.(kind);
    if (context.consolidation) return (o.consolidate ?? answer())(context.consolidation, call);
    if (context.judge) return (o.judge ?? approve)(context.judge, call);
    if (kind === 'selection') return reply({ items: (context.sources ?? []).map((s) => ({ itemId: s.itemId, kind: 'unknown', destination: garden, wants: [] })), asks: [] });
    const pile = context.piles?.find((p) => /Remember this: /.test(p.words));
    const text = pile?.words.match(/Remember this: (.+)/)?.[1]?.trim();
    const observed = o.observe ?? (text ? [{ section: o.section ?? 'about-preferences', text }] : []);
    return reply({ kind: 'tidy-intent', v: 1, things: [], ...(pile && observed.length ? { observations: observed.map((x) => ({ source: { pileId: pile.pileId },
      section: x.section, category: x.section === 'about-preferences' ? 'preference' : 'biography', text: x.text })) } : {}) });
  }, () => ({ drive: f.drive, root: f.root, admission: admission.manifest }), true);
  const run = await runOnDrive(f.c, f.drive, f.root, { claude: spawn, admission: admission.manifest, pacing, ...(o.around ? { around: o.around } : {}),
    ...(o.env ? { env: o.env } : {}), answerStart: { scope, requestId: `b4c-run-${f.press}` } }, f.press);
  return { ...run, calls, inputs, models };
}
/** The seed, then press 1 adds the seventh preference: over budget, four facts newer than the frontier. */
async function waited(o: Parameters<typeof folder>[0] = {}) {
  const f = await folder(o);
  const first = await press(f, remember(PREFS[6] ?? ''));
  return { f, first };
}
const consolidationsOf = (run: CaseRun) => ledgerOf(run).events.filter((e) => e.kind === 'consolidation' && e.runId === run.dispatch?.runId);
const lastLine = (input: string | undefined) => JSON.parse(input?.split('\n').at(-1) ?? '{}') as Record<string, unknown>;
const url = (input: Parameters<typeof fetch>[0]) => new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
/**
 * The archive's create: a multipart create whose metadata names a dated archive file. Its metadata gives `parents`
 * after the name; the run manifest's upload also holds the archive's name, in its effect, followed by `parent`.
 */
const archiveCreate = async (input: Parameters<typeof fetch>[0], init?: RequestInit) => init?.method === 'POST'
  && url(input).pathname === '/upload/drive/v3/files' && init.body instanceof Blob && /"name":"2026-10-07-[A-Za-z0-9_-]+\.md","parents"/.test(await init.body.text());
const throwing = () => vi.fn(() => { throw new Error('Recovery uses the stored manifest, not a new model call.'); });
const CONSOLIDATING: Kind[] = ['selection', 'execution', 'consolidation', 'judge'];
/** Words that remember one whole fact per section, in one pile. */
const several = (facts: Array<{ section: Region; text: string }>) => ({ words: remember(facts.map((x) => x.text).join(' ')), observe: facts });
/** Every archive the run left, in any section. */
const allArchives = (run: CaseRun) => Object.keys(run.after).filter((p) => p.startsWith('.bower/archive/about-me/'));
/** Everything logged with `console.error` since `from`, as Node prints it. */
const printed = (from: number) => vi.mocked(console.error).mock.calls.slice(from).map((args) => format(...args)).join('\n');

describe('B4c-c through production main', () => {
  it('AC17 b4c-gate-through-main: four newer facts wait; the fifth brings one consolidation call and one judge call', async () => {
    const { f, first } = await waited();
    expect(phase(first)).toBe('done');
    expect(first.calls, 'over budget with four newer facts: no consolidation call').toEqual(['selection', 'execution']);
    const second = await press(f, remember(PREFS[7] ?? ''));
    expect(second.calls, 'the fifth newer fact').toEqual(CONSOLIDATING);
    expect(phase(second)).toBe('done');
  });

  it('AC2 c12-measure-call-kinds: a consolidating run prints one model-call line per call, in order, by kind', async () => {
    const { f } = await waited();
    const from = vi.mocked(console.log).mock.calls.length;
    const second = await press(f, remember(PREFS[7] ?? ''));
    expect(second.calls).toEqual(CONSOLIDATING);
    const lines = vi.mocked(console.log).mock.calls.slice(from).flat().map(String).flatMap((s) => s.split('\n'));
    expect(lines.flatMap((l) => /^model-call: kind=(\w+) in=\d+ cached=\d+ out=\d+ ms=\d+$/.exec(l)?.[1] ?? [])).toEqual(CONSOLIDATING);
  });

  it('AC17 b4c-learning-run: a due section is consolidated only by a run that adds a fact to it', async () => {
    const f = await folder({ extra: [7, 8].map((n) => fact(`pref-${n}`, 'about-preferences', '2026-10-06', PREFS[n - 1] ?? '')) });
    const plain = await press(f, null);
    expect(phase(plain)).toBe('done');
    expect(plain.calls.filter((c) => c === 'consolidation'), 'no new fact: no consolidation call').toEqual([]);
    const elsewhere = await press(f, remember('I grow peas on the south plot.'), { section: 'about-you' });
    expect(ledgerOf(elsewhere).live.map((x) => x.text)).toContain('I grow peas on the south plot.');
    expect(elsewhere.calls.filter((c) => c === 'consolidation'), 'a fact about you does not consolidate preferences').toEqual([]);
    const learning = await press(f, remember(LATER[0] ?? ''), { consolidate: answer([...REPLY, BINS]) });
    expect(learning.calls, 'a fact for the due section').toEqual(CONSOLIDATING);
    expect(consolidationsOf(learning)).toHaveLength(1);
  });

  /** A faithful reply for any section: each fact cut to its first clause, by number. */
  const shortened: Answer = (context) => reply({ lines: context.facts.map((x) => ({ text: `${x.text.split(',')[0]?.replace(/\.$/, '')}.`, facts: [x.n], form: 'current' })) });
  const recording = (sections: string[], then: Answer): Answer => (context, call) => { sections.push(context.section); return then(context, call); };

  it('AC17 b4c-first-section: with three sections due, only About you is consolidated; the others wait for their next learning run', async () => {
    const f = await folder({ seeded: 7, extra: [...habits(1, 13), ...projects(1, 14)] });
    const s = several([{ section: 'about-you', text: HABIT(14) }, { section: 'about-working-on', text: PROJECT(15) }, { section: 'about-preferences', text: PREFS[7] ?? '' }]);
    const sections: string[] = [];
    const run = await press(f, s.words, { observe: s.observe, consolidate: recording(sections, shortened) });
    expect(run.calls, 'one consolidation and one judge call in the run').toEqual(CONSOLIDATING);
    expect(sections, 'the first due section in About me\'s order').toEqual(['about-you']);
    expect(consolidationsOf(run).map((e) => (e as { section?: string }).section)).toEqual(['about-you']);
    expect(region(run.after[ABOUT], 'about-working-on').lines.map((l) => l.text), 'What you\'re working on waits in the person\'s words')
      .toEqual(Array.from({ length: 15 }, (_, i) => PROJECT(i + 1)));
    expect(shownPrefs(run), 'and so does How you like things').toEqual(PREFS);
    const next = await press(f, remember(LATER[0] ?? ''), { consolidate: recording(sections, answer([...REPLY, BINS])) });
    expect(next.calls).toEqual(CONSOLIDATING);
    expect(sections, 'the next learning run that adds a preference consolidates How you like things').toEqual(['about-you', 'about-preferences']);
  });

  it('AC17 b4c-one-section-per-run: What you\'re working on comes before How you like things, and its refusal passes the turn to no section', async () => {
    const f = await folder({ seeded: 7, extra: projects(1, 14) });
    const s = several([{ section: 'about-working-on', text: PROJECT(15) }, { section: 'about-preferences', text: PREFS[7] ?? '' }]);
    const sections: string[] = [];
    const errors = vi.mocked(console.error).mock.calls.length;
    const run = await press(f, s.words, { observe: s.observe, consolidate: recording(sections, failed) });
    expect(run.calls, 'one consolidation call: no second section, no judge').toEqual(['selection', 'execution', 'consolidation']);
    expect(sections).toEqual(['about-working-on']);
    expect(phase(run)).toBe('done');
    expect(consolidationsOf(run)).toEqual([]);
    expect(allArchives(run)).toEqual([]);
    expect(shownPrefs(run)).toEqual(PREFS);
    expect(vi.mocked(console.error).mock.calls.length, 'the skip is logged').toBeGreaterThan(errors);
  });

  it('AC17 b4c-over-limit-section: a due section of more than 100 facts is passed over for the next due section', async () => {
    const many = Array.from({ length: 100 }, (_, i) => fact(`you-${i + 1}`, 'about-you', '2026-10-06', `I keep garden habit ${i + 1} for the north plot.`));
    const f = await folder({ seeded: 7, extra: many });
    const s = several([{ section: 'about-you', text: 'I keep garden habit 101 for the north plot.' }, { section: 'about-preferences', text: PREFS[7] ?? '' }]);
    const sections: string[] = [];
    const run = await press(f, s.words, { observe: s.observe, consolidate: recording(sections, answer()) });
    expect(run.calls).toEqual(CONSOLIDATING);
    expect(sections, 'About you holds 102 facts: no call for it').toEqual(['about-preferences']);
    expect(consolidationsOf(run).map((e) => (e as { section?: string }).section)).toEqual(['about-preferences']);
    expect(shownPrefs(run)).toEqual(REPLY.map((l) => l.text));
  });

  it('AC17 b4c-section-learning-run: a section over budget with newer facts but none from this run is not due', async () => {
    const { f } = await waited({ extra: habits(1, 14) });
    const sections: string[] = [];
    const run = await press(f, remember(PREFS[7] ?? ''), { consolidate: recording(sections, answer()) });
    expect(run.calls).toEqual(CONSOLIDATING);
    expect(sections, 'About you is 427 words with fifteen newer facts, none from this run').toEqual(['about-preferences']);
  });

  it('AC18 b4c-call-input: the call holds exactly the section\'s facts, numbered and dated, and nothing else', async () => {
    const { f } = await waited({ oldArchive: true });
    const second = await press(f, remember(PREFS[7] ?? ''));
    const input = second.inputs.get('consolidation');
    expect(input, 'a consolidation call was made').toBeDefined();
    const context = lastLine(input);
    expect(Object.keys(context)).toEqual(['consolidation']);
    expect(context.consolidation).toEqual({ section: 'about-preferences', label: 'How you like things', budget: 200, words: 246,
      facts: PREFS.map((text, i) => ({ n: i + 1, date: DATES[i], text, status: 'live' })) });
    for (const secret of [FORGOTTEN, GARDEN, 'I keep my own notes here', 'lanterns', 'Remember this', 'garden note text', 'Garden.md', 'pref-', 'history-run', 'words-']) {
      expect(input, `the call never holds "${secret}"`).not.toContain(secret);
    }
    expect(second.models.get('consolidation'), 'the consolidation runs on the run\'s model').toBe('claude-sonnet-5-5');
  });

  it('AC34 b4c-judge: one judge call on another tier sees each line with only its cited facts, under the same house rules', async () => {
    const { f } = await waited();
    const second = await press(f, remember(PREFS[7] ?? ''));
    const input = second.inputs.get('judge');
    expect(input, 'a judge call was made').toBeDefined();
    expect(lastLine(input)).toEqual({ judge: { lines: REPLY.map((l, i) => ({ n: i + 1, text: l.text, form: 'current',
      facts: l.facts.map((n) => ({ date: DATES[n - 1], text: PREFS[n - 1], status: 'live' })) })) } });
    expect(second.models.get('judge'), 'never the consolidation\'s own model: a higher tier').toBe('claude-opus-5-5');
    const rules = (text: string | undefined) => new Set((text ?? '').split('\n').slice(0, -1).map((l) => l.trim()).filter((l) => l.length > 20));
    const judgeRules = rules(input);
    const shared = [...rules(second.inputs.get('consolidation'))].filter((l) => judgeRules.has(l)).join('\n');
    for (const rule of [/past/i, /present/i, /health/i, /number/i]) expect(shared, `the house rules, word for word in both prompts: ${String(rule)}`).toMatch(rule);
    const opus = await waited();
    const onOpus = await press(opus.f, remember(PREFS[7] ?? ''), { env: { BOWER_MODEL: 'claude-opus-5-5' } });
    expect([onOpus.models.get('consolidation'), onOpus.models.get('judge')], 'an Opus run is judged by the default tier').toEqual(['claude-opus-5-5', 'claude-sonnet-5-5']);
  });

  it('AC19 b4c-archive-first: folders, the exact archive, then the one ledger write ending in the consolidation; maintain shows it', async () => {
    const { f, first } = await waited();
    const second = await press(f, remember(PREFS[7] ?? ''));
    expect(phase(second)).toBe('done');
    const ops = manifestOf(second).operations;
    const archiveAt = ops.findIndex((op) => op.effect.kind === 'create-text' && op.effect.purpose === 'about-archive');
    const ledgerAt = ops.findIndex((op) => op.effect.kind === 'write-runner-json' && op.effect.path === LEDGER);
    const archive = ops[archiveAt]; const ledger = ops[ledgerAt];
    const before = region(first.after[ABOUT], 'about-preferences').payload;
    expect(archive, 'the plan creates an archive').toBeDefined();
    expect(ops.filter((op) => op.effect.kind === 'create-folder').map((op) => op.effect.name)).toEqual(['archive', 'about-me', 'about-preferences']);
    expect(archive?.effect.name).toMatch(/^2026-10-07-[A-Za-z0-9_-]+\.md$/);
    expect(archive?.effect.text, 'the exact section as the person last saw it').toBe(before);
    expect(archiveAt, 'the archive comes before the ledger write').toBeLessThan(ledgerAt);
    expect(ledger?.dependsOn).toContain(archive?.operationId);
    expect(ops.at(-1)?.effect.kind).toBe('maintain');
    expect(ops.at(-1)?.dependsOn).toContain(ledger?.operationId);
    const live = ledgerOf(second).live.filter((x) => x.section === 'about-preferences').map((x) => x.factId);
    expect(ledgerOf(second).events.at(-1), 'the consolidation is the last line of the one ledger write').toEqual({ v: 1, kind: 'consolidation',
      eventId: expect.any(String), section: 'about-preferences', date: '2026-10-07', factIds: live, runId: second.dispatch?.runId,
      operationId: archive?.operationId, successful: true, lines: REPLY.map((l) => ({ text: l.text, factIds: l.facts.map((n) => live[n - 1]), form: 'current' })), dropped: [] });
    expect(archives(second).map((p) => second.after[p])).toEqual([before]);
    expect(region(second.after[ABOUT], 'about-preferences').lines).toEqual(REPLY.map((l) => ({ date: '2026-10-07', text: l.text })));
    expect(region(second.after[ABOUT], 'about-you').lines).toEqual([{ date: '2026-10-05', text: GARDEN }]);
    expect(second.after[ABOUT]).toContain('## My words\n\nI keep my own notes here.\n');
    const rows = [...report(second).created, ...report(second).updated];
    expect(rows.filter((r) => r.path === ABOUT).map((r) => r.what)).toEqual(['Brought up to date.']);
    expect(rows.filter((r) => r.path.startsWith('.bower/')), 'no row names Bower\'s own files').toEqual([]);
  });

  /** A skipped consolidation: no event, no archive, the eighth fact in the person's words, logged; the next learning run asks again. */
  async function skipped(f: Folder, second: Awaited<ReturnType<typeof press>>, errors: number) {
    expect(phase(second)).toBe('done');
    expect(ledgerOf(second).live.map((x) => x.text)).toContain(PREFS[7]);
    expect(consolidationsOf(second)).toEqual([]);
    expect(archives(second)).toEqual([]);
    expect(shownPrefs(second), 'the eighth fact is appended in the person\'s words').toEqual(PREFS);
    expect(vi.mocked(console.error).mock.calls.length, 'the skip is logged').toBeGreaterThan(errors);
    const quiet = await press(f, null);
    expect(quiet.calls.filter((c) => c === 'consolidation'), 'no new fact: no call').toEqual([]);
    const next = await press(f, remember(LATER[0] ?? ''), { consolidate: answer([...REPLY, BINS]) });
    expect(next.calls).toEqual(CONSOLIDATING);
    expect(consolidationsOf(next)).toHaveLength(1);
  }

  it('AC19 b4c-numbers-bind-facts: the reply\'s numbers name facts by position, so two facts with the same words stay two members', async () => {
    const f = await folder({ extra: [fact('twin', 'about-preferences', '2026-10-06', PREFS[0] ?? '')] });
    const twinReply: Line[] = [
      { text: REPLY[0]?.text ?? '', facts: [1, 7] },
      { text: REPLY[1]?.text ?? '', facts: [2, 3] },
      { text: 'I like garden plans that keep the path by the amber gate in Saltmere clear, with watering jobs said plainly.', facts: [4] },
      { text: REPLY[3]?.text ?? '', facts: [5] },
      { text: REPLY[4]?.text ?? '', facts: [6] },
      { text: REPLY[5]?.text ?? '', facts: [8] },
    ];
    const run = await press(f, remember(PREFS[6] ?? ''), { consolidate: answer(twinReply) });
    expect(run.calls, 'four newer facts and this run\'s: due at once').toEqual(CONSOLIDATING);
    const facts = (lastLine(run.inputs.get('consolidation')).consolidation as Consolidation | undefined)?.facts;
    expect(facts?.map((x) => x.text), 'the same words twice are two facts').toEqual([...PREFS.slice(0, 6), PREFS[0], PREFS[6]]);
    expect((lastLine(run.inputs.get('judge')).judge as Judge | undefined)?.lines[0]?.facts.map((x) => x.date)).toEqual(['2026-10-05', '2026-10-06']);
    const live = ledgerOf(run).live.filter((x) => x.section === 'about-preferences').map((x) => x.factId);
    expect(live.slice(0, 7)).toEqual(['pref-1', 'pref-2', 'pref-3', 'pref-4', 'pref-5', 'pref-6', 'twin']);
    expect((consolidationsOf(run)[0] as { lines?: Array<{ factIds: string[] }> } | undefined)?.lines?.map((l) => l.factIds))
      .toEqual(twinReply.map((l) => l.facts.map((n) => live[n - 1])));
    expect(shownPrefs(run)).toEqual(twinReply.map((l) => l.text));
  });

  it.each<[string, Answer]>([
    ['a malformed reply', malformed],
    ['a reply that leaves a live fact out', answer(REPLY.slice(1))],
    ['a line without a form', () => reply({ lines: REPLY.map((l) => ({ text: l.text, facts: l.facts })) })],
    ['a failed call', failed],
    ['a call that throws', () => { throw new Error('Made-up transport failure.'); }],
  ])('AC20 b4c-skip-on-refusal: %s skips consolidation with no judge call, and the next learning run asks again', async (_name, bad) => {
    const { f } = await waited();
    const errors = vi.mocked(console.error).mock.calls.length;
    const second = await press(f, remember(PREFS[7] ?? ''), { consolidate: bad });
    expect(second.calls, 'one consolidation call, no retry, no judge').toEqual(['selection', 'execution', 'consolidation']);
    await skipped(f, second, errors);
  });

  it.each<[string, Verdicts]>([
    ['a judge that supports no line', verdicts(() => false, 'Made-up reason: the line adds what the facts do not say.')],
    ['a malformed judge reply', malformed],
    ['a judge reply that misses a line', (context) => reply({ verdicts: context.lines.slice(1).map((l) => ({ n: l.n, supported: true, reason: 'Made-up reason.' })) })],
    ['a failed judge call', failed],
  ])('AC20 b4c-skip-on-refusal: %s rejects every line, so nothing is consolidated', async (_name, judge) => {
    const { f } = await waited();
    const errors = vi.mocked(console.error).mock.calls.length;
    const second = await press(f, remember(PREFS[7] ?? ''), { judge });
    expect(second.calls, 'one judge call, no retry').toEqual(CONSOLIDATING);
    await skipped(f, second, errors);
  });

  /** A consolidation skipped in this run: no event, no archive, the eighth fact in the person's words, logged. */
  function skipsHere(second: Awaited<ReturnType<typeof press>>, errors: number) {
    expect(phase(second)).toBe('done');
    expect(consolidationsOf(second)).toEqual([]);
    expect(archives(second)).toEqual([]);
    expect(shownPrefs(second), 'the eighth fact is appended in the person\'s words').toEqual(PREFS);
    expect(vi.mocked(console.error).mock.calls.length, 'the skip is logged').toBeGreaterThan(errors);
  }
  const formed = REPLY.map((l) => ({ text: l.text, facts: l.facts, form: 'current' }));
  const lined = (lines: ReadonlyArray<Record<string, unknown>>, extra: Record<string, unknown> = {}): Answer => () => reply({ lines, ...extra });
  const firstLine = (change: Record<string, unknown>) => formed.map((l, i) => (i ? l : { ...l, ...change }));

  it.each<[string, Answer]>([
    ['a reply with no lines, so no live fact is in a line', lined([])],
    ['a reply with another key', lined(formed, { why: 'shorter' })],
    ['a line with another key', lined(firstLine({ why: 'shorter' }))],
    ['a line with no facts', lined([...formed, { text: 'I like tea.', facts: [], form: 'current' }])],
    ['a fact named twice in one line', lined(firstLine({ facts: [1, 1] }))],
    ['a fact in two lines', lined(firstLine({ facts: [1, 2] }))],
    ['a fact number outside the input', lined(formed.map((l, i) => (i === 5 ? { ...l, facts: [7, 9] } : l)))],
    ['a live fact dropped instead of kept in a line', lined(formed.slice(0, 5), { dropped: [7] })],
    ['a line with a link, which is never stored', lined(firstLine({ text: 'I prefer remote roles, except when a role offers regular mentoring in [[Saltmere]].' }))],
    ['a line over 200 characters, which is never stored', lined(firstLine({ text: `${REPLY[0]?.text ?? ''} ${'x'.repeat(200 - (REPLY[0]?.text.length ?? 0))}` }))],
  ])('AC20 b4c-skip-on-refusal: %s skips consolidation with no judge call', async (_name, bad) => {
    const { f } = await waited();
    const errors = vi.mocked(console.error).mock.calls.length;
    const second = await press(f, remember(PREFS[7] ?? ''), { consolidate: bad });
    expect(second.calls, 'one consolidation call, no retry, no judge').toEqual(['selection', 'execution', 'consolidation']);
    skipsHere(second, errors);
  });

  // Generated-grammar boundaries (R23, R9): each a skip, never stored.
  it.each<[string, Answer]>([
    ['a reply that is a list, not an object', () => reply(formed)],
    ['lines that are not a list', () => reply({ lines: formed[0] })],
    ['a line that is not an object', lined([...formed, 'I like tea.' as unknown as Record<string, unknown>])],
    ['a line without text', lined(formed.map((l, i) => (i ? l : { facts: l.facts, form: l.form })))],
    ['a form other than the two', lined(firstLine({ form: 'future' }))],
    ['a blank text', lined(firstLine({ text: '   ' }))],
    ['a text with a line break', lined(firstLine({ text: 'I prefer remote roles,\nexcept when a role offers regular mentoring in Saltmere.' }))],
    ['a text with the citation mark', lined(firstLine({ text: 'I prefer remote roles · except when a role offers regular mentoring in Saltmere.' }))],
    ['facts that are not a list', lined(firstLine({ facts: 1 }))],
    ['a fact number that is a fraction', lined(firstLine({ facts: [1.5] }))],
    ['a fact number written as text', lined(firstLine({ facts: ['1'] }))],
    ['a fact number below 1', lined(firstLine({ facts: [1, 0] }))],
  ])('AC20 b4c-generated-boundaries: %s skips consolidation with no judge call', async (_name, bad) => {
    const { f } = await waited();
    const errors = vi.mocked(console.error).mock.calls.length;
    const second = await press(f, remember(PREFS[7] ?? ''), { consolidate: bad });
    expect(second.calls, 'one consolidation call, no retry, no judge').toEqual(['selection', 'execution', 'consolidation']);
    skipsHere(second, errors);
  });

  it.each<[string, Answer]>([
    ['an ended fact in no line and not dropped', answer(REPLY)],
    ['an ended fact both in a line and dropped', answer([...REPLY, PAST_MUG], [9])],
    ['an ended fact dropped twice', answer(REPLY, [9, 9])],
    ['a dropped number written as text', lined(formed, { dropped: ['9'] })],
    ['a dropped number outside the input', answer(REPLY, [9, 10])],
    ['dropped that is not a list', lined(formed, { dropped: 9 })],
  ])('AC20 b4c-generated-boundaries: with an ended fact, %s skips consolidation with no judge call', async (_name, bad) => {
    const { f } = await waited({ extra: mugEvents() });
    const errors = vi.mocked(console.error).mock.calls.length;
    const second = await press(f, remember(PREFS[7] ?? ''), { consolidate: bad });
    expect(second.calls, 'one consolidation call, no retry, no judge').toEqual(['selection', 'execution', 'consolidation']);
    skipsHere(second, errors);
  });

  it.each<[string, ReadonlyArray<Record<string, unknown>>, Record<string, unknown>]>([
    ['a line of exactly 200 characters', formed.map((l, i) => (i === 1 ? { ...l, text: WIDE } : l)), {}],
    ['an empty dropped list', formed, { dropped: [] }],
  ])('AC20 b4c-generated-boundaries: %s is a valid reply, stored and shown', async (_name, lines, extra) => {
    expect(WIDE, 'the fixture\'s longest line').toHaveLength(200);
    const { f } = await waited();
    const second = await press(f, remember(PREFS[7] ?? ''), { consolidate: lined(lines, extra) });
    expect(second.calls).toEqual(CONSOLIDATING);
    expect((consolidationsOf(second)[0] as { lines?: Array<{ text: string }> } | undefined)?.lines?.map((l) => l.text)).toEqual(lines.map((l) => l.text));
    expect(shownPrefs(second)).toEqual(lines.map((l) => l.text));
  });

  // Every way `call()` reads a call as failed (R25), beside the failed, malformed and throwing calls above.
  const exit = (envelope: unknown, code = 0): ClaudeExit => ({ code, stderr: '', cut: null, stdout: JSON.stringify(envelope) });
  const FAILURES: Array<[string, () => ClaudeExit]> = [
    ['stopped at its time cap', () => ({ code: 0, stderr: '', cut: 'time', stdout: '' })],
    ['stopped at its size cap', () => ({ code: 0, stderr: '', cut: 'size', stdout: '{"type":"result"' })],
    ['with an error result', () => exit({ type: 'result', subtype: 'error_during_execution', is_error: true }, 1)],
    ['over its turn cap', () => exit({ type: 'result', subtype: 'error_max_turns', is_error: true })],
    ['answering with no result', () => exit({ type: 'assistant' })],
    ['with a result that is not text', () => exit({ type: 'result', subtype: 'success', is_error: false, result: 42 })],
  ];
  it.each<[string, Answer]>(FAILURES)('AC20 b4c-call-failures: a consolidation call %s skips consolidation with no judge call', async (_name, bad) => {
    const { f } = await waited();
    const errors = vi.mocked(console.error).mock.calls.length;
    const second = await press(f, remember(PREFS[7] ?? ''), { consolidate: bad });
    expect(second.calls, 'one consolidation call, no retry, no judge').toEqual(['selection', 'execution', 'consolidation']);
    skipsHere(second, errors);
  });
  it.each<[string, Verdicts]>([...FAILURES, ['that throws', () => { throw new Error('Made-up judge transport failure.'); }]])(
    'AC20 b4c-call-failures: a judge call %s rejects every line', async (_name, judge) => {
      const { f } = await waited();
      const errors = vi.mocked(console.error).mock.calls.length;
      const second = await press(f, remember(PREFS[7] ?? ''), { judge });
      expect(second.calls, 'one judge call, no retry').toEqual(CONSOLIDATING);
      skipsHere(second, errors);
    });

  it.each<[string, Kind, Kind[]]>([
    ['before the consolidation call', 'execution', ['selection', 'execution']],
    ['between the consolidation and the judge call', 'consolidation', ['selection', 'execution', 'consolidation']],
  ])('AC20 b4c-time-used-up: the run\'s model time used up %s skips consolidation and keeps the facts', async (_name, during, calls) => {
    const control = await waited();
    expect((await press(control.f, remember(PREFS[7] ?? ''))).calls, 'control: with time left, the same press consolidates').toEqual(CONSOLIDATING);
    const { f } = await waited();
    // The model allowance is 80% of 15 minutes from the run's start (`RunTiming`, `performance.now`): spend it during one call.
    const real = performance.now.bind(performance);
    let skew = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => real() + skew);
    const errors = vi.mocked(console.error).mock.calls.length;
    const second = await press(f, remember(PREFS[7] ?? ''), { onCall: (kind) => { if (kind === during) skew += 900_000; } });
    expect(second.calls, 'no call past the allowance, no retry').toEqual(calls);
    skipsHere(second, errors);
  });

  const supported = (n: number | undefined, extra: Record<string, unknown> = {}) => ({ n, supported: true, reason: 'Made-up reason.', ...extra });
  it.each<[string, Verdicts]>([
    ['two verdicts for one line', (c) => reply({ verdicts: [...c.lines, c.lines[0]].map((l) => supported(l?.n)) })],
    ['a verdict for a line it was not shown', (c) => reply({ verdicts: [...c.lines.map((l) => supported(l.n)), supported(99)] })],
    ['a verdict with another key', (c) => reply({ verdicts: c.lines.map((l) => supported(l.n, { score: 1 })) })],
    ['a judge reply with another key', (c) => reply({ verdicts: c.lines.map((l) => supported(l.n)), note: 'All fine.' })],
    ['a verdict that is neither true nor false', (c) => reply({ verdicts: c.lines.map((l) => supported(l.n, { supported: 'yes' })) })],
    ['a reason over 400 characters', verdicts(() => true, 'x'.repeat(401))],
  ])('AC20 b4c-skip-on-refusal: %s rejects every line', async (_name, judge) => {
    const { f } = await waited();
    const errors = vi.mocked(console.error).mock.calls.length;
    const second = await press(f, remember(PREFS[7] ?? ''), { judge });
    expect(second.calls, 'one judge call, no retry').toEqual(CONSOLIDATING);
    skipsHere(second, errors);
  });

  it.each<[string, Verdicts]>([
    ['a reason of exactly 400 characters', verdicts(() => true, 'x'.repeat(400))],
    ['verdicts in another order', (c) => reply({ verdicts: [...c.lines].reverse().map((l) => supported(l.n)) })],
  ])('AC34 b4c-judge: %s is a valid judge reply', async (_name, judge) => {
    const { f } = await waited();
    const second = await press(f, remember(PREFS[7] ?? ''), { judge });
    expect(second.calls).toEqual(CONSOLIDATING);
    expect(consolidationsOf(second)).toHaveLength(1);
    expect(shownPrefs(second)).toEqual(REPLY.map((l) => l.text));
  });

  it('AC35 b4c-line-fallback: a line that fails the checks never reaches the judge; a line the judge rejects falls back; the rest stand', async () => {
    const { f } = await waited();
    const named = REPLY.map((l, i) => (i === 0 ? { ...l, text: l.text.replace('Saltmere', 'Briarhaven') } : l));
    const reason = 'Made-up reason: the facts do not say the feedback is regular.';
    const errors = vi.mocked(console.error).mock.calls.length;
    const second = await press(f, remember(PREFS[7] ?? ''), { consolidate: answer(named), judge: verdicts((n) => n !== 2, reason) });
    expect(second.calls).toEqual(CONSOLIDATING);
    expect((lastLine(second.inputs.get('judge')).judge as Judge | undefined)?.lines.map((l) => l.n), 'line 1 names a place its fact does not').toEqual([2, 3, 4, 5, 6]);
    const live = ledgerOf(second).live.filter((x) => x.section === 'about-preferences').map((x) => x.factId);
    expect(consolidationsOf(second).map((e) => e.kind === 'consolidation' && (e as { lines?: unknown }).lines), 'only the accepted lines are stored')
      .toEqual([REPLY.slice(2).map((l) => ({ text: l.text, factIds: l.facts.map((n) => live[n - 1]), form: 'current' }))]);
    expect(shownPrefs(second), 'the accepted lines, then the facts of the refused lines in the person\'s words')
      .toEqual([...REPLY.slice(2).map((l) => l.text), PREFS[0], PREFS[1], PREFS[2]]);
    expect(archives(second)).toHaveLength(1);
    expect(vi.mocked(console.error).mock.calls.slice(errors).flat().map(String).some((m) => m.includes(reason)), 'the judge\'s reason is logged').toBe(true);
  });

  it.each<[string, { consolidate?: Answer; judge?: Verdicts }, Kind[], string | null]>([
    ['a judge reason', { judge: verdicts((n) => n !== 2, `Made-up reason quoting ${TOKEN} by mistake.`) }, CONSOLIDATING, 'Made-up reason quoting [hidden] by mistake.'],
    ['a line the checks refuse', { consolidate: answer(REPLY.map((l, i) => (i ? l : { ...l, text: `I prefer remote roles near Briarhaven, ${TOKEN}.` }))) }, CONSOLIDATING, null],
    ['a consolidation reply with another key', { consolidate: lined(formed, { [TOKEN]: true }) }, ['selection', 'execution', 'consolidation'], null],
    ['a consolidation reply that is not JSON', { consolidate: () => exit({ type: 'result', subtype: 'success', is_error: false, result: `not json ${TOKEN}` }) },
      ['selection', 'execution', 'consolidation'], null],
    ['a failed consolidation call', { consolidate: () => ({ code: 1, stderr: `Made-up failure near ${TOKEN}.`, cut: null, stdout: '' }) },
      ['selection', 'execution', 'consolidation'], null],
    ['a judge reply with another key', { judge: (c) => reply({ verdicts: c.lines.map((l) => supported(l.n)), [TOKEN]: 1 }) }, CONSOLIDATING, null],
  ])('AC35 b4c-logs-hide-the-credential: %s is logged with the run\'s credential hidden', async (_name, o, calls, words) => {
    const { f } = await waited();
    const errors = vi.mocked(console.error).mock.calls.length;
    const second = await press(f, remember(PREFS[7] ?? ''), o);
    expect(second.calls).toEqual(calls);
    const logged = printed(errors);
    expect(logged.length, 'the refusal is logged').toBeGreaterThan(0);
    if (words) expect(logged, 'the model\'s words are logged with the credential hidden, as refusal reasons are').toContain(words);
    expect(logged, 'the run\'s credential is never printed').not.toContain(TOKEN);
  });

  it('AC36 b4c-past-line: an ended fact reaches the call with its ending; a past line about it is kept, or the fact is dropped', async () => {
    const past = await waited({ extra: mugEvents() });
    const second = await press(past.f, remember(PREFS[7] ?? ''), { consolidate: answer([...REPLY, PAST_MUG]) });
    expect(second.calls).toEqual(CONSOLIDATING);
    const facts = (lastLine(second.inputs.get('consolidation')).consolidation as Consolidation | undefined)?.facts;
    expect(facts?.at(-1), 'the ended fact comes last, with its end date and the person\'s words').toEqual({ n: 9, date: '2026-10-05', text: MUG,
      status: 'ended', ended: '2026-10-06', evidence: NO_MUG });
    expect((lastLine(second.inputs.get('judge')).judge as Judge | undefined)?.lines.at(-1)).toEqual({ n: 7, text: PAST_MUG.text, form: 'past',
      facts: [{ date: '2026-10-05', text: MUG, status: 'ended', ended: '2026-10-06', evidence: NO_MUG }] });
    expect(shownPrefs(second)).toEqual([...REPLY.map((l) => l.text), PAST_MUG.text]);
    expect((consolidationsOf(second)[0] as { lines?: Array<{ form: string }> } | undefined)?.lines?.at(-1)?.form).toBe('past');
    const drop = await waited({ extra: mugEvents() });
    const dropped = await press(drop.f, remember(PREFS[7] ?? ''), { consolidate: answer(REPLY, [9]) });
    expect(consolidationsOf(dropped).map((e) => (e as { dropped?: string[] }).dropped)).toEqual([['mug']]);
    expect(shownPrefs(dropped), 'a dropped ended fact is not shown').toEqual(REPLY.map((l) => l.text));
  });

  it('AC36 b4c-past-line-again: the next consolidation re-offers an ended fact a shown past line cites, never one the last dropped', async () => {
    const seededLater = LATER.slice(0, 4).map((text, i) => fact(`later-${i + 1}`, 'about-preferences', '2026-10-06', text));
    const previous = (cite: boolean) => ({ v: 1, kind: 'consolidation', eventId: 'c-prev', section: 'about-preferences', date: '2026-10-06',
      factIds: [...PREFS.slice(0, 6).map((_, i) => `pref-${i + 1}`), 'mug'], runId: 'consolidating-run', operationId: 'op-prev', successful: true,
      lines: [...PREFS.slice(0, 6).map((text, i) => ({ text, factIds: [`pref-${i + 1}`], form: 'current' })),
        ...(cite ? [{ text: PAST_MUG.text, factIds: ['mug'], form: 'past' }] : [])], dropped: cite ? [] : ['mug'] });
    const offered = async (cite: boolean) => {
      const f = await folder({ extra: [...mugEvents(), previous(cite), ...seededLater] });
      const run = await press(f, remember(LATER[4] ?? ''), { consolidate: failed });
      expect(run.calls, 'five facts newer than the last consolidation, one from this run').toEqual(['selection', 'execution', 'consolidation']);
      return (lastLine(run.inputs.get('consolidation')).consolidation as Consolidation | undefined)?.facts ?? [];
    };
    const cited = await offered(true);
    expect(cited.map((x) => x.text), 'the live facts, then the ended fact the past line cites').toEqual([...PREFS.slice(0, 6), ...LATER, MUG]);
    expect(cited.at(-1)).toEqual({ n: 12, date: '2026-10-05', text: MUG, status: 'ended', ended: '2026-10-06', evidence: NO_MUG });
    expect((await offered(false)).map((x) => x.text), 'an ended fact the last consolidation dropped is not offered again').toEqual([...PREFS.slice(0, 6), ...LATER]);
  });

  it('AC21 b4c-archive-refused: a refused archive stops the run before the ledger write; the retry finishes it once', async () => {
    const { f, first } = await waited();
    let refused = 0;
    const second = await press(f, remember(PREFS[7] ?? ''), { around: (next) => async (input, init) => {
      if (!refused && await archiveCreate(input, init)) {
        refused++;
        return new Response(JSON.stringify({ error: { code: 403, message: 'Made-up archive refusal', errors: [{ reason: 'forbidden' }] } }), { status: 403 });
      }
      return next(input, init);
    } });
    expect(refused, 'main tried to create the archive').toBe(1);
    expect(phase(second)).not.toBe('done');
    expect(second.after[LEDGER], 'no ledger write without its archive').toBe(first.after[LEDGER]);
    expect(second.after[ABOUT]).toBe(first.after[ABOUT]);
    expect(Object.keys(second.after).some((p) => p.startsWith('Inbox/') && p.endsWith(PILE_NOTE)), 'the words wait').toBe(true);
    const model = throwing();
    const retried = await redispatchCase(f.c, second, 2, { claude: model, pacing });
    expect(phase(retried)).toBe('done');
    expect(model).not.toHaveBeenCalled();
    expect(archives(retried).map((p) => retried.after[p])).toEqual([region(first.after[ABOUT], 'about-preferences').payload]);
    expect(consolidationsOf(retried)).toHaveLength(1);
    expect(shownPrefs(retried)).toEqual(REPLY.map((l) => l.text));
  });

  it('AC39 b4c-ledger-refused: a refused ledger write after the archive stops the run; the retry writes one consolidation, the archive created once', async () => {
    const { f, first } = await waited();
    const ledgerId = await f.id(LEDGER);
    let refused = 0;
    const second = await press(f, remember(PREFS[7] ?? ''), { around: (next) => async (input, init) => {
      if (!refused && init?.method === 'PATCH' && url(input).pathname === `/upload/drive/v3/files/${ledgerId}`) {
        refused++;
        return new Response(JSON.stringify({ error: { code: 403, message: 'Made-up ledger refusal', errors: [{ reason: 'forbidden' }] } }), { status: 403 });
      }
      return next(input, init);
    } });
    expect(refused, 'main reached the ledger write').toBe(1);
    expect(second.calls).toEqual(CONSOLIDATING);
    expect(phase(second)).not.toBe('done');
    expect(archives(second), 'the archive was confirmed first').toHaveLength(1);
    expect(second.after[LEDGER], 'no event without its ledger write').toBe(first.after[LEDGER]);
    expect(second.after[ABOUT]).toBe(first.after[ABOUT]);
    expect(Object.keys(second.after).some((p) => p.startsWith('Inbox/') && p.endsWith(PILE_NOTE)), 'the words wait').toBe(true);
    const model = throwing();
    const retried = await redispatchCase(f.c, second, 2, { claude: model, pacing });
    expect(phase(retried)).toBe('done');
    expect(model).not.toHaveBeenCalled();
    expect(archives(retried), 'the same archive, created once').toEqual(archives(second));
    expect(consolidationsOf(retried)).toHaveLength(1);
    expect(shownPrefs(retried)).toEqual(REPLY.map((l) => l.text));
  });

  it('AC22 b4c-recovery: a lost archive answer and a crash after the ledger write recover once, without a model call', async () => {
    const { f } = await waited();
    let lost = 0; let crashed = false;
    const ledgerId = await f.id(LEDGER);
    const second = await press(f, remember(PREFS[7] ?? ''), { around: (next) => async (input, init) => {
      if (crashed && url(input).origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost.');
      if (!lost && await archiveCreate(input, init)) {
        const response = await next(input, init);
        lost++;
        if (response.ok) throw new TypeError('Made-up lost answer after the archive.');
        return response;
      }
      if (init?.method === 'PATCH' && url(input).pathname === `/upload/drive/v3/files/${ledgerId}`) {
        const response = await next(input, init);
        crashed = response.ok;
        throw new TypeError('Made-up crash after the ledger write.');
      }
      return next(input, init);
    } });
    expect(lost, 'the archive create landed and its answer was lost').toBe(1);
    expect(crashed, 'main read the archive back and reached the ledger write').toBe(true);
    expect(second.calls).toEqual(CONSOLIDATING);
    const model = throwing();
    const resumed = await redispatchCase(f.c, second, 2, { claude: model, pacing });
    expect(phase(resumed)).toBe('done');
    expect(model).not.toHaveBeenCalled();
    expect(archives(resumed), 'one archive').toHaveLength(1);
    expect(consolidationsOf(resumed), 'one consolidation').toHaveLength(1);
    expect(shownPrefs(resumed)).toEqual(REPLY.map((l) => l.text));
    const done = await redispatchCase(f.c, resumed, 3, { claude: model, pacing });
    expect(model).not.toHaveBeenCalled();
    for (const path of [ABOUT, LEDGER, ...archives(resumed)]) expect(done.after[path], `${path} is unchanged`).toBe(resumed.after[path]);
  });

  it('AC23 b4c-person-edit-kept: About me edited during a consolidating run keeps the edit; the next run shows the lines without a call', async () => {
    const { f, first } = await waited();
    const aboutId = await f.id(ABOUT); const ledgerId = await f.id(LEDGER);
    const MINE = 'I added this line while Bower was busy.';
    let edited = false;
    const second = await press(f, remember(PREFS[7] ?? ''), { around: (next) => async (input, init) => {
      const response = await next(input, init);
      if (!edited && response.ok && init?.method === 'PATCH' && url(input).pathname === `/upload/drive/v3/files/${ledgerId}`) {
        edited = true;
        const now = await f.drive.get(aboutId);
        await f.drive.writeText(aboutId, (await f.drive.readText(aboutId)).replace('I keep my own notes here.', `I keep my own notes here.\n\n${MINE}`), now.modifiedTime);
      }
      return response;
    } });
    expect(edited, 'the person edited About me after the ledger write').toBe(true);
    expect(consolidationsOf(second), 'the consolidation stands in the ledger').toHaveLength(1);
    expect(archives(second).map((p) => second.after[p]), 'the archive holds the section the run read').toEqual([region(first.after[ABOUT], 'about-preferences').payload]);
    expect(second.after[ABOUT], 'the person\'s edit is kept').toContain(MINE);
    const third = await press(f, null);
    expect(third.calls.filter((c) => c === 'consolidation'), 'no new fact: no call').toEqual([]);
    expect(shownPrefs(third), 'maintain rebuilds the section from the ledger').toEqual(REPLY.map((l) => l.text));
    expect(third.after[ABOUT]).toContain(MINE);
    expect(archives(third)).toHaveLength(1);
  });

  it('AC24 b4c-same-day: a second consolidation later the same day writes its own archive; the first stays', async () => {
    const { f } = await waited();
    const second = await press(f, remember(PREFS[7] ?? ''));
    const firstArchive = archives(second);
    expect(firstArchive).toHaveLength(1);
    let last: Awaited<ReturnType<typeof press>> = second;
    for (const [i, text] of LATER.entries()) {
      const before = last;
      last = await press(f, remember(text), { consolidate: answer(SECOND) });
      expect(last.calls.includes('consolidation'), `fact ${i + 9}: due only at the fifth newer fact`).toBe(i === LATER.length - 1);
      if (i === LATER.length - 1) {
        const made = archives(last).filter((p) => !firstArchive.includes(p));
        expect(made.map((p) => last.after[p]), 'the new archive holds the section before it').toEqual([region(before.after[ABOUT], 'about-preferences').payload]);
      }
    }
    expect(archives(last)).toHaveLength(2);
    expect(last.after[firstArchive[0] ?? '']).toBe(second.after[firstArchive[0] ?? '']);
    expect(shownPrefs(last)).toEqual(SECOND.map((l) => l.text));
  });

  it('AC25 b4c-cost: two more model calls in the timing line, and only the archive and its folders as new Drive creates', async () => {
    const turns = (from: number) => vi.mocked(console.log).mock.calls.slice(from).flat().map(String)
      .flatMap((l) => /^timing: .* turns=(\d+)/.exec(l)?.[1] ?? []).map(Number);
    const creates = (run: CaseRun) => (run.wire?.requests ?? []).filter((r) => r.method === 'POST'
      && (r.url.pathname === '/drive/v3/files' || r.url.pathname === '/upload/drive/v3/files')).length;
    const from = vi.mocked(console.log).mock.calls.length;
    const { f, first } = await waited();
    const second = await press(f, remember(PREFS[7] ?? ''));
    expect(turns(from), 'press 1: selection and execution; press 2: and the consolidation and its judge').toEqual([2, 4]);
    const control = await waited();
    const skippedRun = await press(control.f, remember(PREFS[7] ?? ''), { consolidate: answer(REPLY.slice(1)) });
    expect(consolidationsOf(skippedRun), 'a reply that leaves a fact out is refused').toEqual([]);
    expect(creates(second) - creates(skippedRun), 'three archive folders and the archive').toBe(4);
    expect(creates(first)).toBe(creates(control.first));
  });

  it('AC26 b4c-bound: a section of more than 100 facts makes no call', async () => {
    const many = (count: number) => Array.from({ length: count }, (_, i) => fact(`many-${i}`, 'about-preferences', '2026-10-06',
      `I keep habit number ${i + 1} for the garden.`));
    const at100 = await folder({ seeded: 3, extra: many(96) });
    const hundred = await press(at100, remember(LATER[0] ?? ''), { consolidate: () => reply({ lines: [] }) });
    expect(hundred.calls, '100 facts: the call is made (its empty reply is refused, so no judge)').toEqual(['selection', 'execution', 'consolidation']);
    const at101 = await folder({ seeded: 3, extra: many(97) });
    const over = await press(at101, remember(LATER[0] ?? ''));
    expect(over.calls, '101 facts: no call').toEqual(['selection', 'execution']);
    expect(phase(over)).toBe('done');
  });

  it('AC27 c17-b4-gate-archive-first: press 1 waits, press 2 consolidates eight facts, the case scores clean', async () => {
    const dir = resolve(import.meta.dirname, '../../testing/corpus/c17-b4-gate-archive-first');
    const c = await loadCase(dir);
    const calls: Kind[] = [];
    const ordinary = replySequence(JSON.parse(await readFile(join(dir, 'replies.json'), 'utf8')) as unknown[]);
    // An explicit transport: the corpus driver does not wrap it again, so a memory call is never read as a selection.
    const spawn = phaseAwareClaude(async (call) => {
      const context = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as { consolidation?: unknown; judge?: unknown; selection?: unknown };
      if (context.consolidation) {
        calls.push('consolidation');
        return reply(JSON.parse(await readFile(join(dir, 'consolidation-reply.json'), 'utf8')) as unknown);
      }
      if (context.judge) {
        calls.push('judge');
        return reply(JSON.parse(await readFile(join(dir, 'judge-reply.json'), 'utf8')) as unknown);
      }
      calls.push(context.selection === undefined ? 'selection' : 'execution');
      return ordinary(call);
    }, undefined, true);
    const final = await runWithClaude(c, spawn);
    const first = final.runs?.[0];
    expect(calls).toEqual(['selection', 'execution', ...CONSOLIDATING]);
    expect(archives(final).map((p) => final.after[p])).toEqual([region(first?.after[ABOUT], 'about-preferences').payload]);
    expect(region(final.after[ABOUT], 'about-preferences').lines).toHaveLength(6);
    expect(final.score?.unmet).toEqual([]);
    const done = await redispatchCase(c, final, 2, { claude: () => { throw new Error('A done redispatch must not call a model.'); } });
    expect(done.after[ABOUT]).toBe(final.after[ABOUT]);
  });
});
