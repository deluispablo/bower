import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadCase } from '../src/corpus';
import { parseNote } from '../../src/data/contracts/note-format';
import { redispatchCase, replySequence, runOnDrive, runWithClaude, type CaseRun } from './corpus-run';
import { manifest } from './b1-planning-support';

// B9b (TL-P4-50 B9): the four delivered cases through production main and the corpus driver, selection then execution.
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

const FLAT = 'Projects/Flat hunt/Larkspur Lane flat.md';
const EARLIER = 'Projects/Flat hunt/Earlier listing.txt';
const VISIT = 'Projects/Garden visit/Saltmere visit.md';
const BOOKING = 'Projects/Garden visit/Visit booking.txt';
const PLOT = 'Areas/Home/Alex plot.md';
type Reply = { kind: string; v: number; things: unknown[]; lines?: Array<Record<string, unknown>> };

const load = (id: string) => loadCase(resolve(import.meta.dirname, '../../testing/corpus', id));
const replies = async (id: string): Promise<Reply[]> => JSON.parse(await readFile(join(import.meta.dirname, '../../testing/corpus', id, 'replies.json'), 'utf8')) as Reply[];
/** Every model call the run makes, by phase. */
function counted(spawn: ReturnType<typeof replySequence>) {
  const calls: string[] = [];
  return { calls, spawn: async (call: Parameters<typeof spawn>[0]) => {
    calls.push(JSON.parse(call.input.split('\n').at(-1) ?? '{}').selection === undefined ? 'selection' : 'execution');
    return spawn(call);
  } };
}
/** The edit operations a run's manifest holds for one note. */
const editsOf = (run: CaseRun, path: string) => manifest(run).operations.filter((o) => o.effect.kind === 'edit-text' && (o.effect as { path?: string }).path === path);
const pressOne = (run: CaseRun): CaseRun => run.runs?.[0] ?? run;

it('AC12 control: the flat case files the later listing with an ordinary line', async () => {
  const c = await load('c17-b9-contradiction-two-sources');
  const [first, second] = await replies(c.id);
  const ordinary = { ...first, lines: first?.lines?.map(({ marker: _m, alsoCites: _a, ...line }) => line) };
  const run = pressOne(await runWithClaude(c, replySequence([ordinary, second])));
  expect(run.code).toBe(0);
  expect(run.after[FLAT]).toContain('Neither is confirmed. · [[Later listing.txt]]');
  expect(run.after[EARLIER]).toBe(c.folder[EARLIER]);
});

it('AC12 c17-b9-contradiction-two-sources: one contradiction with both rents, both sources and nothing on the second press', async () => {
  const c = await load('c17-b9-contradiction-two-sources');
  const { calls, spawn } = counted(replySequence(await replies(c.id)));
  const final = await runWithClaude(c, spawn);
  const first = pressOne(final);
  expect(first.code, 'two distinct bound sources materialize before authoring').toBe(0);
  const entries = parseNote(FLAT, first.after[FLAT] ?? '').timeline;
  expect(entries).toHaveLength(2);
  expect(entries[1]).toEqual({ date: '2026-10-07', source: 'Later listing.txt',
    text: 'Contradiction: Earlier terms give 1,450; later terms give 1,580 from 2026-11-01, per month. Neither is confirmed. (also from [[Earlier listing.txt]])' });
  expect(first.after[FLAT]).toContain('Alex likes the kitchen window.');
  expect(first.after[EARLIER]).toBe(c.folder[EARLIER]);
  expect(calls.slice(0, 2), 'selection then execution, no retry').toEqual(['selection', 'execution']);
  expect(final.after[FLAT], 'the second press adds nothing').toBe(first.after[FLAT]);
  expect(final.score?.unmet).toEqual([]);
  expect(editsOf(first, FLAT), 'one edit for the flat note').toHaveLength(1);
  // A done redispatch makes no model call and no write.
  const done = await redispatchCase(c, first, 2, { claude: () => { throw new Error('A done redispatch must not call a model.'); } });
  expect(done.after[FLAT]).toBe(first.after[FLAT]);
});

/** Press 1 files the later listing with its line; a fresh press repeats the same line, citing the filed listing. */
async function freshPress(marked: boolean) {
  const c = await load('c17-b9-contradiction-two-sources');
  const [reply, second] = await replies(c.id);
  const line = (l: Record<string, unknown>) => (marked ? l : (({ marker: _m, alsoCites: _a, ...rest }) => rest)(l));
  const first = { ...reply, lines: reply?.lines?.map(line) } as Reply;
  const final = await runWithClaude(c, replySequence([first, second]));
  expect(final.code).toBe(0);
  const filed = Object.entries(final.pathsById).find(([, path]) => path === 'Projects/Flat hunt/Later listing.txt')?.[0];
  expect(filed, 'the later listing was filed').toBeDefined();
  const { calls, spawn } = counted(replySequence([{ ...first, things: [], lines: first.lines?.map((l) => ({ ...l, cites: filed })) }]));
  const again = await runOnDrive(c, final.drive, final.root, { claude: spawn,
    request: { kind: 'tidy', text: 'Record the same disagreement only if it is not already in the flat note.' }, pacing: { baseMs: 0, sleep: async () => {} } }, 3);
  expect(again.code, 'the repeated line is valid input: it is already present').toBe(0);
  expect(calls, 'selection then execution, no validation retry').toEqual(['selection', 'execution']);
  expect(again.after[FLAT], 'no second line').toBe(final.after[FLAT]);
  const rows = ((again.lastRun as { run?: { report?: { updated?: Array<{ path: string }> } } })?.run?.report?.updated ?? []).map((r) => r.path);
  expect(rows, 'no updated row for a line already there').not.toContain(FLAT);
}
it('AC12 control: an ordinary line repeated on a fresh press is a no-op', async () => { await freshPress(false); });
it('AC12 b9-fresh-press-dedup: the same marked line on a fresh press is a no-op, found by its final text (R20)', async () => { await freshPress(true); });

