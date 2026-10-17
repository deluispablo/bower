/** C09a through production main: a question about stored material is answered in its request, with links to what was shown (c09-answers AC1-AC10). */
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { B_FAILURE, NOTHING_FOUND_WHY, listedPiles, planScripted, runKeys, type Decisions } from '../../src/data/spine/scripted';
import { scriptedDecisions } from '../../src/data/demo/script';
import { SYSTEM } from '../../src/data/vault/layout';
import type { ClaudeSpawn } from '../src/claude';
import type { LoadedCase } from '../src/corpus';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { redispatchCase, runOnDrive, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';

const DAY = Date.UTC(2026, 9, 7, 9);
const TOKEN = 'made-up-credential-c09';
const HUNT = 'Projects/Flat hunt';
const LARK = `${HUNT}/Larkspur Lane flat.md`;
const COBBLE = `${HUNT}/Cobble Row flat.md`;
const VIEWING = `${HUNT}/Viewing.md`;
const OLD_VIEWING = 'Archive/Old flat/Viewing.md';
const LONG = `${HUNT}/Letting agent notes.md`;
const note = (summary: string, body: string, line: string) => `---\nsummary: ${summary}\nby: bower\n---\n\n${body}\n\n## Timeline\n- ${line}\n`;
const FILES: Record<string, string> = {
  [`${HUNT}/Flat hunt.md`]: note('Alex is comparing flats in Saltmere.', '## Current state\n- Alex has not chosen a flat.', '2026-10-02 · Started the shortlist.'),
  [LARK]: note('The Larkspur Lane flat in Saltmere.', 'Rent: 1,450 a month.\nCommute: 24 min.', '2026-10-03 · Viewed the flat.'),
  [COBBLE]: note('The Cobble Row flat in Saltmere.', 'Rent: 1,580 a month.\nCommute: 18 min.', '2026-10-04 · Booked the viewing.'),
  [VIEWING]: note('The visit to Cobble Row is on Saturday.', 'The visit to Cobble Row is on Saturday morning.', '2026-10-05 · Booked the visit.'),
  [OLD_VIEWING]: note('The visit to the old flat in Alderwick.', 'The old flat was visited in September.', '2026-09-05 · Visited.'),
  [LONG]: note('The letting agent wrote about Cobble Row.', `${'The letting agent wrote a long letter about Cobble Row. '.repeat(80)}\nDeposit: 1,999.`, '2026-10-06 · Saved the letter.'),
};
const COMMUTE = 'Which flat has the shorter commute?';
const CHEAPER = 'Which flat is cheaper?';
const RENT = 'What is the rent for the Larkspur Lane flat?';
const VISIT = 'When is the visit to Cobble Row?';
const DEPOSIT = 'What deposit does the letting agent ask for Cobble Row?';
const GOOD = '[[Cobble Row flat]] has the shorter commute, 18 min; [[Larkspur Lane flat]] takes 24 min.';
const empty = { kind: 'tidy-intent', v: 1, things: [] };

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

async function folder(files: Record<string, string> = {}) {
  const c: LoadedCase = { id: 'c09-answers', capability: 'C09', title: 'Alex asks about stored notes', covers: 'model', source: 'new', scope: 'instructions',
    allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: [], journal: [], bowerOwned: [], inbox: [], inboxFiles: {},
    folder: { [SYSTEM.requests]: JSON.stringify({ v: 1, done: [] }), 'Rules.md': '# Rules\n', ...FILES, ...files } };
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
type Ctx = { asked: Record<string, string>; id: (path: string) => Promise<string>; frame: Record<string, unknown> };
type Frame = { sources?: Array<{ itemId: string; candidates: Array<{ id: string; path: string }> }> };

/**
 * One instructions press through main: each request written as the app writes it, the selection wanting the named paths
 * for every request (when they are candidates), then the given execution reply.
 */
async function press(f: Folder, words: string[], wants: string[], intent: (ctx: Ctx, attempt: number) => unknown | Promise<unknown>,
  o: { around?: (fetch: typeof globalThis.fetch) => typeof globalThis.fetch } = {}) {
  f.press++;
  const asked: Record<string, string> = {};
  for (const [i, text] of words.entries()) {
    const file = await f.drive.createText(await f.id(SYSTEM.changes), `press-${f.press}-${i + 1}.json`, JSON.stringify({ v: 1,
      id: `press-${f.press}-${i + 1}`, device: 'device-1', at: DAY + f.press * 10 + i, kind: 'request', what: `Asked Bower: "${text}"`, text }));
    asked[text] = file.id;
  }
  const admission = await planAdmission(fakeRead(f.drive), f.root, { scope: 'instructions', clock: () => DAY + f.press * 10 + 9, newId: () => `c09-admission-${f.press}` });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  const hunt = await f.id(HUNT);
  const calls: string[] = [];
  const frames: Array<{ phase: string; frame: Record<string, unknown> }> = [];
  let attempt = 0;
  const spawn: ClaudeSpawn = phaseAwareClaude(async (call, _step, _attempt, phase) => {
    const frame = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as Record<string, unknown> & Frame;
    calls.push(call.input);
    frames.push({ phase, frame });
    if (phase === 'selection') return reply({ items: (frame.sources ?? []).map((s) => ({ itemId: s.itemId, kind: 'unknown', destination: hunt,
      wants: s.candidates.filter((c) => wants.includes(c.path)).map((c) => c.id) })), asks: [] });
    return reply(await intent({ asked, id: f.id, frame }, attempt++));
  }, () => ({ drive: f.drive, root: f.root, admission: admission.manifest }), true);
  const run = await runOnDrive(f.c, f.drive, f.root, { claude: spawn, admission: admission.manifest, pacing: { baseMs: 0, sleep: async () => {} },
    answerStart: { scope: 'instructions', requestId: `c09-run-${f.press}` }, env: { CLAUDE_CODE_OAUTH_TOKEN: TOKEN }, ...(o.around ? { around: o.around } : {}) }, f.press);
  return { ...run, calls, frames, asked };
}
const answer = (requestId: string, text: string, extra: Record<string, unknown> = {}) => ({ ...empty, answers: [{ requestId, text, ...extra }] });
const done = (run: CaseRun) => (JSON.parse(run.after[SYSTEM.requests] ?? '{"done":[]}') as { done: Array<{ id: string; text: string; done?: string }> }).done;
const doneFor = (run: CaseRun, words: string) => done(run).filter((r) => r.text === words).map((r) => r.done);
const waiting = (run: CaseRun, recordId: string) => Object.keys(run.after).some((p) => p.startsWith(`${SYSTEM.changes}/`) && !p.startsWith(`${SYSTEM.archive}/`) && p.endsWith(`${recordId}.json`));
const archived = (run: CaseRun, recordId: string) => !waiting(run, recordId);
const phase = (run: CaseRun) => run.wire?.statuses.at(-1)?.phase;
const refusals = () => vi.mocked(console.error).mock.calls.flatMap((args) => args.map(String))
  .flatMap((line) => [.../was refused \((\w+)\): (.*); asking once more/.exec(line) ?? []].slice(1, 3));
const url = (input: RequestInfo | URL): URL => new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
const unchanged = (run: CaseRun) => Object.fromEntries(Object.keys(FILES).map((p) => [p, run.after[p] === FILES[p]]));
const allSame = Object.fromEntries(Object.keys(FILES).map((p) => [p, true]));

const SHOWN_BOTH = [LARK, COBBLE];
const KEYS = 'an answer with keys outside the intent: give {requestId, text}';
const BINDING = "an answer whose request is not one of the person's requests below, or a second answer for one request";
const TEXT = 'an answer that is not one plain line of at most 1,000 characters, with [[links]] only';
// The one link rule of c06-body-links (claude.ts `linkWhy`, scripted.ts `linkIdentity`): its kind and reasons, no answer kind of its own.
const NOT_SHOWN = 'a link to a note you were not shown: leave it out';
const SHARED = 'a bare name two notes share: give its path, as shown';
const numbers = (n: string) => `a number that is in none of its sources: "${n}" in the answer; write only figures from the request, the notes shown or the files shown, or leave the figure out`;

describe('c09-answers', () => {
  it('AC1 c09-answers-done: an answer becomes its request\'s done text exactly; the request is archived and nothing else changes', async () => {
    const f = await folder();
    const run = await press(f, [COMMUTE], SHOWN_BOTH, (ctx) => answer(ctx.asked[COMMUTE] ?? '', `  ${GOOD}  `));
    expect(doneFor(run, COMMUTE)).toEqual([GOOD]);
    expect(archived(run, 'press-1-1')).toBe(true);
    expect(unchanged(run)).toEqual(allSame);
    expect(Object.keys(run.after).filter((p) => p.startsWith('Inbox/'))).toEqual([]);
    expect(run.calls).toHaveLength(2);
    expect(phase(run)).toBe('done');
  });

  // Figures (2026-10-16 prior-art audit): a count, total or difference computed from the linked sources is allowed; a figure
  // stated as coming from one source must appear in it.
  const COMPUTED = '[[Cobble Row flat]] costs 130 more a month than [[Larkspur Lane flat]], 3,030 for the two together.';
  const bad: Array<{ name: string; kind: string; why: string; words?: string; wants?: string[]; entry: (ctx: Ctx) => Promise<unknown> | unknown; good?: string }> = [
    { name: 'an unknown key', kind: 'answerKeys', why: KEYS, entry: (ctx) => ({ requestId: ctx.asked[COMMUTE], text: GOOD, uses: [] }) },
    { name: 'no text', kind: 'answerKeys', why: KEYS, entry: (ctx) => ({ requestId: ctx.asked[COMMUTE] }) },
    { name: 'a request that is not one of this run\'s', kind: 'answerBinding', why: BINDING, entry: async (ctx) => ({ requestId: await ctx.id(LARK), text: GOOD }) },
    { name: 'two answers for one request', kind: 'answerBinding', why: BINDING, entry: (ctx) => [{ requestId: ctx.asked[COMMUTE], text: GOOD }, { requestId: ctx.asked[COMMUTE], text: GOOD }] },
    { name: 'empty text', kind: 'answerText', why: TEXT, entry: (ctx) => ({ requestId: ctx.asked[COMMUTE], text: '   ' }) },
    { name: 'text over 1,000 characters', kind: 'answerText', why: TEXT, entry: (ctx) => ({ requestId: ctx.asked[COMMUTE], text: `${GOOD} ${'a'.repeat(1_000)}` }) },
    { name: 'a line break', kind: 'answerText', why: TEXT, entry: (ctx) => ({ requestId: ctx.asked[COMMUTE], text: GOOD.replace('; ', ';\n') }) },
    { name: 'a Markdown link', kind: 'answerText', why: TEXT, entry: (ctx) => ({ requestId: ctx.asked[COMMUTE], text: `${GOOD} See [the flat](Cobble Row flat.md).` }) },
    { name: 'a web address', kind: 'answerText', why: TEXT, entry: (ctx) => ({ requestId: ctx.asked[COMMUTE], text: `${GOOD} See https://flats.example/cobble.` }) },
    { name: 'an unclosed link', kind: 'answerText', why: TEXT, entry: (ctx) => ({ requestId: ctx.asked[COMMUTE], text: `${GOOD} [[Cobble Row flat` }) },
    { name: 'a link with a label', kind: 'answerText', why: TEXT, entry: (ctx) => ({ requestId: ctx.asked[COMMUTE], text: GOOD.replace('[[Cobble Row flat]]', '[[Cobble Row flat|Cobble Row]]') }) },
    { name: 'a link to nothing in the folder', kind: 'noteLink', why: NOT_SHOWN, entry: (ctx) => ({ requestId: ctx.asked[COMMUTE], text: `${GOOD} [[Imaginary flat]] is closer.` }) },
    { name: 'a link to a file not shown', kind: 'noteLink', why: NOT_SHOWN, words: VISIT, wants: [VIEWING],
      entry: (ctx) => ({ requestId: ctx.asked[VISIT], text: 'The visit is on Saturday, as [[Archive/Old flat/Viewing]] says.' }), good: 'The visit is on Saturday, as [[Projects/Flat hunt/Viewing]] says.' },
    { name: 'a name two files share', kind: 'noteLink', why: SHARED, words: VISIT, wants: [VIEWING],
      entry: (ctx) => ({ requestId: ctx.asked[VISIT], text: 'The visit is on Saturday, as [[Viewing]] says.' }), good: 'The visit is on Saturday, as [[Projects/Flat hunt/Viewing]] says.' },
    { name: 'a figure stated as from one source that is not in it', kind: 'numbers', why: numbers('1,900'), words: CHEAPER,
      entry: (ctx) => ({ requestId: ctx.asked[CHEAPER], text: '[[Cobble Row flat]] says its rent is 1,900 a month.' }), good: COMPUTED },
    { name: 'a figure past the shown cut', kind: 'numbers', why: numbers('1,999'), words: DEPOSIT, wants: [LONG],
      entry: (ctx) => ({ requestId: ctx.asked[DEPOSIT], text: '[[Letting agent notes]] says the deposit is 1,999.' }),
      good: 'Bower found no deposit in the part of [[Letting agent notes]] it read.' },
  ];
  it.each(bad)('AC2 c09-answers-refusals: $name is refused once with its own kind and reason; the corrected reply applies', async ({ kind, why, words = COMMUTE, wants = SHOWN_BOTH, entry, good = GOOD }) => {
    const f = await folder();
    const run = await press(f, [words], wants, async (ctx, attempt) => {
      if (attempt > 0) return answer(ctx.asked[words] ?? '', good);
      const value = await entry(ctx);
      return { ...empty, answers: Array.isArray(value) ? value : [value] };
    });
    expect(refusals().slice(0, 2)).toEqual([kind, why]);
    expect(doneFor(run, words)).toEqual([good]);
  });

  it('AC2 c09-answers-refusals: a difference and a total computed from the linked sources are no refused figure', async () => {
    const f = await folder();
    const run = await press(f, [CHEAPER], SHOWN_BOTH, (ctx) => answer(ctx.asked[CHEAPER] ?? '', COMPUTED));
    expect(refusals()).toEqual([]);
    expect(doneFor(run, CHEAPER)).toEqual([COMPUTED]);
  });

  it('AC3 c09-answers-unanswered-waits: a request the reply does not answer waits unarchived with no row, beside one it answers', async () => {
    const f = await folder();
    const run = await press(f, [COMMUTE, CHEAPER], SHOWN_BOTH, (ctx) => answer(ctx.asked[COMMUTE] ?? '', GOOD));
    expect(doneFor(run, COMMUTE)).toEqual([GOOD]);
    expect(archived(run, 'press-1-1')).toBe(true);
    expect(doneFor(run, CHEAPER)).toEqual([]);
    expect(waiting(run, 'press-1-2')).toBe(true);
  });

  it('AC4 c09-answers-named-note: an answered request that names a note leaves the append settlement: no line, no "left" row', async () => {
    const f = await folder();
    const text = '[[Larkspur Lane flat]] costs 1,450 a month.';
    const run = await press(f, [RENT], [], (ctx) => answer(ctx.asked[RENT] ?? '', text));
    expect(doneFor(run, RENT)).toEqual([text]);
    expect(run.after[LARK]).toBe(FILES[LARK]);
    expect(JSON.stringify(run.lastRun)).not.toContain(NOTHING_FOUND_WHY);
    expect(archived(run, 'press-1-1')).toBe(true);
  });

  it('AC5 c09-answers-shared-name: a note whose name another file shares is linked by its whole path, stored as written', async () => {
    const f = await folder();
    const text = 'The visit is on Saturday, as [[Projects/Flat hunt/Viewing]] says.';
    const run = await press(f, [VISIT], [VIEWING], (ctx) => answer(ctx.asked[VISIT] ?? '', text));
    expect(refusals()).toEqual([]);
    expect(doneFor(run, VISIT)).toEqual([text]);
  });

  it('AC6 c09-answers-keeps-rows: the requests write keeps the earlier rows and every other key exactly as read', async () => {
    const earlier = { id: 'change-0', text: 'Compare the flats on the shortlist', at: DAY - 5_000, done: 'Done. See what changed in your folders.' };
    const recent = [{ key: '0123456789abcdef', at: DAY - 1_000 }];
    const f = await folder({ [SYSTEM.requests]: `${JSON.stringify({ v: 1, done: [earlier], recent }, null, 2)}\n` });
    const run = await press(f, [COMMUTE], SHOWN_BOTH, (ctx) => answer(ctx.asked[COMMUTE] ?? '', GOOD));
    const stored = JSON.parse(run.after[SYSTEM.requests] ?? '{}') as { done?: unknown[]; recent?: unknown };
    expect(stored.done).toEqual([{ id: 'press-1-1', text: COMMUTE, at: DAY + 10, done: GOOD }, earlier]);
    expect(stored.recent).toEqual(recent);
  });

  it('AC7 c09-answers-ack-lost: a lost answer after the requests write completes once on redispatch, with no model call', async () => {
    const f = await folder();
    const requestsId = await f.id(SYSTEM.requests);
    let crashed = false;
    const first = await press(f, [COMMUTE], SHOWN_BOTH, (ctx) => answer(ctx.asked[COMMUTE] ?? '', GOOD), { around: (next) => async (input, init) => {
      if (crashed && url(input).origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost.');
      if (init?.method === 'PATCH' && url(input).pathname.endsWith(`/files/${requestsId}`)) {
        const response = await next(input, init);
        crashed = response.ok && (await f.drive.readText(requestsId)).includes(GOOD);
        throw new TypeError('Made-up lost answer after the requests write.');
      }
      return next(input, init);
    } });
    expect(crashed, 'main wrote the answer').toBe(true);
    const model = vi.fn<ClaudeSpawn>(async () => { throw new Error('A redispatch must not call a model.'); });
    const resumed = await redispatchCase(f.c, first, 2, { claude: model, pacing: { baseMs: 0, sleep: async () => {} } });
    expect(phase(resumed)).toBe('done');
    expect(model).not.toHaveBeenCalled();
    expect(doneFor(resumed, COMMUTE)).toEqual([GOOD]);
    expect(archived(resumed, 'press-1-1')).toBe(true);
  });

  it('AC8 c09-answers-planner-links: the planner refuses an answer plan whose link names nothing or a name two notes share (the one link rule), beside its passing twin', async () => {
    const f = await folder();
    await f.drive.createText(await f.id(SYSTEM.changes), 'press-9.json', JSON.stringify({ v: 1, id: 'press-9', device: 'device-1', at: DAY,
      kind: 'request', what: `Asked Bower: "${COMMUTE}"`, text: COMMUTE }));
    const admission = await planAdmission(fakeRead(f.drive), f.root, { scope: 'instructions', clock: () => DAY, newId: () => 'c09-planner' });
    if (admission.kind !== 'manifest') throw new Error('Not admitted');
    const plan = async (text: string) => {
      const decisions: Decisions = { ...scriptedDecisions([], []), request: () => ({ kind: 'answer', uses: [LARK, COBBLE], answer: text }) };
      try {
        const reads = fakeRead(f.drive);
        await planScripted({ ...reads, provenance: 'fake-stored', piles: (rootId, context) => listedPiles(reads, rootId, undefined, undefined, context) }, f.root, { scope: 'instructions', allowWeb: false, runId: 'c09-planner', requestId: admission.manifest.id,
          requestedAt: admission.manifest.at, taken: admission.manifest, mintKey: await runKeys('c09-planner'), decisions });
        return 'planned';
      } catch (error) { return error instanceof Error ? error.message : String(error); }
    };
    expect(await plan(GOOD), 'the twin').toBe('planned');
    expect(await plan(`${GOOD} [[Imaginary flat]] is closer.`)).toBe(B_FAILURE);
    expect(await plan('The visit is on Saturday, as [[Viewing]] says.')).toBe(B_FAILURE);
  });

  it('AC10 c09-answers-request-shown: both calls show each request this run took, by its fileId and its words, and nothing else', async () => {
    const f = await folder();
    const run = await press(f, [COMMUTE, CHEAPER], SHOWN_BOTH, (ctx) => answer(ctx.asked[COMMUTE] ?? '', GOOD));
    const expected = [{ requestId: run.asked[COMMUTE], text: COMMUTE }, { requestId: run.asked[CHEAPER], text: CHEAPER }];
    expect(run.frames.map((x) => [x.phase, x.frame.requests])).toEqual([['selection', expected], ['execution', expected]]);
  });

  it('AC9 c09-answers-prompt: the execution prompt gives the answers grammar when the run took a request', async () => {
    const f = await folder();
    const run = await press(f, [COMMUTE], SHOWN_BOTH, (ctx) => answer(ctx.asked[COMMUTE] ?? '', GOOD));
    const prompt = (run.calls[1] ?? '').split('\n').slice(0, -1).join('\n');
    expect(prompt).toMatch(/"answers":\s*\[\{"requestId":"<the request's fileId>","text":"[^"]+"\}\]/);
  });
});
