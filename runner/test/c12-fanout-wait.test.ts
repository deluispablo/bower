/**
 * c12-fanout-wait: a group of piles that gets no valid reply, or no model time, waits whole while the rest is filed
 * (specs/c12-lifecycle/c12-fanout-later.md W1-W7, on c12-fanout-plan.md S12 and S13). Per-request failure as in the
 * Message Batches API, at the grain of one writing call. Every run goes through production main over a made-up folder;
 * only the model is replaced, and each refusal comes from the reply this test builds for the call it answers (W7).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { askId } from '../../src/data/contracts/questions';
import { PILE_NOTE } from '../../src/data/piles';
import { SYSTEM } from '../../src/data/vault/layout';
import { AT } from './corpus-run';
import { paging } from './drive-v3';
import { failedReply, folder, gate, leavesForNextRun, note, run, seedState, setup, waitsForNextRun, type Base, type Frame, type Held } from './b1-planning-support';

const oldPageSize = paging.size;
beforeEach(() => {
  // setImmediate stays real: the gate drains the event loop with it (P11).
  vi.useFakeTimers({ toNotFake: ['setImmediate', 'clearImmediate'] }); vi.setSystemTime(AT); paging.size = 1000;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); paging.size = oldPageSize; });

const [X, Y, Z] = ['Projects/Remote search', 'Resources/Gardening', 'Resources/Careers'];
const GARDEN = 'Resources/Gardening/Garden plans.md';
const LINE = 'Alex sows basil in the spring.';
const COUNT = ['one', 'two', 'three', 'four', 'five', 'six'];
type Row = Record<string, unknown>;
type Inbox = Array<{ line: string; files: string[] }>;
const tagOf = (name: string): string => name.split(' ')[0] ?? '';
/** Piles of pictures, each its own made-up bytes (equal bytes would be put aside as copies), their names starting with their tag. */
const made = (piles: Record<string, number>, more: Omit<NonNullable<Parameters<typeof setup>[0]>, 'inbox'> = {}) => {
  const inbox: Inbox = Object.entries(piles).map(([tag, n]) => ({ line: '', files: COUNT.slice(0, n).map((w) => `${tag} ${w}.png`) }));
  return setup({ ...more, inbox, inboxFiles: Object.fromEntries(inbox.flatMap((p) => p.files).map((f) => [f, `made-up picture bytes of ${f}`])) });
};
const TWO = { Plum: 6, Fern: 3 };
/** The piles' tags in admission order, which is group order (S2). */
const order = (b: Base): string[] => b.admission.piles.map((p) => tagOf(p.items.find((i) => i.name !== PILE_NOTE)?.name ?? ''));
const pileOf = (b: Base, tag: string) => b.admission.piles.find((p) => p.items.some((i) => tagOf(i.name) === tag));
const idOf = (b: Base, tag: string): string => pileOf(b, tag)?.pileId ?? '';
const size = (b: Base, tag: string): number => b.sources.filter((s) => tagOf(s.name) === tag).length;
/** A waiting row's name: the pile's own name or its first thing's (rulings 6, 14, 15). */
const rowOf = (b: Base, tag: string): string => { const p = pileOf(b, tag); return p?.anchor?.name ?? p?.items.find((i) => i.name !== PILE_NOTE)?.name ?? ''; };
const placing = (b: Base, to: Record<string, string>) => ({ asks: [] as unknown[], items: b.sources.map((s) => ({ itemId: s.itemId, kind: 'unknown',
  destination: b.id(to[tagOf(s.name)] ?? ''), wants: [] as string[] })) });
const filing = (b: Base, to: Record<string, string>, tags: string[]): Row & { things: Row[] } => ({ kind: 'tidy-intent', v: 1,
  things: b.sources.filter((s) => tags.includes(tagOf(s.name))).map((s) => ({ fileId: s.itemId, to: to[tagOf(s.name)], name: s.name })) });
