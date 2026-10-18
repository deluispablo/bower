/**
 * c12-fanout: a tidy-up selects once, then writes per group of piles, one group at a time, and merges one plan
 * (specs/c12-lifecycle/c12-fanout-plan.md, rulings 1-19 and S1-S17). Groups are union-find components over the
 * selection's targets, packed first-fit in admission order (Johnson 1974); the writing calls map and one plan reduces
 * (Dean and Ghemawat 2004). Every run goes through production main over a made-up folder; only the model is replaced.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WAITING_WHY } from '../../src/data/contracts/run-manifest';
import type { Filing, Placement } from '../../src/data/spine/scripted';
import { SYSTEM } from '../../src/data/vault/layout';
import { GROUP_THINGS, REFUSALS, groupsOf, mergedFiling } from '../src/claude';
import { AT } from './corpus-run';
import { paging } from './drive-v3';
import { folder, largeFolder, leavesForNextRun, manifest, note, report, run, seedState, setup, type Base, type Frame } from './b1-planning-support';

const oldPageSize = paging.size;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT); paging.size = 1000;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); paging.size = oldPageSize; });

const X = 'Projects/Remote search';
const Y = 'Resources/Gardening';
const Z = 'Resources/Careers';
const GARDEN = 'Resources/Gardening/Garden plans.md';
const WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
/** A pile of `n` pictures (no text, so each is filed as it is), its names starting with its tag. */
const pile = (tag: string, n: number) => ({ line: '', files: WORDS.slice(0, n).map((w) => `${tag} ${w}.png`) });
const tagOf = (name: string): string => name.split(' ')[0] ?? '';
/** `setup` with each inbox file its own made-up bytes: equal bytes would be put aside as copies of each other. */
const made = (options: NonNullable<Parameters<typeof setup>[0]> & { inbox: Array<{ line: string; files: string[] }> }) => setup({ ...options,
  inboxFiles: Object.fromEntries(options.inbox.flatMap((p) => p.files).map((name) => [name,
    name.endsWith('.png') ? `made-up picture bytes of ${name}` : `Alex received a remote developer offer, ${name.replace(/\.txt$/, '')}.\n`])) });
type Place = string | { parentId: string; name: string };
/** The selection: each thing to its tag's folder, wanting nothing; a tag with no folder is left out. */
const placing = (b: Base, to: Record<string, Place>) => ({ asks: [] as unknown[], items: b.sources.flatMap((s) => {
  const at = to[tagOf(s.name)];
  return at === undefined ? [] : [{ itemId: s.itemId, kind: 'unknown', destination: typeof at === 'string' ? b.id(at) : at, wants: [] as string[] }];
}) });
type Row = Record<string, unknown>;
/** The reply filing each thing of the given tags into its folder, as it is. */
const filing = (b: Base, to: Record<string, string>, tags = Object.keys(to)): { kind: string; v: number; things: Row[] } & Row => ({ kind: 'tidy-intent', v: 1,
  things: b.sources.filter((s) => tags.includes(tagOf(s.name))).map((s) => ({ fileId: s.itemId, to: to[tagOf(s.name)], name: s.name })) });

type Shown = { piles: Array<{ pileId: string; things: Array<{ fileId: string; name: string }> }>; sources: Array<{ itemId: string; candidates: Array<{ id: string }> }>;
  selection: { items: Array<{ itemId: string }>; asks: Array<{ fileId?: string; pileId?: string }> }; allowedTargets: Record<string, string[]>;
  cards?: Array<{ id: string }>; requests?: Array<{ requestId: string }>; notes: Array<{ path: string }>; profileSources?: Record<string, unknown>;
  answers?: Array<{ fileId?: string; pileId?: string }> };
