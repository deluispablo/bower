/**
 * A note written from a pile of words (words-note-summary AC2): the reply's `notes` row may give a summary in Bower's
 * words; one that copies the person's words, or holds a figure they never wrote, is refused and asked again, through main.
 */
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCase, type LoadedCase } from '../src/corpus';
import { REFUSALS } from '../src/claude';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { frontValues, scalarOf } from '../../src/data/contracts/note-format';
import { AT, caseReplies, runWithClaude, scoreCase, type CaseRun } from './corpus-run';

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
const CASE = 'b23-summary-words';
const COPIES = 'a summary that copies the person\'s words: say in a few words of your own what the note is about, or leave summary out';
const FIXED = 'Written from a note you added.';
const NOTE = 'Resources/Gardening/Garden bed.md';
const LONG = 'Alex plans a raised garden bed by the shed, with mulch from the gate pile and the amber labels on every row.';

/** Each refusal main logged before asking once more: its kind and the reason it gave. */
const refusals = () => vi.mocked(console.error).mock.calls.flatMap((args) => args.map(String))
  .flatMap((line) => { const m = /was refused \((\w+)\): (.*); asking once more/.exec(line); return m ? [{ kind: m[1] ?? '', why: m[2] ?? '' }] : []; });

/** The made-up garden case with one pile of `words` only, filed by a reply whose notes row gives `summary`, then by one with none. */
async function filed(words: string, summary: string) {
  const base = await loadCase(join(ROOT, CASE));
  const c: LoadedCase = { ...base, expected: {}, inbox: [{ line: words, files: [] }] };
  const row = { pileId: 'p-1', to: 'Resources/Gardening', name: 'Garden bed.md' };
  // The first answer gives the summary; the retry after a refusal leaves it out.
  const run = await runWithClaude(c, phaseAwareClaude((_call, _step, attempt) =>
    reply({ kind: 'tidy-intent', v: 1, things: [], notes: [attempt === 0 ? { ...row, summary } : row] })));
  expect(run.code).toBe(0);
  return { run, note: run.after[NOTE] ?? '' };
}
/** The two summary corpus cases (corpus-fix-b23-summaries), person-lint first: the filed note and the personal note beside it. */
const SUMMARY_CASES = [
  { id: 'b23-summary-person-lint', note: 'Resources/Gardening/Mulch notice.md', name: 'Mulch notice',
    summary: 'Mulch: collection at #amber.', personal: 'Resources/Gardening/Plot diary.md', personalName: 'Plot diary' },
  { id: 'b23-summary-words', note: NOTE, name: 'Garden bed',
    summary: 'Alex\'s garden bed plan: the "amber" label, #mulch by the gate.', personal: 'Resources/Gardening/Personal plan.md', personalName: 'Personal plan' },
] as const;
const createdRows = (run: CaseRun, key: 'created' | 'updated'): string[] =>
  (JSON.parse(run.after['.bower/last-run.json'] ?? '{}') as { run?: { report?: Record<string, Array<{ path: string }>> } })
    .run?.report?.[key]?.map((r) => r.path) ?? [];

const summaryOf =(note: string) => /^summary: (.*)$/m.exec(note)?.[1]?.replace(/^"|"$/g, '');

