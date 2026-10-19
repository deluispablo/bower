import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadCase, loadCorpus } from '../src/corpus';
import { parseNote } from '../../src/data/contracts/note-format';
import { replySequence, runWithClaude, scoreCase, type CaseRun } from './corpus-run';
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
/** A case's row in a corpus table: the line that starts with its id cell. */
const row = (file: string, id: string): string | undefined => readFileSync(file, 'utf8').split('\n').find((line) => line.startsWith(`| ${id} |`));
it('corpus-delete-b9 AC3: B9 executes only its retained capability cases', async () => {
  const ids = (await loadCorpus(ROOT)).map((c) => c.id);
  for (const id of RETIRED) {
    expect(existsSync(join(ROOT, id)), id).toBe(false);
    expect(ids).not.toContain(id);
  }
  expect(ids).toEqual(expect.arrayContaining(['c17-b9-uncertain-and-inferred', 'c17-b9-person-list-kept']));
});

it('corpus-fix-b9 AC1: person-list case preserves CRLF and list bytes through replay', async () => {
  const c = await load('c17-b9-person-list-kept');
  const seed = c.folder[PLOT] ?? '';
  expect(seed.split('\r\n').some((line) => line.includes('\n')), 'every seeded line ends in CRLF').toBe(false);
  expect(seed.endsWith('\r\n* 1 Oct: Alex dug the first bed.\r\n* Keep the sketch beside the gate.\r\n')).toBe(true);
  const final = await runWithClaude(c, replySequence(await replies(c.id)));
  const first = pressOne(final);
  expect([first.code, final.code]).toEqual([0, 0]);
  expect(final.runs, 'the tidy-up, then the replay of its request').toHaveLength(1);
  expect(final.requestAction).toEqual({ kind: 'replay', id: 'change-1', outcome: 'redispatched' });
  expect(first.after[PLOT], 'every seeded byte, then one star line in CRLF').toBe(`${seed}* 2026-10-07 · The committee confirms the amber gate is open again. · [[Gate notice.txt]]\r\n`);
  expect(parseNote(PLOT, first.after[PLOT] ?? '').timeline.map((entry) => entry.text), 'the new line is counted once').toEqual(['1 Oct: Alex dug the first bed.', 'Keep the sketch beside the gate.', 'The committee confirms the amber gate is open again.']);
  expect(final.after, 'the replay changes nothing').toEqual(first.after);
  expect(final.props[PLOT] ?? {}).not.toHaveProperty('by');
  expect(scoreCase(c, final).unmet, 'both presses meet their expectations').toEqual([]);
  const rubric = readFileSync(join(ROOT, c.id, 'rubric.md'), 'utf8');
  expect(rubric, 'the rubric describes a landed proof').not.toMatch(/pending|preparation|B9c|proposed|unsupported/i);
  expect(rubric).toContain('The replay of the same request adds nothing.');
  expect(c.source).toBe('new (TL-P4-39 B9/U6; TL-P4-50 B9); runs through main in the B9 corpus tests');
  expect(row(join(ROOT, 'README.md'), c.id)).toBe('| c17-b9-person-list-kept | C17 / B9 | model | c05-timeline-list + TL-P4-32/-42; one personal byte append, star/CRLF and replay preserved |');
  expect(row(join(ROOT, '../fixtures/p4-method-rubric-changes.md'), c.id)).toBe('| c17-b9-person-list-kept | changed | Points 1–8 plus TL-P4-32/-42 and c05-timeline-list: one explicitly named sourced append uses the value gate and preserves prior star bullets, CRLF, quoted summary and prose; replay adds nothing, source syntax grants no authority, and the unnamed non-list note stays personal (corpus-fix-b9 AC1). |');
});