const shown = (f: Frame): Shown => f.value as unknown as Shown;
const writing = (r: { frames: Frame[] }): Frame[] => r.frames.filter((f) => f.value.selection !== undefined);
const own = (f: Frame): Set<string> => new Set(shown(f).sources.map((s) => s.itemId));
const names = (f: Frame): string[] => shown(f).piles.flatMap((p) => p.things.map((t) => t.name));
const tagsIn = (f: Frame): string => [...new Set(names(f).map(tagOf))].sort().join('+');
/** The prompt file a call names, as it read it (`promptOf` is the prompt file, a newline, then stdin). */
const promptFile = (f: Frame): string => f.prompt.slice(0, f.prompt.length - f.call.input.length - 1);
const manifests = (r: { after: Record<string, string> }): string[] => Object.keys(r.after).filter((p) => /\/manifest-[^/]+\.json$/.test(p));
const inInbox = (r: { pathsById: Record<string, string> }, name: string): boolean => Object.values(r.pathsById).some((p) => p.startsWith('Inbox/') && p.endsWith(`/${name}`));
const filedAt = (r: { pathsById: Record<string, string> }, name: string): string[] => Object.values(r.pathsById).filter((p) => !p.startsWith('Inbox/') && p.endsWith(`/${name}`));
const errors = (): string[] => vi.mocked(console.error).mock.calls.flatMap((args) => args.map(String));

/** Each writing call shows, sends and allows only its own group's sources (S3). */
function onlyOwn(b: Base, f: Frame): void {
  const v = shown(f); const ids = own(f); const piles = new Set(v.piles.map((p) => p.pileId));
  const targets = new Set(Object.values(v.allowedTargets).flat());
  const candidates = new Set(v.sources.flatMap((s) => s.candidates.map((c) => c.id)));
  expect(v.piles.every((p) => p.things.every((t) => ids.has(t.fileId)) || ids.has(p.pileId)), 'piles').toBe(true);
  expect(v.selection.items.every((i) => ids.has(i.itemId)), 'selection.items').toBe(true);
  expect(v.selection.asks.every((a) => ids.has(a.fileId ?? '') || piles.has(a.pileId ?? '')), 'selection.asks').toBe(true);
  expect(Object.keys(v.allowedTargets).every((id) => ids.has(id)), 'allowedTargets').toBe(true);
  expect((v.cards ?? []).every((c) => candidates.has(c.id)), 'cards').toBe(true);
  expect((v.requests ?? []).every((q) => ids.has(q.requestId)), 'requests').toBe(true);
  expect(v.notes.every((n) => targets.has(b.id(n.path))), 'notes').toBe(true);
  expect(Object.keys(v.profileSources ?? {}).every((id) => targets.has(id)), 'profileSources').toBe(true);
  expect((v.answers ?? []).every((a) => (a.fileId === undefined || ids.has(a.fileId)) && (a.pileId === undefined || piles.has(a.pileId))), 'answers').toBe(true);
}

