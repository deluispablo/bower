import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadCase, loadCorpus } from '../src/corpus';
import { parseNote } from '../../src/data/contracts/note-format';
import { replySequence, runWithClaude, type CaseRun } from './corpus-run';
import { manifest } from './b1-planning-support';

// B9b (TL-P4-50 B9): the two retained cases through production main and the corpus driver, selection then execution.
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

const VISIT = 'Projects/Garden visit/Saltmere visit.md';
const BOOKING = 'Projects/Garden visit/Visit booking.txt';
const PLOT = 'Areas/Home/Alex plot.md';
type Reply = { kind: string; v: number; things: unknown[]; lines?: Array<Record<string, unknown>> };

const load = (id: string) => loadCase(resolve(import.meta.dirname, '../../testing/corpus', id));
const replies = async (id: string): Promise<Reply[]> => JSON.parse(await readFile(join(import.meta.dirname, '../../testing/corpus', id, 'replies.json'), 'utf8')) as Reply[];
/** The edit operations a run's manifest holds for one note. */
const editsOf = (run: CaseRun, path: string) => manifest(run).operations.filter((o) => o.effect.kind === 'edit-text' && (o.effect as { path?: string }).path === path);
const pressOne = (run: CaseRun): CaseRun => run.runs?.[0] ?? run;

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

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
const RETIRED = ['contradiction-two-sources', 'legacy-readable'].map((s) => `c17-b9-${s}`);
it('corpus-delete-b9 AC3: B9 executes only its retained capability cases', async () => {
  const ids = (await loadCorpus(ROOT)).map((c) => c.id);
  for (const id of RETIRED) {
    expect(existsSync(join(ROOT, id)), id).toBe(false);
    expect(ids).not.toContain(id);
  }
  expect(ids).toEqual(expect.arrayContaining(['c17-b9-uncertain-and-inferred', 'c17-b9-person-list-kept']));
});
