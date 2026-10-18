/**
 * C07 c07-cases (specs/c07-disagreement/spec.md AC2-AC4): the three model cases land as scripted proof through
 * production main in B9's form: one Contradiction line with both sources, an Uncertain line that keeps its condition,
 * an ordinary dated line, and nothing asks the person to choose.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadCase, type LoadedCase } from '../src/corpus';
import { parseNote } from '../../src/data/contracts/note-format';
import { caseReplies, redispatchCase, replySequence, runOnDrive, runWithClaude, scoreCase, type CaseRun } from './corpus-run';
import { manifest } from './b1-planning-support';
import type { ClaudeCall, ClaudeSpawn } from '../src/claude';

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
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
const FLAT = 'Projects/Flat hunt/Larkspur Lane flat.md';
const VISIT = 'Projects/Garden visit/Saltmere garden visit.md';
const EARLIER = 'Projects/Flat hunt/Earlier listing.txt';
type Reply = { kind: string; v: number; things: unknown[]; lines?: Array<Record<string, unknown>> };
/** Each case, the note its line goes on, the source note the draft wrote and must no longer write, and its marker. */
const CASES = [
  { id: 'c07-same-period-rent', note: FLAT, oldNote: 'Projects/Flat hunt/Later listing.md', marker: 'Contradiction: ' },
  { id: 'c07-tentative-closure', note: VISIT, oldNote: 'Projects/Garden visit/Garden notice.md', marker: 'Uncertain: ' },
  { id: 'c07-dated-rent-change', note: FLAT, oldNote: 'Projects/Flat hunt/Later rent terms.md', marker: null },
] as const;

const load = (id: string): Promise<LoadedCase> => loadCase(join(ROOT, id));
const isExecution = (call: ClaudeCall): boolean => (JSON.parse(call.input.split('\n').at(-1) ?? '{}') as { selection?: unknown }).selection !== undefined;
/** Every call's phase, in order, and the inputs seen. */
function counted(spawn: ClaudeSpawn) {
  const calls: Array<'selection' | 'execution'> = [];
  const inputs: string[] = [];
  return { calls, inputs, spawn: async (call: ClaudeCall) => {
    calls.push(isExecution(call) ? 'execution' : 'selection');
    inputs.push(call.input);
    return spawn(call);
  } };
}
const pressOne = (run: CaseRun): CaseRun => run.runs?.[0] ?? run;
const replies = async (id: string): Promise<Reply[]> => JSON.parse(await readFile(join(ROOT, id, 'replies.json'), 'utf8')) as Reply[];
/** The edit operations a run's manifest holds for one note. */
const editsOf = (run: CaseRun, path: string) => manifest(run).operations.filter((o) => o.effect.kind === 'edit-text' && (o.effect as { path?: string }).path === path);

it.each(CASES)('AC2 c07-fixtures-landed: $id has scripted replies in B9\'s form and a replay press (R7)', async ({ id, oldNote }) => {
  const c = await load(id);
  expect(existsSync(join(ROOT, id, 'replies.json')), 'scripted replies').toBe(true);
  expect(c.covers, 'the case is scripted proof now').toBe('scripted');
  expect(`${c.title}\n${c.source}\n${c.rubric}`, 'no pending proof or draft wording').not.toMatch(/pending|draft|lead review|lead\/designer|remains open|future driver|scripted preparation|new source note/i);
  expect(c.expected.files?.absent ?? [], 'the line carries the news: no source-note chain (value gate)').toContain(oldNote);
  expect(c.expected.runs, 'press 1 and a replay press are both scored').toHaveLength(2);
  expect(c.expected.runs?.[0]?.report?.created ?? [], 'the first run\'s health note is expected').toContain('Bower health.md');
  // A Timeline expectation that names a source holds its words and that source in one string, so a correct link on
  // another line cannot satisfy it (R7).
  const timeline = (c.expected.notes ?? []).flatMap((n) => n.timeline ?? []);
  for (const t of timeline) expect(t === '' || !/^\[\[[^\]]+\]\]$/.test(t.trim()), `a bare citation expectation: ${t}`).toBe(true);
  const readme = await readFile(join(ROOT, 'README.md'), 'utf8');
  expect(readme, 'the README row says scripted').toMatch(new RegExp(`^\\| ${id} \\| C07 \\| scripted \\|`, 'm'));
  const rubricLog = await readFile(resolve(ROOT, '../fixtures/p4-method-rubric-changes.md'), 'utf8');
  const row = rubricLog.split('\n').find((l) => l.startsWith(`| ${id} |`)) ?? '';
  expect(row, 'the rubric row keeps its verdict').toMatch(new RegExp(`^\\| ${id} \\| changed \\| .{10,}`));
  expect(row, 'the rubric row drops the draft and old-state wording (R7)').not.toMatch(/scripted draft|expected\.json is unchanged|removed the (?:historical-state|Current state)/i);
});

