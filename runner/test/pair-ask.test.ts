/**
 * The live evidence of keep-one-not-asked (TL-P4-16 addendum, c3-pair-ask): Projects/Flat hunt holds "Flat 3, 12
 * Larkspur Lane" and "Flat 3 (second)", and a pile of words only says "Flat 3 at 12 Larkspur Lane: second viewing
 * booked for Saturday." Nothing is seeded: no question, no answer, and Bower's notes carry only the properties the
 * app writes. The model can ask about the two notes as a pair (by the notes it was shown; Bower stores their file
 * ids), and the pile's news can be a Timeline line on the note it is about, under the value gate, instead of a
 * new note. No live call.
 */
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { subjectOf } from '../../src/data/contracts/questions';
import type { ClaudeCall, ClaudeSpawn } from '../src/claude';
import { loadCorpus, type LoadedCase } from '../src/corpus';
import { runWithClaude, type CaseRun } from './corpus-run';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
afterEach(() => vi.restoreAllMocks());

const KEPT = 'Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md';
const OTHER = 'Projects/Flat hunt/Flat 3 (second).md';
const WORDS = 'Flat 3 at 12 Larkspur Lane: second viewing booked for Saturday.';
const NEWS = 'Second viewing booked for Saturday.';
const ASK = { text: 'Flat 3, 12 Larkspur Lane and Flat 3 (second) look like one flat. Keep one note?', yes: 'Yes, keep one', no: 'No, keep both' };

const envelope = (intent: unknown): string => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1000, duration_api_ms: 900, num_turns: 1, result: JSON.stringify(intent), usage: { input_tokens: 10, output_tokens: 10 } });
interface Shown { piles: Array<{ pileId: string; words: string; things: unknown[] }>; notes: Array<{ path: string }> }
const shownOf = (call: ClaudeCall): Shown => JSON.parse(call.input.split('\n').at(-1) ?? '{}') as Shown;
const reply = (intent: (shown: Shown) => unknown): ClaudeSpawn => async (call) => ({ code: 0, stderr: '', cut: null, stdout: envelope(intent(shownOf(call))) });

/** The c05 folder with no question and no answer, and the pile of words from the live evidence in the inbox. */
async function flatCase(): Promise<LoadedCase> {
  const c = (await loadCorpus(ROOT)).find((x) => x.id === 'c05-keep-one-note');
  if (!c) throw new Error('no c05-keep-one-note case');
  return { ...c, scope: 'all', questions: [], journal: [], inbox: [{ line: WORDS, files: [] }] };
}

