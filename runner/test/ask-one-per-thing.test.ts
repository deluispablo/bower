/**
 * One open question per thing (TL-P4-11 addendum, `ask-one-per-thing`). A question is keyed by what it is about (the
 * thing's fileId, or a pile's id, with the content hash for the same file uploaded again), never by its words; a thing
 * that leaves the inbox closes its question. No live call: `claude` is answered by scripted proposals.
 */
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClaudeSpawn } from '../src/claude';
import { loadCorpus, type LoadedCase } from '../src/corpus';
import { runScripted, runWithClaude } from './corpus-run';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
afterEach(() => vi.restoreAllMocks());

interface Context { piles: Array<{ pileId: string; words: string; things: Array<{ fileId: string; name: string }> }> }
const contextOf = (input: string): Context => JSON.parse(input.split('\n').at(-1) ?? '{}') as Context;
const envelope = (result: unknown): string => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1000, duration_api_ms: 900, num_turns: 1, result, usage: { input_tokens: 10, output_tokens: 10 } });
type Id = (name: string) => string;
const answering = (make: (id: Id) => unknown): ClaudeSpawn => async (call) => {
  const ids = new Map(contextOf(call.input).piles.flatMap((p) => p.things).map((t) => [t.name, t.fileId]));
  return { code: 0, stderr: '', cut: null, stdout: envelope(JSON.stringify(make((name) => ids.get(name) ?? `no ${name}`))) };
};

async function offerAndFlat(): Promise<LoadedCase> {
  const c = (await loadCorpus(ROOT)).find((x) => x.id === 'c04-offer-and-flat');
  if (!c) throw new Error('no corpus case c04-offer-and-flat');
  return c;
}
/** Asks about the photo (filing the payslip of its pile when it is there, as a first ask does). */
const asking = (text: string): ClaudeSpawn => answering((id) => ({
  kind: 'tidy-intent',
  v: 1,
  things: id('Payslip_Aug.pdf').startsWith('no ') ? [] : [{ fileId: id('Payslip_Aug.pdf'), to: 'Resources/Pay', name: 'Payslip August.pdf', note: { name: 'Payslip, August.md', summary: 'A payslip for August.', body: 'Payslip for August.' } }],
  asks: [{ fileId: id('IMG_2301.jpg'), text, yes: 'Yes', no: 'No' }],
}));
interface Open { id: string; text: string; subject?: string; hash?: string }
const openOf = (after: Record<string, string>): Open[] => (JSON.parse(after['.bower/questions.json'] ?? '{}') as { questions: Open[] }).questions;
const photoPile = { line: 'The flat viewing, and the payslip.', files: ['IMG_2301.jpg', 'Payslip_Aug.pdf'] };
const otherPile = { line: 'A flat listing.', files: ['listing-88213.example.url'] };

