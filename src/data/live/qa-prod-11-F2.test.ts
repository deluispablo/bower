/**
 * qa-prod-11-F2: opening with a stopped (failed) last run lists the folder once and asks the Bin once. The runner never
 * writes `.bower/last-run.json` for a failed run (it writes it only in `saveReport`, once a run is done), so the report
 * read there is an older run's and the page used to list the whole folder again for it: every listing, Bin query and
 * parent read twice, and Home re-read after the second listing. A failed run this page did not see going ended before
 * its listing, which already holds whatever it changed. Prior art: RFC 9111 §4.2 (a stored response that is still fresh
 * is served, not fetched again); TanStack Query's request deduplication and staleTime. The counts are the guard: the
 * pretend Drive charges nothing for a listing, and its run service writes a view for a failed run, so no e2e can see it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import type { DriveFile } from '../drive/drive-api';
import { lastRunText } from '../spine/barrier';
import type { NewPile, RunReport } from '../types';
import { DriveVault } from '../vault/drive-vault';
import { WorkerHttp } from '../worker/worker-http';
import { LiveRuns } from './runs';

const AT = Date.parse('2026-10-10T12:00:00Z');
const report = (to: string): RunReport => ({ filed: [{ name: 'receipt.pdf', title: 'Receipt', kind: 'pdf', to }], created: [], updated: [], setAside: [], questions: [] });
const done = (id: string): string =>
  lastRunText({ v: 1, run: { id, scope: 'all', phase: 'done', requestedAt: AT - 600_000, phaseAt: AT - 500_000, total: 1, finishedAt: AT - 500_000, report: report('Projects') } });
const failed = { id: 'STOP', scope: 'all', phase: 'failed', requestedAt: AT - 60_000, phaseAt: AT - 1_000, failure: 'The tidy-up stopped before changing anything. Try again.' };

const pages: DriveVault[] = [];
const runs: LiveRuns[] = [];

afterEach(() => {
  for (const r of runs) r.dispose();
  for (const p of pages) p.dispose();
  runs.length = pages.length = 0;
  localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** A Worker whose `/status` answers what `status.run` holds when asked. */
function worker(): { http: WorkerHttp; status: { run: object | null; revision: number } } {
  const status: { run: object | null; revision: number } = { run: null, revision: 1 };
  const http = new WorkerHttp('https://worker.example', vi.fn(async () => new Response(JSON.stringify(status), { status: 200 })));
  return { http, status };
}

const input = (tag: string, n: number): NewPile => ({
  text: '', items: Array.from({ length: n }, (_, i) => ({ name: `${tag}-${i}.pdf`, kind: 'pdf' as const, origin: 'From this computer', body: new Blob([`%PDF ${tag} ${i}`], { type: 'application/pdf' }) })),
});

/** qa-prod-11's opening: two piles waiting, one binned pile, and `.bower/last-run.json` still showing the run before the stop. */
async function opening(): Promise<{ drive: FakeDrive; page: () => DriveVault }> {
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
  await uploader.addPile(input('gone', 2));
  await uploader.settled();
  const listed = async (): Promise<DriveFile[]> => (await drive.listAll(inbox)).filter((f) => f.parents[0] === inbox);
  // A binned thing is trashed with its children (the fake does not inherit trash, Drive does).
  for (const f of await listed()) {
    for (const c of (await drive.listAll(f.id)).filter((x) => x.parents[0] === f.id)) await drive.trash(c.id);
    await drive.trash(f.id);
  }
  await uploader.addPile(input('a', 2));
  await uploader.addPile(input('b', 2));
  await uploader.settled();
  await drive.createText(sys, 'last-run.json', done('RUN'));
  expect(await listed(), 'setup: two piles waiting').toHaveLength(2);
  return { drive, page };
}

describe('qa-prod-11-F2: opening with a stopped last run', () => {
  it('qa11-one-listing-with-a-stopped-run: piles, the orphan count and the stopped run together list once and ask the Bin once', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { drive, page } = await opening();
    const alone = await page().orphanSummary();
    const { http, status } = worker();
    status.run = failed;
    const home = page();
    const r = new LiveRuns(http, home);
    runs.push(r);
    const lookups = vi.spyOn(drive, 'binnedByItem');
    const listing = vi.spyOn(drive, 'listAll');
    const refresh = vi.spyOn(home, 'refresh');
    const [piles, summary, run] = await Promise.all([home.piles(), home.orphanSummary(), r.current()]);
    await Promise.allSettled(refresh.mock.results.map((x) => x.value));
    expect(run?.phase, 'setup: the stopped run shows').toBe('failed');
    expect(run?.report, 'a stopped run shows no report').toBeUndefined();
    expect(piles, 'the two piles waiting').toHaveLength(2);
    expect(summary, 'the same count as an opening with no run').toEqual(alone);
    expect(refresh, 'AC: no second listing for a stopped run\'s report').not.toHaveBeenCalled();
    expect(listing, 'AC: one listing for the opening').toHaveBeenCalledTimes(1);
    expect(lookups, 'AC: one Bin lookup for the opening').toHaveBeenCalledTimes(1);
  });

  it('qa11 guard: a stopped run this page saw going lists once more when it ends, since it may have made changes', async () => {
    const { drive, page } = await opening();
    const { http, status } = worker();
    status.run = { ...failed, phase: 'writing' };
    const home = page();
    const r = new LiveRuns(http, home);
    runs.push(r);
    const going = await Promise.all([home.piles(), r.current()]);
    expect(going[1]?.phase, 'setup: the page sees the run going').toBe('writing');
    status.run = failed;
    status.revision += 1;
    const listing = vi.spyOn(drive, 'listAll');
    const run = await r.current();
    expect(run?.phase).toBe('failed');
    expect(listing, 'the run\'s changes are listed').toHaveBeenCalledTimes(1);
  });
});
