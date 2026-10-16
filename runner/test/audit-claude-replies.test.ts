/**
 * audit-claude-replies: the Claude planner refuses only what is really wrong and never crashes on a damaged journal
 * file (deep audit 2026-10-16 of `claude.ts`). No live call: scripted replies over the pretend Drive.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { timelineLine } from '../../src/data/contracts/timeline-line';
import { BowerError } from '../../src/data/contracts/types';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { B_FAILURE } from '../../src/data/spine/scripted';
import { REFUSALS, type ClaudeCall, type ClaudeSpawn } from '../src/claude';
import { loadCorpus, type LoadedCase } from '../src/corpus';
import { LedgerExhausted, RunTiming } from '../src/timing';
import { note, phaseAwareClaude, reply as replied, run as runPlanning, select, setup, type Base } from './b1-planning-support';
import { AT, redispatchCase, replySequence, runOnDrive, runWithClaude, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
const ABOUT = 'About me.md';
const LEDGER = '.bower/observations.jsonl';
const BEANS = 'I grow beans on the north plot.';
const REFUSED = /^Your reply was refused: (.*)$/m;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
    removeItem: (key: string) => { stored.delete(key); },
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const empty = (heading: string, r: string) => `<!-- bower:ownership/2 begin ${r} -->\n### ${heading}\n<!-- bower:ownership/2 end ${r} -->\n`;
const ABOUT_TEXT = '---\nsummary: What Bower knows about you. Change it whenever you like.\n---\n\n## My words\n\nI keep my own notes here.\n\n## What Bower has learned\n'
  + empty('About you', 'about-you') + empty("What you're working on", 'about-working-on') + empty('How you like things', 'about-preferences');
const MEMORY_FOLDER = { [LEDGER]: '', [ABOUT]: ABOUT_TEXT, 'Projects/Garden/Garden.md': '---\nsummary: Alex plans the garden.\n---\n# Garden\n\n## Timeline\n' };

/** Alex's words pile "Remember this", as b4c-words-step seeds it; `journal` adds lines of Alex's changes. */
const wordsCase = (journal: LoadedCase['journal'] = []): LoadedCase => ({ id: 'audit-claude-replies', capability: 'C05', title: 'Alex asks Bower to remember',
  covers: 'model', source: 'new', scope: 'all', allowWeb: false, dir: ROOT, folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '',
  questions: [], journal, bowerOwned: [], inboxFiles: {}, inbox: [{ line: `Remember this: ${BEANS}`, files: [] }], folder: { ...MEMORY_FOLDER } });
const remember = { kind: 'tidy-intent', v: 1, things: [], observations: [{ source: { pileId: 'p-1' }, section: 'about-you', category: 'biography', text: BEANS }] };

/** Every model input a run sends. */
function recorded(spawn: ClaudeSpawn) {
  const inputs: string[] = [];
  return { inputs, spawn: (async (call: ClaudeCall) => { inputs.push(call.input); return spawn(call); }) as ClaudeSpawn };
}
const refusals = (inputs: readonly string[]): string[] => inputs.flatMap((input) => REFUSED.exec(input)?.[1] ?? []);

// The planner's own errors while planning a memory reply: a used-up ledger, Drive not answering a read the plan makes, and
// stored history it cannot read (`scripted.ts` personalAppendHistory): none is a refusal of the reply.
const FAILURES = [
  ['ledger', () => new LedgerExhausted(1)],
  ['drive', () => new BowerError('offline', "Google Drive didn't answer. Try again.")],
  ['history', () => new BowerError('unknown', 'Bower could not read what it did.')],
] as const;
/** Whether `error` itself ended the run: a used-up ledger leaves the items for the next run; any other stops it with its own words. */
const reached = (error: BowerError): boolean => error instanceof LedgerExhausted
  ? vi.mocked(console.log).mock.calls.flat().some((line) => /items left in the inbox for the next run/.test(String(line)))
  : vi.mocked(console.error).mock.calls.some(([first]) => first === error.message);
