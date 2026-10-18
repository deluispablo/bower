/**
 * c12-fanout-parallel: a tidy-up writes up to four groups of piles at once (`limiter(4)`), each call in a config folder of
 * its own, with one plan whatever order the replies come back in (specs/c12-lifecycle/c12-fanout-later.md P1-P9, on
 * c12-fanout-plan.md S14-S17). Parallel map, ordered reduce (Dean and Ghemawat 2004); results matched by source, never by
 * completion order (Message Batches API). Every run goes through production main over a made-up folder; only the model is
 * replaced. setImmediate stays real so the transport can let the event loop drain before it answers (P5).
 */
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PILE_NOTE } from '../../src/data/piles';
import type { ClaudeCall, ClaudeExit } from '../src/claude';
import { AT, redispatchCase } from './corpus-run';
import { fixedDrive, paging } from './drive-v3';
import { gate, largeFolder, manifest, phaseAwareClaude, report, run, seedState, setup, waitsForNextRun, type Base, type Frame, type Held } from './b1-planning-support';

const oldPageSize = paging.size;
beforeEach(() => {
  vi.useFakeTimers({ toNotFake: ['setImmediate', 'clearImmediate'] }); vi.setSystemTime(AT); paging.size = 1000;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); paging.size = oldPageSize; });

const [X, Y, Z] = ['Projects/Remote search', 'Resources/Gardening', 'Resources/Careers'];
const COUNT = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
type Row = Record<string, unknown>;
const tagOf = (name: string): string => name.split(' ')[0] ?? '';
/** Piles of pictures, each its own made-up bytes (equal bytes would be put aside as copies), their names starting with their tag. */
const made = (piles: Record<string, number>) => {
  const inbox = Object.entries(piles).map(([tag, n]) => ({ line: '', files: COUNT.slice(0, n).map((w) => `${tag} ${w}.png`) }));
  return setup({ inbox, inboxFiles: Object.fromEntries(inbox.flatMap((p) => p.files).map((f) => [f, `made-up picture bytes of ${f}`])) });
};
const pileOf = (b: Base, tag: string) => b.admission.piles.find((p) => p.items.some((i) => tagOf(i.name) === tag));
const idOf = (b: Base, tag: string): string => pileOf(b, tag)?.pileId ?? '';
const placing = (b: Base, to: Record<string, string>) => ({ asks: [] as unknown[], items: b.sources.map((s) => ({ itemId: s.itemId, kind: 'unknown',
  destination: b.id(to[tagOf(s.name)] ?? ''), wants: [] as string[] })) });
const filing = (b: Base, to: Record<string, string>, tags = Object.keys(to)): Row & { things: Row[] } => ({ kind: 'tidy-intent', v: 1,
  things: b.sources.filter((s) => tags.includes(tagOf(s.name))).map((s) => ({ fileId: s.itemId, to: to[tagOf(s.name)], name: s.name })) });
/** A reply-level refusal: every thing with a key outside the intent (thingKeys). */
const refused = (b: Base, to: Record<string, string>, tags: string[]) => ({ ...filing(b, to, tags), things: filing(b, to, tags).things.map((t) => ({ ...t, extra: true })) });
const tagsIn = (f: Frame): string[] => [...new Set((f.value.piles as Array<{ things: Array<{ name: string }> }>).flatMap((p) => p.things.map((t) => tagOf(t.name))))];
const pilesIn = (f: Frame): string[] => (f.value.piles as Array<{ pileId: string }>).map((p) => p.pileId);
const writing = (r: { frames: Frame[] }): Frame[] => r.frames.filter((f) => f.value.selection !== undefined);
const isRetry = (f: Frame): boolean => /^Your reply was refused:/m.test(f.call.input);
const timingLine = (r: { consoleLines: string[] }): string => r.consoleLines.find((l) => l.startsWith('timing:')) ?? '';
const field = (line: string, name: string): number => Number(new RegExp(`\\b${name}=(\\d+)`).exec(line)?.[1] ?? NaN);
const modelCalls = (line: string): string[] => line.split('\n').filter((l) => l.startsWith('model-call:'));
const waitingRows = (r: { after: Record<string, string> }): string[] => ((JSON.parse(Object.entries(r.after).find(([p]) => /\/manifest-[^/]+\.json$/.test(p))?.[1] ?? '{}') as
  { waiting?: Array<{ name: string }> }).waiting ?? []).map((w) => w.name);
