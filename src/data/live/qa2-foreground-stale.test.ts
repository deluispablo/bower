import { afterEach, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { FakeWorker } from '../fake/fake-worker';
import { FakeRunService } from '../fake/fake-run-service';
import { seedFakeDrive } from '../fake/seed';
import type { RunReport } from '../types';
import type { RunWire } from '../worker/worker-api';
import { makeLiveSources, type LiveSources } from './index';

let live: LiveSources | null = null;
let second: LiveSources | null = null;

afterEach(() => {
  live?.dispose();
  second?.dispose();
  live = second = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function open() {
  localStorage.clear();
  sessionStorage.clear();
  const drive = new FakeDrive();
  const rootId = await seedFakeDrive(drive, 'default', Date.now());
  if (!rootId) throw new Error('The synthetic folder is missing');
  const worker = new FakeWorker({ drive, runs: new FakeRunService({ drive, scale: 'instant' }), scenario: 'default', rootId });
  live = makeLiveSources({ worker, drive });
  await live.vault.piles();
  await live.vault.tree();
  await live.runs.current();
  const listing = vi.spyOn(drive, 'listAll');
  vi.useFakeTimers();
  return { s: live, drive, worker, rootId, listing };
}

function back(): void {
  for (const value of ['hidden', 'visible'] as const) {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(value);
    document.dispatchEvent(new Event('visibilitychange'));
  }
}

it('AC1 returns to view 2 s apart for a minute list the folder at most twice', async () => {
  const { listing } = await open();
  for (let i = 0; i < 30; i++) {
    back();
    await vi.advanceTimersByTimeAsync(2000);
  }
  expect(listing).toHaveBeenCalledTimes(2);
});

it("AC2 a return 5 s after a finished tidy-up's listing lists nothing more", async () => {
  const { s, worker, listing } = await open();
  const wire: RunWire = { id: 'DONE', phase: 'done', scope: 'all', requestedAt: 1, phaseAt: 1 };
  const report: RunReport = { filed: [], created: [], updated: [], setAside: [], questions: [] };
  vi.spyOn(worker, 'status').mockResolvedValue({ run: wire, revision: 1 });
  vi.spyOn(s.vault, 'lastRun').mockResolvedValue({ v: 1, run: { ...wire, report } });
  await s.runs.current();
  await vi.advanceTimersByTimeAsync(5000);
  back();
  await vi.advanceTimersByTimeAsync(0);
  expect(listing).toHaveBeenCalledOnce();
});

it('AC3 a return 30 s after the last listing sees a change made elsewhere', async () => {
  const { s, drive, rootId, listing } = await open();
  second = makeLiveSources({ drive, worker: new FakeWorker({ drive, runs: new FakeRunService({ drive, scale: 'instant' }), scenario: 'default', rootId }) });
  second.runs.dispose();
  await second.vault.flushJournal();
  listing.mockClear();
  back();
  await vi.advanceTimersByTimeAsync(0);
  expect(listing).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(30_000);
  await second.drive.createText(rootId, 'External.md', 'A new remote note.');
  back();
  await vi.advanceTimersByTimeAsync(0);
  expect(listing).toHaveBeenCalledTimes(2);
  expect((await s.vault.note('External.md')).body).toBe('A new remote note.');
});