const inInbox = (run: CaseRun): boolean => Object.keys(run.after).some((p) => p.startsWith('Inbox/'));

it.for(FAILURES.map(([name, error]) => [`memory-${name}`, error] as const))('AC1 audit-claude-replies-%s: an error planning a memory reply is rethrown, never asked again as keepNotAsked', async ([, make]) => {
  const error = make();
  vi.spyOn(RunTiming.prototype, 'requireOperations').mockImplementation(() => { throw error; });
  const { inputs, spawn } = recorded(replySequence([remember]));
  const result = await runWithClaude(wordsCase(), spawn);
  expect(inputs.length, 'the memory reply was asked for').toBeGreaterThan(0);
  expect(refusals(inputs), 'only a planner refusal is a refusal of the reply').toEqual([]);
  expect(reached(error), 'the original failure reaches the runner').toBe(true);
  expect(result.after[LEDGER] ?? '', 'no memory effect lands').not.toContain(BEANS);
  expect(inInbox(result), 'the words wait in the inbox').toBe(true);
});

/** Long facts about you (budget 400): fourteen are 420 words, so a fifteenth this run makes the section due. */
const HABIT = (n: number) => `I keep garden habit ${n}: I water the beds slowly at dawn, check the soil by hand, and write down what grew so I can plan the rows with care.`;
const HABITS = Array.from({ length: 14 }, (_, i) => i + 1);
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const habitFact = (n: number) => ({ v: 1, kind: 'observation', eventId: `event-habit-${n}`, factId: `habit-${n}`, date: '2026-10-06', section: 'about-you',
  text: HABIT(n), category: 'biography', source: { fileId: `words-habit-${n}`, sha256: sha(`${HABIT(n)}\n`) },
  origin: { kind: 'words', runId: 'history-run', captureId: sha('history'), pileId: `pile-habit-${n}` } });
/** About me and its ledger with the fourteen habits, as an earlier run left them. */
const HABIT_FOLDER = { [LEDGER]: HABITS.map((n) => JSON.stringify(habitFact(n))).join('\n') + '\n',
  [ABOUT]: ABOUT_TEXT.replace('### About you\n', `### About you\n${HABITS.map((n) => `${timelineLine({ date: '2026-10-06', text: HABIT(n), source: 'Your words' })}\n`).join('')}`) };
const habitObservation = { source: { pileId: 'p-1' }, section: 'about-you', category: 'biography', text: HABIT(15) };
const habitCase = (): LoadedCase => ({ ...wordsCase(), inbox: [{ line: `Remember this: ${HABIT(15)}`, files: [] }], folder: { ...MEMORY_FOLDER, ...HABIT_FOLDER } });
/** `spawn`, with the consolidation and judge calls answered here: each fact cut to its first clause, every line supported. */
const consolidating = (spawn: ClaudeSpawn): ClaudeSpawn => phaseAwareClaude(async (call) => {
  const ctx = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as { consolidation?: { facts: Array<{ n: number; text: string }> }; judge?: { lines: Array<{ n: number }> } };
  if (ctx.consolidation) return replied({ lines: ctx.consolidation.facts.map((f) => ({ text: `${f.text.split(',')[0]?.replace(/\.$/, '')}.`, facts: [f.n], form: 'current' })) });
  if (ctx.judge) return replied({ verdicts: ctx.judge.lines.map((l) => ({ n: l.n, supported: true, reason: 'Made-up reason: it follows from its facts.' })) });
  return spawn(call);
}, undefined, true);
const consolidated = (run: CaseRun): boolean => /"kind":"consolidation"/.test(run.after[LEDGER] ?? '');
const habitReply = { ...remember, observations: [habitObservation] };

