import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { SYSTEM } from '../vault/layout';
import { FakeWorker } from './fake-worker';
import { seedFakeDrive } from './seed';
import type { Scenario } from '../demo/scenario';

afterEach(() => vi.useRealTimers());

async function world(scenario: Scenario) {
  localStorage.clear();
  const drive = new FakeDrive();
  const rootId = await seedFakeDrive(drive, scenario, Date.now());
  return { drive, rootId, worker: new FakeWorker({ drive, scenario, scale: 'instant', rootId }) };
}

const until = async (worker: FakeWorker, phase: string): Promise<void> => {
  for (let i = 0; i < 200 && (await worker.status())?.phase !== phase; i++) await new Promise((r) => setTimeout(r, 1));
};

describe('the fake Worker', () => {
  it('is signed out in the signed-out scenario until you sign in', async () => {
    const { worker } = await world('signed-out');
    expect(await worker.me()).toBeNull();
    await worker.signIn();
    expect((await worker.me())?.user.name).toBe('Alex');
  });

  it('makes the Bower folder with the five main folders', async () => {
    const { drive, worker } = await world('first');
    expect((await worker.me())?.folderId).toBeNull();
    const id = await worker.createFolder();
    const names = (await drive.listAll(id)).filter((f) => f.parents[0] === id).map((f) => f.name).sort();
    expect(names).toEqual(['.bower', 'About me.md', 'Archive', 'Areas', 'Inbox', 'Projects', 'Resources', 'Rules.md']);
    expect((await worker.me())?.folderId).toBe(id);
  });

  it('runs a tidy-up to done and writes its report', async () => {
    const { drive, rootId, worker } = await world('default');
    const run = await worker.process('all');
    expect(run.phase).toBe('queued');
    expect((await worker.process('all')).id).toBe(run.id);
    await until(worker, 'done');
    const done = await worker.status();
    expect(done).toMatchObject({ id: run.id, phase: 'done' });
    expect(done?.total).toBeGreaterThan(0);
    const last = JSON.parse(drive.dump(rootId ?? '').get(SYSTEM.lastRun) ?? '{}') as { run?: { id: string; report?: { filed: unknown[] } } };
    expect(last.run?.id).toBe(run.id);
    expect(last.run?.report?.filed.length).toBe(done?.total);
  });

  it('refuses a tidy-up with nothing to do', async () => {
    const { worker } = await world('empty');
    await expect(worker.process('all')).rejects.toMatchObject({ code: 'conflict', message: 'Nothing is waiting in the inbox.' });
    await expect(worker.process('instructions')).rejects.toMatchObject({ code: 'conflict', message: 'There is nothing new for Bower to read.' });
  });

  it('fails one tidy-up in the fail-run scenario, then the next one works', async () => {
    const { worker } = await world('fail-run');
    await worker.process('all');
    await until(worker, 'failed');
    expect((await worker.status())?.failure).toMatch(/Nothing was moved/);
    await worker.process('all');
    await until(worker, 'done');
    expect((await worker.status())?.phase).toBe('done');
  });

  it('knows the piles a running tidy-up took', async () => {
    const { worker } = await world('default');
    await worker.process('all');
    await new Promise((r) => setTimeout(r, 0));
    expect(worker.runningPiles().size).toBeGreaterThan(0);
    await until(worker, 'done');
    expect(worker.runningPiles().size).toBe(0);
  });

  it('comes back with the last run in the back scenario', async () => {
    const { worker } = await world('back');
    expect((await worker.status())?.phase).toBe('done');
  });
});