describe('groupsOf (c12-fanout S2)', () => {
  const unit = (id: string, size: number, items: string[] = [id], notes?: string[]) => ({ id, size, items, ...(notes ? { notes } : {}) });
  it('AC1 groups: units sharing a target join; components pack first-fit in first-unit order up to eight things', () => {
    expect(GROUP_THINGS).toBe(8);
    const targets = { p1: ['x'], p2: ['y'], p3: ['x', 'hub-x'] };
    expect(groupsOf([unit('p1', 6), unit('p2', 3), unit('p3', 2)], targets)).toEqual([['p1', 'p3'], ['p2']]);
    // First fit: a later component goes into the first group with room, never only the last one.
    expect(groupsOf([unit('a', 6), unit('b', 3), unit('c', 2)], { a: ['1'], b: ['2'], c: ['3'] })).toEqual([['a', 'c'], ['b']]);
    // First-unit order: the components follow the admission order of their first unit.
    expect(groupsOf([unit('b', 3), unit('a', 6)], { a: ['1'], b: ['2'] })).toEqual([['b'], ['a']]);
  });
  it('AC1 groups: a component over eight things is one group, never split, and nothing joins it', () => {
    expect(groupsOf([unit('big', 9), unit('small', 1)], { big: ['x'], small: ['y'] })).toEqual([['big'], ['small']]);
    expect(groupsOf([unit('a', 5), unit('b', 5)], { a: ['x'], b: ['x'] })).toEqual([['a', 'b']]);
  });
  it('AC1 groups: a request joins the group of its named notes; a source with no selection item is a component of its own', () => {
    // The request has no selection item: its named note alone joins it to the pile that wants that note.
    const targets = { p1: ['x'], p2: ['y', 'note-n'] };
    expect(groupsOf([unit('p1', 6), unit('p2', 3), unit('r', 1, ['r'], ['note-n'])], targets)).toEqual([['p1'], ['p2', 'r']]);
    // Without its notes, first fit would put it with p1.
    expect(groupsOf([unit('p1', 6), unit('p2', 3), unit('r', 1)], targets)).toEqual([['p1', 'r'], ['p2']]);
    // A pile the selection only asks about (no item) counts 0 (S20): it rides in the first group with room, never a call of
    // its own unless no group has room; every unit is in exactly one group.
    const groups = groupsOf([unit('p1', 8), unit('asked', 1), unit('p2', 1)], { p1: ['x'], p2: ['x'] });
    expect(groups).toEqual([['p1', 'p2'], ['asked']]);
    expect(groupsOf([unit('p1', 8), unit('asked', 1), unit('p2', 1)], { p1: ['x'], p2: ['y'] })).toEqual([['p1', 'asked'], ['p2']]);
    expect(groupsOf([unit('p1', 1), ...Array.from({ length: 100 }, (_, i) => unit(`left-${i}`, 1))], { p1: ['x'] }), 'unselected sources make no groups').toHaveLength(1);
    expect(groupsOf([], {})).toEqual([]);
  });
});

describe('mergedFiling (c12-fanout S6)', () => {
  const at = (to: string): Placement => ({ to, name: `${to}.png` });
  const base = (over: Partial<Filing>): Filing => ({ thing: () => null, words: () => null, ...over });
  it('AC5 merge: placements take the first non-null in group order; arrays concatenate; maps and sets union', () => {
    const one = base({ thing: (id) => (id === 'a' ? at('A1') : id === 'both' ? at('first') : null), lines: [{ path: 'n1', text: 'one', cites: 'a' }],
      asks: new Map([['p1', { text: 'Where?', yes: 'Yes', no: 'No' }]]), kinds: new Map([['a', 'offer']]), neverDo: new Set(['r1']),
      observations: [{ n: 1 }], views: [{ requestId: 'v1' }] as unknown as Filing['views'] });
    const two = base({ thing: (id) => (id === 'b' ? at('B1') : id === 'both' ? at('second') : null), words: (id) => (id === 'w' ? at('W') : null),
      lines: [{ path: 'n2', text: 'two', cites: 'b' }], asks: new Map([['p2', { text: 'Which?', yes: 'Yes', no: 'No' }]]),
      kinds: new Map([['b', 'note']]), neverDo: new Set(['r2']), observations: [{ n: 2 }], views: [{ requestId: 'v2' }] as unknown as Filing['views'] });
    const merged = mergedFiling([{ filing: one, held: new Set(['h1']) }, { filing: two, held: new Set(['h2']) }]);
    const f = merged.filing;
    expect([f.thing('a'), f.thing('b'), f.thing('both'), f.thing('none'), f.words('w')]).toEqual([at('A1'), at('B1'), at('first'), null, at('W')]);
    expect(f.lines?.map((l) => l.path)).toEqual(['n1', 'n2']);
    expect(f.observations).toEqual([{ n: 1 }, { n: 2 }]);
    expect(f.views?.map((v) => v.requestId)).toEqual(['v1', 'v2']);
    expect([...f.asks?.keys() ?? []]).toEqual(['p1', 'p2']);
    expect([...f.kinds ?? []]).toEqual([['a', 'offer'], ['b', 'note']]);
    expect([...f.neverDo ?? []]).toEqual(['r1', 'r2']);
    expect([...merged.held]).toEqual(['h1', 'h2']);
  });
  it('AC5 merge: forget and ends once per fact, new tags once in group order, suggestions from the first group with any, shown facts once', () => {
    const one = base({ forget: [{ factId: 'f1' }, { factId: 'f2', quote: 'first' }], ends: [{ factId: 'e1', quote: 'one' }], newTags: ['rainwater', 'compost'],
      shownFactIds: ['f1', 'f2'] });
    const two = base({ forget: [{ factId: 'f2', quote: 'second' }, { factId: 'f3' }], ends: [{ factId: 'e1', quote: 'two' }], newTags: ['compost', 'mulch'],
      shownFactIds: ['f1', 'f2'], suggestions: { first: true, views: [{ requestId: 's2' }] as unknown as NonNullable<Filing['suggestions']>['views'] } });
    const three = base({ suggestions: { first: false, views: [{ requestId: 's3' }] as unknown as NonNullable<Filing['suggestions']>['views'] } });
    const f = mergedFiling([{ filing: one, held: new Set() }, { filing: two, held: new Set() }, { filing: three, held: new Set() }]).filing;
    expect(f.forget).toEqual([{ factId: 'f1' }, { factId: 'f2', quote: 'first' }, { factId: 'f3' }]);
    expect(f.ends).toEqual([{ factId: 'e1', quote: 'one' }]);
    expect(f.newTags).toEqual(['rainwater', 'compost', 'mulch']);
    expect(f.suggestions).toEqual({ first: true, views: [{ requestId: 's2' }, { requestId: 's3' }] });
    expect(f.shownFactIds).toEqual(['f1', 'f2']);
  });
  it('AC7 one group: the one filing is the plan\'s filing, as it is', () => {
    const only = { filing: base({ newTags: ['a', 'a'] }), held: new Set(['h']) };
    expect(mergedFiling([only])).toBe(only);
  });
});

