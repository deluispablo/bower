import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { FakeWorker } from '../fake/fake-worker';
import { FakeRunService } from '../fake/fake-run-service';
import { seedFakeDrive } from '../fake/seed';
import { liveShape } from '../fake/live-shape';
import { makeLiveSources, type LiveSources } from './index';

let live: LiveSources | null = null;
afterEach(() => {
  live?.dispose();
  live = null;
  vi.restoreAllMocks();
});

/**
 * The live-shaped folder (a declared pile, 20 leftovers, 12 changes, questions, an unseen finished tidy-up) on a
 * pretend Drive at 300 ms a call, four at once, read as Home reads it (TL-P4-13 home-cache-stable).
 */
async function slowReport() {
  localStorage.clear();
  sessionStorage.clear();
  // The made-up leftovers are not real dispositions: their refusal is logged and expected.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const drive = new FakeDrive();
  const rootId = (await seedFakeDrive(drive, 'slow-report', Date.now())) as string;
  await liveShape(drive, rootId);
  const runs = new FakeRunService({ drive, scale: 'instant' });
  const worker = new FakeWorker({ drive, scenario: 'slow-report', rootId, fresh: true, runs });
  live = makeLiveSources({ worker, drive, runningPiles: () => worker.runningPiles(), pollMs: 300, declarePiles: true });
  const s = live;
  await s.session.current();
  await s.vault.tree();
  drive.latency = 300;
  drive.concurrency = 4;
  drive.calls = 0;
  return { drive, s };
}

/** What Home asks at once: the run, the Inbox from the listing, the full piles, the questions, the changes. */
async function homeLoad(s: LiveSources, drive: FakeDrive) {
  const start = Date.now();
  const done: Record<string, number> = {};
  const at = <T>(name: string, p: Promise<T>): Promise<T> => p.then((v) => { done[name] = Date.now() - start; return v; });
  const [run, listed, piles, questions] = await Promise.all([
    at('run', s.runs.current()),
    at('listed', s.vault.pilesListed()),
    at('piles', s.vault.piles()),
    at('questions', s.vault.questions()),
    at('changes', s.vault.changes()),
    // The side panel and the status bar read the piles as well (about 25 callers in the live trace).
    ...Array.from({ length: 6 }, (_, i) => at(`piles${i}`, s.vault.piles())),
  ]);
  return { run, listed, piles, questions, done, ms: Date.now() - start, calls: drive.calls };
}

describe('Home on the latency fake', () => {
  it('Home is complete within 2 s on the latency fake', async () => {
    const { drive, s } = await slowReport();
    const out = await homeLoad(s, drive);
    expect(out.run?.report, 'the last tidy-up report').toBeTruthy();
    expect(out.piles.length).toBeGreaterThan(0);
    expect(out.questions.length).toBeGreaterThan(0);
    expect(out.done.listed ?? 0).toBeLessThan(1200);
    expect(out.ms, `complete after ${out.ms} ms, ${out.calls} Drive calls`).toBeLessThan(2000);
  }, 60_000);

  it('a report refresh does not restart the inbox reads', async () => {
    const { drive, s } = await slowReport();
    // The report's refresh lands in the middle of the full read; no file is read twice because of it.
    const reads = new Map<string, number>();
    const readText = drive.readText.bind(drive);
    drive.readText = async (id: string, ...rest: never[]) => {
      reads.set(id, (reads.get(id) ?? 0) + 1);
      return readText(id, ...(rest as []));
    };
    const out = await homeLoad(s, drive);
    expect(out.piles.length).toBeGreaterThan(0);
    const twice = [...reads].filter(([, n]) => n > 1).map(([id, n]) => `${drive.pathOf(id, 'root')} x${n}`);
    expect(twice.join(', '), `read more than once in one load, ${out.calls} calls`).toBe('');
  }, 60_000);
});
