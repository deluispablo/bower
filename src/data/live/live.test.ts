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
  sessionStorage.clear();
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

describe('an ended session', () => {
  it('Drive refusing the person sends them to sign in', async () => {
    const s = await open();
    expect((await s.session.current())?.name).toBe('Alex');
    let told = 0;
    s.session.subscribe(() => told++);
    await s.worker.signOut(); // the Worker's session ended elsewhere
    (s.drive as FakeDrive).failNext('auth');
    await expect(s.vault.tree()).rejects.toMatchObject({ code: 'auth' });
    expect(await s.session.current()).toBeNull();
    expect(told).toBeGreaterThan(0);
  });
});

describe('asking the Worker', () => {
  it('a run already going when the app opens is followed at the fast pace', async () => {
    localStorage.clear();
    const drive = new FakeDrive();
    const rootId = await seedFakeDrive(drive, 'running', Date.now());
    const worker = new FakeWorker({ drive, scenario: 'running', scale: 'demo', rootId });
    const s = makeLiveSources({ worker, drive, runningPiles: () => worker.runningPiles(), pollMs: 50 });
    const phases: string[] = [];
    s.runs.subscribe(() => void s.runs.current().then((r) => r && phases.push(r.phase)));
    await s.runs.current();
    await new Promise((r) => setTimeout(r, 400));
    s.dispose();
    expect(phases).toContain('writing');
  });
});

describe('signing out', () => {
  it("forgets this person's things on this device", async () => {
    const s = await open();
    localStorage.setItem('bower:seen', '["f1@x"]');
    localStorage.setItem('bower:dismissed', '["s1"]');
    localStorage.setItem('bower:run-seen', 'run-1');
    localStorage.setItem('bower:bookmarks', '["Resources/Cooking/Lemon tart.md"]');
    localStorage.setItem('bower:prefs', '{"theme":"dark"}');
    sessionStorage.setItem('bower:add-items', '[{"name":"a.pdf"}]');
    await s.session.signOut();
    for (const k of ['bower:seen', 'bower:dismissed', 'bower:run-seen', 'bower:bookmarks']) expect(localStorage.getItem(k), k).toBeNull();
    expect(sessionStorage.getItem('bower:add-items')).toBeNull();
    expect(localStorage.getItem('bower:prefs')).toBe('{"theme":"dark"}');
  });
});

describe('the outbox', () => {
  it('outbox: a waiting line goes before a tidy-up starts', async () => {
    const s = await open();
    const real = s.drive.createText.bind(s.drive);
    s.drive.createText = (): Promise<never> => Promise.reject(new TypeError('Failed to fetch'));
    await s.vault.addRule('anything from the dentist goes in health');
    s.drive.createText = real;
    await s.runs.start('instructions');
    const r = await until(s, (x) => x?.phase === 'done' || x?.phase === 'failed');
    expect(r?.report?.yourChanges).toBe(1);
  });

  it('outbox: a waiting line goes when the device is back online', async () => {
    const s = await open();
    const real = s.drive.createText.bind(s.drive);
    s.drive.createText = (): Promise<never> => Promise.reject(new TypeError('Failed to fetch'));
    await s.vault.addRule('anything from the dentist goes in health');
    s.drive.createText = real;
    window.dispatchEvent(new Event('online'));
    for (let i = 0; i < 100 && Object.keys(localStorage).some((k) => k.startsWith('bower:outbox:')); i++) await new Promise((res) => setTimeout(res, 2));
    expect(Object.keys(localStorage).filter((k) => k.startsWith('bower:outbox:'))).toEqual([]);
  });
});

describe('deleting the account', () => {
  it('says goodbye only when the delete went through', async () => {
    const s = await open();
    const worker = s.worker as FakeWorker;
    const real = worker.deleteAccount.bind(worker);
    worker.deleteAccount = (): Promise<void> => Promise.reject(new Error('no answer'));
    await expect(s.session.deleteAccount()).rejects.toThrow();
    expect(sessionStorage.getItem('bower:bye')).toBeNull();
    await s.session.signOut();
    expect(sessionStorage.getItem('bower:bye')).toBeNull();
    worker.deleteAccount = real;
    await s.session.deleteAccount();
    expect(sessionStorage.getItem('bower:bye')).toBe('1');
  });
});

describe('the web', () => {
  it('a tidy-up tells the Worker whether Bower may look things up on the web (allow web)', async () => {
    const s = await open();
    await s.runs.start('all', { allowWeb: true });
    expect((s.worker as FakeWorker).lastAllowWeb).toBe(true);
  });
});