describe('the fan-out through main (c12-fanout)', () => {
  it('AC1 c12-fanout-groups: 6 things to X, 3 to Y and 2 to X make a selection and two writing calls, each with only its group, one plan', async () => {
    const b = await made({ folder: { ...folder, [GARDEN]: note('Alex grows herbs.', '# Garden plans\n\n## Timeline\n- 2026-10-01 · Alex dug the herb bed.\n') },
      inbox: [pile('Plum', 6), pile('Fern', 3), pile('Sage', 2)], journal: [{ kind: 'request', text: 'Add to Garden plans: Alex sows basil in the spring.' }] });
    await seedState(b);
    const to = { Plum: X, Fern: Y, Sage: X };
    const selection = placing(b, to); const intent = filing(b, to);
    const r = await run(b, [selection, intent], { beforeReply: async (turn, frame) => {
      if (turn !== 1) return;
      const request = shown(frame).requests?.[0]?.requestId ?? 'missing request';
      selection.items.push({ itemId: request, kind: 'unknown', destination: b.id(Y), wants: [b.id(GARDEN)] });
      intent.lines = [{ note: GARDEN, text: 'Alex sows basil in the spring.', cites: request }];
    } });
    expect(r.code).toBe(0);
    expect(r.frames, 'one selection, then one writing call per group').toHaveLength(3);
    const calls = writing(r);
    expect(calls.map(tagsIn).sort(), 'the groups, matched by their sources').toEqual(['Fern', 'Plum+Sage']);
    const fern = calls.find((f) => tagsIn(f) === 'Fern');
    expect(fern?.value.requests, 'the request goes with the pile that shares its folder').toHaveLength(1);
    expect(calls.find((f) => tagsIn(f) !== 'Fern')?.value.requests, 'and with no other').toBeUndefined();
    expect(shown(fern as Frame).notes.map((n) => n.path), 'its named note is shown to its group').toContain(GARDEN);
    for (const f of calls) onlyOwn(b, f);
    for (const f of r.frames) expect(promptFile(f), 'every call reads the same prompt file').toBe(promptFile(r.frames[0] as Frame));
    expect(manifests(r), 'one plan').toHaveLength(1);
    expect(report(r).filed, 'it files all 11 things').toHaveLength(11);
    expect(r.after[GARDEN], 'and the request\'s line').toContain('Alex sows basil in the spring.');
  }, 60_000);

  it.each([
    ['3 piles and 8 things', [pile('Plum', 4), pile('Fern', 2), pile('Sage', 2)], { Plum: X, Fern: Y, Sage: Z }, 8],
    ['one pile of 9 things', [pile('Plum', 9)], { Plum: X }, 9],
  ])('AC1 c12-fanout-groups control: %s make one writing call', async (_what, inbox, to, things) => {
    const b = await made({ inbox }); await seedState(b);
    const r = await run(b, [placing(b, to), filing(b, to)]);
    expect(r.code).toBe(0);
    expect(r.frames, 'a selection and one writing call').toHaveLength(2);
    expect(report(r).filed).toHaveLength(things);
  }, 60_000);

  it('AC2 c12-fanout-eight: 40 one-thing piles in 40 folders make 1 selection and 5 writing calls of 8, in first-pile order, at most four at a time', async () => {
    const large = largeFolder(80, 40, 40);
    const b = await setup(large); await seedState(b);
    const MAIN = ['Projects', 'Areas', 'Resources', 'Archive'];
    // Thing t of the made-up folder is about topic t: each goes to its own folder.
    const topic = (name: string): string => { const t = Number(/\d+/.exec(name)?.[0] ?? '1') - 1; return `${MAIN[t % 4]}/Topic ${String(t + 1).padStart(2, '0')}`; };
    const selection = { asks: [], items: b.sources.map((s) => ({ itemId: s.itemId, kind: 'unknown', destination: b.id(topic(s.name)), wants: [] })) };
    const intent = { kind: 'tidy-intent', v: 1, things: b.sources.map((s) => ({ fileId: s.itemId, to: topic(s.name), name: s.name,
      note: { name: s.name.replace(/\.txt$/, '.md'), summary: 'Alex received a remote developer offer.', body: 'Alex received a remote developer offer.' } })) };
    let flying = 0; let most = 0;
    const r = await run(b, [selection, intent], { beforeReply: async () => { flying++; most = Math.max(most, flying); await Promise.resolve(); flying--; } });
    expect(r.code).toBe(0);
    const calls = writing(r);
    expect(r.frames, 'one selection and five writing calls').toHaveLength(6);
    expect(most, 'at most 4 calls in flight').toBeLessThanOrEqual(4);
    for (const f of calls) expect(own(f).size, 'at most eight things a call').toBeLessThanOrEqual(8);
    const piles = b.admission.piles.map((p) => p.pileId);
    const chunks = Array.from({ length: 5 }, (_, i) => piles.slice(i * 8, i * 8 + 8).sort().join());
    expect(calls.map((f) => shown(f).piles.map((p) => p.pileId).sort().join()).sort(), 'groups of 8 in first-pile order').toEqual(chunks.sort());
    expect(calls.flatMap((f) => [...own(f)]).sort(), 'every source in exactly one call').toEqual(b.sources.map((s) => s.itemId).sort());
    expect(report(r).filed).toHaveLength(40);
  }, 120_000);

  it('AC3 c12-fanout-own-sources: a group\'s reply filing another group\'s thing is refused by name; its retry carries only its own sources', async () => {
    const b = await made({ inbox: [pile('Plum', 6), pile('Fern', 3)] }); await seedState(b);
    const to = { Plum: X, Fern: Y };
    const stray = filing(b, to, ['Plum']).things[0] as Row;
    const current = filing(b, to, []);
    const r = await run(b, [placing(b, to), current], { narrow: false, beforeReply: async (turn, frame) => {
      if (turn === 1) return;
      const retry = /^Your reply was refused:/m.test(frame.call.input);
      current.things = [...filing(b, to, tagsIn(frame).split('+')).things, ...(tagsIn(frame) === 'Fern' && !retry ? [stray] : [])];
    } });
    expect(r.code).toBe(0);
    expect(r.frames, 'a selection, two groups and one retry').toHaveLength(4);
    expect(errors().some((l) => l.includes('was refused (thingNotAdmitted)')), 'refused with its kind named').toBe(true);
    const retry = r.frames.find((f) => /^Your reply was refused:/m.test(f.call.input));
    expect(retry?.call.input).toContain(REFUSALS.thingNotAdmitted);
    expect(names(retry as Frame).map(tagOf), 'the retry shows only its own group').toEqual(['Fern', 'Fern', 'Fern']);
    expect(own(retry as Frame).has(String(stray.fileId)), 'never the other group\'s thing').toBe(false);
    expect(report(r).filed, 'the clean retry files all, nothing dropped').toHaveLength(9);
    expect(filedAt(r, String(stray.name)), 'the strayed thing filed once, by its own group').toEqual([`${X}/${String(stray.name)}`]);
    expect((JSON.parse(r.after[manifests(r)[0] ?? ''] ?? '{}') as { waiting?: unknown }).waiting, 'no waiting rows').toBeUndefined();
    expect(errors().filter((l) => /drops a (pile|request)/.test(l))).toEqual([]);
  }, 60_000);

  it('AC3 c12-fanout-own-sources: an item-level refusal on one of a group\'s own piles drops only that pile, with one waiting row', async () => {
    const b = await made({ inbox: [pile('Plum', 8), pile('Fern', 2), pile('Moss', 1)] }); await seedState(b);
    const to = { Plum: X, Fern: Y, Moss: Z };
    const current = filing(b, to, []);
    const r = await run(b, [placing(b, to), current], { narrow: false, beforeReply: async (turn, frame) => {
      if (turn === 1) return;
      // Moss's thing is filed outside its selected folder in both replies (thingPlace, item-level, on Moss's pile).
      current.things = filing(b, to, tagsIn(frame).split('+')).things.map((t) => (tagOf(String(t.name)) === 'Moss' ? { ...t, to: X } : t));
    } });
    expect(r.code).toBe(0);
    expect(r.frames, 'a selection, two groups and one retry').toHaveLength(4);
    expect(writing(r).map(tagsIn).sort()).toEqual(['Fern+Moss', 'Fern+Moss', 'Plum']);
    expect(report(r).filed, 'Plum\'s 8 and Fern\'s 2').toHaveLength(10);
    expect(inInbox(r, 'Moss one.png'), 'Moss waits in the inbox').toBe(true);
    const drops = errors().filter((l) => /drops a (pile|request)/.test(l));
    expect(drops, 'only Moss\'s pile drops').toHaveLength(1);
    expect(drops[0]).toMatch(/drops a pile \(thingPlace\)/);
    const waiting = (JSON.parse(r.after[manifests(r)[0] ?? ''] ?? '{}') as { waiting?: Array<{ why: string }> }).waiting;
    expect(waiting?.map((w) => w.why), 'one waiting row').toEqual([WAITING_WHY]);
  }, 60_000);

  it('AC4 c12-fanout-asked: a frozen-ask pile beside a two-group run is asked in exactly one call and gets one question', async () => {
    const b = await made({ inbox: [pile('Plum', 6), pile('Fern', 3), pile('Mint', 1)] }); await seedState(b);
    const to = { Plum: X, Fern: Y };
    const mint = b.sources.find((s) => tagOf(s.name) === 'Mint')?.itemId;
    const ask = { fileId: mint, text: 'Should this stay with the remote search?', yes: 'Yes', no: 'No' };
    const selection = placing(b, to); selection.asks = [ask];
    const r = await run(b, [selection, { ...filing(b, to), asks: [ask] }]);
    expect(r.code).toBe(0);
    expect(r.frames, 'a selection and two writing calls').toHaveLength(3);
    expect(writing(r).flatMap((f) => shown(f).selection.asks), 'the frozen ask is in one call only').toEqual([ask]);
    expect(writing(r).filter((f) => own(f).has(mint ?? '')), 'its pile is in one call').toHaveLength(1);
    expect(report(r).questions, 'one question').toHaveLength(1);
    expect(report(r).filed).toHaveLength(9);
    expect(inInbox(r, 'Mint one.png')).toBe(true);
  }, 60_000);

  it('AC4 c12-fanout-asked: an item a cut map removed is in exactly one writing call and waits unplaced; nothing is created', async () => {
    const groups = Object.fromEntries(Array.from({ length: 160 }, (_, i) => {
      const name = `Group ${String(i).padStart(3, '0')}`;
      return [`Resources/${name}/${name}.md`, note(`Alex keeps remote offer group ${i} ${'x'.repeat(180)}.`)];
    }));
    const b = await made({ folder: { ...folder, ...groups }, inbox: [pile('Plum', 6), pile('Fern', 3), pile('Mint', 1)] }); await seedState(b);
    const to = { Plum: X, Fern: Y };
    const selection = placing(b, { ...to, Mint: { parentId: b.id(X), name: 'Missing remote offers' } });
    const r = await run(b, [selection, filing(b, to)]);
    expect(r.code).toBe(0);
    expect(r.frames[0]?.prompt, 'the map is cut').toContain('folders cut');
    expect(r.frames, 'a selection and two writing calls').toHaveLength(3);
    const mint = b.sources.find((s) => tagOf(s.name) === 'Mint')?.itemId ?? '';
    expect(writing(r).filter((f) => own(f).has(mint)), 'the cut item is in one call').toHaveLength(1);
    expect(inInbox(r, 'Mint one.png'), 'it waits unplaced').toBe(true);
    expect(Object.values(r.pathsById).filter((p) => p.includes('Missing remote offers')), 'nothing created').toEqual([]);
    expect(report(r).filed).toHaveLength(9);
  }, 120_000);

  it('AC5 c12-fanout-merge: two new tags from one group and one from the next: the tags file gains the first two, the next group\'s note goes without its tag', async () => {
    const b = await made({ inbox: [{ line: '', files: [...WORDS.slice(0, 7).map((w) => `Plum ${w}.png`), 'Plum notice.txt'] }, { line: '', files: ['Fern notice.txt', 'Fern one.png'] }] });
    await seedState(b);
    const to = { Plum: X, Fern: Y };
    const current = filing(b, to, []);
    const r = await run(b, [placing(b, to), current], { narrow: false, beforeReply: async (turn, frame) => {
      if (turn === 1) return;
      // By group, not by which call comes first: Plum's pile is admitted first, so its group is first.
      const tags = tagsIn(frame) === 'Plum' ? ['rainwater', 'compost'] : ['mulch'];
      current.newTags = tags;
      current.things = filing(b, to, tagsIn(frame).split('+')).things.map((t) => (String(t.name).endsWith('.txt') ? { ...t,
        note: { name: String(t.name).replace(/\.txt$/, '.md'), summary: 'Alex received a remote developer offer.', body: 'Alex received a remote developer offer.', tags } } : t));
    } });
    expect(r.code).toBe(0);
    expect(r.frames).toHaveLength(3);
    expect(JSON.parse(r.after[SYSTEM.tags] ?? '{"tags":[]}'), 'the first two additions, in group order').toMatchObject({ tags: ['rainwater', 'compost'] });
    const [first, next] = ['Plum', 'Fern'];
    const noteOf = (tag: string): string => r.after[`${tag === 'Plum' ? X : Y}/${tag} notice.md`] ?? '';
    expect(noteOf(first), 'the first group\'s note keeps its tags').toMatch(/compost/);
    expect(noteOf(next), 'the next group\'s note is filed').not.toBe('');
    expect(noteOf(next), 'without the dropped tag').not.toMatch(/mulch/);
  }, 60_000);

  const ABOUT = 'About me.md';
  const LEDGER = '.bower/observations.jsonl';
  const region = (heading: string, id: string) => `<!-- bower:ownership/2 begin ${id} -->\n### ${heading}\n<!-- bower:ownership/2 end ${id} -->\n`;
  const ABOUT_TEXT = '---\nsummary: What Bower knows about you. Change it whenever you like.\n---\n\n## My words\n\nI keep my own notes here.\n\n## What Bower has learned\n'
    + region('About you', 'about-you') + region("What you're working on", 'about-working-on') + region('How you like things', 'about-preferences');
  const BEANS = 'I grow beans on the north plot.';
  const BEES = 'I keep bees by the old shed.';

  it('AC6 c12-fanout-reduce: two groups each sending an observation make one observations write, one plan and at most one consolidation call', async () => {
    const b = await made({ folder: { ...folder, [LEDGER]: '', [ABOUT]: ABOUT_TEXT },
      inbox: [pile('Plum', 7), { line: `Remember this: ${BEANS}`, files: [] }, pile('Fern', 2), { line: `Remember this: ${BEES}`, files: [] }] });
    await seedState(b);
    const to = { Plum: X, Fern: Y };
    const selection = placing(b, to); const intent = filing(b, to);
    const r = await run(b, [selection, intent], { beforeReply: async (turn, frame) => {
      if (turn !== 1) return;
      const words = (text: string): string => (frame.value.piles as Array<{ pileId: string; words: string }>).find((p) => p.words.includes(text))?.pileId ?? 'missing pile';
      selection.items.push({ itemId: words(BEANS), kind: 'unknown', destination: b.id(X), wants: [] }, { itemId: words(BEES), kind: 'unknown', destination: b.id(Y), wants: [] });
      intent.observations = [[BEANS, words(BEANS)], [BEES, words(BEES)]].map(([text, pileId]) => ({ source: { pileId }, section: 'about-you', category: 'biography', text }));
    } });
    expect(r.code).toBe(0);
    expect(writing(r).map(tagsIn).sort(), 'two writing calls, each with its words').toEqual(['Fern', 'Plum']);
    expect(r.frames.filter((f) => 'consolidation' in f.value).length, 'at most one consolidation call').toBeLessThanOrEqual(1);
    expect(manifests(r), 'one plan').toHaveLength(1);
    const writes = manifest(r).operations.filter((op) => op.effect.kind === 'write-runner-json' && (op.effect as { path?: string }).path === LEDGER);
    expect(writes, 'one observations write').toHaveLength(1);
    expect(r.after[LEDGER]).toContain(BEANS);
    expect(r.after[LEDGER]).toContain(BEES);
  }, 60_000);

  it('AC6 c12-fanout-reduce: a merged plan over 200 operations holds the whole run for the next one', async () => {
    const many = (tag: string, n: number) => ({ line: '', files: Array.from({ length: n }, (_, i) => `${tag} ${String(i + 1).padStart(2, '0')}.txt`) });
    const b = await made({ inbox: [many('Plum', 60), many('Fern', 50)] }); await seedState(b);
    const to = { Plum: X, Fern: Y };
    const intent = { ...filing(b, to), things: filing(b, to).things.map((t) => ({ ...t,
      note: { name: String(t.name).replace(/\.txt$/, '.md'), summary: 'Alex received a remote developer offer.', body: 'Alex received a remote developer offer.' } })) };
    const r = await run(b, [placing(b, to), intent]);
    expect(writing(r), 'each group has its own call, each under 200 operations').toHaveLength(2);
    leavesForNextRun(r);
    expect(manifests(r), 'no plan').toEqual([]);
  }, 120_000);
});