// The consolidation's plan is the run's second plan: the planner's errors there end the run as any of its errors do.
it.for(FAILURES.map(([name, error]) => [`consolidation-${name}`, error] as const))('AC1 audit-claude-replies-%s: an error planning the consolidation is rethrown, never skipped', async ([, make]) => {
  const error = make();
  const planned = vi.spyOn(RunTiming.prototype, 'requireOperations').mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw error; });
  const result = await runWithClaude(habitCase(), consolidating(replySequence([habitReply])));
  expect(planned, 'the consolidation was planned').toHaveBeenCalledTimes(2);
  expect(reached(error), 'the original failure reaches the runner').toBe(true);
  expect(result.after[LEDGER] ?? '', 'no memory effect lands').not.toContain(HABIT(15));
  expect(consolidated(result)).toBe(false);
});

it('AC1 audit-claude-replies-consolidation-refused: a consolidation the planner refuses is skipped and the memory plan kept', async () => {
  const planned = vi.spyOn(RunTiming.prototype, 'requireOperations').mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw new BowerError('unknown', B_FAILURE); });
  const result = await runWithClaude(habitCase(), consolidating(replySequence([habitReply])));
  expect(planned, 'the consolidation was planned').toHaveBeenCalledTimes(2);
  expect(result.code).toBe(0);
  expect(result.after[LEDGER], 'the validated memory plan').toContain(HABIT(15));
  expect(consolidated(result), 'skipped').toBe(false);
});

it('AC1 audit-claude-replies-consolidation-control: with no failure the consolidation lands (the fixture reaches that plan)', async () => {
  const result = await runWithClaude(habitCase(), consolidating(replySequence([habitReply])));
  expect(result.code).toBe(0);
  expect(consolidated(result)).toBe(true);
});

/** The offer fixture of b5c-fr1: an offer type row with a profile, and the offer's own words. */
async function offerFixture(words: string): Promise<Base> {
  const b = await setup({ folder: {
    'Areas/Career/Career.md': note('Career documents.', '## Timeline\n', true),
    'Projects/Job hunt/Job hunt.md': note('Alex searches for work.', '## Timeline\n', true),
  }, inbox: [{ line: '', files: ['Offer.txt'] }], inboxFiles: { 'Offer.txt': words } });
  await b.drive.createText(b.id('.bower'), 'type-table.json', JSON.stringify({ v: 1, rows: [{
    id: 'offer', match: ['offer'], template: 'source', properties: {}, table: [], profile: { template: 'profile' } }] }));
  return b;
}

it('AC2 audit-claude-replies-currency-case: a lower-case word that spells a currency code (all, ALL) is no added currency', async () => {
  vi.useFakeTimers(); vi.setSystemTime(AT);
  const b = await offerFixture('48000. Currency is not stated.');
  const value = select(b, [], 'Areas/Career');
  for (const item of value.items) item.kind = 'offer';
  const body = '48000 for all of it. Currency is not stated.';
  const intent = { kind: 'tidy-intent', v: 1, things: b.sources.map((s) => ({ fileId: s.itemId, to: 'Areas/Career', name: s.name,
    note: { name: 'Offer.md', summary: 'An offer.', body }, profile: [{ source: s.itemId, sentence: 1 }] })) };
  const result = await runPlanning(b, [value, intent]);
  expect(result.frames.slice(2).map((f) => REFUSED.exec(f.call.input)?.[1]), 'ISO 4217 codes are upper case: "all" is not ALL').toEqual([]);
  expect(result.code, result.errors).toBe(0);
  expect(result.after['Areas/Career/Offer.md']).toContain(body);
});

