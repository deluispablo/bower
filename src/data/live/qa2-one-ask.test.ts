import { afterEach, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { DriveVault } from '../vault/drive-vault';
import { WorkerHttp } from '../worker/worker-http';
import { LiveRuns } from './runs';

let runs: LiveRuns;
afterEach(() => runs?.dispose());

function open() {
  localStorage.clear();
  const replies: Array<(response: Response) => void> = [];
  const fetch = vi.fn(() => new Promise<Response>((resolve) => replies.push(resolve)));
  const worker = new WorkerHttp('https://worker.example', fetch);
  const vault = new DriveVault({ drive: new FakeDrive(), rootId: async () => 'FOLDER_ID', runningPiles: () => new Set() });
  runs = new LiveRuns(worker, vault);
  const run = { id: 'RUN', scope: 'all', phase: 'reading', requestedAt: 1, phaseAt: 1 };
  const answer = (index: number) => replies[index]?.(new Response(JSON.stringify({ run, revision: 1 }), { status: 200 }));
  return { fetch, answer, run };
}

it('six current() at once send one /status, and all six get its answer', async () => {
  const { fetch, answer, run } = open();
  const pending = Array.from({ length: 6 }, () => runs.current());
  const calls = fetch.mock.calls.length;
  for (let i = 0; i < calls; i++) answer(i);
  expect(await Promise.all(pending)).toEqual(Array.from({ length: 6 }, () => ({ ...run, seen: false })));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith('https://worker.example/status', expect.anything());
});

it('a current() after the first one settled asks again', async () => {
  const { fetch, answer } = open();
  const first = runs.current();
  answer(0);
  await first;
  const second = runs.current();
  answer(1);
  await second;
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('current({ again: true }) asks even while another is on its way', async () => {
  const { fetch, answer, run } = open();
  const first = runs.current();
  const second = runs.current({ again: true });
  expect(fetch).toHaveBeenCalledTimes(2);
  answer(1);
  expect(await second).toMatchObject(run);
  answer(0);
  expect(await first).toMatchObject(run);
});