const drops = (r: { errors: string }): string[] => r.errors.split('\n').flatMap((l) => /drops a (?:pile|request) \((\w+)\)/.exec(l)?.[1] ?? []);
const waitLines = (r: { consoleLines: string[] }): string[] => r.consoleLines.filter((l) => /exhaust|next run|left.*inbox|wait/i.test(l) && !l.startsWith('timing:'));

// One call answers per drain, so a reply a test sets once its call is released is the one that call reads.
const inOrder = (open: readonly Held[]): readonly Held[] => open.slice(0, 1);
const latestFirst = (open: readonly Held[]): readonly Held[] => open.slice(-1);

/** C12's made-up large folder: `n` one-thing piles, thing t to topic folder t, so groups of eight in first-pile order (S2). */
async function topics(n: number) {
  const b = await setup(largeFolder(2 * n, n, n)); await seedState(b);
  const MAIN = ['Projects', 'Areas', 'Resources', 'Archive'];
  const topic = (name: string): string => { const t = Number(/\d+/.exec(name)?.[0] ?? '1') - 1; return `${MAIN[t % 4]}/Topic ${String(t + 1).padStart(2, '0')}`; };
  const selection = { asks: [], items: b.sources.map((s) => ({ itemId: s.itemId, kind: 'unknown', destination: b.id(topic(s.name)), wants: [] })) };
  const intent = { kind: 'tidy-intent', v: 1, things: b.sources.map((s) => ({ fileId: s.itemId, to: topic(s.name), name: s.name,
    note: { name: s.name.replace(/\.txt$/, '.md'), summary: 'Alex received a remote developer offer.', body: 'Alex received a remote developer offer.' } })) };
  const piles = b.admission.piles.map((p) => p.pileId);
  /** The group (0-based) a writing call holds, by its first pile. */
  const group = (f: Frame): number => Math.floor(piles.indexOf(pilesIn(f)[0] ?? '') / 8);
  return { b, selection, intent, piles, group };
}

