/**
 * brain-06 (rulings in specs/brain-audit/brain-06-rulings.md): a model proposes a Current state change as lines it adds
 * and the exact lines it replaces; Bower retains every other line and the planner's one state-rewrite writes the result.
 * A replacement needs the cited thing's own words saying it corrects the line ("because"), or the person's answer about
 * that note; otherwise the old line stays and both claims go on the Timeline as a contradiction (the existing marker).
 * The state after the change keeps the 8-line write bound (R-5).
 * Prior art: Instructor's reask (a refusal says how to comply) and evaluating correctness and citation support
 * separately (Liu et al., "Evaluating Verifiability in Generative Search Engines"). Names are made up.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentStateOf, stateMark } from '../../src/data/contracts/note-edit';
import { note, run, setup, type Base } from './b1-planning-support';
import { AT } from './corpus-run';

const HOME = 'Areas/Home';
const ROOF = `${HOME}/Roof repair.md`;
const INVOICE = `${HOME}/Roof invoice.txt`;
const NAME = 'Roof letter.txt';
const WAS = ['Payment pending.', 'Inspection due 20 October.'];
/** Bower's own roof note, its Current state marked as Bower last wrote it; the pending claim is from the earlier invoice. */
const ROOF_NOTE = note('Roof repair by Pine Roofing.',
  `## Current state\n${WAS.map((x) => `- ${x}\n`).join('')}\n## Timeline\n- 2026-10-01 · Payment pending. · [[Roof invoice.txt]]\n`, true)
  .replace('by: bower\n', `by: bower\nbower_state: ${stateMark(WAS)}\n`);
const CORRECTION = 'This corrects the earlier pending status: payment was approved.';
const NEWER = 'Payment approved. Pine Roofing thanks Alex for the roof repair.';
const GUARANTEE = 'Pine Roofing guarantees the roof repair for two years.';
const UNKNOWN_LINE = 'a "replaces" line that is not one line of that note\'s Current state as shown: copy it word for word';
const UNSUPPORTED = 'a state that replaces a line with no "because": copy the thing\'s words that say it corrects that line, or keep the line and give a "contradiction" line';
const OVER_BOUND = 'a state that would hold more than 8 lines: give the change as a Timeline line only, or replace the line it corrects';
const PROMPT = [
  'Propose only additions or replacements of identified Current state lines',
  'Bower retains every other line.',
  'Replace a conflicting claim only with explicit supersession evidence, the thing\'s words copied in "because"; otherwise preserve it and record both claims as a contradiction.',
];

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

/** Areas/Home with the roof note and the earlier invoice; one letter in the inbox. */
async function house(letter: string): Promise<Base> {
  return setup({ folder: { [ROOF]: ROOF_NOTE, [INVOICE]: 'Pine Roofing invoice. Payment pending.' }, inbox: [{ line: '', files: [NAME] }], inboxFiles: { [NAME]: letter } });
}
const source = (b: Base) => b.sources[0]?.itemId ?? '';
const selection = (b: Base) => ({ items: [{ itemId: source(b), kind: 'unknown', destination: b.id(HOME), wants: [b.id(ROOF)] }], asks: [] });
const filed = (b: Base, text: string, extra: Record<string, unknown> = {}) =>
  ({ kind: 'tidy-intent', v: 1, things: [{ fileId: source(b), to: HOME, name: NAME }], lines: [{ note: ROOF, text, cites: source(b) }], ...extra });
const state = (b: Base, lines: string[], extra: Record<string, unknown> = {}) => ({ states: [{ note: ROOF, lines, cites: source(b), ...extra }] });
const stateOf = (text: string | undefined) => currentStateOf(new TextEncoder().encode(text ?? ''), undefined, true)?.lines;
const refusedWith = (r: Awaited<ReturnType<typeof run>>, why: string) => {
  expect(r.frames, 'refused once, then accepted').toHaveLength(3);
  expect(r.frames[2]?.call.input).toContain(`Your reply was refused: ${why}.`);
  expect(r.code, r.errors).toBe(0);
};