it('corpus-fix-b9 AC2: uncertainty and inference retain qualification and attribution', async () => {
  const c = await load('c17-b9-uncertain-and-inferred');
  const all = await replies(c.id);
  const [reply] = all;
  const run = await runWithClaude(c, replySequence(all));
  expect(run.code).toBe(0);
  expect(run.after[VISIT], 'every seeded byte, then the uncertain line and the inferred line with its second source').toBe(`${c.folder[VISIT] ?? ''}${[
    '- 2026-10-07 · Uncertain: The garden may close if heavy rain is forecast; no decision has been made. · [[Garden notice.txt]]',
    '- 2026-10-07 · The confirmed visit may be affected; the booking has not been cancelled. (inferred) (also from [[Visit booking.txt]]) · [[Garden notice.txt]]',
  ].join('\n')}\n`);
  const updated = (run.lastRun as { run?: { report?: { updated?: Array<{ path: string; what: string }> } } }).run?.report?.updated ?? [];
  expect(updated.map((r) => [r.path, r.what]), 'the report shows both qualifications').toEqual([
    [VISIT, 'Uncertain: The garden may close if heavy rain is forecast; no decision has been made.'],
    [VISIT, 'The confirmed visit may be affected; the booking has not been cancelled. (inferred) (also from Visit booking.txt)'],
  ]);
  expect(editsOf(run, VISIT)).toHaveLength(1);
  expect([run.after[BOOKING], run.after['Projects/Garden visit/Garden notice.txt']], 'both originals keep their bytes').toEqual([c.folder[BOOKING], c.inboxFiles['Garden notice.txt']]);
  expect(scoreCase(c, run).unmet).toEqual([]);
  const plain = await runWithClaude(c, replySequence([{ ...reply, lines: reply?.lines?.map(({ marker: _m, alsoCites: _a, ...line }) => line) }]));
  expect(plain.code).toBe(0);
  expect(scoreCase(c, plain).unmet, 'the same lines without their markers fail').toEqual([
    `${VISIT}: no Timeline line with "Uncertain: The garden may close if heavy rain is forecast; no decision has been made."`,
    `${VISIT}: no Timeline line with "The confirmed visit may be affected; the booking has not been cancelled. (inferred) (also from [[Visit booking.txt]])"`,
  ]);
  const certain = await runWithClaude(c, replySequence([{ ...reply, lines: [reply?.lines?.[0], { note: VISIT, text: 'The visit is cancelled.', cites: '$file:Garden notice.txt' }] }]));
  expect(certain.code).toBe(0);
  expect(scoreCase(c, certain).unmet, 'a line that invents a cancellation fails').toEqual([
    `${VISIT}: has "The visit is cancelled."`,
    `${VISIT}: no Timeline line with "The confirmed visit may be affected; the booking has not been cancelled. (inferred) (also from [[Visit booking.txt]])"`,
  ]);
  const rubric = readFileSync(join(ROOT, c.id, 'rubric.md'), 'utf8');
  expect(rubric, 'the rubric describes the supported fields').not.toMatch(/pending|preparation|B9c|proposed|unsupported/i);
  expect(rubric).toContain('The same lines without their markers, or a line that calls the visit\ncancelled, fail the expectations.');
  expect(c.source).toBe('new (TL-P4-39 B9/U6; TL-P4-50 B9); runs through main in the B9 corpus tests');
  expect(row(join(ROOT, 'README.md'), c.id)).toBe('| c17-b9-uncertain-and-inferred | C17 / B9 | model | TL-P4-39 B9/U6; explicit uncertainty and qualified inference, no asserted cancellation |');
  expect(row(join(ROOT, '../fixtures/p4-method-rubric-changes.md'), c.id)).toBe('| c17-b9-uncertain-and-inferred | changed | Points 1–8: fit the visit, carry conditional source news and a visibly qualified inference with relevant sources, no redundant note, cancellation, invented number, policy or schema; both entries share one bounded edit and a truthful existing update row; the same lines unqualified, or one calling the visit cancelled, fail (corpus-fix-b9 AC2). |');
});