describe('four groups at once (c12-fanout-parallel)', () => {
  it('AC1 c12-fanout-parallel-four and AC2 time: 5 writing calls, exactly 4 open at once, the 5th only after one is released, with the time left at its start', async () => {
    const { b, selection, intent } = await topics(40);
    let peak = 0; let startedAtPeak = 0; let fifthAfterRelease = false; let stage = 0; let started = 0;
    const held = gate((open) => {
      if (stage === 0) {
        stage = open.length === 4 ? 1 : 2;
        peak = open.length; startedAtPeak = started;
        if (stage === 2) return open;
        vi.advanceTimersByTime(1_000);
        return open.slice(0, 1);
      }
      if (stage === 1) {
        // Wait for the 5th: it may start only now that one of the first four is released.
        if (open.length < 4) return [];
        fifthAfterRelease = started === 5;
        stage = 2;
      }
      return open;
    });
    const r = await run(b, [selection, intent], { beforeReply: async (turn, frame) => {
      if (frame.value.selection !== undefined) started++;
      await held(turn, frame);
    } });
    expect(r.code).toBe(0);
    const calls = writing(r);
    expect(calls, 'five writing calls').toHaveLength(5);
    expect(peak, 'exactly four unresolved at once').toBe(4);
    expect(startedAtPeak, 'the 5th not started while four are open').toBe(4);
    expect(fifthAfterRelease, 'the 5th starts after one of the first four is released').toBe(true);
    // P4: each call's time is what is left at its start; the 5th, queued while the clock moved, gets less.
    const [first, ...others] = calls.map((f) => f.call.timeoutMs);
    expect(others.slice(0, 3), 'the first four start together').toEqual([first, first, first]);
    expect(calls[4]?.call.timeoutMs, 'the 5th: the time left when it starts').toBe((first ?? 0) - 1_000);
    expect(report(r).filed).toHaveLength(40);
  }, 180_000);

  it('AC2 c12-fanout-parallel-time: a 10 s selection then two parallel 10 s groups take about 20 s; model= is the sum of the reported durations', async () => {
    const b = await made({ Plum: 6, Fern: 3 }); await seedState(b);
    const to = { Plum: X, Fern: Y };
    const r = await run(b, [placing(b, to), filing(b, to)], { beforeReply: async (turn, frame) => {
      if (turn === 1) { vi.advanceTimersByTime(10_000); return; }
      await clocked(turn, frame);
    } });
    expect(r.code).toBe(0);
    expect(writing(r), 'two groups').toHaveLength(2);
    const line = timingLine(r);
    expect(field(line, 'total'), 'the two groups overlap: about 20 s, not 30').toBeGreaterThanOrEqual(20_000);
    expect(field(line, 'total'), 'the two groups overlap: about 20 s, not 30').toBeLessThan(25_000);
    const calls = modelCalls(line);
    expect(calls, 'one model-call line per call').toHaveLength(r.frames.length);
    expect(field(line, 'model'), 'model= is the sum of the durations each reply reports').toBe(calls.reduce((n, c) => n + field(c, 'ms'), 0));
    const run1 = line.split('\n')[0] ?? '';
    expect([...run1.matchAll(/\b\w+=(-?\d+)/g)].filter((m) => Number(m[1]) < 0), 'no phase is negative').toEqual([]);
  }, 60_000);
});
/** Each batch of overlapping writing calls takes 10 s of the injected clock once. */
const clocked = gate((open) => { vi.advanceTimersByTime(10_000); return open; });

describe('one plan whatever order replies come in (c12-fanout-parallel, guard)', () => {
  it('AC3 c12-fanout-parallel-order: replies released latest first give byte-identical operations, filed in admission order; a redispatch makes no model call', async () => {
    const piles = { Plum: 7, Fern: 7, Sage: 7 };
    const to = { Plum: X, Fern: Y, Sage: Z };
    const tidy = async (pick: (open: readonly Held[]) => readonly Held[]) => {
      const b = await made(piles); await seedState(b);
      return { b, r: await run(b, [placing(b, to), filing(b, to)], { beforeReply: gate(pick) }) };
    };
    const ordered = await tidy(inOrder);
    const reversed = await tidy(latestFirst);
    expect(writing(reversed.r), 'three groups').toHaveLength(3);
    expect(reversed.r.code).toBe(0);
    expect(JSON.stringify(manifest(reversed.r).operations), 'byte-identical operations').toBe(JSON.stringify(manifest(ordered.r).operations));
    const things = reversed.b.admission.piles.flatMap((p) => p.items.filter((i) => i.name !== PILE_NOTE).map((i) => i.name));
    expect(report(reversed.r).filed.map((f) => (f as { name?: string }).name), 'filed in pile admission order').toEqual(things);
    let calls = 0;
    const counted = async (call: ClaudeCall): Promise<ClaudeExit> => { calls++; throw new Error(`no model call expected: ${call.args.length}`); };
    const again = await redispatchCase(reversed.b.c, reversed.r, 2, { claude: counted, pacing: { baseMs: 0, sleep: async () => {} } });
    expect(again.code, 'the redispatch completes').toBe(0);
    expect(calls, 'a redispatch from the persisted manifest makes no model call').toBe(0);
  }, 180_000);

  it('AC3 c12-fanout-parallel-order: reversed with one group waiting, rows, drops and the wait line follow group order', async () => {
    // Plum and Moss share a folder, Sage and Mint another: groups [Plum, Moss], [Fern], [Sage, Mint].
    const piles = { Plum: 6, Moss: 1, Fern: 7, Sage: 7, Mint: 1 };
    const to = { Plum: X, Moss: X, Fern: Y, Sage: Z, Mint: Z };
    const tidy = async (pick: (open: readonly Held[]) => readonly Held[]) => {
      const b = await made(piles); await seedState(b);
      const replies: unknown[] = [placing(b, to), {}];
      const held = gate(pick);
      const r = await run(b, replies, { narrow: false, beforeReply: async (turn, frame) => {
        if (turn === 1) return;
        await held(turn, frame);
        const tags = tagsIn(frame);
        // Moss renamed to what it is not (nameChangesKind), Mint filed outside its folder (thingPlace): each drops alone; Fern is refused whole.
        replies[1] = tags.includes('Fern') ? refused(b, to, ['Fern']) : { ...filing(b, to, tags), things: filing(b, to, tags).things.map((t) => (
          tagOf(String(t.name)) === 'Moss' ? { ...t, name: String(t.name).replace(/\.png$/, '.txt') } : tagOf(String(t.name)) === 'Mint' ? { ...t, to: X } : t)) };
      } });
      return { b, r };
    };
    const ordered = await tidy(inOrder);
    const reversed = await tidy(latestFirst);
    for (const { b, r } of [ordered, reversed]) waitsForNextRun(r, [idOf(b, 'Fern')], 13);
    expect(drops(reversed.r), 'the drop lines in group order').toEqual(['nameChangesKind', 'thingPlace']);
    expect(drops(reversed.r)).toEqual(drops(ordered.r));
    expect(waitingRows(reversed.r), 'the rows in group order').toEqual(waitingRows(ordered.r));
    expect(waitLines(reversed.r)).toEqual(waitLines(ordered.r));
    expect(JSON.stringify(manifest(reversed.r).operations), 'byte-identical operations').toBe(JSON.stringify(manifest(ordered.r).operations));
  }, 180_000);
});

