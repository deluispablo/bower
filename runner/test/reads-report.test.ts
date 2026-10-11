import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DriveFile } from '../../src/data/drive/drive-api';
import { RunnerDrive } from '../src/drive';
import { runnerReads } from '../src/spine/records';
import { RunnerToken } from '../src/token';
import { API, RUN_ID, TICKET, driveV3, fixedDrive, paging, type DriveV3 } from './drive-v3';
import { modelled, type Call } from './modelled';
import { finishedBefore } from './earlier-runs';

afterEach(() => {
  paging.size = 2;
});

/** The run's phases as the Worker hears them: plan reads end at the first write, the report runs from `saving` to `done`. */
function phases(calls: Call[], ms: number): { reads: Call[]; readsMs: number; report: Call[]; reportMs: number } {
  const status = calls.map((c, i) => ({ c, i })).filter((x) => x.c.kind === 'status');
  const firstWrite = calls.findIndex((c) => c.kind === 'write');
  const saving = status[2];
  const done = status[3];
  if (!saving || !done || firstWrite < 0) throw new Error('the run did not report reading, writing, saving and done');
  const reads = calls.slice(0, firstWrite).filter((c) => c.kind === 'read');
  const report = calls.slice(saving.i + 1, done.i);
  return { reads, readsMs: calls[firstWrite]?.at ?? ms, report, reportMs: done.c.at - saving.c.at };
}

/** Today's modelled plan reads for c04-offer-and-flat (150 ms a Drive call, 80 ms a Worker call): 25 Drive reads. */
const READS_BEFORE_MS = 4150;
/** Today's report: 62 calls in 8060 ms (44 Drive reads, 6 writes, 12 attempt checks). */
const REPORT_BEFORE_CALLS = 62;

describe('the runner plan reads and report', () => {
  it('plan reads finish under the budget with modelled Drive latency', async () => {
    const { calls, ms, code } = await modelled();
    const p = phases(calls, ms);
    if (process.env.DUMP) console.log('DUMP\n' + calls.map((c, i) => `${i} ${c.at} ${c.kind} ${c.method} ${c.name ?? ''} ${c.path.slice(0, 90)}`).join('\n'));
    console.log(`reads: modelled=${p.readsMs}ms (was ${READS_BEFORE_MS}) drive reads=${p.reads.length} (was 25)`);
    expect(code).toBe(0);
    // TL-P4-42 addendum 5: cold questions.json media adds 150 ms; measured 2,880 ms.
    // Keep the existing strict bound form and its prior headroom (2,075 + 750 + 150).
    expect(p.readsMs).toBeLessThan(READS_BEFORE_MS / 2 + 900);
  });

  it('with 25 earlier runs plan reads stay within their measured maintenance delta', async () => {
    const { calls, ms, code } = await modelled(async (drive, root) => { await finishedBefore(drive, root, 25); });
    expect(code).toBe(0);
    // TL-P4-42 addendum 5: retained questions.json media adds 150 ms; measured 3,330 ms.
    expect(phases(calls, ms).readsMs).toBeLessThanOrEqual(2280 + 1050);
  });

  it('the report keeps its barrier order in fewer calls', async () => {
    const { calls, ms, code } = await modelled();
    const p = phases(calls, ms);
    if (process.env.DUMP) console.log('DUMP\n' + p.report.map((c, i) => `${i} ${c.at} ${c.kind} ${c.method} ${c.name ?? ''} ${c.path.slice(0, 90)}`).join('\n'));
    console.log(`report: modelled=${p.reportMs}ms calls=${p.report.length} (was ${REPORT_BEFORE_CALLS} in 8060ms)`);
    expect(code).toBe(0);
    // The barrier's order (TL-P3-22): the report record, the dispositions, dispositions.json, then last-run.json,
    // confirmed by its answer, and only then the closing checkpoint.
    // After the barrier, the ended stamp on the run's own folder (`retention.ts`), then done.
    const all = p.report.filter((c) => c.kind === 'write').map((c) => c.name ?? '?');
    expect(all.at(-1)).toBe(RUN_ID);
    const writes = all.slice(0, -1);
    const at = (re: RegExp): number => writes.findIndex((n) => re.test(n));
    expect(at(/^report-/)).toBeGreaterThanOrEqual(0);
    expect(at(/^report-/)).toBeLessThan(at(/^dispositions\.json$/));
    if (at(/^disposition-/) >= 0) expect(at(/^disposition-/)).toBeLessThan(at(/^dispositions\.json$/));
    console.log(`report writes: ${writes.join(', ')}`);
    expect(at(/^dispositions\.json$/)).toBeLessThan(at(/^last-run\.json$/));
    expect(at(/^last-run\.json$/)).toBe(writes.length - 2);
    expect(at(/^checkpoint-/)).toBe(-1 + writes.length);
    const lastRun = p.report.findIndex((c) => c.kind === 'write' && c.name === 'last-run.json');
    // last-run.json is confirmed by its write's answer: nothing reads it back.
    expect(p.report.slice(lastRun + 1).filter((c) => c.kind === 'read' && c.name === 'last-run.json')).toEqual([]);
    // Fewer calls: at most half of today's.
    expect(p.report.length).toBeLessThanOrEqual(REPORT_BEFORE_CALLS / 2);
  });
});