/** A reply-level refusal: every thing with a key outside the intent (thingKeys, not item-level). */
const refused = (b: Base, to: Record<string, string>, tags: string[]) => ({ ...filing(b, to, tags), things: filing(b, to, tags).things.map((t) => ({ ...t, extra: true })) });
const tagsIn = (f: Frame): string[] => [...new Set((f.value.piles as Array<{ things: Array<{ name: string }> }>).flatMap((p) => p.things.map((t) => tagOf(t.name))))];
const writing = (r: { frames: Frame[] }): Frame[] => r.frames.filter((f) => f.value.selection !== undefined);
const outOfTime = (f: Frame): void => { vi.advanceTimersByTime(f.call.timeoutMs); };
const waitingRows = (r: { after: Record<string, string> }): string[] => ((JSON.parse(Object.entries(r.after).find(([p]) => /\/manifest-[^/]+\.json$/.test(p))?.[1] ?? '{}') as
  { waiting?: Array<{ name: string }> }).waiting ?? []).map((w) => w.name);
const drops = (r: { errors: string }): string[] => r.errors.split('\n').flatMap((l) => /drops a (?:pile|request) \((\w+)\)/.exec(l)?.[1] ?? []);

type Turn = { tags: string[]; retry: boolean; frame: Frame };
/**
 * The tidy-up, each writing call answered by `answer` from the call it answers (W7). `order`: the groups' tags in the order
 * their calls answer, one call at a time through the gate (P11), a group's retry before any later group.
 */
const tidy = (b: Base, selection: ReturnType<typeof placing>, answer: (t: Turn) => Row, order?: string[], hold?: (t: Turn) => Promise<void> | undefined) => {
  const replies: unknown[] = [selection, {}];
  const rank = (h: Held): number => order?.findIndex((tag) => tagsIn(h.frame).includes(tag)) ?? 0;
  const held = order && gate((open) => [...open].sort((x, y) => rank(x) - rank(y)).slice(0, 1), { open: [3, 2, 2] });
  return run(b, replies, { narrow: false, beforeReply: async (turn, frame) => {
    if (turn === 1) return;
    await held?.(turn, frame);
    const t = { tags: tagsIn(frame), retry: /^Your reply was refused:/m.test(frame.call.input), frame };
    await hold?.(t);
    replies[1] = answer(t);
  } });
};
/** Two piles in two folders, so two groups in admission order; `reask`: a stored reask on the second's pile. */
const twoGroups = async (reask = false) => {
  const b = await made(TWO);
  const [one = '', two = ''] = order(b);
  if (reask) await reasked(b, two);
  await seedState(b);
  return { b, one, two, to: { [one]: X, [two]: Y } };
};
/** A stored reask on the pile: it is planned whatever the reply says, so its group cannot wait (W1, ruling 19). */
async function reasked(b: Base, tag: string) {
  const pileId = idOf(b, tag);
  const reask = { id: askId(pileId), subject: pileId, text: 'Where does it go?', yes: 'Yes', no: 'No', askedAt: AT - 5000 };
  const text = JSON.stringify({ v: 1, questions: [], rounds: [{ subject: pileId, pileId, words: tag, count: size(b, tag), wordsOnly: true, reask }] });
  const id = b.ix.idOf(SYSTEM.questions);
  if (id) await b.drive.writeText(id, text, (await b.drive.get(id)).modifiedTime);
  else await b.drive.createText(b.id(SYSTEM.dir), 'questions.json', text);
}

