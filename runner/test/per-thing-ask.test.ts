/**
 * Per-thing asks and the uniform retry (TL-P4-08 addendum 4, `per-thing-ask`). An ask names one thing (`fileId`) or a
 * pile (`pileId`): the things asked about stay in the inbox untouched with the pile's words, and the rest of the pile
 * is filed. Every validation refusal of the model's reply is asked again once with its reason, then ends as C12 does.
 * No live call: `claude` is answered by scripted proposals in the intent shape over the c04-offer-and-flat case.
 */
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STATE_LINE_MAX, STATE_LINES_MAX, stateLinesOk } from '../../src/data/contracts/note-edit';
import { REFUSALS, type ClaudeCall, type ClaudeSpawn, type RefusalKind } from '../src/claude';
import { loadCorpus, type LoadedCase } from '../src/corpus';
import { runWithClaude } from './corpus-run';

const ROOT = resolve(import.meta.dirname, '../../harness/corpus');

afterEach(() => vi.restoreAllMocks());

interface Context { piles: Array<{ pileId: string; words: string; things: Array<{ fileId: string; name: string }> }> }
const contextOf = (input: string): Context => JSON.parse(input.split('\n').at(-1) ?? '{}') as Context;
const envelope = (result: unknown): string => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1000, duration_api_ms: 900, num_turns: 1, result, usage: { input_tokens: 10, output_tokens: 10 } });

async function offerAndFlat(): Promise<LoadedCase> {
  const c = (await loadCorpus(ROOT)).find((x) => x.id === 'c04-offer-and-flat');
  if (!c) throw new Error('no corpus case c04-offer-and-flat');
  return c;
}

type Id = (name: string) => string;
type Thing = { fileId: string; to: string; name: string; note?: Record<string, unknown> } & Record<string, unknown>;
interface Intent { kind: string; v: number; things: Thing[]; notes?: unknown[]; lines?: unknown[]; asks?: unknown[] }

/** A reply that passes: every thing of the one pile filed, the offer with its note. */
function filed(id: Id): Intent {
  return {
    kind: 'tidy-intent',
    v: 1,
    things: [
      { fileId: id('Offer_letter_final(2).pdf'), to: 'Projects/Job hunt', name: 'Offer, Industrial Designer, Ferrowick.pdf', note: { name: 'Industrial Designer, Ferrowick.md', summary: 'An offer from Ferrowick.', body: 'Industrial designer, fully remote, 42,000 a year.' } },
      { fileId: id('listing-88213.example.url'), to: 'Projects/Flat hunt', name: 'Flat 9, Wrenfield Road.md' },
      { fileId: id('IMG_2301.jpg'), to: 'Projects/Flat hunt', name: 'Wrenfield Road, kitchen.jpg' },
      { fileId: id('Payslip_Aug.pdf'), to: 'Resources/Pay', name: 'Payslip August.pdf', note: { name: 'Payslip, August.md', summary: 'A payslip for August.', body: 'Payslip for August.' } },
    ],
  };
}

/** `claude` answering each call with the next of `replies` (the last one again after that), keeping the calls. */
function answering(replies: Array<(ctx: Context, id: Id) => string>, calls: ClaudeCall[] = []): ClaudeSpawn {
  return async (call) => {
    calls.push(call);
    const ctx = contextOf(call.input);
    const ids = new Map(ctx.piles.flatMap((p) => p.things).map((t) => [t.name, t.fileId]));
    const reply = replies[Math.min(calls.length, replies.length) - 1] ?? (() => '');
    return { code: 0, stderr: '', cut: null, stdout: reply(ctx, (name) => ids.get(name) ?? `no ${name}`) };
  };
}
const intentReply = (make: (ctx: Context, id: Id) => unknown) => (ctx: Context, id: Id): string => envelope(JSON.stringify(make(ctx, id)));