describe('a words note\'s summary', () => {
  it.each([
    ['equals the pile', LONG, LONG],
    ['is a short pile minus its final period', 'Buy milk on Friday.', 'buy milk on Friday'],
    ['contains a pile of 20+ plain characters', 'Shed key under the blue pot.', 'A note: the shed key under the blue pot, by the door.'],
    ['shares a 60+ character run with the pile', LONG, `Plans: ${LONG.slice(12, 80)}.`],
    ['is a prefixed copy', LONG, `Alex: ${LONG.slice(0, 66)}`],
  ])('AC2: a summary that %s is refused noteSummary with its own rule, then the fixed line is written', async (_, words, summary) => {
    const { note } = await filed(words, summary);
    expect(refusals()).toEqual([{ kind: 'noteSummary', why: COPIES }]);
    expect(summaryOf(note)).toBe(FIXED);
  });

  it('AC2: "A reminder to buy milk" for the pile "Milk" is accepted and written', async () => {
    const { note } = await filed('Milk', 'A reminder to buy milk');
    expect(refusals()).toEqual([]);
    expect(summaryOf(note)).toBe('A reminder to buy milk');
    expect(note).toContain('\nMilk\n');
  });

  it('AC2: a figure the pile never gives is refused numbers', async () => {
    const { note } = await filed('The boiler service costs 80 in November.', 'What the boiler service costs: 95.');
    expect(refusals()).toEqual([{ kind: 'numbers', why: REFUSALS.numbers }]);
    expect(summaryOf(note)).toBe(FIXED);
  });

  it('AC2: a link with no reason in a words summary is refused noteLink, the thing-note rule', async () => {
    const { note } = await filed(LONG, 'See also [[Gardening]]');
    expect(refusals().map((r) => r.kind)).toEqual(['noteLink']);
    expect(summaryOf(note)).toBe(FIXED);
  });

  it('ruling 2: the corpus case\'s note holds the reply\'s summary as one scalar and the pile\'s words as its body', async () => {
    const c = await loadCase(join(ROOT, CASE));
    const run = await runWithClaude(c, caseReplies(CASE));
    expect(refusals()).toEqual([]);
    const want = c.expected.notes?.find((n) => n.path === NOTE)?.contains ?? [];
    expect(want.join('\n')).not.toContain('Keep #mulch beside the gate in Saltmere; the path stays clear."');
    for (const text of want) expect(run.after[NOTE]).toContain(text);
  });

  it('corpus-fix-b23-summaries AC1: summary cases assert parsed scalar summaries in hidden context', async () => {
    for (const k of SUMMARY_CASES) {
      const c = await loadCase(join(ROOT, k.id)); const run = await runWithClaude(c, caseReplies(k.id));
      expect(run.code).toBe(0);
      expect({ id: k.id, unmet: scoreCase(c, run).unmet }).toEqual({ id: k.id, unmet: [] });
      expect(c.folder['index.md']).toBeUndefined(); expect(run.after['index.md']).toBeUndefined();
      expect(c.expected.notes?.map((n) => n.path)).not.toContain('index.md');
      expect(scalarOf(frontValues(run.after[k.note] ?? '')?.summary ?? '')).toBe(k.summary);
      const hidden = run.after['.bower/index.md'] ?? '';
      expect(hidden).toContain(`- [[${k.name}]] — ${k.summary}`); expect(hidden).not.toContain('[[index]]');
    }
    expect(refusals()).toEqual([]);
  });

  it('corpus-fix-b23-summaries AC2: personal notes remain personal and reports include actual bookkeeping', async () => {
    for (const k of SUMMARY_CASES) {
      const c = await loadCase(join(ROOT, k.id));
      expect(c.expected.report?.created).toEqual([k.note, 'Bower health.md']);
      expect(c.expected.report?.createdAtLeast).toBeUndefined(); expect(c.expected.report?.updated).toEqual([]);
      expect(c.expected.unchanged).toContain(k.personal); expect(c.rubric).toContain("Bower's health note");
      const run = await runWithClaude(c, caseReplies(k.id)); expect(run.code).toBe(0);
      expect(createdRows(run, 'created')).toEqual([k.note, 'Bower health.md']); expect(createdRows(run, 'updated')).toEqual([]);
      expect(run.after[k.personal]).toBe(c.folder[k.personal]); expect(Object.keys(frontValues(run.after[k.personal] ?? '') ?? {})).toEqual(['custom']);
      expect(run.after['Bower health.md']).toContain('by: bower');
      expect(run.after['.bower/index.md']).toContain(`- [[${k.personalName}]] — (no summary)`);
      expect(scoreCase(c, run).unmet).toEqual([]);
    }
  });
});
