/**
 * C12's five corpus cases land and score through production main (c12-corpus). The faults are the test's, never the
 * case's: a failed model call, a lost answer with Drive gone, a long text cut where marked, a group that gets no valid
 * reply (specs/c12-lifecycle/plan-corpus-r2.md, AC9-AC13 and AC15; the admission wait is in c12-corpus-admit.test.ts).
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FakeDrive } from '../../src/data/drive/fake-drive';
import { WAITING_WHY } from '../../src/data/contracts/run-manifest';
import { B_FAILURE } from '../../src/data/spine/scripted';
import type { ClaudeExit, ClaudeSpawn } from '../src/claude';
import { CORPUS_CAPABILITIES, loadCase, score, timelineOf, type LoadedCase } from '../src/corpus';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { AT, caseReplies, frameOf, inboxAsSeeded, lastJson, perPress, redispatchCase, replySequence, runOnDrive, runWithClaude, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
const ONE_PRESS = ['c12-model-failure-retry', 'c12-tool-interruption-recovery', 'c12-text-budget-truthful'] as const;
const CASES = [...ONE_PRESS, 'c12-group-waits', 'c12-admission-waits'] as const;
const PLOT = 'Areas/Home/Garden plot.md';
const BENCH = 'Projects/Bench fund/Bench fund.md';
const pacing = { baseMs: 0, sleep: async () => {} };
const phase = (r: CaseRun) => r.wire?.statuses.at(-1)?.phase;
const reportOf = (r: CaseRun) => (r.lastRun as { run?: { report?: { filed: unknown[]; setAside: Array<{ why: string }>; waiting?: number; nothingReady?: true } } } | null)?.run?.report;
const url = (input: RequestInfo | URL): URL => new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
const filing = (name: string, text: string) => ({ kind: 'tidy-intent', v: 1, things: [{ fileId: `$file:${name}`, to: 'Areas/Home', name }],
  lines: [{ note: PLOT, text, cites: `$file:${name}` }] });
const WATER = filing('Water butt notice.txt', 'The replacement water butt has arrived.');
const BOTH = { ...WATER, things: [...WATER.things, ...filing('Bench notice.txt', '').things],
  lines: [...WATER.lines, { note: PLOT, text: 'The shared bench has been delivered.', cites: '$file:Bench notice.txt' }] };
async function seeded(id: string): Promise<{ c: LoadedCase; drive: FakeDrive; root: string }> {
  const c = await loadCase(join(ROOT, id));
  const drive = fixedDrive();
  return { c, drive, root: await seedCase(drive, c) };
}
const evidence = async (drive: FakeDrive, root: string) => Object.fromEntries(await Promise.all((await drive.listAll(root))
  .map(async (f) => [f.id, await drive.evidence(f.id)] as const)));

describe('C12 corpus cases land (c12-corpus)', () => {
  it('AC9 c12-corpus-registered: C12 is a corpus capability', () => {
    expect(CORPUS_CAPABILITIES as readonly string[]).toContain('C12');
  });

  it.each(CASES)('AC9 c12-corpus-fixtures-landed: %s has scripted replies, the first run\'s health note and no pending wording', async (id) => {
    const c = await loadCase(join(ROOT, id));
    expect(c.capability).toBe('C12');
    expect(existsSync(join(ROOT, id, 'replies.json')), 'scripted replies').toBe(true);
    const replies = JSON.parse(await readFile(join(ROOT, id, 'replies.json'), 'utf8')) as Array<{ kind?: string }>;
    expect(replies.filter((r) => r.kind === 'tidy-intent'), 'one execution reply per press').toHaveLength(1 + (c.presses?.length ?? 0));
    expect(c.covers, 'scored by its own test, as the C15 and B10 cases are').toBe('model');
    expect((c.expected.runs?.[0] ?? c.expected).report?.created ?? [], 'the first run\'s health note is expected').toEqual(['Bower health.md']);
    expect(`${c.source}\n${c.rubric}`, 'no pending-proof wording').not.toMatch(/pending|future driver|proposed driver|must rule/i);
  });

  it('AC10 c12-corpus-appendix-figure: the unseen appendix holds a figure, so a claim from it is caught by the shown-text check', async () => {
    const c = await loadCase(join(ROOT, 'c12-text-budget-truthful'));
    expect(c.inboxFiles['Long garden notice.txt'] ?? '', 'the late appendix carries a date').toMatch(/Late appendix: [^\n]*2026-11-02/);
    expect(c.expected.notes?.[0]?.excludes ?? [], 'and the plot never says it').toContain('2026-11-02');
  });

  it.each(ONE_PRESS)('AC11 c12-corpus-case: %s through main scores clean with two model calls', async (id) => {
    const c = await loadCase(join(ROOT, id));
    const model = perPress(caseReplies(id));
    const run = await runWithClaude(c, model.claude);
    expect(run.score).toEqual({ pass: true, unmet: [] });
    expect(phase(run)).toBe('done');
    expect(model.calls, 'selection and execution').toEqual([2]);
  });
});

describe('C12 lifecycles through main (c12-corpus guards)', () => {
  const FAILURES: Array<[string, ClaudeExit | 'refused']> = [
    ['a time cut', { code: null, stdout: '', stderr: 'Synthetic model time limit.', cut: 'time' }],
    ['a size cut', { code: null, stdout: '', stderr: '', cut: 'size' }],
    ['the turn cap', { code: 0, stderr: '', cut: null, stdout: JSON.stringify({ type: 'result', subtype: 'error_max_turns', is_error: true, num_turns: 61 }) }],
    ['an error result', { code: 1, stderr: 'Synthetic API error.', cut: null, stdout: JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true }) }],
    ['two refused replies', 'refused'],
  ];
  it.each(FAILURES)('AC12 c12-corpus-failure-retry: %s on the first press writes nothing and says so; the later tidy-up files the notice once', async (_name, failure) => {
    const { c, drive, root } = await seeded('c12-model-failure-retry');
    const before = await evidence(drive, root);
    let calls = 0;
    const failing = phaseAwareClaude(() => { calls++; return failure === 'refused' ? reply({ kind: 'tidy-intent', v: 1, things: [], extra: true }) : failure; },
      () => ({ drive, root, admission: null }), true);
    const first = await runOnDrive(c, drive, root, { claude: failing, pacing }, 1);
    expect(first.wire?.statuses.at(-1), 'failed, with the stopped-before-changing sentence').toMatchObject({ phase: 'failed', failure: B_FAILURE });
    expect(calls, 'a failed call is not retried; a refused reply once').toBe(failure === 'refused' ? 2 : 1);
    expect(first.lastRun, 'no report claims the failed run').toBeNull();
    expect(await evidence(drive, root), 'every file as it was').toEqual(before);
    const second = await runOnDrive(c, drive, root, { claude: replySequence([WATER]), pacing }, 2);
    expect(phase(second)).toBe('done');
    expect(second.after['Areas/Home/Water butt notice.txt'], 'the notice filed whole').toBe(c.inboxFiles['Water butt notice.txt']);
    expect(timelineOf(second.after[PLOT] ?? '').filter((line) => line.includes('The replacement water butt has arrived.')), 'its news once').toHaveLength(1);
    expect(Object.keys(second.after).filter((path) => path.startsWith('Inbox/')), 'the inbox is empty').toEqual([]);
  });

  it('AC12 c12-corpus-interruption: a lost answer on a filing, with Drive gone after it, stays saving; attempt 2 finishes the same plan once, with no model call', async () => {
    const { c, drive, root } = await seeded('c12-tool-interruption-recovery');
    const water = (await drive.listAll(root)).find((f) => f.name === 'Water butt notice.txt')?.id ?? '';
    let lost = false; let moves = 0;
    const count = (next: typeof globalThis.fetch): typeof globalThis.fetch => async (input, init) => {
      if (init?.method === 'PATCH' && url(input).pathname === `/drive/v3/files/${water}` && init.body && String(init.body).includes('bowerOp')) moves++;
      return next(input, init);
    };
    const first = await runOnDrive(c, drive, root, { claude: replySequence([BOTH]), pacing, around: (next) => async (input, init) => {
      if (lost && url(input).origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost.');
      if (init?.method === 'PATCH' && url(input).pathname === `/drive/v3/files/${water}`) {
        const response = await count(next)(input, init);
        lost = response.ok;
        throw new TypeError('Made-up lost answer after the move.');
      }
      return next(input, init);
    } }, 1);
    expect(lost, 'main reached the filing').toBe(true);
    expect(phase(first), 'something changed: saving, never done or failed').toBe('saving');
    expect(first.code).toBe(1);
    expect(first.lastRun, 'no report claims it done').toBeNull();
    const model = vi.fn<ClaudeSpawn>(async () => { throw new Error('A redispatch must not call a model.'); });
    const second = await redispatchCase(c, first, 2, { claude: model, pacing, around: count });
    expect(model).not.toHaveBeenCalled();
    expect(phase(second)).toBe('done');
    expect(moves, 'the landed filing is read back, never sent again').toBe(1);
    expect(second.after['Areas/Home/Water butt notice.txt']).toBe(c.inboxFiles['Water butt notice.txt']);
    expect(second.after['Areas/Home/Bench notice.txt']).toBe(c.inboxFiles['Bench notice.txt']);
    const lines = timelineOf(second.after[PLOT] ?? '');
    for (const news of ['The replacement water butt has arrived.', 'The shared bench has been delivered.']) expect(lines.filter((l) => l.includes(news)), news).toHaveLength(1);
    expect(reportOf(second)?.filed, 'both filings reported once').toHaveLength(2);
  });

  it('AC12 c12-corpus-text-budget: the model sees the notice cut where marked and never its appendix; a figure from the appendix is refused once', async () => {
    const c = await loadCase(join(ROOT, 'c12-text-budget-truthful'));
    const name = 'Long garden notice.txt';
    const unseen = filing(name, 'The shared bench delivery is cancelled until 2026-11-02.');
    const inputs: string[] = [];
    const spawn: ClaudeSpawn = (call) => {
      const execution = lastJson<{ selection?: unknown }>(call.input).selection !== undefined;
      if (execution) inputs.push(call.input);
      return replySequence([execution && inputs.length === 1 ? unseen : filing(name, 'The replacement water butt has arrived.')])(call);
    };
    const run = await runWithClaude(c, spawn);
    const shown = inputs[0] ?? '';
    expect(shown, 'the shown part').toContain('The replacement water butt has arrived.');
    expect(shown, 'the cut is marked').toContain('[cut here:');
    expect(shown, 'the appendix is not shown').not.toContain('2026-11-02');
    expect(vi.mocked(console.error).mock.calls.flat().map(String).filter((l) => /was refused \(numbers\)/.test(l)), 'refused once for its unseen figure').toHaveLength(1);
    expect(phase(run)).toBe('done');
    expect(run.after[`Areas/Home/${name}`], 'the whole notice is filed, every byte').toBe(c.inboxFiles[name]);
    expect(run.after[PLOT] ?? '', 'no claim from the unseen appendix').not.toContain('2026-11-02');
  });
});

describe('C12 group wait through main (c12-corpus AC13)', () => {
  /** The case's replies, but the bench receipts' group gets a reply refused whole (an unknown key), twice: the first press only. */
  const refusingBench = (id: string) => {
    const model = caseReplies(id);
    let refused = 0;
    return perPress((call) => {
      const things = frameOf<{ selection?: unknown; piles?: Array<{ things: Array<{ name: string }> }> }>(call);
      const bench = things.selection !== undefined && things.piles?.some((p) => p.things.some((t) => t.name.startsWith('Bench receipt')));
      if (bench && refused < 2) { refused++; return Promise.resolve(reply({ kind: 'tidy-intent', v: 1, things: [], extra: true })); }
      return model(call);
    });
  };

  it('AC13 c12-corpus-group-waits: the refused group waits untouched, the other is filed; the next tidy-up files it; both presses score clean', async () => {
    const c = await loadCase(join(ROOT, 'c12-group-waits'));
    const model = refusingBench('c12-group-waits');
    const run = await runWithClaude(c, model.claude);
    expect(run.score).toEqual({ pass: true, unmet: [] });
    const [one] = run.runs ?? [];
    if (!one) throw new Error('Press 1 is missing.');
    expect(one.code).toBe(0);
    expect(phase(one)).toBe('done');
    expect(model.calls, 'press 1: selection, two groups and one retry; press 2: selection and one group').toEqual([4, 2]);
    expect(reportOf(one)?.filed, 'the seed packets').toHaveLength(6);
    expect(reportOf(one)?.setAside.map((r) => r.why), 'one row says the bench receipts wait').toEqual([WAITING_WHY]);
    expect(reportOf(one)).not.toHaveProperty('waiting');
    expect(reportOf(one)).not.toHaveProperty('nothingReady');
    for (const n of [1, 2, 3]) {
      const { now, was } = await inboxAsSeeded(c, one, `Bench receipt ${n}.txt`);
      expect(now, `Bench receipt ${n} is still in the inbox as it was`).toEqual(was);
    }
    expect(one.after[BENCH], 'the bench note is unchanged').toBe(await readFile(join(ROOT, 'c12-group-waits/folder', BENCH), 'utf8'));
    for (const n of [1, 2, 3]) expect(run.after[`Projects/Bench fund/Bench receipt ${n}.txt`], `Bench receipt ${n} filed by press 2`).toBeDefined();
    expect(timelineOf(run.after[BENCH] ?? '').filter((l) => l.includes('The bench fund paid for the new slats.')), 'its line once').toHaveLength(1);
    expect(Object.keys(run.after).filter((p) => p.startsWith('Inbox/')), 'the inbox is empty').toEqual([]);
    expect(reportOf(run)?.setAside, 'nothing is put aside in press 2').toHaveLength(0);
  });

  it('AC13 c12-corpus-unknown-name: a reply naming a file no admitted pile holds is still an error', async () => {
    const c = await loadCase(join(ROOT, 'c12-group-waits'));
    const errors: string[] = [];
    const known = replySequence([filing('No such notice.txt', 'Made up.')]);
    await runWithClaude(c, async (call) => {
      try { return await known(call); } catch (e) { errors.push(String(e)); throw e; }
    });
    expect(errors.some((e) => /names an unshown file: \$file:No such notice\.txt/.test(e))).toBe(true);
  });
});

describe('the corpus scorer reads the waiting count (c12-corpus AC15)', () => {
  // A finished run in the runner's current `last-run.json` shape (corpus-scorer-validation AC2).
  const lastRun = (report: object) => ({ v: 1, run: { id: 'run-wait', scope: 'all', phase: 'done', requestedAt: 0, phaseAt: 0,
    report: { filed: [], created: [], updated: [], setAside: [], questions: [], ...report } } });
  const input = (report: object) => ({ expected: { report: { waiting: 1 } }, before: {}, after: {}, lastRun: lastRun(report) });
  it('AC15 c12-corpus-waiting-scored: expected waiting 1 is unmet against none, and met against 1', () => {
    expect(score(input({ filed: [] })).unmet).toEqual(['report.waiting: 0, expected 1']);
    expect(score(input({ filed: [], waiting: 1 }))).toEqual({ pass: true, unmet: [] });
  });
});