it.each(CASES)('AC3 c07-case: $id scores clean through main, with selection then execution, and the replay adds nothing (R1-R3, R7)', async ({ id, note, marker }) => {
  const c = await load(id);
  const { calls, spawn } = counted(caseReplies(id));
  const final = await runWithClaude(c, spawn);
  const first = pressOne(final);
  expect(final.score).toEqual({ pass: true, unmet: [] });
  expect(calls.slice(0, 2), 'selection then execution, no retry').toEqual(['selection', 'execution']);
  const added = parseNote(note, first.after[note] ?? '').timeline.slice(parseNote(note, c.folder[note] ?? '').timeline.length);
  expect(added, 'exactly one new line').toHaveLength(1);
  if (marker) expect(added[0]?.text.startsWith(marker), `the line is marked ${marker}`).toBe(true);
  else expect(added[0]?.text ?? '', 'a dated change carries no marker').not.toMatch(/^(?:Contradiction|Uncertain):|\(inferred\)/);
  expect((first.lastRun as { run?: { report?: { questions?: unknown[] } } } | null)?.run?.report?.questions ?? [], 'nothing asks the person to choose (R2)').toEqual([]);
  expect(final.after[note], 'the replay press adds nothing').toBe(first.after[note]);
});

it('corpus-delete-overlaps AC1: same-period rent retains unique preservation assertions', async () => {
  const c = await load('c07-same-period-rent');
  const final = await runWithClaude(c, caseReplies(c.id));
  expect(scoreCase(c, final)).toEqual({ pass: true, unmet: [] });
  const personal = 'Alex likes the kitchen window.';
  const history = '2026-10-02 · The earlier listing says rent from 2026-11-01 is 1,450 a month. · [[Earlier listing.txt]]';
  const contradiction = 'Contradiction: The earlier listing gives 1,450 a month from 2026-11-01; the later listing gives 1,580 for the same period. Neither is confirmed. (also from [[Earlier listing.txt]]) · [[Later listing.txt]]';
  const mutations = [
    { label: 'personal prose', remove: personal, unmet: `lacks "${personal}"` },
    { label: 'old history', remove: history, unmet: `no Timeline line with "${history}"` },
    { label: 'earlier claim', remove: 'The earlier listing gives 1,450 a month from 2026-11-01; ', unmet: `no Timeline line with "${contradiction}"` },
    { label: 'later claim', remove: 'the later listing gives 1,580 for the same period.', unmet: `no Timeline line with "${contradiction}"` },
  ];
  for (const [index, run] of [...final.runs ?? [], final].entries()) {
    for (const { label, remove, unmet } of mutations) {
      const original = run.after[FLAT] ?? '';
      expect(original, label).toContain(remove);
      const changed = { ...run, after: { ...run.after, [FLAT]: original.replace(remove, '') } };
      const corrupted = index === 0 ? { ...final, runs: [changed] } : changed;
      const result = scoreCase(c, corrupted);
      expect(result.pass, `press ${index + 1}: missing ${label}`).toBe(false);
      expect(result.unmet).toContain(`run ${index + 1}: ${FLAT}: ${unmet}`);
    }
  }
});

