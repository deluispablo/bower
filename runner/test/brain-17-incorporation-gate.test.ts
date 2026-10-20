/**
 * brain-17 (rulings in specs/brain-audit/brain-17-rulings.md): filing a thing beside a MOC is not incorporating it. A thing
 * with text still needs its note or a cited Timeline line on a note below that it updates or confirms; a MOC takes no line,
 * and the refusal says where the line goes instead. A thing that only repeats a fact a note already cites is incorporated
 * by that cited line, with no second note. Prior art: the existing value gate (TL-P4-08 addendum 2) and Instructor's
 * reask (a refusal says how to comply). Names are made up.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { note, run, setup, type Base } from './b1-planning-support';
import { AT } from './corpus-run';

const HOME = 'Areas/Home';
const MAP = `${HOME}/House map.md`;
const ROOF = `${HOME}/Roof repair.md`;
const MAP_TEXT = '---\nsummary: Map of house notes.\ntype: moc\nby: bower\n---\n## Overview\nHouse notes.\n';
const APPROVED = 'Payment approved. Pine Roofing thanks Alex for the roof repair.';
const NO_NOTE = 'a thing with text and no note: "Roof payment.txt" needs a "note", or a Timeline line citing it on a note below that it updates or confirms (never a MOC)';
const MOC_LINE = 'a line on a MOC, which takes none: give it on a note below that the thing updates or confirms, or give the thing its own "note"';
const PROMPT = 'A hub gets a Timeline line only when the thing is news for it. A note of type moc takes no line, and filing a thing beside one is not enough: it still needs its "note" or a line on another note below that it updates or confirms.';

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

/** Areas/Home with a Bower MOC and a compiled note on the roof repair; one thing in the inbox. */
async function house(roofTimeline = '', name = 'Roof payment.txt', words = APPROVED): Promise<Base> {
  return setup({ folder: {
    [MAP]: MAP_TEXT,
    [ROOF]: note('Roof repair by Pine Roofing.', `Payment pending.\n\n## Timeline\n${roofTimeline}`, true),
  }, inbox: [{ line: '', files: [name] }], inboxFiles: { [name]: words } });
}

const source = (b: Base) => b.sources[0]?.itemId ?? '';
/** The selection shows both notes: the MOC and the compiled note. */
const selection = (b: Base) => ({ items: [{ itemId: source(b), kind: 'unknown', destination: b.id(HOME), wants: [b.id(MAP), b.id(ROOF)] }], asks: [] });
const filed = (b: Base, name: string, lines: unknown[] = []) =>
  ({ kind: 'tidy-intent', v: 1, things: [{ fileId: source(b), to: HOME, name }], ...(lines.length ? { lines } : {}) });
const line = (b: Base, path: string, text: string) => ({ note: path, text, cites: source(b), quotes: ['Payment approved.'] });
const timeline = (text: string | undefined) => (text ?? '').split('\n').filter((l) => l.startsWith('- '));

describe('brain-17 AC1 hub membership cannot swallow new payment status', () => {
  it('filing beside a shown MOC with no note and no line is refused noNote; the retry puts the news on the compiled note', async () => {
    const b = await house();
    const r = await run(b, [selection(b), filed(b, 'Roof payment.txt'), filed(b, 'Roof payment.txt', [line(b, ROOF, 'Payment approved.')])]);
    expect(r.frames, 'the bare filing beside the MOC is refused once').toHaveLength(3);
    expect(r.frames[2]?.call.input).toContain(`Your reply was refused: ${NO_NOTE}.`);
    expect(r.code, r.errors).toBe(0);
    expect(timeline(r.after[ROOF])).toEqual([expect.stringMatching(/^- \d{4}-\d{2}-\d{2} · Payment approved\. · \[\[Roof payment\.txt\]\]$/)]);
    expect(r.after[`${HOME}/Roof payment.txt`], 'the original is the source record, byte for byte').toBe(APPROVED);
    expect(r.after[MAP], 'the MOC takes no line').toBe(MAP_TEXT);
    expect(Object.keys(r.after).filter((p) => p.startsWith(`${HOME}/`) && p.endsWith('.md')).sort()).toEqual([MAP, ROOF]);
  });
});

describe('brain-17 AC2 MOC Timeline advice is rejected consistently', () => {
  it('a line on the MOC is refused lineNote with advice to use a note it updates; the retry lands there', async () => {
    const b = await house();
    const r = await run(b, [selection(b), filed(b, 'Roof payment.txt', [line(b, MAP, 'Payment approved.')]),
      filed(b, 'Roof payment.txt', [line(b, ROOF, 'Payment approved.')])]);
    expect(r.frames, 'the line on the MOC is refused once').toHaveLength(3);
    expect(r.frames[2]?.call.input).toContain(`Your reply was refused: ${MOC_LINE}.`);
    expect(r.code, r.errors).toBe(0);
    expect(r.after[MAP]).toBe(MAP_TEXT);
    expect(timeline(r.after[ROOF])).toHaveLength(1);
  });

  it('the instructions say a MOC takes no line and filing beside it is not enough', async () => {
    const b = await house();
    const r = await run(b, [selection(b), filed(b, 'Roof payment.txt', [line(b, ROOF, 'Payment approved.')])]);
    const prompt = r.frames[1]?.prompt ?? '';
    expect(prompt.replace(/\n\s*/g, ' ').includes(PROMPT), 'the hub sentence goes on to say a MOC takes no line').toBe(true);
  });
});

describe('brain-17 AC3 demonstrably redundant evidence avoids duplicate compilation', () => {
  it('guard: a thing repeating a fact the compiled note already cites is incorporated by one cited line, with no new note', async () => {
    const before = '- 2026-10-01 · Payment approved. · [[Roof invoice.txt]]\n';
    const b = await house(before, 'Roof receipt.txt', 'Receipt. Payment approved. Pine Roofing, roof repair.');
    const r = await run(b, [selection(b), filed(b, 'Roof receipt.txt', [line(b, ROOF, 'The receipt confirms the payment was approved.')])]);
    expect(r.code, r.errors).toBe(0);
    expect(r.frames, 'accepted on the first reply').toHaveLength(2);
    expect(timeline(r.after[ROOF])).toEqual([before.trim(),
      expect.stringMatching(/^- \d{4}-\d{2}-\d{2} · The receipt confirms the payment was approved\. · \[\[Roof receipt\.txt\]\]$/)]);
    expect(r.after[`${HOME}/Roof receipt.txt`]).toBe('Receipt. Payment approved. Pine Roofing, roof repair.');
    expect(r.after[MAP]).toBe(MAP_TEXT);
    expect(Object.keys(r.after).filter((p) => p.startsWith(`${HOME}/`) && p.endsWith('.md')).sort()).toEqual([MAP, ROOF]);
  });
});