describe('per-thing asks (TL-P4-08 addendum 4)', () => {
  it('an ask about one thing leaves it in the inbox and files the rest of its pile', async () => {
    const c = await offerAndFlat();
    const question = { text: 'Is the kitchen photo from the Wrenfield Road viewing?', yes: 'Yes, that flat', no: 'No, another one' };
    const asking = intentReply((_ctx, id) => {
      const i = filed(id);
      return { ...i, things: i.things.filter((t) => t.fileId !== id('IMG_2301.jpg')), asks: [{ fileId: id('IMG_2301.jpg'), ...question }] };
    });
    const calls: ClaudeCall[] = [];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const run = await runWithClaude(c, answering([asking], calls));
    expect(run.code).toBe(0);
    expect(calls).toHaveLength(1);

    // The photo stays in the inbox untouched, with the pile's words beside it; the rest of the pile is filed.
    const inbox = Object.keys(run.after).filter((p) => p.startsWith('Inbox/')).sort();
    expect(inbox).toEqual([expect.stringMatching(/^Inbox\/[^/]+\/IMG_2301\.jpg$/), expect.stringMatching(/^Inbox\/[^/]+\/Pile note\.md$/)]);
    const photo = inbox[0] ?? '';
    const bytes = c.inboxBinary['IMG_2301.jpg'];
    expect(run.after[photo]).toBe(bytes ? new TextDecoder().decode(bytes) : c.inboxFiles['IMG_2301.jpg']);
    expect(run.after[inbox[1] ?? '']).toBe('Job offer and a flat near it. Compare the commute.\n');
    for (const p of ['Projects/Job hunt/Offer, Industrial Designer, Ferrowick.pdf', 'Projects/Job hunt/Industrial Designer, Ferrowick.md', 'Projects/Flat hunt/Flat 9, Wrenfield Road.md', 'Resources/Pay/Payslip August.pdf']) {
      expect({ p, there: p in run.after }).toEqual({ p, there: true });
    }

    // The question names the thing, in Bower's list and in the report, under an id of its own.
    const photoId = contextOf(calls[0]?.input ?? '').piles.flatMap((p) => p.things).find((t) => t.name === 'IMG_2301.jpg')?.fileId ?? '';
    const asked = { id: `q-ask-${photoId}`, ...question, about: photo };
    const open = (JSON.parse(run.after['.bower/questions.json'] ?? '{}') as { questions: unknown[] }).questions;
    expect(open).toEqual([expect.objectContaining(asked)]);
    const report = (run.lastRun as { run?: { report?: { questions?: unknown[]; filed?: unknown[] } } }).run?.report;
    expect(report?.questions).toEqual([expect.objectContaining(asked)]);
    expect(report?.filed).toHaveLength(3);

    // A later run asked about the same photo again: not asked twice, and it stays.
    const again = await runWithClaude({ ...c, questions: open as never, inbox: c.inbox }, answering([intentReply((_ctx, id) => ({ kind: 'tidy-intent', v: 1, things: [], asks: [{ fileId: id('IMG_2301.jpg'), ...question }] }))]));
    expect(again.code).toBe(0);
    expect((JSON.parse(again.after['.bower/questions.json'] ?? '{}') as { questions: unknown[] }).questions).toHaveLength(1);
  });

  it('the reply schema takes its state limits from note-edit', async () => {
    // One home for the Current state's limits (TL-P4-14 addendum 20): the method's short state, 8 lines of 200.
    expect({ lines: STATE_LINES_MAX, line: STATE_LINE_MAX }).toEqual({ lines: 8, line: 200 });
    const c = await offerAndFlat();
    const long = (n: number, size: number): string[] => Array.from({ length: n }, (_, k) => `${'Offer to answer, '.repeat(20)}${'abcdefgh'[k] ?? 'z'}`.slice(0, size - 1) + 'x');
    const stated = (lines: string[]) => intentReply((_ctx, id) => ({ ...filed(id), states: [{ note: 'Projects/Job hunt/Job hunt.md', lines, cites: id('Offer_letter_final(2).pdf') }] }));
    // The manifest contract and the reply judge the same state alike.
    expect(stateLinesOk([], long(STATE_LINES_MAX, STATE_LINE_MAX))).toBe(true);
    expect(stateLinesOk([], long(STATE_LINES_MAX + 1, STATE_LINE_MAX))).toBe(false);
    expect(stateLinesOk([], long(1, STATE_LINE_MAX + 1))).toBe(false);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const calls: ClaudeCall[] = [];
    const ok = await runWithClaude(c, answering([stated(long(STATE_LINES_MAX, STATE_LINE_MAX))], calls));
    expect({ code: ok.code, calls: calls.length }).toEqual({ code: 0, calls: 1 });
    // The prompt prints the limits it checks.
    expect(calls[0]?.input).toContain(`at most ${STATE_LINES_MAX} lines of at most`);
    expect(calls[0]?.input).toContain(`  ${STATE_LINE_MAX} characters with no link, only for a note below whose state`);
    for (const over of [long(STATE_LINES_MAX + 1, STATE_LINE_MAX), long(1, STATE_LINE_MAX + 1)]) {
      const asked: ClaudeCall[] = [];
      const run = await runWithClaude(c, answering([stated(over), intentReply((_ctx, id) => filed(id))], asked));
      // Refused as a state, asked again with today's words, and the second reply files the pile.
      expect({ calls: asked.length, code: run.code }).toEqual({ calls: 2, code: 0 });
      expect(asked[1]?.input).toContain(`Your reply was refused: ${REFUSALS.stateText}. Reply again`);
    }
  });

  it('every validation refusal is retried once with its reason', async () => {
    const c = await offerAndFlat();
    const offer = (i: Intent): Thing => i.things[0] as Thing;
    const without = (i: Intent, id: Id, name: string): Intent => ({ ...i, things: i.things.filter((t) => t.fileId !== id(name)) });
    const ask = (fileId: string, extra: Record<string, unknown> = {}) => ({ fileId, text: 'Is the photo from the viewing?', yes: 'Yes', no: 'No', ...extra });
    const line = (id: Id, extra: Record<string, unknown> = {}) => ({ note: 'Projects/Job hunt/Job hunt.md', text: 'A new offer from Ferrowick.', cites: id('Offer_letter_final(2).pdf'), ...extra });
    const state = (id: Id) => ({ note: 'Projects/Job hunt/Job hunt.md', lines: ['An offer from Ferrowick to answer.'], cites: id('Offer_letter_final(2).pdf') });
    const noted = (i: Intent, note: Record<string, unknown>): Intent => {
      offer(i).note = { ...(offer(i).note ?? {}), ...note };
      return i;
    };
    const edit = (change: (i: Intent, id: Id) => unknown) => (_ctx: Context, id: Id): string => envelope(JSON.stringify(change(filed(id), id)));
    // One bad reply per refusal kind; the record makes the compiler and the check below list every kind.
    const bad: Record<RefusalKind, (ctx: Context, id: Id) => string> = {
      notJson: () => envelope('Here is my plan: file everything.'),
      noText: () => envelope(null),
      notIntent: edit((i) => ({ ...i, v: 2 })),
      thingKeys: edit((i) => ((offer(i).extra = 1), i)),
      thingNotAdmitted: edit((i) => ((offer(i).fileId = 'f-none'), i)),
      thingTwice: edit((i) => ({ ...i, things: [...i.things, offer(i)] })),
      placeOutside: edit((i) => ((offer(i).to = 'Inbox'), i)),
      nameChangesKind: edit((i) => ((offer(i).name = 'Offer.jpg'), i)),
      rawName: edit((i) => ((offer(i).name = 'Offer_letter_final(2).pdf'), i)),
      numbers: edit((i) => noted(i, { body: 'Keep to the 30-minute commute limit.' })),
      newFolder: edit((i) => ((offer(i).to = 'Projects/Community garden'), i)),
      noteForNote: edit((i) => (((i.things[1] as Thing).note = { name: 'Flat.md', summary: 'A flat.', body: 'A flat.' }), i)),
      noteKeys: edit((i) => noted(i, { extra: 1 })),
      noteName: edit((i) => noted(i, { name: 'Offer.txt' })),
      noteSummary: edit((i) => noted(i, { summary: 'one\ntwo' })),
      noteBody: edit((i) => noted(i, { body: 'x'.repeat(8_001) })),
      noteSections: edit((i) => noted(i, { body: '## Timeline\n- a line' })),
      noteLink: edit((i) => noted(i, { body: 'See [[Nowhere at all]].' })),
      noteMdLink: edit((i) => noted(i, { body: 'See [the post](https://elsewhere.example/post).' })),
      noteWeb: edit((i) => noted(i, { body: 'See www.elsewhere.example for more.' })),
      pileNotAdmitted: edit((i) => ({ ...i, notes: [{ pileId: 'p-none', to: 'Resources', name: 'Other.md' }] })),
      pileTwice: edit((i) => ({ ...i, notes: [{ pileId: 'p-1', to: 'Resources', name: 'One.md' }, { pileId: 'p-1', to: 'Resources', name: 'Two.md' }] })),
      tooManyLines: edit((i, id) => ({ ...i, lines: Array.from({ length: 21 }, () => line(id)) })),
      lineKeys: edit((i, id) => ({ ...i, lines: [line(id, { extra: 1 })] })),
      lineNote: edit((i, id) => ({ ...i, lines: [line(id, { note: 'Projects/None.md' })] })),
      lineText: edit((i, id) => ({ ...i, lines: [line(id, { text: 'one\ntwo' })] })),
      lineCites: edit((i, id) => ({ ...i, lines: [line(id, { cites: 'f-none' })] })),
      noNote: edit((i) => (delete offer(i).note, i)),
      stateKeys: edit((i, id) => ({ ...i, states: [{ ...state(id), extra: 1 }] })),
      stateNote: edit((i, id) => ({ ...i, states: [{ ...state(id), note: 'Projects/None.md' }] })),
      stateTwice: edit((i, id) => ({ ...i, states: [state(id), state(id)] })),
      stateText: edit((i, id) => ({ ...i, states: [{ ...state(id), lines: ['one\ntwo'] }] })),
      stateCites: edit((i, id) => ({ ...i, states: [{ ...state(id), cites: 'f-none' }] })),
      askKeys: edit((i, id) => ({ ...without(i, id, 'IMG_2301.jpg'), asks: [ask(id('IMG_2301.jpg'), { pileId: 'p-1' })] })),
      askNotAdmitted: edit((i) => ({ ...i, asks: [ask('f-none')] })),
      askTwice: edit((i, id) => ({ ...without(i, id, 'IMG_2301.jpg'), asks: [ask(id('IMG_2301.jpg')), ask(id('IMG_2301.jpg'))] })),
      askAlsoFiles: edit((i, id) => ({ ...i, asks: [ask(id('IMG_2301.jpg'))] })),
      askText: edit((i, id) => ({ ...without(i, id, 'IMG_2301.jpg'), asks: [ask(id('IMG_2301.jpg'), { text: 'one\ntwo' })] })),
      keepKeys: edit((i) => ({ ...i, keep: [{ kept: 'Projects/Job hunt/Job hunt.md', extra: 1 }] })),
      keepNote: edit((i) => ({ ...i, keep: [{ kept: 'Projects/Job hunt/Job hunt.md', other: 'Projects/None.md' }] })),
      keepNotAsked: edit((i) => ({ ...i, keep: [{ kept: 'Projects/Job hunt/Job hunt.md', other: 'Projects/Flat hunt/Flat hunt.md' }] })),
    };
    expect(Object.keys(bad).sort()).toEqual(Object.keys(REFUSALS).sort());
    const good = intentReply((_ctx, id) => filed(id));
    for (const kind of Object.keys(bad) as RefusalKind[]) {
      const calls: ClaudeCall[] = [];
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      const run = await runWithClaude(c, answering([bad[kind], good], calls));
      // Refused for this kind, asked once more with the reason, and the second reply files the pile.
      const retried = errors.mock.calls.map((a) => a.map(String).join(' ')).find((l) => /asking once more/.test(l)) ?? '';
      expect({ kind, retried: retried.includes(`(${kind})`) }).toEqual({ kind, retried: true });
      expect({ kind, calls: calls.length }).toEqual({ kind, calls: 2 });
      expect({ kind, told: /Your reply was refused: .+\. Reply again/.test(calls[1]?.input ?? '') }).toEqual({ kind, told: true });
      expect({ kind, code: run.code, filed: 'Projects/Flat hunt/Wrenfield Road, kitchen.jpg' in run.after }).toEqual({ kind, code: 0, filed: true });
      errors.mockRestore();
    }
  });
});