it.for([
  ['damaged-journal', '{"v":1,"id":'],
  ['damaged-journal-empty', ''],
  ['damaged-journal-not-a-record', '{"v":1}'],
] as const)('AC3 audit-claude-replies-%s: an admitted journal file that is not JSON is left where it is, never a crash', async ([, bytes]) => {
  const c = wordsCase([{ kind: 'request', text: 'Put my garden notes together.' }]);
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const damaged = (await drive.listAll(root)).find((f) => f.name === 'change-1.json')?.id ?? '';
  expect(damaged).not.toBe('');
  const stored = await drive.readText(damaged);
  const admitted = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'admission-1' });
  expect(admitted.kind === 'manifest' && admitted.manifest.journal.some((j) => j.fileId === damaged), 'the request was admitted').toBe(true);
  // The runner reads it damaged (changed after admission): its bytes are not a journal record.
  const around = (fetch: typeof globalThis.fetch): typeof globalThis.fetch => async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    return url.pathname.endsWith(`/files/${damaged}`) && url.searchParams.get('alt') === 'media' ? new Response(bytes, { status: 200 }) : fetch(input, init);
  };
  const { inputs, spawn } = recorded(replySequence([remember]));
  const pacing = { baseMs: 0, sleep: async () => {} };
  const result = await runOnDrive(c, drive, root, { claude: spawn, around, pacing }, 1);
  const crashed = () => vi.mocked(console.error).mock.calls.flat().filter((e) => e instanceof SyntaxError);
  expect(crashed(), 'jsonOf reads it, never a bare JSON.parse').toEqual([]);
  expect(inputs.length, 'the model was asked').toBeGreaterThan(0);
  expect(result.code).toBe(0);
  const kept = async () => ({ path: drive.pathOf(damaged, root), bytes: await drive.readText(damaged) });
  expect(await kept(), 'left where it is, as it was').toEqual({ path: '.bower/changes/change-1.json', bytes: stored });
  const again = await redispatchCase(c, result, 2, { claude: spawn, around, pacing });
  expect(again.code, 'its replay goes on too').toBe(0);
  expect(crashed()).toEqual([]);
  expect(await kept(), 'and leaves it where it is').toEqual({ path: '.bower/changes/change-1.json', bytes: stored });
});

it('AC4 audit-claude-replies-memory-installs: a view a request installs takes that request on the memory path too', async () => {
  const tally = (await loadCorpus(ROOT)).find((x) => x.id === 'c17-b11-skills-tally');
  if (!tally) throw new Error('no corpus case c17-b11-skills-tally');
  const [reply] = JSON.parse(await readFile(resolve(ROOT, tally.id, 'replies.json'), 'utf8')) as Array<Record<string, unknown>>;
  const RULE = 'I prefer short notes about offers.';
  const c: LoadedCase = { ...tally, folder: { ...tally.folder, [LEDGER]: '', [ABOUT]: ABOUT_TEXT },
    journal: [...tally.journal, { kind: 'rule', text: RULE }] };
  const changes = (after: Record<string, string>) => Object.keys(after).filter((p) => p.startsWith('.bower/changes/')).sort();
  const plain = await runWithClaude(c, replySequence([reply]));
  expect(plain.code).toBe(0);
  const learning = await runWithClaude(c, replySequence([{ ...reply,
    observations: [{ source: { fileId: '$request:change-2' }, section: 'about-preferences', category: 'preference', text: RULE }] }]));
  expect(learning.code).toBe(0);
  expect(learning.after[LEDGER] ?? '', 'the memory path ran').toContain(RULE);
  expect(/^bower_views: /m.test(learning.after['Projects/Job hunt/Job hunt.md'] ?? ''), 'the view installed').toBe(true);
  expect(changes(learning.after), 'the installing request is taken as on the plain path (one helper for the final journal)')
    .toEqual(changes(plain.after));
});

const UNRELATED = 'Add a line to Garden about the beans.';
const RULED = 'I prefer short notes about offers.';
/** A corpus case and its first reply, with a rule of Alex's (change-2) and an unrelated request (change-3, its note never selected). */
async function withMemory(id: string): Promise<{ c: LoadedCase; first: Record<string, unknown> }> {
  const base = (await loadCorpus(ROOT)).find((x) => x.id === id);
  if (!base) throw new Error(`no corpus case ${id}`);
  const [first] = JSON.parse(await readFile(resolve(ROOT, id, 'replies.json'), 'utf8')) as Array<Record<string, unknown>>;
  return { first: first ?? {}, c: { ...base, presses: undefined, between: undefined,
    folder: { ...base.folder, 'Areas/Garden/Garden.md': '---\nsummary: Alex plans the garden.\n---\n# Garden\n\n## Timeline\n', [LEDGER]: '', [ABOUT]: ABOUT_TEXT },
    journal: [...base.journal, { kind: 'rule', text: RULED }, { kind: 'request', text: UNRELATED }] } };
}
const fromRule = { source: { fileId: '$request:change-2' }, section: 'about-preferences', category: 'preference', text: RULED };
const pendingFiles = (after: Record<string, string>) => Object.keys(after).filter((p) => p.startsWith('.bower/changes/')).sort();
const unrelatedWaits = (after: Record<string, string>) => pendingFiles(after).some((p) => (after[p] ?? '').includes(UNRELATED));

