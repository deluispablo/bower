import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { parseRunManifestV2 } from '../../src/data/contracts/run-manifest';
import { parseRunCheckpoint, verifyCheckpointChain, type Checkpoint } from '../../src/data/contracts/run-checkpoint';
import { RUNNER_WRITES } from '../../src/data/vault/layout';
import { AT, caseReplies, replySequence, scoreCase, type CaseRun } from './corpus-run';
import { HOT, empty, manifests, observe, pacing, redispatchCase, runOnDrive, setup, writes,
  type Observation } from './b23-hot-observe';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(AT); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

const checkpoints = (run: CaseRun): Checkpoint[] => Object.entries(run.after)
  .filter(([path]) => /\/checkpoint-[^/]+\.json$/.test(path))
  .map(([, text]) => JSON.parse(text) as Checkpoint).sort((a, b) => a.revision - b.revision);

it('B3b hot: pre-plan failure and done redispatch send no hot writes', async () => {
  const { c, drive, root } = await setup();
  const events: Observation[] = [];
  const spawn = vi.fn(replySequence([empty]));
  const first = await runOnDrive(c, drive, root, { pacing, claude: spawn, around: observe(drive, root, events) }, 1);
  expect(first.code).toBe(0);
  expect(first.after['Rules.md']).toContain('Keep gardening notes in Resources.');
  expect(writes(events, '.bower/retrieval.json')).toHaveLength(1);
  expect.soft(writes(events, HOT), 'positive settled instruction-only run writes hot').toHaveLength(1);
  const calls = spawn.mock.calls.length;
  events.length = 0;
  const done = await redispatchCase(c, first, 2, { pacing, claude: spawn, around: observe(drive, root, events) });
  expect(done.code).toBe(0);
  expect(spawn).toHaveBeenCalledTimes(calls);
  expect(writes(events, HOT)).toEqual([]);
  expect(events.filter((event) => ['POST', 'PATCH', 'DELETE'].includes(event.method)), 'done dispatch sends no Drive writes').toEqual([]);
  expect(events.filter((event) => event.path === HOT && event.method === 'GET' && event.media), 'done check precedes hot read').toEqual([]);
  expect(done.after[HOT]).toBe(first.after[HOT]);
  expect(manifests(done)).toEqual(manifests(first));

  const failedWorld = await setup();
  const sys = (await failedWorld.drive.listAll(failedWorld.root)).find((f) => f.name === '.bower' && f.parents[0] === failedWorld.root);
  expect(sys).toBeDefined();
  const old = '# Hot\n_Updated: 2026-10-06_\n## Open threads\n## Current focus\n## Recent changes';
  await failedWorld.drive.createText(sys?.id ?? '', 'hot.md', old);
  const failedEvents: Observation[] = [];
  const refusal = vi.fn(async () => { throw new Error('Made-up provider failed before planning'); });
  const failed = await runOnDrive(failedWorld.c, failedWorld.drive, failedWorld.root, {
    pacing, claude: refusal, around: observe(failedWorld.drive, failedWorld.root, failedEvents),
  }, 1);
  expect(refusal).toHaveBeenCalledTimes(1);
  expect(failed.code).toBe(0); // main successfully delivers the failure report to the Worker.
  expect(failed.wire?.statuses.at(-1)?.phase).toBe('failed');
  expect(manifests(failed)).toEqual([]);
  expect(writes(failedEvents, HOT)).toEqual([]);
  expect(failedEvents.filter((event) => ['.bower/index.md', '.bower/retrieval.json'].includes(event.path)
    && ['POST', 'PATCH', 'DELETE'].includes(event.method)), 'pre-plan failure sends no derived writes').toEqual([]);
  expect(failed.after[HOT]).toBe(old);
});