describe('a stop and a time-out (c12-fanout-parallel)', () => {
  it('AC4 c12-fanout-parallel-stop: a plain error in group 1 stops groups 5 and 6 from starting; the started groups settle; the run fails with it', async () => {
    const { b, selection, intent, group } = await topics(48);
    const fault = new Error('made-up spawn fault');
    const held = gate((open) => { const one = open.find((h) => group(h.frame) === 0); return one ? [one] : open; });
    const r = await run(b, [selection, intent], { beforeReply: async (turn, frame) => {
      await held(turn, frame);
      if (frame.value.selection !== undefined && group(frame) === 0) throw fault;
    } });
    expect(writing(r).map(group).sort(), 'groups 5 and 6 never start').toEqual([0, 1, 2, 3]);
    expect(r.wire?.statuses.at(-1)?.phase, 'the run fails').toBe('failed');
    expect(r.errors, 'with that error').toContain('made-up spawn fault');
    expect(modelCalls(timingLine(r)), 'the started groups settled before the run ended').toHaveLength(5);
  }, 180_000);

  it('AC4 c12-fanout-parallel-time-out: the allowance passing after the first four start makes the 5th wait with its row; the first four are filed', async () => {
    const { b, selection, intent, piles, group } = await topics(40);
    let passed = false;
    const r = await run(b, [selection, intent], { beforeReply: gate((open) => {
      if (!passed && open[0]) { passed = true; vi.advanceTimersByTime(open[0].frame.call.timeoutMs); }
      return open;
    }) });
    expect(writing(r).map(group).sort(), 'the 5th group gets no call').toEqual([0, 1, 2, 3]);
    waitsForNextRun(r, piles.slice(32), 32);
  }, 180_000);
});