describe('a group with no valid reply or no model time waits whole (c12-fanout-wait)', () => {
  it('AC1 c12-fanout-wait-refused: the second group refused twice waits whole with its request; the first is filed; one group alone fails', async () => {
    const b = await made(TWO, { folder: { ...folder, [GARDEN]: note('Alex grows herbs.', '# Garden plans\n\n## Timeline\n- 2026-10-01 · Alex dug the herb bed.\n') },
      journal: [{ kind: 'request', text: `Add to Garden plans: ${LINE}` }] });
    await seedState(b);
    const [one = '', two = ''] = order(b);
    const to = { [one]: X, [two]: Y };
    const request = b.admission.journal[0]?.fileId ?? 'missing request';
    const selection = placing(b, to);
    selection.items.push({ itemId: request, kind: 'unknown', destination: b.id(Y), wants: [b.id(GARDEN)] });
    const r = await tidy(b, selection, ({ tags }) => (tags.includes(two)
      ? { ...refused(b, to, [two]), lines: [{ note: GARDEN, text: LINE, cites: request }] } : filing(b, to, tags)));
    expect(r.frames, 'a selection, two groups and one retry').toHaveLength(4);
    expect(writing(r).filter((f) => tagsIn(f).includes(two)).map((f) => (f.value.requests as unknown[] | undefined)?.length), 'the request rides with the second group').toEqual([1, 1]);
    waitsForNextRun(r, [idOf(b, two), request], size(b, one));
    expect(r.after[GARDEN], 'the waiting request adds no line').not.toContain(LINE);
    // Control (PP-R2): the same refusal on a run of one group fails the run.
    const c = await made({ Fern: 3 }); await seedState(c);
    failedReply(await tidy(c, placing(c, { Fern: Y }), () => refused(c, { Fern: Y }, ['Fern'])));
  }, 120_000);

  it('AC2 c12-fanout-wait-time: refused once, then no model time for its retry, the second group waits; no time after selection, nothing lands', async () => {
    const { b, one, two, to } = await twoGroups();
    const r = await tidy(b, placing(b, to), ({ tags, frame }) => {
      if (!tags.includes(two)) return filing(b, to, tags);
      outOfTime(frame);
      return refused(b, to, [two]);
    });
    expect(r.frames, 'a selection and two groups; the retry never goes out').toHaveLength(3);
    waitsForNextRun(r, [idOf(b, two)], size(b, one));
    const late = await twoGroups();
    const held = await run(late.b, [placing(late.b, late.to), filing(late.b, late.to, [late.one, late.two])], { beforeReply: async (turn, frame) => { if (turn === 1) outOfTime(frame); } });
    expect(held.frames, 'no writing call starts after the model time is used up').toHaveLength(1);
    leavesForNextRun(held);
  }, 120_000);

  it('AC3 c12-fanout-wait-cannot: a refused group holding a reasked pile fails the run though the first landed; no group landed fails it too', async () => {
    const refuseSecond = (g: Awaited<ReturnType<typeof twoGroups>>) => ({ tags }: Turn) => (tags.includes(g.two) ? refused(g.b, g.to, [g.two]) : filing(g.b, g.to, tags));
    const choice = await twoGroups(true);
    const r = await tidy(choice.b, placing(choice.b, choice.to), refuseSecond(choice));
    expect(r.frames, 'a selection, two groups and one retry').toHaveLength(4);
    failedReply(r);
    // Control: the same refusal with no reask waits.
    const plain = await twoGroups();
    waitsForNextRun(await tidy(plain.b, placing(plain.b, plain.to), refuseSecond(plain)), [idOf(plain.b, plain.two)], size(plain.b, plain.one));
    // No group landed: the first refused twice, the model time gone on its retry; the second, called at once, answers only
    // after that and is refused, so its retry finds no time: one refusal and one time-out.
    // The second answers only after the first's retry has (an event, not event-loop ticks, which a starved pool can outrun).
    const none = await twoGroups();
    let firstRetried = (): void => {};
    const afterFirstRetry = new Promise<void>((resolve) => { firstRetried = resolve; });
    const nothing = await tidy(none.b, placing(none.b, none.to), ({ tags, retry, frame }) => {
      if (retry && tags.includes(none.one)) { outOfTime(frame); firstRetried(); }
      return refused(none.b, none.to, tags);
    }, undefined, ({ tags }) => (tags.includes(none.two) ? afterFirstRetry : undefined));
    expect(nothing.frames, 'a selection, both groups and the first\'s retry').toHaveLength(4);
    failedReply(nothing);
  }, 180_000);

  it('AC3 c12-fanout-wait-cannot: a reasked group out of model time after the first landed holds the whole run', async () => {
    // Both groups are called at once: the second's first reply is refused and uses up the time, so its retry finds none.
    const answer = (g: Awaited<ReturnType<typeof twoGroups>>) => ({ tags, frame }: Turn) => {
      if (!tags.includes(g.two)) return filing(g.b, g.to, tags);
      outOfTime(frame);
      return refused(g.b, g.to, [g.two]);
    };
    const choice = await twoGroups(true);
    const r = await tidy(choice.b, placing(choice.b, choice.to), answer(choice));
    expect(r.frames, 'a selection and both groups; the retry never goes out').toHaveLength(3);
    leavesForNextRun(r);
    // Control: with no reask the second group waits and the first is filed.
    const plain = await twoGroups();
    waitsForNextRun(await tidy(plain.b, placing(plain.b, plain.to), answer(plain)), [idOf(plain.b, plain.two)], size(plain.b, plain.one));
  }, 120_000);

  it('AC4 c12-fanout-wait-words: one refused, one out of time and one landed give one count line with both waiting totals', async () => {
    const b = await made({ Plum: 5, Fern: 4, Sage: 6 }); await seedState(b);
    const [one = '', two = '', three = ''] = order(b);
    const to = { [one]: X, [two]: Y, [three]: Z };
    // All three are called at once and answer in group order: the first lands, the second is refused twice, then the third's
    // refused reply uses up the time, so its retry finds none.
    const r = await tidy(b, placing(b, to), ({ tags, frame }) => {
      if (tags.includes(one)) return filing(b, to, tags);
      if (tags.includes(three)) outOfTime(frame);
      return refused(b, to, tags);
    }, [one, two, three]);
    expect(r.frames, 'a selection, three groups and the second\'s retry').toHaveLength(5);
    waitsForNextRun(r, [idOf(b, two), idOf(b, three)], size(b, one));
  }, 120_000);

  it('AC5 c12-fanout-wait-mixed: item-level drops keep their kinds and lines; only the group\'s own waiting sources are counted', async () => {
    // Plum and Moss share a folder, Fern and Sage another: two groups of five.
    const b = await made({ Plum: 4, Moss: 1, Fern: 3, Sage: 2 }); await seedState(b);
    const to = { Plum: X, Moss: X, Fern: Y, Sage: Y };
    const r = await tidy(b, placing(b, to), ({ tags }) => {
      // Moss filed outside its folder (thingPlace, item-level): only its pile drops, and Plum lands.
      if (tags.includes('Plum')) return { ...filing(b, to, ['Plum']), things: [...filing(b, to, ['Plum']).things, ...filing(b, { Moss: Z }, ['Moss']).things] };
      // Fern's names change what its things are (item-level, first), Sage's rows have a key outside the intent (reply-level):
      // Fern is pruned, the re-check refuses, and the rest of the group waits.
      return { ...filing(b, to, []), things: [...filing(b, to, ['Fern']).things.map((t) => ({ ...t, name: String(t.name).replace(/\.png$/, '.txt') })),
        ...refused(b, to, ['Sage']).things] };
    });
    expect(r.frames, 'a selection, two groups, two retries').toHaveLength(5);
    expect(drops(r).sort(), 'both item-level drops keep their own lines').toEqual(['nameChangesKind', 'thingPlace']);
    waitsForNextRun(r, [idOf(b, 'Sage')], size(b, 'Plum'));
    expect(waitingRows(r).sort(), 'the rows: the first group\'s dropped pile, the pruned pile and the waiting one').toEqual(['Moss', 'Fern', 'Sage'].map((t) => rowOf(b, t)).sort());
  }, 120_000);

  it('AC6 c12-fanout-wait-cross: both of the second group\'s replies file a thing of the first: the second waits; the thing is filed once, by its own group', async () => {
    const { b, one, two, to } = await twoGroups();
    const stray = filing(b, to, [one]).things[0] as Row;
    const r = await tidy(b, placing(b, to), ({ tags }) => (tags.includes(two)
      ? { ...filing(b, to, [two]), things: [...filing(b, to, [two]).things, stray] } : filing(b, to, tags)));
    expect(r.frames, 'a selection, two groups and one retry').toHaveLength(4);
    waitsForNextRun(r, [idOf(b, two)], size(b, one));
    expect(Object.values(r.pathsById).filter((p) => p.endsWith(`/${String(stray.name)}`)), 'filed once, by its own group').toEqual([`${X}/${String(stray.name)}`]);
    expect(waitingRows(r), 'in no waiting row').toEqual([rowOf(b, two)]);
  }, 120_000);
});