it.for([
  ['view', 'c17-b11-skills-tally', (after: Record<string, string>) => /^bower_views: /m.test(after['Projects/Job hunt/Job hunt.md'] ?? '')],
  ['suggestion', 'c17-b11-proposal-authority', (after: Record<string, string>) => (after['.bower/questions.json'] ?? '').includes('earliest-deadline')],
  ['map', 'c17-b12-shared-target', (after: Record<string, string>) => /TypeScript/.test(after['Areas/Career/Career profile.md'] ?? '')],
] as const)('AC4 audit-claude-replies-memory-installs-%s: the request it takes on the plain path is taken on the memory path; an unselected one waits', async ([, id, landed]) => {
  const { c, first } = await withMemory(id);
  const plain = await runWithClaude(c, replySequence([first]));
  expect(plain.code).toBe(0);
  expect(landed(plain.after), 'the plain path lands it').toBe(true);
  const learning = await runWithClaude(c, replySequence([{ ...first, observations: [fromRule] }]));
  expect(learning.code).toBe(0);
  expect(learning.after[LEDGER] ?? '', 'the memory path ran').toContain(RULED);
  expect(landed(learning.after), 'and lands it too').toBe(true);
  expect(pendingFiles(learning.after), 'one helper for the final journal').toEqual(pendingFiles(plain.after));
  expect(unrelatedWaits(learning.after), 'an unselected request stays pending').toBe(true);
});

it('AC4 audit-claude-replies-memory-installs-consolidation: a consolidating memory plan takes the installing request too', async () => {
  const { c: tally, first } = await withMemory('c17-b11-skills-tally');
  const c: LoadedCase = { ...tally, scope: 'all', inbox: [{ line: `Remember this: ${HABIT(15)}`, files: [] }], folder: { ...tally.folder, ...HABIT_FOLDER } };
  const plain = await runWithClaude(c, replySequence([first]));
  expect(plain.code).toBe(0);
  const learning = await runWithClaude(c, consolidating(replySequence([{ ...first, observations: [habitObservation] }])));
  expect(learning.code).toBe(0);
  expect(consolidated(learning), 'the consolidation is planned').toBe(true);
  expect(/^bower_views: /m.test(learning.after['Projects/Job hunt/Job hunt.md'] ?? ''), 'the view installed').toBe(true);
  expect(pendingFiles(learning.after), 'one helper for the final journal').toEqual(pendingFiles(plain.after));
  expect(unrelatedWaits(learning.after), 'an unselected request stays pending').toBe(true);
});

