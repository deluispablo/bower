/**
 * C12 measured (c12-measure, rethink section 6): each model call's input, cached and output sizes reach the timing
 * output, and a scripted made-up large folder pins characters per call and calls per run for the next C12 tasks.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeScripted } from '../../src/data/fake/fake-runner';
import { claudeProvider, type ClaudeExit } from '../src/claude';
import { RunTiming } from '../src/timing';
import { AT } from './corpus-run';
import { RUN_ID, paging } from './drive-v3';
import * as support from './b1-planning-support';
import { candidates, fileIntent, phaseAwareClaude, report, run, seedState, select, setup } from './b1-planning-support';

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

  // Review gap (round 1, acceptance): the call lines are RunTiming.line's own, after the run line, in its one output.
  it('AC2 c12-measure-call-lines: the call lines follow the run line in the one timing output', async () => {
    const timing = new RunTiming(0, () => 0);
    timing.addModel({ wallMs: 10, apiMs: 7, turns: 1, inputTokens: 16, outputTokens: 5, cacheReadTokens: 3, cacheWriteTokens: 2 }, 'selection');
    timing.addModel(null, 'execution');
    expect(timing.line('done').split('\n')).toEqual([expect.stringMatching(/^timing: .* in=16 out=5 .* cache=3\/2$/),
      'model-call: kind=selection in=16 cached=3 out=5 ms=10', 'model-call: kind=execution in=0 cached=0 out=0 ms=0']);

    const b = await setup(); await seedState(b);
    const r = await run(b, [select(b), fileIntent(b)]);
    const logged = r.consoleLines.filter((l) => l.includes('model-call:'));
    expect(logged, 'printed once, with the run line').toHaveLength(1);
    expect(logged[0]?.split('\n')).toEqual([runLine(r), ...callLines(r)]);
    expect(callLines(r)).toHaveLength(2);
  });

  // Review gap (round 1, ruling): a spawned call with no JSON result (it throws, is cut, or prints none) still gets its
  // line, with zeros; the run line's model figures stay as they were (no stats, nothing summed).
  it.each([
    ['throws', (): ClaudeExit => { throw new Error('spawn failed'); }],
    ['is cut at its time cap', (): ClaudeExit => ({ code: null, stderr: '', cut: 'time', stdout: '{"type":"res' })],
    ['prints no JSON result', (): ClaudeExit => ({ code: 1, stderr: 'crashed', cut: null, stdout: 'Segmentation fault' })],
  ])('AC2 c12-measure-call-lines: a call that %s still gets its line, with zeros', async (_what, exit) => {
    const b = await setup(); await seedState(b);
    const timing = new RunTiming(0, () => 0);
    let spawned = 0;
    const spawn = phaseAwareClaude(() => { spawned++; return exit(); }, () => ({ drive: b.drive, root: b.root, admission: b.admission }), true);
    await claudeProvider({ env: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up' }, spawn, timing }, { rootId: b.root, runId: RUN_ID, allowWeb: false },
      fakeScripted(b.drive))({ taken: b.admission, deferred: [] }).catch(() => null);
    const [line = '', ...calls] = timing.line('done').split('\n');
    expect(spawned).toBeGreaterThan(0);
    expect(calls).toEqual(Array.from({ length: spawned }, () => 'model-call: kind=selection in=0 cached=0 out=0 ms=0'));
    expect(line).toMatch(/ api=0 turns=0 in=0 out=0 .* cache=0\/0$/);
    expect(timing.model).toBeNull();
  });
});

/** Characters of all every model call reads, its prompt file and its stdin (c12-prefix), in call order. */
const sizes = (r: Awaited<ReturnType<typeof run>>): number[] => r.frames.map((f) => f.prompt.length);

/**
 * Today's figures, measured on this fixture (main 316fbcce): the ceilings are those plus 5%, rounded up to a thousand;
 * the floors are the things filed today. The next C12 tasks move these numbers (c12-prefix, c12-map, c12-fanout).
 */
describe('the made-up large-folder benchmark (c12-measure)', () => {
  it.each([
    // things, things filed at least, the selection call's characters at most, the execution call's characters at most
    // The cards carry up to 12 candidates a source, so the calls are larger than with the old index (nothing is cut now).
    [25, 25, 114_000, 128_000], // measured 25 filed, 107,874 and 121,199 characters (c12-map-cards)
    [150, 50, 217_000, 245_000], // measured 50 filed, 206,486 and 232,991 characters (c12-map-cards); 14 before c12-map
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
      // The run holds whole above 200 operations until c12-admit, so the scripted model places at most 50 things.
      selected.items = selected.items.flatMap((item) => { const wants = candidates(frame, item.itemId).slice(0, 1); return wants.length ? [{ ...item, wants }] : []; }).slice(0, 50);
      intent.things = intent.things.filter((t) => selected.items.some((i) => i.itemId === t.fileId));
    } });
    const [selection = 0, execution = 0] = sizes(r);
    // c12-prefix spec review round 1 ruling 2: the measure counts the prompt file too, not stdin alone.
    expect(r.frames.every((f) => f.call.args.includes('--system-prompt-file')), 'each call names its prompt file').toBe(true);
    expect(selection, 'the prompt file is counted').toBeGreaterThan((r.frames[0]?.call.input.length ?? 0) + 1);
    // The figures, for the next tasks and staging to compare (console is mocked here).
    process.stdout.write(`c12-measure: things=${things} calls=${r.frames.length} chars=${selection}/${execution} filed=${report(r).filed.length}\n`);
    expect(r.code).toBe(0);
    expect(r.frames.length, 'calls per run: one selection, one execution').toBe(2);
    expect(selection, 'the selection call\'s characters').toBeLessThanOrEqual(selectionMax);
    expect(execution, 'the execution call\'s characters').toBeLessThanOrEqual(executionMax);
    expect(report(r).filed.length, 'things filed').toBeGreaterThanOrEqual(filedMin);
  }, 120_000);
});
