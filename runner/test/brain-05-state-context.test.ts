/**
 * brain-05 (rulings in specs/brain-audit/brain-05-rulings.md): a Current state is replaced only when its whole section
 * was shown, and only on evidence; a Timeline line needs evidence whatever its words. Evidence is a cited thing, pile
 * or request, a checked "alsoCites", or the person's answer about that note in this run (R-B). A state that repeats the
 * note's own lines changes nothing and needs none. Prior art: Anthropic, "Reduce hallucinations" (ground claims in
 * supplied text) and Instructor's reask (a refusal says how to comply). Names are made up.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { note, run, setup, type Base } from './b1-planning-support';
import { AT } from './corpus-run';

const HOME = 'Areas/Home';
const ROOF = `${HOME}/Roof repair.md`;
const NAME = 'Roof payment.txt';
const APPROVED = 'Payment approved. Pine Roofing thanks Alex for the roof repair.';
const STATE = '## Current state\n- Payment pending.\n- Inspection due 20 October.\n\n## Timeline\n';
/** A long Timeline after a whole Current state: the note is cut, but not in its Current state. */
const LONG_TIMELINE = Array.from({ length: 60 }, (_, i) => `- 2026-09-${String((i % 28) + 1).padStart(2, '0')} · Alex checked the gutters again. · [[Gutter log ${i + 1}.txt]]\n`).join('');
/** An ownership/2 note whose Next steps come first and run past 4,000 characters, so its Current state is not shown. */
const B = (r: string) => `<!-- bower:ownership/2 begin ${r} -->`;
const E = (r: string) => `<!-- bower:ownership/2 end ${r} -->`;
const STEPS = Array.from({ length: 80 }, (_, i) => `- [ ] Alex checks roof tile row ${i + 1} for cracks and moss.`).join('\n');
const HIDDEN = ['---', 'bower_format: ownership/2', 'summary: Roof repair by Pine Roofing.', 'by: bower', '---',
  B('goal'), '## Goal', 'Repair the roof before winter.', E('goal'),
  B('next-steps'), '## Next steps', STEPS, E('next-steps'),
  B('current'), '- Payment pending.', '- Inspection due 20 October.', E('current'),
  B('personal'), '## My notes', 'Alex keeps the ladder in the shed.', E('personal'),
  B('timeline'), '## Timeline', E('timeline'),
  B('bower-note'), E('bower-note'), ''].join('\n');
const STATE_CUT = 'a state for a note whose Current state was cut where shown: give its change as a Timeline line only';
const STATE_UNCITED = 'a state that cites nothing: cite the thing or pile it is from';
const LINE_UNCITED = 'a Timeline line with no evidence, whatever its words: give "cites" (the thing, pile or request it is from), or with a marker its "alsoCites"';
const PROMPT = [
  'Every line needs this evidence, whatever its words: "cites", or with a marker its "alsoCites".',
  'Give one only when that note\'s whole Current state is shown, not cut.',
];

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

/** Areas/Home with the roof note as given; one thing in the inbox. */
async function house(roof: string): Promise<Base> {
  return setup({ folder: { [ROOF]: roof }, inbox: [{ line: '', files: [NAME] }], inboxFiles: { [NAME]: APPROVED } });
}
const source = (b: Base) => b.sources[0]?.itemId ?? '';
const selection = (b: Base) => ({ items: [{ itemId: source(b), kind: 'unknown', destination: b.id(HOME), wants: [b.id(ROOF)] }], asks: [] });
const line = (b: Base, text = 'Payment approved.') => ({ note: ROOF, text, cites: source(b), quotes: ['Payment approved.'] });
const filed = (b: Base, extra: Record<string, unknown> = {}) =>
  ({ kind: 'tidy-intent', v: 1, things: [{ fileId: source(b), to: HOME, name: NAME }], lines: [line(b)], ...extra });
const refusedWith = (r: Awaited<ReturnType<typeof run>>, why: string) => {
  expect(r.frames, 'refused once, then accepted').toHaveLength(3);
  expect(r.frames[2]?.call.input).toContain(`Your reply was refused: ${why}.`);
  expect(r.code, r.errors).toBe(0);
};

describe('brain-05 AC1 cut state cannot be replaced', () => {
  it('a state for a note whose Current state lies past the cut is refused; the retry gives a line only', async () => {
    const b = await house(HIDDEN);
    expect(HIDDEN.indexOf(B('current')), 'the Current state starts past 4,000 characters').toBeGreaterThan(4_000);
    const r = await run(b, [selection(b), filed(b, { states: [{ note: ROOF, lines: ['All work is complete.'], cites: source(b) }] }), filed(b)]);
    expect(r.frames[1]?.call.input, 'the note is cut where shown').toContain('[cut here: ');
    refusedWith(r, STATE_CUT);
    expect(r.after[ROOF]).toContain('- Inspection due 20 October.');
    expect(r.after[ROOF]).not.toContain('All work is complete.');
  });

  it('guard: a cut elsewhere in the note does not block a cited state', async () => {
    const b = await house(note('Roof repair by Pine Roofing.', STATE + LONG_TIMELINE, true));
    const r = await run(b, [selection(b), filed(b, { states: [{ note: ROOF, lines: ['Payment approved.', 'Inspection due 20 October.'], cites: source(b), quotes: ['Payment approved.'] }] })]);
    expect(r.frames[1]?.call.input, 'the note is cut where shown').toContain('[cut here: ');
    expect(r.code, r.errors).toBe(0);
    expect(r.frames, 'accepted on the first reply').toHaveLength(2);
  });
});

describe('brain-05 AC2 state change requires evidence', () => {
  it('a whole shown Current state replaced with no citation is refused; the cited retry passes', async () => {
    const b = await house(note('Roof repair by Pine Roofing.', STATE, true));
    const lines = ['Payment approved.', 'Inspection due 20 October.'];
    const r = await run(b, [selection(b), filed(b, { states: [{ note: ROOF, lines }] }),
      filed(b, { states: [{ note: ROOF, lines, cites: source(b), quotes: ['Payment approved.'] }] })]);
    refusedWith(r, STATE_UNCITED);
  });

  it('guard: a state that repeats the note\'s own lines changes nothing and needs no citation', async () => {
    const b = await house(note('Roof repair by Pine Roofing.', STATE, true));
    const r = await run(b, [selection(b), filed(b, { states: [{ note: ROOF, lines: ['Payment pending.', 'Inspection due 20 October.'] }] })]);
    expect(r.code, r.errors).toBe(0);
    expect(r.frames, 'accepted on the first reply').toHaveLength(2);
  });
});

describe('brain-05 AC3 timeline citation does not depend on prefix', () => {
  it.each(['Payment approved by Alex.', 'New: Payment approved by Alex.'])('"%s" with no evidence is refused; the cited retry passes', async (text) => {
    const b = await house(note('Roof repair by Pine Roofing.', STATE, true));
    const r = await run(b, [selection(b), filed(b, { lines: [line(b), { note: ROOF, text }] }), filed(b)]);
    refusedWith(r, LINE_UNCITED);
  });

  it('the instructions say every line needs evidence and a state needs its whole section shown', async () => {
    const b = await house(note('Roof repair by Pine Roofing.', STATE, true));
    const r = await run(b, [selection(b), filed(b)]);
    const prompt = (r.frames[1]?.prompt ?? '').replace(/\n\s*/g, ' ');
    for (const sentence of PROMPT) expect(prompt.includes(sentence), sentence).toBe(true);
  });
});