it('B3b hot: a lost maintain reply resumes the same manifest and writes hot once', async () => {
  const { c, drive, root } = await setup('b23-summary-person-lint');
  const source = (await drive.listAll(root)).find((file) => file.name === 'Mulch notice.txt');
  expect(source).toBeDefined();
  const sourcePath = drive.pathOf(source?.id ?? '', root) ?? '';
  const events: Observation[] = [];
  const lost = { enabled: true, reached: false };
  const spawn = vi.fn(caseReplies(c.id));
  const interrupted = await runOnDrive(c, drive, root, { pacing, claude: spawn,
    around: observe(drive, root, events, lost) }, 1);
  // Positive control: the primary filing settled and main persisted its immutable plan.
  expect(interrupted.after['Resources/Gardening/Mulch notice.txt']).toBe(c.inboxFiles['Mulch notice.txt']);
  expect(interrupted.after['Resources/Gardening/Mulch notice.md']).toContain('Alex can collect mulch');
  expect(writes(events, sourcePath)).toHaveLength(1);
  expect(manifests(interrupted)).toHaveLength(1);
  expect(spawn).toHaveBeenCalled();
  expect.soft(lost.reached, 'fault reaches a real hot send inside maintain').toBe(true);
  expect.soft(interrupted.after[HOT] ?? '', 'the response is lost after hot lands').toContain('# Hot');
  expect.soft(interrupted.code, 'interrupted maintain stays resumable').toBe(1);
  expect.soft(interrupted.after['.bower/last-run.json'], 'no barrier before hot reconciles').toBeUndefined();
  expect.soft(checkpoints(interrupted).at(-1)?.phase).not.toBe('done');
  const planCalls = spawn.mock.calls.length;
  lost.enabled = false;
  const resumed = await redispatchCase(c, interrupted, 2, { pacing, claude: spawn, around: observe(drive, root, events) });
  expect(resumed.code).toBe(0);
  expect(manifests(resumed)).toEqual(manifests(interrupted));
  expect(spawn).toHaveBeenCalledTimes(planCalls);
  expect(writes(events, sourcePath), 'recovery never repeats the settled primary filing').toHaveLength(1);
  expect(resumed.after['Resources/Gardening/Mulch notice.md']).toBe(interrupted.after['Resources/Gardening/Mulch notice.md']);
  expect.soft(writes(events, HOT), 'op identity reconciles the landed hot without a second send').toHaveLength(1);
  expect.soft(resumed.after[HOT] ?? '').toContain('# Hot');
  const chain = checkpoints(resumed);
  expect(await verifyCheckpointChain(chain)).toMatchObject({ ok: true });
  const parsed = await parseRunManifestV2(new TextEncoder().encode(manifests(resumed)[0]?.[1] ?? ''), root, RUNNER_WRITES);
  expect(parsed).toMatchObject({ ok: true });
  if (parsed.ok) {
    const maintain = parsed.value.operations.filter((op) => op.effect.kind === 'maintain');
    expect(maintain).toHaveLength(1);
    if (maintain[0]?.effect.kind === 'maintain') expect.soft(maintain[0].effect.inputs.targets)
      .toContainEqual(expect.objectContaining({ path: HOT, fileId: expect.any(String) }));
    for (const cp of chain) expect(await parseRunCheckpoint(new TextEncoder().encode(JSON.stringify(cp)), {
      rootId: root, runId: parsed.value.runId, captureId: parsed.value.captureId, manifestHash: parsed.sha256,
      operationIds: parsed.value.operations.map((op) => op.operationId),
    })).toMatchObject({ ok: true });
    expect(chain.at(-1)?.outcomes.find((outcome) => outcome.operationId === maintain[0]?.operationId)?.state).toBe('applied');
  }
  expect(chain.at(-1)?.phase).toBe('done');
  const report = (resumed.lastRun as { run: { report: { created: Array<{ path: string }>; updated: Array<{ path: string }> } } }).run.report;
  expect([...report.created, ...report.updated].filter((row) => row.path === HOT)).toEqual([]);
  expect(Object.keys(resumed.after).filter((path) => path.startsWith('.bower/archive/hot/'))).toEqual([]);
  if (lost.reached) {
    const hotAt = events.findIndex((event) => event === writes(events, HOT)[0]);
    const barrierAt = events.findIndex((event) => event === writes(events, '.bower/last-run.json')[0]);
    expect(barrierAt).toBeGreaterThan(hotAt);
  }
  events.length = 0;
  const done = await redispatchCase(c, resumed, 3, { pacing, claude: spawn, around: observe(drive, root, events) });
  expect(done.code).toBe(0);
  expect(writes(events, HOT)).toEqual([]);
});

it('corpus-fix-b23-hot AC2: hot refresh and recovery report actual effects', async () => {
  const { c, drive, root } = await setup('b23-hot-evidence-only');
  expect(c.rubric).not.toMatch(/report row is created|^Pending:/m);
  expect(c.rubric).toContain("Bower's health note");
  expect(c.expected.report?.created).toEqual(['Bower health.md']);
  expect(c.folder[HOT]).toContain('Evergreen launch');
  const events: Observation[] = [];
  const spawn = vi.fn(caseReplies(c.id));
  const first = await runOnDrive(c, drive, root, { pacing, claude: spawn, around: observe(drive, root, events) }, 1);
  expect(first.code).toBe(0);
  expect(writes(events, HOT)).toHaveLength(1);
  expect(events.filter((e) => ['POST', 'PATCH', 'DELETE'].includes(e.method) && !e.path.startsWith('.bower/'))
    .map((e) => e.path)).toEqual(['Bower health.md']);
  expect((first.lastRun as { run: { report: { created: Array<{ path: string }> } } }).run.report.created
    .map((r) => r.path)).toEqual(['Bower health.md']);
  expect(scoreCase(c, first).unmet).toEqual([]);
  const calls = spawn.mock.calls.length;
  events.length = 0;
  const done = await redispatchCase(c, first, 2, { pacing, claude: spawn, around: observe(drive, root, events) });
  expect(done.code).toBe(0);
  expect(spawn).toHaveBeenCalledTimes(calls);
  expect(events.filter((e) => ['POST', 'PATCH', 'DELETE'].includes(e.method))).toEqual([]);
  expect(done.after[HOT]).toBe(first.after[HOT]);
  expect(done.after['.bower/last-run.json']).toBe(first.after['.bower/last-run.json']);
  expect(manifests(done)).toEqual(manifests(first));
  expect(scoreCase(c, done).unmet).toEqual([]);
});