it.each([
  ['one source', (line: Record<string, unknown>) => { delete line.alsoCites; }],
  ['a basename', (line: Record<string, unknown>) => { line.alsoCites = ['Earlier listing.txt']; }],
  ['the new source itself', (line: Record<string, unknown>) => { line.alsoCites = ['Inbox/Later listing.txt']; }],
])('AC12 c17-b9-contradiction-two-sources refuses %s before any write', async (_name, mutate) => {
  const c = await load('c17-b9-contradiction-two-sources');
  const [first] = await replies(c.id);
  const line = { ...first?.lines?.[0] };
  mutate(line);
  const inputs: string[] = [];
  const spawn = replySequence([{ ...first, lines: [line] }]);
  const run = pressOne(await runWithClaude(c, async (call) => { inputs.push(call.input); return spawn(call); }));
  expect(run.code).toBe(1);
  expect(run.after[FLAT]).toBe(c.folder[FLAT]);
  const retry = inputs.find((input) => /^Your reply was refused:/m.test(input)) ?? '';
  expect(retry, 'refused through the retry, by the marker rules').toMatch(/^Your reply was refused:/m);
  expect(retry).not.toContain('a line with keys outside the intent');
});

it('AC13 control: the visit case with ordinary lines is one edit and keeps the booking and Alex\'s words', async () => {
  const c = await load('c17-b9-uncertain-and-inferred');
  const [first] = await replies(c.id);
  const run = await runWithClaude(c, replySequence([{ ...first, lines: first?.lines?.map(({ marker: _m, alsoCites: _a, ...line }) => line) }]));
  expect(run.code).toBe(0);
  expect(run.after[VISIT]).toContain('Alex plans to bring a sketchbook.');
  expect(run.after[BOOKING]).toBe(c.folder[BOOKING]);
  expect(parseNote(VISIT, run.after[VISIT] ?? '').timeline).toHaveLength(3);
});

it('AC13 c17-b9-uncertain-and-inferred: an uncertain and an inferred line in one edit, nothing claimed cancelled', async () => {
  const c = await load('c17-b9-uncertain-and-inferred');
  const before = parseNote(VISIT, c.folder[VISIT] ?? '').timeline;
  const run = await runWithClaude(c, replySequence(await replies(c.id)));
  expect(run.code, 'uncertainty and a grounded nonnumeric inference are accepted together').toBe(0);
  expect(parseNote(VISIT, run.after[VISIT] ?? '').timeline).toEqual([...before,
    { date: '2026-10-07', source: 'Garden notice.txt', text: 'Uncertain: The garden may close if heavy rain is forecast; no decision has been made.' },
    { date: '2026-10-07', source: 'Garden notice.txt', text: 'The confirmed visit may be affected; the booking has not been cancelled. (inferred) (also from [[Visit booking.txt]])' }]);
  expect(editsOf(run, VISIT), 'two lines for one note are one edit').toHaveLength(1);
  expect(run.after[BOOKING]).toBe(c.folder[BOOKING]);
  expect(run.score?.unmet).toEqual([]);
});

it('AC14 guard c17-b9-legacy-readable: old and unknown marker text stays byte for byte', async () => {
  const c = await load('c17-b9-legacy-readable');
  const run = await runWithClaude(c, replySequence(await replies(c.id)));
  expect(run.code).toBe(0);
  for (const [path, text] of Object.entries(c.folder)) expect(run.after[path], path).toBe(text);
  expect(run.score?.unmet).toEqual([]);
});

it('AC14 guard c17-b9-person-list-kept: one exact ordinary star splice, and the replay adds nothing', async () => {
  const c = await load('c17-b9-person-list-kept');
  const final = await runWithClaude(c, replySequence(await replies(c.id)));
  const first = pressOne(final);
  expect(first.code).toBe(0);
  expect(first.after[PLOT]).toBe(`${c.folder[PLOT]}* 2026-10-07 · The committee confirms the amber gate is open again. · [[Gate notice.txt]]\r\n`);
  expect(first.props[PLOT] ?? {}).not.toHaveProperty('by');
  expect(final.after[PLOT]).toBe(first.after[PLOT]);
  expect(final.after['Areas/Home/Private plans.md']).toBe(c.folder['Areas/Home/Private plans.md']);
  expect(final.score?.unmet).toEqual([]);
});

it.each([
  ['no Timeline', ''],
  ['a prose Timeline', '## Timeline\r\nPlain prose.\r\n'],
  ['a table Timeline', '## Timeline\r\n| Day | Event |\r\n| --- | --- |\r\n'],
  ['a fenced Timeline', '## Timeline\r\n```\r\n* Not a list\r\n```\r\n'],
])('AC14 guard c17-b9-person-non-list: %s is left as written while the notice is still filed', async (_name, section) => {
  const c = await load('c17-b9-person-list-kept');
  const text = `${(c.folder[PLOT] ?? '').split('## Timeline')[0]}${section}`;
  c.folder[PLOT] = text;
  const [first] = await replies(c.id);
  const run = pressOne(await runWithClaude(c, replySequence([first])));
  expect(run.code).toBe(0);
  expect(run.after[PLOT]).toBe(text);
  expect(run.after['Areas/Home/Gate notice.txt']).toBeDefined();
  const rows = (run.lastRun as { run?: { report?: { updated?: unknown[] } } })?.run?.report;
  expect(rows?.updated ?? []).toEqual([]);
});
