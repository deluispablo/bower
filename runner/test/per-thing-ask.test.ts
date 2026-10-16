/**
 * Per-thing asks and the uniform retry (TL-P4-08 addendum 4, `per-thing-ask`). An ask names one thing (`fileId`) or a
 * pile (`pileId`): the things asked about stay in the inbox untouched with the pile's words, and the rest of the pile
 * is filed. Every validation refusal of the model's reply is asked again once with its reason, then ends as C12 does.
 * No live call: `claude` is answered by scripted proposals in the intent shape over the c04-offer-and-flat case.
 */
import { phaseAwareClaude } from './b1-planning-support';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as noteEdit from '../../src/data/contracts/note-edit';
import { REFUSALS, type ClaudeCall, type ClaudeSpawn, type RefusalKind } from '../src/claude';
import { loadCorpus, type LoadedCase } from '../src/corpus';
import { replySequence, runWithClaude } from './corpus-run';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');

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

/** Execution observations keep validation retry counts; selection uses the final execution ids.
 * `claude` answering each call with the next of `replies` (the last one again after that), keeping the calls. */
function answering(replies: Array<(ctx: Context, id: Id) => string>, calls: ClaudeCall[] = []): ClaudeSpawn {
  return phaseAwareClaude(async (call, _step, attempt, phase) => {
    if (phase === 'execution') calls.push(call);
    const ctx = contextOf(call.input);
    const ids = new Map(ctx.piles.flatMap((p) => p.things).map((t) => [t.name, t.fileId]));
    const reply = replies[phase === 'selection' ? replies.length - 1 : Math.min(attempt, replies.length - 1)] ?? (() => '');
    return { code: 0, stderr: '', cut: null, stdout: reply(ctx, (name) => ids.get(name) ?? `no ${name}`) };
  });
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
    // Two bounds, one home (TL-P4-14 addenda 20 and 22): Bower writes the method's short state, 8 lines of 200, and
    // reads (a person's state, a stored manifest) up to 20 lines of 400.
    const bounds = noteEdit as unknown as Record<string, { lines: number; line: number } | undefined>;
    expect({ write: bounds.STATE_WRITE, read: bounds.STATE_READ }).toEqual({ write: { lines: 8, line: 200 }, read: { lines: 20, line: 400 } });
    const write = bounds.STATE_WRITE ?? { lines: 0, line: 0 };
    const read = bounds.STATE_READ ?? { lines: 0, line: 0 };
    const c = await offerAndFlat();
    const long = (n: number, size: number): string[] => Array.from({ length: n }, (_, k) => `${'Offer to answer, '.repeat(30)}${'abcdefghijklmnopqrstu'[k] ?? 'z'}`.slice(0, size - 1) + 'x');
    const stated = (lines: string[]) => intentReply((_ctx, id) => ({ ...filed(id), states: [{ note: 'Projects/Job hunt/Job hunt.md', lines, cites: id('Offer_letter_final(2).pdf') }] }));
    // The manifest contract reads up to the read bound; the reply is held to the write bound.
    expect(noteEdit.stateLinesOk(long(read.lines, read.line), long(read.lines, read.line))).toBe(true);
    expect(noteEdit.stateLinesOk([], long(read.lines + 1, read.line))).toBe(false);
    expect(noteEdit.stateLinesOk(long(1, read.line + 1), long(1, write.line))).toBe(false);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const calls: ClaudeCall[] = [];
    const ok = await runWithClaude(c, answering([stated(long(write.lines, write.line))], calls));
    expect({ code: ok.code, calls: calls.length }).toEqual({ code: 0, calls: 1 });
    // The prompt prints the limits it checks.
    expect(calls[0]?.input).toContain(`at most ${write.lines} lines of at most`);
    expect(calls[0]?.input).toContain(`  ${write.line} characters with no link, only for a note below whose state`);
    for (const over of [long(write.lines + 1, write.line), long(1, write.line + 1)]) {
      const asked: ClaudeCall[] = [];
      const run = await runWithClaude(c, answering([stated(over), intentReply((_ctx, id) => filed(id))], asked));
      // Refused as a state, asked again with today's words, and the second reply files the pile.
      expect({ calls: asked.length, code: run.code }).toEqual({ calls: 2, code: 0 });
      expect(asked[1]?.input).toContain(`Your reply was refused: ${REFUSALS.stateText}. Reply again`);
    }
  });

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
  // One bad reply per refusal kind; the records make the compiler and the check below list every kind.
  type ViewKind = 'viewKeys' | 'viewBinding' | 'viewLimit';
  type MapKind = 'mapKeys' | 'mapBinding' | 'mapLimit';
  const bad: Record<Exclude<RefusalKind, ViewKind | MapKind>, (ctx: Context, id: Id) => string> = {
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
    lineUncited: edit((i) => ({ ...i, lines: [{ note: 'Projects/Job hunt/Job hunt.md', text: 'New: an offer from Ferrowick to answer.' }] })),
    lineMarker: edit((i, id) => ({ ...i, lines: [line(id, { marker: 'confirmed' })] })),
    lineAlsoCites: edit((i, id) => ({ ...i, lines: [line(id, { marker: 'uncertain', alsoCites: ['Projects/Job hunt/None.txt'] })] })),
    noNote: edit((i) => (delete offer(i).note, i)),
    stateKeys: edit((i, id) => ({ ...i, states: [{ ...state(id), extra: 1 }] })),
    stateNote: edit((i, id) => ({ ...i, states: [{ ...state(id), note: 'Projects/None.md' }] })),
    stateTwice: edit((i, id) => ({ ...i, states: [state(id), state(id)] })),
    stateText: edit((i, id) => ({ ...i, states: [{ ...state(id), lines: ['one\ntwo'] }] })),
    stateCites: edit((i, id) => ({ ...i, states: [{ ...state(id), cites: 'f-none' }] })),
    askKeys: edit((i, id) => ({ ...without(i, id, 'IMG_2301.jpg'), asks: [ask(id('IMG_2301.jpg'), { pileId: 'p-1' })] })),
    askNotAdmitted: edit((i) => ({ ...i, asks: [ask('f-none')] })),
    askNotes: edit((i) => ({ ...i, asks: [{ notes: ['Projects/Job hunt/Job hunt.md', 'Projects/None.md'], text: 'Are these one thing?', yes: 'Yes', no: 'No' }] })),
    askTwice: edit((i, id) => ({ ...without(i, id, 'IMG_2301.jpg'), asks: [ask(id('IMG_2301.jpg')), ask(id('IMG_2301.jpg'))] })),
    askAlsoFiles: edit((i, id) => ({ ...i, asks: [ask(id('IMG_2301.jpg'))] })),
    askText: edit((i, id) => ({ ...without(i, id, 'IMG_2301.jpg'), asks: [ask(id('IMG_2301.jpg'), { text: 'one\ntwo' })] })),
    keepKeys: edit((i) => ({ ...i, keep: [{ kept: 'Projects/Job hunt/Job hunt.md', extra: 1 }] })),
    keepNote: edit((i) => ({ ...i, keep: [{ kept: 'Projects/Job hunt/Job hunt.md', other: 'Projects/None.md' }] })),
    keepNotAsked: edit((i) => ({ ...i, keep: [{ kept: 'Projects/Job hunt/Job hunt.md', other: 'Projects/Flat hunt/Flat hunt.md' }] })),
    memory: edit((i) => ({ ...i, forget: Array.from({ length: 21 }, (_, n) => ({ factId: `fact-${n + 1}` })) })),
  };
  // A view needs a type, a request and a Bower map, which the offer-and-flat case has not: these change the skills tally's view.
  const viewBad: Record<ViewKind, (view: unknown) => unknown[]> = {
    viewKeys: (v) => [{ ...(v as object), extra: 1 }],
    viewBinding: (v) => [{ ...(v as object), requestId: '$note:Projects/Job hunt/Past offer.md' }],
    viewLimit: (v) => [v, v],
  };
  // B12a (AC2): a map needs a type, a request and a folder; one on the skills tally's offers, beside its view.
  const MAP = { requestId: '$request:change-1', title: 'Offer skills', set: { type: 'offer', folderId: '$folder:Projects/Job hunt', recursive: true },
    ops: [{ kind: 'property', key: 'skills', mode: 'union', value: ['SQL'] }] };
  const mapBad: Record<MapKind, () => unknown[]> = {
    mapKeys: () => [{ ...MAP, extra: 1 }],
    mapBinding: () => [{ ...MAP, requestId: '$note:Projects/Job hunt/Past offer.md' }],
    mapLimit: () => [MAP, MAP],
  };

  const good = intentReply((_ctx, id) => filed(id));

  // The name stays the one earlier checks named; each kind is a test of its own inside it.
  describe('every validation refusal is retried once with its reason', () => {
    it('every refusal kind has a bad reply here', () => {
      expect(Object.keys({ ...bad, ...viewBad, ...mapBad }).sort()).toEqual(Object.keys(REFUSALS).sort());
    });

    // One test for each kind (vitest's test.for), so each takes its own few milliseconds and names itself when it fails.
    it.for(Object.keys(bad) as Array<keyof typeof bad>)('a %s refusal is retried once with its reason', async (kind) => {
      const c = await offerAndFlat();
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
    });

    it.for(Object.keys(viewBad) as ViewKind[])('a %s refusal is retried once with its reason', async (kind) => {
      const c = (await loadCorpus(ROOT)).find((x) => x.id === 'c17-b11-skills-tally');
      if (!c) throw new Error('no corpus case c17-b11-skills-tally');
      const [tally] = JSON.parse(await readFile(resolve(ROOT, c.id, 'replies.json'), 'utf8')) as Array<{ views: unknown[] }>;
      const inputs: string[] = [];
      // replySequence answers by step, so the retry (told its refusal) goes to a sequence of the good reply.
      const [first, again] = [replySequence([{ ...tally, views: viewBad[kind](tally?.views[0]) }]), replySequence([tally])];
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      const run = await runWithClaude(c, (call) => (inputs.push(call.input), (/Your reply was refused/.test(call.input) ? again : first)(call)));
      // Refused for this kind, told the reason once, and the second reply installs the view in its map.
      const retried = errors.mock.calls.map((a) => a.map(String).join(' ')).find((l) => /asking once more/.test(l)) ?? '';
      expect({ kind, retried: retried.includes(`(${kind})`) }).toEqual({ kind, retried: true });
      expect({ kind, told: inputs.filter((i) => /Your reply was refused: .+\. Reply again/.test(i)).length }).toEqual({ kind, told: 1 });
      expect({ kind, code: run.code, installed: /^bower_views: /m.test(run.after['Projects/Job hunt/Job hunt.md'] ?? '') }).toEqual({ kind, code: 0, installed: true });
    });

    it.for(Object.keys(mapBad) as MapKind[])('AC2 b12-set-properties-refusal-table: a %s refusal is retried once with its reason', async (kind) => {
      const c = (await loadCorpus(ROOT)).find((x) => x.id === 'c17-b11-skills-tally');
      if (!c) throw new Error('no corpus case c17-b11-skills-tally');
      const [tally] = JSON.parse(await readFile(resolve(ROOT, c.id, 'replies.json'), 'utf8')) as Array<{ views: unknown[] }>;
      const inputs: string[] = [];
      const [first, again] = [replySequence([{ ...tally, maps: mapBad[kind]() }]), replySequence([tally])];
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      const run = await runWithClaude(c, (call) => (inputs.push(call.input), (/Your reply was refused/.test(call.input) ? again : first)(call)));
      const retried = errors.mock.calls.map((a) => a.map(String).join(' ')).find((l) => /asking once more/.test(l)) ?? '';
      expect({ kind, retried: retried.includes(`(${kind})`) }).toEqual({ kind, retried: true });
      expect({ kind, told: inputs.filter((i) => /Your reply was refused: .+\. Reply again/.test(i)).length }).toEqual({ kind, told: 1 });
      expect({ kind, code: run.code, installed: /^bower_views: /m.test(run.after['Projects/Job hunt/Job hunt.md'] ?? '') }).toEqual({ kind, code: 0, installed: true });
    });

    it('a structured output beside a bad result is refused and asked again', async () => {
      const c = await offerAndFlat();
      // The reply is read from the result text only (TL-P4-14 addendum 22): claude gets no --json-schema, and a
      // structured_output beside a bad result is not taken as the reply; the result is refused and asked again.
      const calls: ClaudeCall[] = [];
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const structured = (_ctx: Context, id: Id): string => JSON.stringify({ ...(JSON.parse(envelope('Here is my plan.')) as object), structured_output: filed(id) });
      const run = await runWithClaude(c, answering([structured, good], calls));
      expect({ calls: calls.length, code: run.code, schema: calls.some((call) => call.args.includes('--json-schema')) }).toEqual({ calls: 2, code: 0, schema: false });
      expect(calls[1]?.input).toContain(`Your reply was refused: ${REFUSALS.notJson}. Reply again`);
    });
  });
});