it('AC3 c07-case: a done redispatch of the same-period run makes no model call and writes nothing', async () => {
  const c = await load('c07-same-period-rent');
  const final = await runWithClaude(c, caseReplies('c07-same-period-rent'));
  const first = pressOne(final);
  expect(first.code).toBe(0);
  expect(first.after[FLAT], 'press 1 wrote the contradiction').not.toBe(c.folder[FLAT]);
  const again = await redispatchCase(c, first, 2, { claude: () => { throw new Error('A done redispatch must not call a model.'); } });
  expect(again.after[FLAT]).toBe(first.after[FLAT]);
});

it('AC4 guard c07-attribution: swapped figures fail the same-period score, so the claim and its source are checked together', async () => {
  const c = await load('c07-same-period-rent');
  const replies = existsSync(join(ROOT, c.id, 'replies.json'))
    ? JSON.parse(await readFile(join(ROOT, c.id, 'replies.json'), 'utf8')) as Array<{ lines?: Array<{ text: string }> }>
    : [];
  const first = replies[0];
  const swapped = first?.lines?.[0]?.text.replace('1,450', '#').replace('1,580', '1,450').replace('#', '1,580');
  const reply = { ...first, lines: first?.lines?.map((l, i) => (i === 0 && swapped ? { ...l, text: swapped } : l)) };
  const run = await runWithClaude(c, replySequence([reply, ...replies.slice(1)]));
  expect(run.score?.pass, 'reversed attribution never scores clean').toBe(false);
});

const AC1 = 'corpus-delete-b9 AC1: same-period rent enforces both-source marker binding — ';
const SAME = 'c07-same-period-rent';
const plain = (reply: Reply | undefined): Reply => ({ ...reply, lines: reply?.lines?.map(({ marker: _m, alsoCites: _a, ...line }) => line) } as Reply);
const REQUEST = { kind: 'tidy', text: 'Record the same disagreement only if it is not already in the flat note.' } as const;

// guard: passes before deletion
it(`${AC1}an ordinary line files the later listing and leaves the earlier one`, async () => {
  const c = await load(SAME);
  const [first, second] = await replies(SAME);
  const run = pressOne(await runWithClaude(c, replySequence([plain(first), second as Reply])));
  expect(run.code).toBe(0);
  expect(run.after[FLAT]).toContain('Neither is confirmed. · [[Later listing.txt]]');
  expect(run.after[EARLIER]).toBe(c.folder[EARLIER]);
});

// guard: passes before deletion
it(`${AC1}both sources bind into one contradiction line in one edit`, async () => {
  const c = await load(SAME);
  const first = pressOne(await runWithClaude(c, caseReplies(SAME)));
  expect(first.code, 'two distinct bound sources materialize before authoring').toBe(0);
  const entries = parseNote(FLAT, first.after[FLAT] ?? '').timeline;
  expect(entries).toHaveLength(2);
  expect(entries[1]).toEqual({ date: '2026-10-07', source: 'Later listing.txt',
    text: 'Contradiction: The earlier listing gives 1,450 a month from 2026-11-01; the later listing gives 1,580 for the same period. Neither is confirmed. (also from [[Earlier listing.txt]])' });
  expect(first.after[EARLIER]).toBe(c.folder[EARLIER]);
  expect(editsOf(first, FLAT), 'one edit for the flat note').toHaveLength(1);
});