describe('retries counted per group (c12-fanout-parallel)', () => {
  it('AC5 c12-fanout-parallel-retries: two groups each refused once, their retries interleaved, each retry is attempt 1', async () => {
    const b = await made({ Plum: 6, Fern: 3 }); await seedState(b);
    const to = { Plum: X, Fern: Y };
    const replies: unknown[] = [placing(b, to), {}];
    const held = gate(inOrder);
    const r = await run(b, replies, { narrow: false, beforeReply: async (turn, frame) => {
      if (turn === 1) return;
      await held(turn, frame);
      replies[1] = isRetry(frame) ? filing(b, to, tagsIn(frame)) : refused(b, to, tagsIn(frame));
    } });
    expect(r.code).toBe(0);
    const calls = writing(r);
    expect(calls.map(isRetry), 'both groups are called before either retry').toEqual([false, false, true, true]);
    expect(calls.map((f) => f.attempt), 'each retry is its group\'s attempt 1').toEqual([0, 0, 1, 1]);
    expect(report(r).filed).toHaveLength(9);
  }, 60_000);

  it('AC5 c12-fanout-parallel-retries: phaseAwareClaude keys attempts by phase and sorted source ids, the empty key for none', async () => {
    const seen: number[] = [];
    const fixture = { drive: fixedDrive(), root: 'FOLDER_ID' };
    const spawn = phaseAwareClaude((_call, _step, attempt) => { seen.push(attempt); return { code: 0, stderr: '', cut: null, stdout: '{}' }; }, () => fixture, true);
    const call = (value: Row, retry = false, cwd = '/made-up/run'): ClaudeCall => ({ command: 'claude', args: [], env: {}, cwd, timeoutMs: 1, maxBytes: 1,
      input: `${JSON.stringify(value)}${retry ? '\nYour reply was refused: a made-up why.' : ''}` });
    const execution = (ids: string[]): Row => ({ piles: [], selection: {}, sources: ids.map((itemId) => ({ itemId })) });
    for (const c of [
      call({ piles: [], sources: [{ itemId: 'a' }, { itemId: 'b' }, { itemId: 'c' }] }), call(execution(['b', 'a'])), call(execution(['c'])),
      call(execution(['a', 'b']), true), call(execution(['c']), true), call(execution(['c']), true),
      call({ piles: [] }), call({ piles: [] }, true), call(execution(['c']), true, '/made-up/next'),
    ]) await spawn(c);
    expect(seen).toEqual([0, 0, 0, 1, 1, 2, 0, 1, 0]);
  });
});

describe('a config folder per call (c12-fanout-parallel)', () => {
  it('AC6 c12-fanout-parallel-home: every call its own HOME and CLAUDE_CONFIG_DIR next to one shared cwd, gone after the run', async () => {
    const b = await made({ Plum: 6, Fern: 3 }); await seedState(b);
    const to = { Plum: X, Fern: Y };
    const replies: unknown[] = [placing(b, to), {}];
    const at: Array<{ home: string; config: string; cwd: string; there: boolean }> = [];
    const held = gate(inOrder);
    const r = await run(b, replies, { narrow: false, beforeReply: async (turn, frame) => {
      const home = frame.call.env.HOME ?? '';
      at.push({ home, config: frame.call.env.CLAUDE_CONFIG_DIR ?? '', cwd: frame.call.cwd, there: existsSync(home) });
      if (turn === 1) return;
      await held(turn, frame);
      replies[1] = tagsIn(frame).includes('Fern') && !isRetry(frame) ? refused(b, to, ['Fern']) : filing(b, to, tagsIn(frame));
    } });
    expect(r.code).toBe(0);
    expect(at, 'a selection, two groups and one retry').toHaveLength(4);
    expect(new Set(at.map((a) => a.home)).size, 'every call its own home').toBe(4);
    expect(new Set(at.map((a) => a.cwd)).size, 'one shared cwd').toBe(1);
    for (const a of at) {
      expect(basename(a.home)).toMatch(/^home-\d+$/);
      expect(a.config, 'its config folder in its home').toBe(join(a.home, '.claude'));
      expect(dirname(a.home), 'a sibling of the cwd').toBe(dirname(a.cwd));
      expect(a.home.startsWith(tmpdir())).toBe(true);
      expect(a.there, 'it exists during its call').toBe(true);
      expect(existsSync(a.home), 'gone after the run').toBe(false);
    }
  }, 60_000);
});