describe('the record listing kept across the runner\'s own writes', () => {
  const adapterOn = (wire: DriveV3): RunnerDrive =>
    new RunnerDrive({ token: new RunnerToken({ api: API, runId: RUN_ID, ticket: TICKET, fetch: wire.fetch, now: () => wire.now }), attempt: 1, fetch: wire.fetch });
  const byId = (files: DriveFile[]): string[] => files.map((f) => `${f.id} ${f.name} ${f.parents.join()} ${f.modifiedTime}`).sort();
  const lists = (wire: DriveV3): number => wire.requests.filter((r) => r.method === 'GET' && r.url.pathname === '/drive/v3/files').length;

  async function seeded(): Promise<{ wire: DriveV3; root: string; bower: string }> {
    const drive = fixedDrive();
    const root = (await drive.createFolder('root', 'Bower')).id;
    const bower = (await drive.createFolder(root, '.bower')).id;
    await drive.createText(bower, 'questions.json', '{}');
    await drive.createText(root, 'Rules.md', 'Rules.');
    return { wire: driveV3(drive), root, bower };
  }

  it('is brought up to date from the answers of its own writes, as a fresh listing would give it', async () => {
    const { wire, root, bower } = await seeded();
    const adapter = adapterOn(wire);
    const reads = runnerReads(adapter, RUN_ID);
    await reads.listAll(root);
    const before = lists(wire);
    const writes = await adapter.batch();
    const runs = await writes.createFolder(bower, 'runs');
    const run = await writes.createFolder(runs.id, RUN_ID);
    await writes.createText(run.id, 'manifest.json', '{}');
    const other = await writes.createFolder(root, 'Resources');
    await writes.createText(other.id, 'Elsewhere.md', 'Not listed.');
    const questions = (await reads.listAll(root)).find((f) => f.name === 'questions.json');
    await writes.writeText(questions?.id ?? '', '{"v":1}', questions?.modifiedTime ?? '');
    const kept = await reads.listAll(root);
    // Nothing was listed for the kept one; listed afresh by another reader, it is the same.
    const listedForKept = lists(wire) - before;
    const fresh = await runnerReads(adapterOn(wire), RUN_ID).listAll(root);
    expect(byId(kept)).toEqual(byId(fresh));
    expect(kept.map((f) => f.name)).toEqual(expect.arrayContaining(['runs', RUN_ID, 'manifest.json', 'Resources']));
    expect(kept.map((f) => f.name)).not.toContain('Elsewhere.md');
    expect(listedForKept).toBe(0);
  });

  it('is listed again when a write\'s answer was lost, since what Drive holds is not known', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { wire, root, bower } = await seeded();
    const adapter = adapterOn(wire);
    const reads = runnerReads(adapter, RUN_ID);
    await reads.listAll(root);
    adapter.fault = { before: () => 'lose-reply' };
    const writes = await adapter.batch();
    await expect(writes.createText(bower, 'suggestions.json', '{}')).rejects.toThrow();
    adapter.fault = null;
    const listed = lists(wire);
    const now = await reads.listAll(root);
    // The write landed though its answer was lost, and the listing shows it because it was read again.
    expect(lists(wire)).toBeGreaterThan(listed);
    expect(now.map((f) => f.name)).toContain('suggestions.json');
  });
});
