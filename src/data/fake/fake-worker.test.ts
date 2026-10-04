import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { SYSTEM } from '../vault/layout';
import { FakeWorker } from './fake-worker';
import { seedFakeDrive } from './seed';
import { DriveVault } from '../vault/drive-vault';
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

  it('a run cut short by a reload shows as stopped, with the inbox as it was', async () => {
    localStorage.clear();
    const drive = new FakeDrive();
    const rootId = await seedFakeDrive(drive, 'default', Date.now());
    const before = new FakeWorker({ drive, scenario: 'default', scale: 'demo', rootId });
    await before.process('all');
    await new Promise((r) => setTimeout(r, 50));
    // The page reloads: a new Worker on the same Drive.
    const after = new FakeWorker({ drive, scenario: 'default', scale: 'demo', rootId, fresh: false });
    const run = await after.status();
    expect(run?.phase).toBe('failed');
    expect(run?.failure).toMatch(/reload/);
    const piles = await new DriveVault({ drive, rootId: async () => rootId ?? '', runningPiles: () => new Set() }).piles();
    expect(piles.length).toBeGreaterThan(0);
  });

  it('a reload during filing does not say nothing was moved; before filing it does', async () => {
    for (const [phase, says] of [
      ['saving', /some things may be in their new places/i],
      ['reading', /Nothing was moved/],
    ] as const) {
      localStorage.clear();
      const drive = new FakeDrive();
      const rootId = (await seedFakeDrive(drive, 'default', Date.now())) ?? '';
      const all = await drive.listAll(rootId);
      const sys = all.find((f) => f.folder && f.name === SYSTEM.dir && f.parents[0] === rootId);
      const run = { id: 'run-1', scope: 'all', phase, requestedAt: Date.now() - 60_000, phaseAt: Date.now() - 1000 };
      await drive.createText(sys?.id ?? '', 'last-run.json', JSON.stringify({ v: 1, run }));
      const after = new FakeWorker({ drive, scenario: 'default', scale: 'instant', rootId, fresh: false });
      const out = await after.status();
      expect(out?.phase, phase).toBe('failed');
      expect(out?.failure, phase).toMatch(says);
      if (phase === 'saving') expect(out?.failure).not.toMatch(/Nothing was moved/);
    }
  });

  it('the running situation starts its run only on a fresh pretend Drive, not on a reload', async () => {
    localStorage.clear();
    const drive = new FakeDrive();
    const rootId = await seedFakeDrive(drive, 'running', Date.now());
    const reloaded = new FakeWorker({ drive, scenario: 'running', scale: 'demo', rootId, fresh: false });
    expect((await reloaded.status())?.phase ?? 'none').not.toMatch(/queued|reading|writing|saving/);
  });
});