describe('one open question per thing (TL-P4-11 addendum)', () => {
  it('two differently worded asks about one thing give one question', async () => {
    const c = await offerAndFlat();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const first = await runWithClaude({ ...c, inbox: [photoPile] }, asking('Is the kitchen photo from the Wrenfield Road viewing?'));
    expect(openOf(first.after)).toHaveLength(1);
    const second = await runWithClaude({ ...c, inbox: [photoPile], questions: openOf(first.after) as never }, asking('Was this kitchen picture taken at the flat viewing?'));
    expect(second.code).toBe(0);
    expect(openOf(second.after).map((q) => q.text)).toEqual(['Is the kitchen photo from the Wrenfield Road viewing?']);
  });

  it('a thing that leaves the inbox closes its question', async () => {
    const c = await offerAndFlat();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const first = await runWithClaude({ ...c, inbox: [otherPile, photoPile] }, asking('Is the kitchen photo from the Wrenfield Road viewing?'));
    expect(openOf(first.after)).toHaveLength(1);
    // The photo is binned (it is not in the inbox any more); something else is tidied.
    const second = await runWithClaude({ ...c, inbox: [otherPile], questions: openOf(first.after) as never }, answering(() => ({ kind: 'tidy-intent', v: 1, things: [] })));
    expect(openOf(second.after)).toEqual([]);
  });

  it('an answer whose subject left is settled', async () => {
    const c = await offerAndFlat();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const first = await runWithClaude({ ...c, inbox: [otherPile, photoPile] }, asking('Is the kitchen photo from the Wrenfield Road viewing?'));
    const before = openOf(first.after);
    expect(before).toHaveLength(1);
    // The person says yes, and then takes the photo out of the inbox before any tidy-up takes it.
    const second = await runWithClaude({ ...c, inbox: [otherPile], journal: [{ kind: 'answer', text: 'yes', questionId: before[0]?.id ?? '' }], questions: before as never }, answering(() => ({ kind: 'tidy-intent', v: 1, things: [] })));
    expect(second.code).toBe(0);
    expect(openOf(second.after)).toEqual([]);
    // Its answer is settled with its question: archived, not left waiting among your changes.
    expect(Object.keys(second.after).filter((p) => p.startsWith('.bower/changes/') && !p.startsWith('.bower/changes/archive/'))).toEqual([]);
    expect(Object.keys(second.after).filter((p) => p.startsWith('.bower/changes/archive/'))).toHaveLength(1);
  });

  it('a re-upload of the same thing adds no question', async () => {
    const c = await offerAndFlat();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const first = await runWithClaude({ ...c, inbox: [...Array.from({ length: 6 }, (_, n) => ({ ...otherPile, line: `A listing ${n}.` })), photoPile] }, asking('Is the kitchen photo from the Wrenfield Road viewing?'));
    const before = openOf(first.after);
    expect(before).toHaveLength(1);
    // After a reset the same bytes come back under a new fileId (another file is added first, so the ids shift).
    const second = await runWithClaude({ ...c, inbox: [otherPile, photoPile], questions: before as never }, asking('Was this taken at the viewing?'));
    expect(second.code).toBe(0);
    // The one question stays, now about the new file.
    expect(openOf(second.after)).toEqual([expect.objectContaining({ id: before[0]?.id, text: before[0]?.text, hash: before[0]?.hash })]);
    expect(openOf(second.after)[0]?.subject).not.toBe(before[0]?.subject);
  });

  it('an instructions run keeps an open thing question', async () => {
    const c = await offerAndFlat();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const first = await runWithClaude({ ...c, inbox: [photoPile] }, asking('Is the kitchen photo from the Wrenfield Road viewing?'));
    const before = openOf(first.after);
    expect(before).toHaveLength(1);
    const other = { id: 'q-other', text: 'Other?', yes: 'Yes', no: 'No', askedAt: 1 };
    const second = await runScripted({ ...c, scope: 'instructions', inbox: [{ line: '', files: ['IMG_2301.jpg'] }], journal: [{ kind: 'answer', text: 'no', questionId: 'q-other' }], questions: [...before, other] as never });
    expect(openOf(second.after).map((q) => q.id)).toEqual(before.map((q) => q.id));
  });

  it('a pile ask then a thing ask leave one question', async () => {
    const c = await offerAndFlat();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const pileAsk: ClaudeSpawn = async (call) => {
      const p = contextOf(call.input).piles.find((x) => x.things.some((t) => t.name === 'IMG_2301.jpg'));
      return { code: 0, stderr: '', cut: null, stdout: envelope(JSON.stringify({ kind: 'tidy-intent', v: 1, things: [], asks: [{ pileId: p?.pileId ?? 'none', text: 'Is this pile about the viewing?', yes: 'Yes', no: 'No' }] })) };
    };
    const first = await runWithClaude({ ...c, inbox: [photoPile] }, pileAsk);
    const before = openOf(first.after);
    expect(before).toHaveLength(1);
    const second = await runWithClaude({ ...c, inbox: [photoPile], questions: before as never }, asking('Was this kitchen picture taken at the flat viewing?'));
    expect(openOf(second.after)).toHaveLength(1);
    // And the other way round: a thing ask, then a pile ask.
    const third = await runWithClaude({ ...c, inbox: [photoPile] }, asking('Is the kitchen photo from the viewing?'));
    const fourth = await runWithClaude({ ...c, inbox: [photoPile], questions: openOf(third.after) as never }, pileAsk);
    expect(openOf(fourth.after)).toHaveLength(1);
  });
});
