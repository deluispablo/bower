/**
 * qa-prod-10-F3: opening with a finished last run lists the folder once and asks the Bin once; the run's report is read
 * from that listing, and the folder is listed again only when the report there is not this run's, or when this page
 * saw the run going (specs/qa-prod-10/plan.md, F3; qa-prod-10-F3 rulings). Prior art: RFC 9111 §4.2-4.3 (serve a
 * stored response while fresh, validate before fetching again; the run id in `last-run.json` is the validator);
 * TanStack Query's staleTime (no refetch of data still fresh). The counts are the guard: the pretend Drive charges
 * nothing for a listing, so no e2e can see this.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import type { DriveFile } from '../drive/drive-api';
import { FakeRunService } from '../fake/fake-run-service';
import { FakeWorker } from '../fake/fake-worker';
import { seedFakeDrive } from '../fake/seed';
import { lastRunText } from '../spine/barrier';
import type { NewPile, RunReport } from '../types';
import { DriveVault } from '../vault/drive-vault';
import { WorkerHttp } from '../worker/worker-http';
import { makeLiveSources, type LiveSources } from './index';
import { LiveRuns } from './runs';

const AT = Date.parse('2026-10-10T12:00:00Z');
const report = (to: string): RunReport => ({ filed: [{ name: 'receipt.pdf', title: 'Receipt', kind: 'pdf', to }], created: [], updated: [], setAside: [], questions: [] });
const view = (id: string, phase: 'done' | 'saving', to: string): string =>
  lastRunText({ v: 1, run: { id, scope: 'all', phase, requestedAt: AT - 60_000, phaseAt: AT - 1_000, total: 1, ...(phase === 'done' ? { finishedAt: AT - 1_000, report: report(to) } : {}) } });

let live: LiveSources | null = null;
const pages: DriveVault[] = [];
const runs: LiveRuns[] = [];

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  live?.dispose();
  live = null;
  for (const r of runs) r.dispose();
  for (const p of pages) p.dispose();
  runs.length = pages.length = 0;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** A Worker whose `/status` answers what `status.run` holds when asked. */
function worker(): { http: WorkerHttp; status: { run: object | null; revision: number } } {
  const status: { run: object | null; revision: number } = { run: null, revision: 1 };
  const http = new WorkerHttp('https://worker.example', vi.fn(async () => new Response(JSON.stringify(status), { status: 200 })));
  return { http, status };
}

/** Every listing the page started, settled. */
async function listingsSettled(refresh: { mock: { results: Array<{ value: unknown }> } }): Promise<void> {
  await Promise.allSettled(refresh.mock.results.map((r) => r.value));
}

