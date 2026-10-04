import { afterEach, describe, expect, it } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { FakeWorker } from '../fake/fake-worker';
import { seedFakeDrive } from '../fake/seed';
import type { Scenario } from '../demo/scenario';
import type { RunState } from '../types';
import { makeLiveSources, type LiveSources } from './index';

let live: LiveSources | null = null;
afterEach(() => {
  live?.dispose();
  live = null;
});

async function open(scenario: Scenario = 'default'): Promise<LiveSources> {
  localStorage.clear();
  const drive = new FakeDrive();
  const rootId = await seedFakeDrive(drive, scenario, Date.now());
  const worker = new FakeWorker({ drive, scenario, scale: 'instant', rootId });
  live = makeLiveSources({ worker, drive, runningPiles: () => worker.runningPiles() });
  return live;
}

async function until(s: LiveSources, done: (r: RunState | null) => boolean): Promise<RunState | null> {
  for (let i = 0; i < 300; i++) {
    const r = await s.runs.current();
    if (done(r)) return r;
    await new Promise((res) => setTimeout(res, 2));
  }
  throw new Error('the run never ended');
}

describe('LiveRuns', () => {
  it('a run walks the phases and ends with its report', async () => {
    const s = await open();
    const seen: string[] = [];
    s.runs.subscribe(() => void s.runs.current().then((r) => r && seen.push(r.phase)));
    const r = await s.runs.start('all');
    expect(r.phase).toBe('queued');
    expect(r.seen).toBe(false);
    const done = await until(s, (x) => x?.phase === 'done');
    expect(done?.report?.filed.length).toBeGreaterThan(0);
    expect(done?.report?.filed.length).toBe(done?.total);
    expect(await s.vault.piles()).toEqual([]);
  });

  it('a failed run carries its sentence and leaves the inbox', async () => {
    const s = await open('fail-run');
    const piles = (await s.vault.piles()).length;
    await s.runs.start('all');
    const r = await until(s, (x) => x?.phase === 'failed');
    expect(r?.failure).toMatch(/Nothing was moved/);
    expect(await s.vault.piles()).toHaveLength(piles);
  });

  it('seen survives a new LiveRuns', async () => {
    const s = await open('back');
    const r = await s.runs.current();
    expect(r?.phase).toBe('done');
    expect(r?.seen).toBe(false);
    expect(r?.report?.filed.length).toBeGreaterThan(5);
    await s.runs.markSeen(r?.id ?? '');
    expect((await s.runs.current())?.seen).toBe(true);
    s.dispose();
    const again = makeLiveSources({ worker: s.worker, drive: s.drive, runningPiles: () => new Set() });
    expect((await again.runs.current())?.seen).toBe(true);
    again.dispose();
  });

  it('the inbox is locked while a run is going', async () => {
    const s = await open();
    await s.runs.start('all');
    const pile = (await s.vault.piles())[0];
    await expect(s.vault.removePile(pile?.id ?? '')).rejects.toMatchObject({ code: 'conflict' });
    await until(s, (x) => x?.phase === 'done');
  });
});

describe('LiveSession', () => {
  it('signs in and out', async () => {
    const s = await open('signed-out');
    expect(await s.session.current()).toBeNull();
    expect((await s.session.signIn()).name).toBe('Alex');
    expect((await s.session.current())?.name).toBe('Alex');
    await s.session.signOut();
    expect(await s.session.current()).toBeNull();
  });

  it('createFolder reports each root once and the folder is ready', async () => {
    const s = await open('first');
    expect(await s.session.folderState()).toBe('missing');
    const steps: string[] = [];
    await s.session.createFolder((r) => steps.push(r));
    expect(steps).toEqual(['Inbox', 'Projects', 'Areas', 'Resources', 'Archive']);
    expect(await s.session.folderState()).toBe('ready');
    expect((await s.vault.tree()).map((n) => n.name)).toContain('Projects');
  });
});