/** Press 1 files the later listing with its line; a fresh press repeats the same line, citing the filed listing. */
async function freshPress(marked: boolean) {
  const c = await load(SAME);
  // B9's shape: press 2 is the same explicit request, so no default request is left open at press 3.
  c.presses = [{ request: REQUEST }];
  const [reply, second] = await replies(SAME);
  const first = marked ? (reply as Reply) : plain(reply);
  const final = await runWithClaude(c, replySequence([first, second as Reply]));
  expect(final.code).toBe(0);
  const filed = Object.entries(final.pathsById).find(([, path]) => path === 'Projects/Flat hunt/Later listing.txt')?.[0];
  expect(filed, 'the later listing was filed').toBeDefined();
  const { calls, spawn } = counted(replySequence([{ ...first, things: [], lines: first.lines?.map((l) => ({ ...l, cites: filed })) }]));
  const again = await runOnDrive(c, final.drive, final.root, { claude: spawn, request: REQUEST, pacing: { baseMs: 0, sleep: async () => {} } }, 3);
  expect(again.code, 'the repeated line is valid input: it is already present').toBe(0);
  expect(calls, 'selection then execution, no validation retry').toEqual(['selection', 'execution']);
  expect(again.after[FLAT], 'no second line').toBe(final.after[FLAT]);
  const rows = ((again.lastRun as { run?: { report?: { updated?: Array<{ path: string }> } } })?.run?.report?.updated ?? []).map((r) => r.path);
  expect(rows, 'no updated row for a line already there').not.toContain(FLAT);
}
// guard: passes before deletion
it(`${AC1}an ordinary line repeated on a fresh press is a no-op`, async () => { await freshPress(false); });
// guard: passes before deletion
it(`${AC1}the same marked line on a fresh press is a no-op, found by its final text`, async () => { await freshPress(true); });

// guard: passes before deletion
it.each([
  ['one source', (line: Record<string, unknown>) => { delete line.alsoCites; }],
  ['a basename', (line: Record<string, unknown>) => { line.alsoCites = ['Earlier listing.txt']; }],
])(`${AC1}refuses %s before any write`, async (_name, mutate) => {
  const c = await load(SAME);
  const [first] = await replies(SAME);
  const line = { ...first?.lines?.[0] };
  mutate(line);
  const inputs: string[] = [];
  const sp = replySequence([{ ...first, lines: [line] } as Reply]);
  const run = pressOne(await runWithClaude(c, async (call: ClaudeCall) => { inputs.push(call.input); return sp(call); }));
  expect(run.code).toBe(1);
  expect(run.after[FLAT]).toBe(c.folder[FLAT]);
  const retry = inputs.find((input) => /^Your reply was refused:/m.test(input)) ?? '';
  expect(retry, 'refused through the retry, by the marker rules').toMatch(/^Your reply was refused:/m);
  expect(retry).not.toContain('a line with keys outside the intent');
});

// guard: passes before deletion
it(`${AC1}refuses the new source itself, linked and filed, on a fresh press`, async () => {
  const c = await load(SAME);
  // B9's shape: press 2 is the same explicit request, so no default request is left open at press 3.
  c.presses = [{ request: REQUEST }];
  const [first, second] = await replies(SAME);
  const final = await runWithClaude(c, replySequence([plain(first), second as Reply]));
  const filed = Object.entries(final.pathsById).find(([, path]) => path === 'Projects/Flat hunt/Later listing.txt')?.[0];
  expect(filed, 'the later listing was filed').toBeDefined();
  const inputs: string[] = [];
  const sp = replySequence([{ ...first, things: [], lines: first?.lines?.map((l) => ({ ...l, cites: filed, alsoCites: ['Projects/Flat hunt/Later listing.txt'] })) } as Reply]);
  const again = await runOnDrive(c, final.drive, final.root, { claude: async (call: ClaudeCall) => { inputs.push(call.input); return sp(call); }, request: REQUEST, pacing: { baseMs: 0, sleep: async () => {} } }, 3);
  expect(again.code).toBe(1);
  expect(again.after[FLAT]).toBe(final.after[FLAT]);
  const retry = inputs.find((input) => /^Your reply was refused:/m.test(input)) ?? '';
  expect(/^Your reply was refused: (.*)$/m.exec(retry)?.[1], 'refused for its identity only').toContain('naming the thing the line cites');
});