/** The c04-offer-and-flat case, answered by `replies` in turn (the last one again after that). */
async function offerAndFlat(): Promise<LoadedCase> {
  const c = (await loadCorpus(ROOT)).find((x) => x.id === 'c04-offer-and-flat');
  if (!c) throw new Error('no corpus case c04-offer-and-flat');
  return c;
}
type Id = (name: string) => string;
const envelope = (result: unknown): string => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1000, duration_api_ms: 900, num_turns: 1, result, usage: { input_tokens: 10, output_tokens: 10 } });
function answering(replies: Array<(id: Id) => unknown>, calls: ClaudeCall[] = []): ClaudeSpawn {
  return phaseAwareClaude(async (call, _step, attempt, phase) => {
    if (phase === 'execution') calls.push(call);
    const ctx = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as { piles: Array<{ things: Array<{ fileId: string; name: string }> }> };
    const ids = new Map(ctx.piles.flatMap((p) => p.things).map((t) => [t.name, t.fileId]));
    const make = replies[phase === 'selection' ? replies.length - 1 : Math.min(attempt, replies.length - 1)] ?? (() => null);
    return { code: 0, stderr: '', cut: null, stdout: envelope(JSON.stringify(make((name) => ids.get(name) ?? `no ${name}`))) };
  });
}
const filed = (id: Id, offerName = 'Offer, Industrial Designer, Ferrowick.pdf') => ({ kind: 'tidy-intent', v: 1, things: [
  { fileId: id('Offer_letter_final(2).pdf'), to: 'Projects/Job hunt', name: offerName, note: { name: 'Industrial Designer, Ferrowick.md', summary: 'An offer from Ferrowick.', body: 'Industrial designer, fully remote, 42,000 a year.' } },
  { fileId: id('listing-88213.example.url'), to: 'Projects/Flat hunt', name: 'Flat 9, Wrenfield Road.md' },
  { fileId: id('IMG_2301.jpg'), to: 'Projects/Flat hunt', name: 'Wrenfield Road, kitchen.jpg' },
  { fileId: id('Payslip_Aug.pdf'), to: 'Resources/Pay', name: 'Payslip August.pdf', note: { name: 'Payslip, August.md', summary: 'A payslip for August.', body: 'Payslip for August.' } },
] });

const factOf = (n: number) => ({ source: { pileId: 'p-1' }, section: 'about-you', category: 'biography', text: `Fact ${n}.` });
it.for([
  ['memory-reason', { observations: Array.from({ length: 21 }, (_, n) => factOf(n + 1)) }],
  ['memory-reason-forget-limit', { forget: Array.from({ length: 21 }, (_, n) => ({ factId: `fact-${n + 1}` })) }],
  ['memory-reason-forget-shape', { forget: [{ factId: 'fact-1', why: 'made-up' }] }],
  ['memory-reason-observation-shape', { observations: [{ source: { pileId: 'p-1' }, section: 'nowhere', text: 'Fact 1.' }] }],
  ['memory-reason-ending-shape', { ends: [{ factId: 'fact-1' }] }],
  ['memory-reason-forget-empty', { forget: [{}] }],
  ['memory-reason-forget-number', { forget: [{ factId: 42 }] }],
  ['memory-reason-observations-object', { observations: {} }],
  ['memory-reason-ends-object', { ends: {} }],
  ['memory-reason-two-endings', { ends: [{ factId: 'fact-1', quote: 'I no longer grow beans.' }, { factId: 'fact-1', quote: 'The beans are gone.' }] }],
] as const)('AC5 audit-claude-replies-%s: a memory effect past its bounds or shape is refused with a reason of its own, never keepNotAsked', async ([, memory]) => {
  const calls: ClaudeCall[] = [];
  const result = await runWithClaude(await offerAndFlat(), answering([(id) => ({ ...filed(id), ...memory }), (id) => filed(id)], calls));
  const retried = vi.mocked(console.error).mock.calls.map((a) => a.map(String).join(' ')).filter((l) => /asking once more/.test(l));
  expect(retried, 'refused once, as memory, its own kind').toEqual([expect.stringContaining('(memory)')]);
  expect(REFUSED.exec(calls[1]?.input ?? '')?.[1]).not.toBe(REFUSALS.keepNotAsked);
  expect((REFUSALS as Record<string, string>).memory, 'REFUSALS names the memory kind').toEqual(expect.any(String));
  expect(calls, 'one retry').toHaveLength(2);
  expect({ code: result.code, filed: 'Projects/Flat hunt/Wrenfield Road, kitchen.jpg' in result.after }, 'the corrected reply files the pile').toEqual({ code: 0, filed: true });
});

it('AC6 audit-claude-replies-name-extension: a name of 120 characters before its extension is not refused', async () => {
  const stem = 'Offer, Industrial Designer, Ferrowick, fully remote, salary stated, start in November, signed and returned by post now';
  expect(stem.length).toBe(118);
  const name = `${stem}.pdf`;
  const calls: ClaudeCall[] = [];
  const result = await runWithClaude(await offerAndFlat(), answering([(id) => filed(id, name)], calls));
  expect(refusals(calls.map((c) => c.input)), 'the extension is not counted (contracts/tree.ts checkLength)').toEqual([]);
  expect(result.code).toBe(0);
  expect(`Projects/Job hunt/${name}` in result.after).toBe(true);
});

