/**
 * qa-prod-8-F3: a contradiction may name the line's own note in "alsoCites" when the note itself states the other claim,
 * the usual case for a words or saved-link note that links no other file (specs/qa-prod-8/plan.md, F3). Prior art: W3C
 * PROV-DM (a claim's provenance is the entity it was taken from, https://www.w3.org/TR/prov-dm/); c07-same-period-rent's
 * rubric (each claim keeps its own source, no winner). Every run goes through production main on b1-planning-support's
 * made-up folders; only the model is replaced.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseNote } from '../../src/data/contracts/note-format';
import { REFUSALS } from '../src/claude';
import { empty, note, run, select, setup, type Base } from './b1-planning-support';
import { splitPrompt } from './corpus-run';

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

const VISIT = 'Projects/Garden visit/Visit.md';
const NOTICE = 'Garden notice.txt';
const VISIT_LINE = 'The visit note keeps the booking open; the garden notice says the garden may close.';
const CHOIR = 'Resources/Choir/Ferrowick Community Choir autumn subs.md';
const WORDS = 'Ferrowick Choir autumn subscription, 24 pounds, due 21 November.';
const CHOIR_LINE = 'The note gives 30 pounds due 24 November; the new words give 24 pounds due 21 November.';

/** A Bower note that states one claim and links no other file. */
const visit = () => setup({ folder: { [VISIT]: note('Alex records a garden visit.', '# Visit\n\nThe booking stays open.\n\n## Timeline\n', true) },
  inbox: [{ line: 'Update Visit from the garden notice.', files: [NOTICE] }], inboxFiles: { [NOTICE]: 'The garden may close if heavy rain is forecast.' } });
const visitIntent = (base: Base, line: Record<string, unknown>) => ({ ...empty,
  things: [{ fileId: base.sources[0]?.itemId, to: 'Projects/Garden visit', name: NOTICE }],
  lines: [{ note: VISIT, text: VISIT_LINE, cites: base.sources[0]?.itemId, marker: 'contradiction', ...line }] });
const added = (path: string, before: string | undefined, after: string | undefined) =>
  parseNote(path, after ?? '').timeline.slice(parseNote(path, before ?? '').timeline.length);
const refusal = (input: string | undefined): string | undefined => /^Your reply was refused: (.*)$/m.exec(input ?? '')?.[1];

describe('qa-prod-8-F3', () => {
  it('AC1 qa8-contradiction-names-own-note: the line\'s own note is the other claim\'s file', async () => {
    const base = await visit();
    const r = await run(base, [select(base, [base.id(VISIT)], 'Projects/Garden visit'), visitIntent(base, { alsoCites: [VISIT] })]);
    expect(refusal(r.frames[2]?.call.input), 'R1: accepted on the first execution call').toBeUndefined();
    expect(r.code).toBe(0);
    expect(r.frames).toHaveLength(2);
    expect(added(VISIT, base.c.folder[VISIT], r.after[VISIT])).toEqual([
      { date: '2026-10-07', text: `Contradiction: ${VISIT_LINE} (also from [[Visit]])`, source: NOTICE }]);
  });

  it('AC2 qa8-choir-shaped-pile-files: a words pile that contradicts a saved note is filed as one Contradiction line', async () => {
    const base = await setup({ folder: { [CHOIR]: note('Alex pays the choir subscription each autumn.',
      '# Ferrowick Community Choir autumn subs\n\nAutumn subscription 30 pounds, due 24 November.\n\n## Timeline\n', true) },
    inbox: [{ line: WORDS, files: [] }] });
    const pile = base.sources[0]?.itemId;
    const line = { note: CHOIR, text: CHOIR_LINE, cites: pile, marker: 'contradiction', alsoCites: [CHOIR] };
    // The same reply answers the execution call and any retry. On the base its one pile is refused twice, so the run fails.
    const r = await run(base, [select(base, [base.id(CHOIR)], 'Resources/Choir'), { ...empty, lines: [line] }]);
    expect(r.errors, 'R1: neither refused nor dropped').not.toMatch(/lineAlsoCites|drops a pile/);
    expect(r.code).toBe(0);
    expect(r.wire?.statuses.at(-1)?.phase).toBe('done');
    expect(Object.keys(r.after).filter((path) => path.startsWith('Inbox/')), 'the pile leaves the inbox').toEqual([]);
    // A words pile has no file to link: the line carries no end source.
    expect(added(CHOIR, base.c.folder[CHOIR], r.after[CHOIR])).toEqual([
      { date: '2026-10-07', text: `Contradiction: ${CHOIR_LINE} (also from [[Ferrowick Community Choir autumn subs]])` }]);
  });

  it('AC3 qa8-prompt-and-reasons-name-own-note: the prompt and the reasons say the line\'s own note is allowed', async () => {
    const base = await visit();
    const r = await run(base, [select(base, [base.id(VISIT)], 'Projects/Garden visit'), visitIntent(base, {})]);
    const instructions = splitPrompt(r.frames[1]?.prompt ?? '').instructions;
    expect(instructions, 'the execution prompt was sent').toMatch(/You plan one Bower tidy-up/);
    expect(instructions, 'R2: the other claim\'s file may be the line\'s own note').toMatch(/"alsoCites"[^.]*own note[^.]*ask nothing/);
    expect(instructions, 'c07-prompt R1 still holds').toMatch(/marker "contradiction"[^.]*"alsoCites"[^.]*ask nothing/);
    expect(REFUSALS.lineAlsoCites, 'R3: the catalogue').toMatch(/the line's own note/);
    expect(r.code, 'a contradiction with no "alsoCites" is still refused').toBe(1);
    expect(refusal(r.frames[2]?.call.input), 'R3: the rule\'s own sentence').toMatch(/^a contradiction that [^:]*the line's own note/);
  });
});
