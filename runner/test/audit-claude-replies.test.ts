/**
 * audit-claude-replies: the Claude planner refuses only what is really wrong and never crashes on a damaged journal
 * file (deep audit 2026-10-16 of `claude.ts`). No live call: scripted replies over the pretend Drive.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BowerError } from '../../src/data/contracts/types';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { REFUSALS, type ClaudeCall, type ClaudeSpawn } from '../src/claude';
import { loadCorpus, type LoadedCase } from '../src/corpus';
import { LedgerExhausted, RunTiming } from '../src/timing';
import { note, phaseAwareClaude, run as runPlanning, select, setup, type Base } from './b1-planning-support';
import { AT, replySequence, runOnDrive, runWithClaude, seedCase } from './corpus-run';
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

// The planner's own errors while planning a memory reply: a used-up ledger, and Drive not answering a read the plan makes.
it.for([
  ['memory-ledger', () => new LedgerExhausted(1)],
  ['memory-drive', () => new BowerError('offline', "Google Drive didn't answer. Try again.")],
] as const)('AC1 audit-claude-replies-%s: an error planning a memory reply is rethrown, never asked again as keepNotAsked', async ([, error]) => {
  vi.spyOn(RunTiming.prototype, 'requireOperations').mockImplementation(() => { throw error(); });
  const { inputs, spawn } = recorded(replySequence([remember]));
  await runWithClaude(wordsCase(), spawn);
  expect(inputs.length, 'the memory reply was asked for').toBeGreaterThan(0);
  expect(refusals(inputs), 'only a planner refusal is a refusal of the reply').toEqual([]);
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

it('AC3 audit-claude-replies-damaged-journal: an admitted journal file that is not JSON is left where it is, never a crash', async () => {
  const c = wordsCase([{ kind: 'request', text: 'Put my garden notes together.' }]);
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const damaged = (await drive.listAll(root)).find((f) => f.name === 'change-1.json')?.id ?? '';
  expect(damaged).not.toBe('');
  const admitted = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'admission-1' });
  expect(admitted.kind === 'manifest' && admitted.manifest.journal.some((j) => j.fileId === damaged), 'the request was admitted').toBe(true);
  // The runner reads it damaged (changed after admission): its bytes are not JSON.
  const around = (fetch: typeof globalThis.fetch): typeof globalThis.fetch => async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    return url.pathname.endsWith(`/files/${damaged}`) && url.searchParams.get('alt') === 'media' ? new Response('{"v":1,"id":', { status: 200 }) : fetch(input, init);
  };
  const { inputs, spawn } = recorded(replySequence([remember]));
  const result = await runOnDrive(c, drive, root, { claude: spawn, around, pacing: { baseMs: 0, sleep: async () => {} } }, 1);
  const crashed = vi.mocked(console.error).mock.calls.flat().filter((e) => e instanceof SyntaxError);
  expect(crashed, 'jsonOf reads it, never a bare JSON.parse').toEqual([]);
  expect(inputs.length, 'the model was asked').toBeGreaterThan(0);
  expect(result.code).toBe(0);
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

it('AC5 audit-claude-replies-memory-reason: past the memory limits is refused with a reason of its own, never keepNotAsked', async () => {
  const many = Array.from({ length: 21 }, (_, n) => ({ source: { pileId: 'p-1' }, section: 'about-you', category: 'biography', text: `Fact ${n + 1}.` }));
  const calls: ClaudeCall[] = [];
  await runWithClaude(await offerAndFlat(), answering([(id) => ({ ...filed(id), observations: many }), (id) => filed(id)], calls));
  const retried = vi.mocked(console.error).mock.calls.map((a) => a.map(String).join(' ')).find((l) => /asking once more/.test(l)) ?? '';
  expect(retried, 'refused as memory, its own kind').toContain('(memory)');
  expect(REFUSED.exec(calls[1]?.input ?? '')?.[1]).not.toBe(REFUSALS.keepNotAsked);
  expect((REFUSALS as Record<string, string>).memory, 'REFUSALS names the memory kind').toEqual(expect.any(String));
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