const idOf = async (run: CaseRun, path: string): Promise<string> => (await run.drive.listAll(run.root)).find((f) => run.drive.pathOf(f.id, run.root) === path)?.id ?? '';
const questionsOf = (run: CaseRun): Array<{ id: string; text: string; yes: string; no: string }> => (JSON.parse(run.after['.bower/questions.json'] ?? '{"questions":[]}') as { questions: Array<{ id: string; text: string; yes: string; no: string }> }).questions;
const timelineOf = (text: string): string[] => (/## Timeline\n([\s\S]*)$/.exec(text)?.[1] ?? '').split('\n').filter((l) => l.startsWith('- '));

describe('two notes for one thing (keep-one-not-asked)', () => {
  it('two notes for one thing are asked as a pair', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await flatCase();
    // The pile becomes its own note as before; the two notes for one flat are asked about as a pair, by the notes shown.
    const run = await runWithClaude(c, reply((s) => ({
      kind: 'tidy-intent', v: 1, things: [],
      notes: [{ pileId: s.piles[0]?.pileId ?? '', to: 'Projects/Flat hunt', name: 'Flat 3, second viewing.md' }],
      asks: [{ notes: [KEPT, OTHER], ...ASK }],
    })));
    expect(run.code).toBe(0);
    // One question, with no link in its words, whose subject is the two notes by their file ids.
    const asked = questionsOf(run);
    expect(asked).toEqual([expect.objectContaining(ASK)]);
    expect(asked[0]?.text).not.toMatch(/\[\[|\]\]/);
    const subject = subjectOf(asked[0] ?? { id: '' });
    const ids = [await idOf(run, KEPT), await idOf(run, OTHER)].sort();
    expect(subject).toEqual({ kind: 'pair', by: 'id', notes: ids });
    // The report asks it; both notes stay until the person says yes.
    expect((run.lastRun as { run: { report: { questions: Array<{ text: string }> } } }).run.report.questions).toEqual([expect.objectContaining({ text: ASK.text })]);
    expect(OTHER in run.after).toBe(true);
  });

  it('a words-only pile can become a Timeline line', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await flatCase();
    // The value gate for words: news about a note shown is a line on it, citing the pile, and no new note.
    const cite = reply((s) => ({ kind: 'tidy-intent', v: 1, things: [], lines: [{ note: KEPT, text: NEWS, cites: s.piles[0]?.pileId ?? '' }] }));
    const run = await runWithClaude(c, cite);
    expect(run.code).toBe(0);
    expect(timelineOf(run.after[KEPT] ?? '')).toContain(`- 2026-10-07 · ${NEWS}`);
    const before = Object.keys(c.folder).filter((p) => p.endsWith('.md')).sort();
    // B8 (R8): the first maintaining run also creates Bower's health note.
    expect(Object.keys(run.after).filter((p) => p.endsWith('.md') && !p.startsWith('.bower/')).sort()).toEqual([...before, 'Bower health.md'].sort());
    // The pile went to the Bin once its line was written: the inbox is empty.
    expect(Object.keys(run.after).filter((p) => p.startsWith('Inbox/'))).toEqual([]);
    expect((run.lastRun as { run: { report: { updated: Array<{ path: string; what: string }> } } }).run.report.updated).toContainEqual(expect.objectContaining({ path: KEPT, what: NEWS }));

    // A line that cannot be written (the note is shown, but its text says it is the person's) keeps the pile whole.
    const theirs = { ...c, folder: { ...c.folder, [KEPT]: (c.folder[KEPT] ?? '').replace('by: bower\n', '') } };
    const held = await runWithClaude(theirs, cite, { [KEPT]: { by: 'bower' } });
    expect(held.after[KEPT]).toBe(theirs.folder[KEPT]);
    expect(Object.keys(held.after).filter((p) => p.startsWith('Inbox/'))).toContainEqual(expect.stringMatching(/^Inbox\//));
  });

  it('a words-only pile whose lines are all in its note already is already saved', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await flatCase();
    const cite = reply((s) => ({ kind: 'tidy-intent', v: 1, things: [], lines: [{ note: KEPT, text: NEWS, cites: s.piles[0]?.pileId ?? '' }] }));
    // The same news again, on a note that holds its line already: nothing is new, so it is saved already, as that note.
    const first = await runWithClaude(c, cite);
    const again = { ...c, folder: { ...c.folder, [KEPT]: first.after[KEPT] ?? '' } };
    const run = await runWithClaude(again, cite);
    expect(run.code).toBe(0);
    expect(run.after[KEPT]).toBe(again.folder[KEPT]);
    expect(Object.keys(run.after).filter((p) => p.startsWith('Inbox/'))).toEqual([]);
    const report = (run.lastRun as { run: { report: { filed: unknown[]; alreadySaved?: unknown[] } } }).run.report;
    expect(report.alreadySaved).toEqual([{ name: WORDS.slice(0, 40), as: 'Flat 3, 12 Larkspur Lane.md', notes: 1 }]);
    expect(report.filed).toEqual([]);
  });

  it('a yes to an older pair question whose note is in the Bin settles and names it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // The accepted app's question, in its words (two links), answered yes; the other note went to the Bin since.
    const c = (await loadCorpus(ROOT)).find((x) => x.id === 'c05-keep-one-note');
    if (!c) throw new Error('no c05-keep-one-note case');
    const binOther = async (drive: Parameters<NonNullable<Parameters<typeof runWithClaude>[3]>>[0], root: string): Promise<void> => {
      const other = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === OTHER);
      if (other) await drive.trash(other.id);
    };
    const run = await runWithClaude(c, reply(() => ({ kind: 'tidy-intent', v: 1, things: [] })), undefined, binOther);
    expect(run.code).toBe(0);
    // The answer settles: its question is closed, and the report says nothing was merged, and why.
    expect(questionsOf(run)).toEqual([]);
    expect(Object.keys(run.after).filter((p) => /^\.bower\/changes\/[^/]+\.json$/.test(p))).toEqual([]);
    // Not set aside (TL-P4-19 addendum 10): an answered row, on the note that stays.
    const report = (run.lastRun as { run: { report: { setAside: unknown[]; answered?: unknown[] } } }).run.report;
    expect(report.setAside).toEqual([]);
    expect(report.answered).toEqual([{ questionId: 'q-merge-flat-3', kind: 'pair', outcome: 'subject-gone', why: 'Not merged: Flat 3 (second) was already in the Bin.', note: KEPT }]);
  });
});
