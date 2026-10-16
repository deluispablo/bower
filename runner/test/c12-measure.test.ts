/**
 * C12 measured (c12-measure, rethink section 6): each model call's input, cached and output sizes reach the timing
 * output, and a scripted made-up large folder pins characters per call and calls per run for the next C12 tasks.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunTiming } from '../src/timing';
import { AT } from './corpus-run';
import { paging } from './drive-v3';
import * as support from './b1-planning-support';
import { candidates, fileIntent, report, run, seedState, select, setup } from './b1-planning-support';

const oldPageSize = paging.size;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT); paging.size = 1000;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); paging.size = oldPageSize; });

/** Every printed line of the run's timing output (the run line, then one line per model call). */
const printed = (r: { consoleLines: string[] }): string[] => r.consoleLines.flatMap((l) => l.split('\n'));
const runLine = (r: { consoleLines: string[] }): string => printed(r).find((l) => l.startsWith('timing:')) ?? '';
const callLines = (r: { consoleLines: string[] }): string[] => printed(r).filter((l) => l.startsWith('model-call:'));

describe('model usage in the timing output (c12-measure)', () => {
  it('AC1 c12-measure-cache-split: ModelStats keeps cache reads and writes apart and the run line ends with cache=r/w', async () => {
    const timing = new RunTiming(0, () => 0);
    const stats = (n: number) => ({ wallMs: n * 10, apiMs: n * 7, turns: n, inputTokens: n * 16, outputTokens: n * 5,
      cacheReadTokens: n * 3, cacheWriteTokens: n * 2 });
    timing.addModel(stats(1)); timing.addModel(stats(2));
    expect(timing.model).toMatchObject({ inputTokens: 48, outputTokens: 15, cacheReadTokens: 9, cacheWriteTokens: 6 });
    expect(timing.line('done'), 'in= keeps the whole input; the cache split is the last field').toMatch(/ in=48 out=15 .* region=unknown cache=9\/6$/m);

    // Through the provider: usage's cache_read_input_tokens and cache_creation_input_tokens, per scripted reply (n = 1, 2).
    const b = await setup(); await seedState(b);
    const r = await run(b, [select(b), fileIntent(b)]);
    expect(r.code).toBe(0);
    expect(runLine(r)).toMatch(/ in=48 out=15 /);
    expect(runLine(r)).toMatch(/ region=unknown cache=9\/6$/);
  });

  it('AC2 c12-measure-call-lines: one line per model call, in call order, with its kind, in, cached, out and ms', async () => {
    const b = await setup(); await seedState(b);
    const r = await run(b, [select(b), fileIntent(b)]);
    expect(callLines(r)).toEqual([
      'model-call: kind=selection in=16 cached=3 out=5 ms=10',
      'model-call: kind=execution in=32 cached=6 out=10 ms=20',
    ]);
    // A refused reply's retry is a call of its own, of the same kind.
    const again = await setup(); await seedState(again);
    const retried = await run(again, ['refused', select(again), fileIntent(again)]);
    expect(retried.frames).toHaveLength(3);
    expect(callLines(retried).map((l) => /kind=(\w+)/.exec(l)?.[1])).toEqual(['selection', 'selection', 'execution']);
    expect(callLines(retried)[2]).toBe('model-call: kind=execution in=48 cached=9 out=15 ms=30');
  });
});

/** Characters of every model call's input, in call order. */
const sizes = (r: Awaited<ReturnType<typeof run>>): number[] => r.frames.map((f) => f.call.input.length);

/**
 * Today's figures, measured on this fixture (main 316fbcce): the ceilings are those plus 5%, rounded up to a thousand;
 * the floors are the things filed today. The next C12 tasks move these numbers (c12-prefix, c12-map, c12-fanout).
 */
describe('the made-up large-folder benchmark (c12-measure)', () => {
  it.each([
    // things, things filed at least, the selection call's characters at most, the execution call's characters at most
    [25, 24, 88_000, 94_000], // measured 24 filed, 83,709 and 88,742 characters
    [150, 14, 116_000, 120_000], // measured 14 filed, 109,536 and 113,569 characters
  ])('AC3 c12-measure-benchmark: 800 notes in 60 folders and %i things', async (things, filedMin, selectionMax, executionMax) => {
    expect(support, 'the made-up large folder is part of the planning test support').toHaveProperty('largeFolder');
    const large = support.largeFolder(800, 60, things);
    expect(Object.keys(large.folder), 'notes').toHaveLength(800);
    expect(new Set(Object.keys(large.folder).map((p) => p.slice(0, p.lastIndexOf('/')))), 'folders').toHaveProperty('size', 60);
    expect(large.inbox.flatMap((p) => p.files), 'things').toHaveLength(things);
    expect(JSON.stringify(large), 'made-up names only').not.toMatch(/@|https?:/);
    const b = await setup(large); await seedState(b);
    // Each thing with a candidate wants its first one and gets a note. With the index cut, a thing shown no candidate
    // cannot be given a new note (TL-P4-47 Q6), so the scripted model leaves it unplaced: it waits in the inbox.
    const selected = select(b, [], large.to); const intent = fileIntent(b, large.to);
    const r = await run(b, [selected, intent], { beforeReply: async (turn, frame) => {
      if (turn !== 1) return;
      selected.items = selected.items.flatMap((item) => { const wants = candidates(frame, item.itemId).slice(0, 1); return wants.length ? [{ ...item, wants }] : []; });
      intent.things = intent.things.filter((t) => selected.items.some((i) => i.itemId === t.fileId));
    } });
    const [selection = 0, execution = 0] = sizes(r);
    // The figures, for the next tasks and staging to compare (console is mocked here).
    process.stdout.write(`c12-measure: things=${things} calls=${r.frames.length} chars=${selection}/${execution} filed=${report(r).filed.length}\n`);
    expect(r.code).toBe(0);
    expect(r.frames.length, 'calls per run: one selection, one execution').toBe(2);
    expect(selection, 'the selection call\'s characters').toBeLessThanOrEqual(selectionMax);
    expect(execution, 'the execution call\'s characters').toBeLessThanOrEqual(executionMax);
    expect(report(r).filed.length, 'things filed').toBeGreaterThanOrEqual(filedMin);
  }, 120_000);
});