const STEM_120 = 'Offer, Industrial Designer, Ferrowick, fully remote, salary stated, start in November, signed and returned by post today';
it.for([
  ['name-extension-120', `${STEM_120}.pdf`, true],
  ['name-extension-121', `${STEM_120}s.pdf`, false],
  ['name-extension-breaker', 'Offer, Ferrowick #2.pdf', false],
  ['name-extension-hidden', 'Offer, Ferrowick​.pdf', false],
  ['name-extension-edge-space', ' Offer, Ferrowick.pdf', false],
] as const)('AC6 audit-claude-replies-%s: the stem counts to 120, every other check is on the whole name', async ([, name, accepted]) => {
  expect(STEM_120.length).toBe(120);
  const calls: ClaudeCall[] = [];
  const result = await runWithClaude(await offerAndFlat(), answering([(id) => filed(id, name), (id) => filed(id)], calls));
  expect(refusals(calls.map((c) => c.input)), name).toEqual(accepted ? [] : [expect.stringContaining(REFUSALS.nameChangesKind)]);
  expect(result.code).toBe(0);
  expect(`Projects/Job hunt/${name}` in result.after).toBe(accepted);
});

/** A file with no extension, filed under a new name of `length` characters. */
async function extensionless(length: number) {
  vi.useFakeTimers(); vi.setSystemTime(AT);
  const b = await setup({ folder: { 'Areas/Career/Career.md': note('Career documents.', '## Timeline\n', true) },
    inbox: [{ line: '', files: ['offer scan'] }], inboxFiles: { 'offer scan': 'An offer from Ferrowick for Alex.' } });
  const name = 'Offer from Ferrowick for Alex, scanned and kept with the career documents as it came, every page of it here, with more pages to come'.slice(0, length);
  const intent = { kind: 'tidy-intent', v: 1, things: b.sources.map((s) => ({ fileId: s.itemId, to: 'Areas/Career', name,
    note: { name: 'Offer from Ferrowick.md', summary: 'An offer from Ferrowick.', body: 'An offer from Ferrowick for Alex.' } })) };
  return { name, result: await runPlanning(b, [select(b, [], 'Areas/Career'), intent, intent]) };
}
it.for([[120, true], [121, false]] as const)('AC6 audit-claude-replies-name-extensionless-%s: a name with no extension counts whole', async ([length, accepted]) => {
  const { name, result } = await extensionless(length);
  expect(name.length).toBe(length);
  expect(result.frames.slice(2).flatMap((f) => REFUSED.exec(f.call.input)?.[1] ?? []), name).toEqual(accepted ? [] : [expect.stringContaining(REFUSALS.nameChangesKind)]);
  expect(`Areas/Career/${name}` in result.after).toBe(accepted);
});

it('AC7 audit-claude-replies-selected-notes guard: the model is shown only the notes the selection chose (passes now)', async () => {
  const c = await offerAndFlat();
  const GARDEN = 'Areas/Garden/Garden.md';
  const withOwn = { ...c, folder: { ...c.folder, [GARDEN]: '---\nsummary: Alex plans the garden.\nby: bower\n---\n# Garden\n\n## Timeline\n' }, bowerOwned: [GARDEN] };
  const calls: ClaudeCall[] = [];
  const result = await runWithClaude(withOwn, answering([(id) => filed(id)], calls));
  expect(result.code).toBe(0);
  const shown = (JSON.parse(calls[0]?.input.split('\n').at(-1) ?? '{}') as { notes?: Array<{ path: string }> }).notes?.map((n) => n.path).sort();
  expect(shown, 'the destination hubs only; an unselected Bower note is not shown').toEqual(['Projects/Flat hunt/Flat hunt.md', 'Projects/Job hunt/Job hunt.md']);
});