describe('brain-06 AC1 unmentioned deadline survives status update', () => {
  it('replacing the payment line keeps the inspection line exactly, in its place', async () => {
    const b = await house(CORRECTION);
    const r = await run(b, [selection(b), filed(b, 'Payment approved; this corrects the earlier pending status.',
      state(b, ['Payment approved.'], { replaces: ['Payment pending.'], because: CORRECTION }))]);
    expect(r.code, r.errors).toBe(0);
    expect(r.frames, 'accepted on the first reply').toHaveLength(2);
    expect(stateOf(r.after[ROOF])).toEqual(['Payment approved.', 'Inspection due 20 October.']);
  });

  it('a line added alone keeps every line already there', async () => {
    const b = await house(GUARANTEE);
    const r = await run(b, [selection(b), filed(b, 'Pine Roofing guarantees the repair for two years.', state(b, ['Repair guaranteed for two years.']))]);
    expect(r.code, r.errors).toBe(0);
    expect(stateOf(r.after[ROOF])).toEqual([...WAS, 'Repair guaranteed for two years.']);
  });

  it('a line that would take an 8-line state past the write bound is refused; the state stays as it was', async () => {
    const full = [...WAS, ...['gutters', 'chimney', 'skylight', 'flashing', 'fascia', 'soffit'].map((x) => `The ${x} was checked.`)];
    const b = await setup({ folder: { [ROOF]: ROOF_NOTE.replace(WAS.map((x) => `- ${x}\n`).join(''), full.map((x) => `- ${x}\n`).join('')).replace(stateMark(WAS), stateMark(full)),
      [INVOICE]: 'Pine Roofing invoice. Payment pending.' }, inbox: [{ line: '', files: [NAME] }], inboxFiles: { [NAME]: GUARANTEE } });
    const history = 'Pine Roofing guarantees the repair for two years.';
    const r = await run(b, [selection(b), filed(b, history, state(b, ['Repair guaranteed for two years.'])), filed(b, history)]);
    refusedWith(r, OVER_BOUND);
    expect(stateOf(r.after[ROOF])).toEqual(full);
  });
});

describe('brain-06 AC2 newer claim alone cannot supersede', () => {
  it('a replacement with no supersession evidence is refused; the old state stays and both claims are a contradiction', async () => {
    const b = await house(NEWER);
    const contradiction = { note: ROOF, text: 'The letter says payment was approved; the invoice says payment pending.', cites: source(b), marker: 'contradiction', alsoCites: [INVOICE] };
    const r = await run(b, [selection(b), filed(b, 'Payment approved.', state(b, ['Payment approved.'], { replaces: ['Payment pending.'] })),
      { ...filed(b, ''), lines: [contradiction] }]);
    refusedWith(r, UNSUPPORTED);
    expect(stateOf(r.after[ROOF])).toEqual(WAS);
    expect(r.after[ROOF]).toContain('Contradiction: The letter says payment was approved; the invoice says payment pending. (also from [[Roof invoice.txt]])');
  });
});

describe('brain-06 AC3 explicit correction replaces only its claim', () => {
  it('a correction the letter states replaces the pending line, with its history line, and keeps the rest', async () => {
    const b = await house(CORRECTION);
    const history = 'Payment approved; this corrects the earlier pending status.';
    const r = await run(b, [selection(b), filed(b, history, state(b, ['Payment approved.'], { replaces: ['Payment pending.'], because: CORRECTION }))]);
    expect(r.code, r.errors).toBe(0);
    expect(stateOf(r.after[ROOF])).toEqual(['Payment approved.', 'Inspection due 20 October.']);
    expect(r.after[ROOF]).toContain(`· ${history} · [[${NAME}]]`);
    expect(r.after[ROOF]).toContain('- 2026-10-01 · Payment pending. · [[Roof invoice.txt]]');
    expect(r.after[ROOF]).not.toContain('Contradiction:');
  });

  it('the instructions say what a state change may propose and when it may replace', async () => {
    const b = await house(CORRECTION);
    const r = await run(b, [selection(b), filed(b, 'Payment approved; this corrects the earlier pending status.')]);
    const prompt = (r.frames[1]?.prompt ?? '').replace(/\n\s*/g, ' ');
    for (const sentence of PROMPT) expect(prompt.includes(sentence), sentence).toBe(true);
  });
});

describe('brain-06 AC4 unknown old-line reference is refused', () => {
  it('a replacement naming a line not in the shown Current state is refused, and no state is written', async () => {
    const b = await house(CORRECTION);
    const r = await run(b, [selection(b), filed(b, 'Payment approved; this corrects the earlier pending status.',
      state(b, ['Payment approved.'], { replaces: ['Payment overdue.'], because: CORRECTION })),
    filed(b, 'Payment approved; this corrects the earlier pending status.')]);
    refusedWith(r, UNKNOWN_LINE);
    expect(stateOf(r.after[ROOF])).toEqual(WAS);
  });
});