describe('opening with a finished last run', () => {
  it('qa10-one-listing-with-a-finished-run: the opening lists the folder once and shows the run with its report', async () => {
    const drive = new FakeDrive();
    const rootId = await seedFakeDrive(drive, 'slow-report', Date.now());
    if (!rootId) throw new Error('The synthetic folder is missing');
    const fake = new FakeWorker({ drive, runs: new FakeRunService({ drive, scale: 'instant' }), scenario: 'slow-report', rootId });
    live = makeLiveSources({ worker: fake, drive });
    const listing = vi.spyOn(FakeDrive.prototype, 'listAll');
    const refresh = vi.spyOn(DriveVault.prototype, 'refresh');
    const [, , , run] = await Promise.all([live.vault.pilesListed(), live.vault.piles(), live.vault.orphanSummary(), live.runs.current()]);
    await listingsSettled(refresh);
    expect(run?.phase, 'setup: the seed account opens with a finished run').toBe('done');
    expect(run?.report, 'the finished run shows its report').toBeDefined();
    expect(listing, 'one listing for the opening').toHaveBeenCalledTimes(1);
    expect(refresh, 'no second listing for the report').not.toHaveBeenCalled();
  });

  const input = (tag: string, n: number): NewPile => ({
    text: '', items: Array.from({ length: n }, (_, i) => ({ name: `${tag}-${i}.pdf`, kind: 'pdf' as const, origin: 'From this computer', body: new Blob([`%PDF ${tag} ${i}`], { type: 'application/pdf' }) })),
  });

  /** qa-prod-9-F3's opening: seven binned two-thing piles and one live pile; `.bower/last-run.json` shows run RUN done. */
  async function binned(): Promise<{ drive: FakeDrive; page: () => DriveVault }> {
    vi.setSystemTime(AT);
    const drive = new FakeDrive({ clock: () => AT, chunkMultiple: 4 });
    const root = (await drive.createFolder('root', 'Bower')).id;
    const inbox = (await drive.createFolder(root, 'Inbox')).id;
    const sys = (await drive.createFolder(root, '.bower')).id;
    await drive.createFolder(sys, 'piles');
    const page = (): DriveVault => {
      const v = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true, device: 'DEVICE_A' });
      pages.push(v);
      return v;
    };
    const uploader = page();
    for (let i = 0; i < 7; i++) await uploader.addPile(input(`p${i}`, 2));
    await uploader.settled();
    // A binned thing is trashed with its children (the fake does not inherit trash, Drive does).
    const listed = async (): Promise<DriveFile[]> => (await drive.listAll(inbox)).filter((f) => f.parents[0] === inbox);
    for (const f of await listed()) {
      for (const c of (await drive.listAll(f.id)).filter((x) => x.parents[0] === f.id)) await drive.trash(c.id);
      await drive.trash(f.id);
    }
    await uploader.addPile(input('live', 2));
    await uploader.settled();
    await drive.createText(sys, 'last-run.json', view('RUN', 'done', 'Projects'));
    expect(await listed(), 'setup: the live pile only').toHaveLength(1);
    return { drive, page };
  }

  it('qa10-one-bin-lookup-with-a-finished-run: piles, the orphan count and the run together list once and ask the Bin once', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { drive, page } = await binned();
    const alone = await page().orphanSummary();
    const { http, status } = worker();
    status.run = { id: 'RUN', scope: 'all', phase: 'done', requestedAt: AT - 60_000, phaseAt: AT - 1_000 };
    const home = page();
    const r = new LiveRuns(http, home);
    runs.push(r);
    const lookups = vi.spyOn(drive, 'binnedByItem');
    const listing = vi.spyOn(drive, 'listAll');
    const [, summary, run] = await Promise.all([home.piles(), home.orphanSummary(), r.current()]);
    expect(run?.report, 'the run shows its report').toEqual(report('Projects'));
    expect(summary, 'the same count as an opening with no run').toEqual(alone);
    expect(listing, 'one listing for the opening').toHaveBeenCalledTimes(1);
    expect(lookups, 'one Bin lookup for the opening').toHaveBeenCalledTimes(1);
  });
});

describe('a run that finishes while the page is open', () => {
  /** A folder whose `.bower/last-run.json` shows `first`; the page and its runs over a scripted Worker. */
  async function open(first: string) {
    const drive = new FakeDrive();
    const root = (await drive.createFolder('root', 'Bower')).id;
    const sys = (await drive.createFolder(root, '.bower')).id;
    const file = await drive.createText(sys, 'last-run.json', first);
    const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
    pages.push(vault);
    const { http, status } = worker();
    const r = new LiveRuns(http, vault);
    runs.push(r);
    const finish = async (id: string, to: string): Promise<void> => {
      const now = (await drive.get(file.id)).modifiedTime;
      await drive.writeText(file.id, view(id, 'done', to), now);
      status.run = { id, scope: 'all', phase: 'done', requestedAt: AT - 60_000, phaseAt: AT - 1_000 };
      status.revision += 1;
    };
    return { drive, vault, runs: r, status, finish };
  }

  it('qa10-finish-while-open-lists-again: a run the page did not see going, whose report lands after the listing, lists once more', async () => {
    const { drive, vault, runs: r, status, finish } = await open(view('RUN', 'done', 'Projects'));
    status.run = { id: 'RUN', scope: 'all', phase: 'done', requestedAt: AT - 60_000, phaseAt: AT - 1_000 };
    await Promise.all([vault.piles(), r.current()]);
    await finish('RUN2', 'Travel');
    const listing = vi.spyOn(drive, 'listAll');
    const run = await r.current();
    expect(listing, 'the run\'s moves are listed').toHaveBeenCalledTimes(1);
    expect(run?.report, 'and its own report shows').toEqual(report('Travel'));
  });

  it('qa10-seen-going-lists-again: a run the page saw going lists once more when it ends, though the report there was never read', async () => {
    const { drive, vault, runs: r, status, finish } = await open(view('RUN', 'done', 'Projects'));
    status.run = { id: 'RUN2', scope: 'all', phase: 'saving', requestedAt: AT - 60_000, phaseAt: AT - 2_000 };
    const going = await Promise.all([vault.piles(), r.current()]);
    expect(going[1]?.phase, 'setup: the page sees the run going').toBe('saving');
    await finish('RUN2', 'Travel');
    const listing = vi.spyOn(drive, 'listAll');
    const run = await r.current();
    expect(listing, 'the run\'s moves are listed').toHaveBeenCalledTimes(1);
    expect(run?.report, 'and its own report shows').toEqual(report('Travel'));
  });
});
