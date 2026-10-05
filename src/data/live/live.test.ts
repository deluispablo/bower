import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { FakeWorker } from '../fake/fake-worker';
import { seedFakeDrive } from '../fake/seed';
import type { Scenario } from '../demo/scenario';
import type { RunReport, RunState } from '../types';
import type { Me, RunWire } from '../worker/worker-api';
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
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
  }

  const wire = (id: string, phase: RunWire['phase']): RunWire => ({ id, phase, scope: 'all', requestedAt: 1, phaseAt: 1 });
  const report: RunReport = { filed: [], created: [], updated: [], setAside: [], questions: [] };

  async function controlled() {
    const s = await open();
    const status = vi.spyOn(s.worker, 'status').mockResolvedValue(wire('OLD', 'reading'));
    const process = vi.spyOn(s.worker, 'process').mockResolvedValue(wire('NEW', 'queued'));
    const lastRun = vi.spyOn(s.vault, 'lastRun').mockResolvedValue({ v: 1, run: { ...wire('OLD', 'done'), report } });
    return { s, status, process, lastRun };
  }

  it('older run responses cannot replace newer observed state (reversed terminal replies and subscribers)', async () => {
    const { s, status } = await controlled();
    const older = deferred<RunWire | null>();
    const newer = deferred<RunWire | null>();
    status.mockImplementationOnce(() => older.promise).mockImplementationOnce(() => newer.promise);
    const first = s.runs.current();
    const second = s.runs.current();
    const observations: Array<Promise<RunState | null>> = [];
    s.runs.subscribe(() => observations.push(s.runs.current()));
    newer.resolve(wire('OLD', 'done'));
    expect(await second).toMatchObject({ phase: 'done', report });
    older.resolve(wire('OLD', 'reading'));
    expect(await first).toMatchObject({ phase: 'done', report });
    expect(observations).toHaveLength(1);
    expect((await Promise.all(observations)).every((r) => r?.phase === 'done')).toBe(true);
    expect(await s.runs.current()).toMatchObject({ phase: 'done', report });
    expect([...s.runs.runningPiles()]).toEqual([]);
  });

  it.each(['old-id', 'null'] as const)('older run responses cannot replace newer observed state (admission supersedes %s)', async (reply) => {
    const { s, status, process } = await controlled();
    await s.runs.current();
    const admission = deferred<RunWire>();
    const admitted = deferred<undefined>();
    process.mockImplementationOnce(() => { admitted.resolve(undefined); return admission.promise; });
    const start = s.runs.start('all');
    await admitted.promise;
    const pending = deferred<RunWire | null>();
    status.mockImplementationOnce(() => pending.promise);
    const current = s.runs.current();
    const piles = (await s.vault.piles()).map((p) => p.id);
    admission.resolve(wire('NEW', 'queued'));
    expect(await start).toMatchObject({ id: 'NEW', phase: 'queued' });
    pending.resolve(reply === 'null' ? null : wire('OLD', 'done'));
    expect(await current).toMatchObject({ id: 'NEW', phase: 'queued' });
    expect([...s.runs.runningPiles()]).toEqual(piles);
    status.mockResolvedValue(reply === 'null' ? null : wire('OLD', 'reading'));
    if (reply === 'null') {
      // A fresh eligible idle reply has its baseline meaning; only the delayed reply above loses admission authority.
      expect(await s.runs.current()).toBeNull();
      expect([...s.runs.runningPiles()]).toEqual([]);
    } else {
      expect(await s.runs.current()).toMatchObject({ id: 'NEW', phase: 'queued' });
      expect([...s.runs.runningPiles()]).toEqual(piles);
    }
  });

  it.each(['reading', 'done'] as const)('older run responses cannot replace newer observed state (idle after session reset clears %s)', async (phase) => {
    const { s, status } = await controlled();
    const initial = await s.worker.me();
    if (!initial?.folderId) throw new Error('The synthetic initial folder is missing');
    const nextFolder = await s.drive.createFolder('root', 'Another Bower folder');
    let context: Me | null = initial;
    // Controlled existing Worker replies model a new context; FakeWorker itself retains its scripted run.
    vi.spyOn(s.worker, 'me').mockImplementation(async () => context);
    vi.spyOn(s.worker, 'signOut').mockImplementation(async () => { context = null; });
    vi.spyOn(s.worker, 'signIn').mockImplementation(async () => {
      context = { user: { name: 'Sam', email: 'sam@example.com' }, folderId: nextFolder.id };
      status.mockResolvedValue(null);
    });
    expect((await s.session.current())?.name).toBe('Alex');
    const failedSend = vi.spyOn(s.drive, 'createText').mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await s.vault.addRule('Keep receipts together');
    failedSend.mockRestore();
    const outboxKey = `bower:outbox:${initial.folderId}`;
    const waiting = localStorage.getItem(outboxKey);
    expect(waiting).not.toBeNull();
    status.mockResolvedValue(wire('OLD', phase));
    expect(await s.runs.current()).toMatchObject({ id: 'OLD', phase, ...(phase === 'done' ? { report } : {}) });
    if (phase === 'reading') expect([...s.runs.runningPiles()]).toEqual(['*']);
    await s.runs.markSeen('OLD');
    const sessions: Array<ReturnType<typeof s.session.current>> = [];
    s.session.subscribe(() => sessions.push(s.session.current()));
    await s.session.signOut();
    expect(await s.session.current()).toBeNull();
    expect(localStorage.getItem('bower:run-seen')).toBeNull();
    await s.session.signIn();
    expect(await s.session.rootId()).toBe(nextFolder.id);
    expect(await Promise.all(sessions)).toEqual([null, { name: 'Sam', email: 'sam@example.com' }]);
    const observations: Array<Promise<RunState | null>> = [];
    s.runs.subscribe(() => observations.push(s.runs.current()));
    expect(await s.runs.current()).toBeNull();
    expect(await Promise.all(observations)).toEqual([null]);
    expect([...s.runs.runningPiles()]).toEqual([]);
    expect(await s.runs.current()).toBeNull();
    expect(localStorage.getItem(outboxKey)).toBe(waiting);
  });

  it.each(['refresh', 'lastRun'] as const)('older run responses cannot replace newer observed state (old %s cannot cross accepted idle)', async (boundary) => {
    const { s, status, lastRun } = await controlled();
    await s.runs.current();
    const entered = deferred<undefined>();
    const release = deferred<undefined>();
    if (boundary === 'refresh') {
      const refresh = s.vault.refresh.bind(s.vault);
      vi.spyOn(s.vault, 'refresh').mockImplementationOnce(async () => { entered.resolve(undefined); await release.promise; await refresh(); });
    } else lastRun.mockImplementationOnce(async () => { entered.resolve(undefined); await release.promise; return { v: 1, run: { ...wire('OLD', 'done'), report } }; });
    status.mockResolvedValue(wire('OLD', 'done'));
    const old = s.runs.current();
    await entered.promise;
    const observations: Array<Promise<RunState | null>> = [];
    s.runs.subscribe(() => observations.push(s.runs.current()));
    status.mockResolvedValue(null);
    const idle = s.runs.current();
    release.resolve(undefined);
    expect(await idle).toBeNull();
    expect([...s.runs.runningPiles()]).toEqual([]);
    expect(await old).toBeNull();
    expect(await Promise.all(observations)).toEqual([null]);
    expect(await s.runs.current()).toBeNull();
    expect(lastRun).toHaveBeenCalledTimes(boundary === 'refresh' ? 0 : 1);
  });

  it.each(['refresh', 'lastRun'] as const)('older run responses cannot replace newer observed state (delayed old %s)', async (boundary) => {
    const { s, status, lastRun } = await controlled();
    await s.runs.current();
    const entered = deferred<undefined>();
    const release = deferred<undefined>();
    if (boundary === 'refresh') {
      const refresh = s.vault.refresh.bind(s.vault);
      vi.spyOn(s.vault, 'refresh').mockImplementationOnce(async () => { entered.resolve(undefined); await release.promise; await refresh(); });
    } else lastRun.mockImplementationOnce(async () => { entered.resolve(undefined); await release.promise; return { v: 1, run: { ...wire('OLD', 'done'), report } }; });
    status.mockResolvedValue(wire('OLD', 'done'));
    const old = s.runs.current();
    await entered.promise;
    const piles = (await s.vault.piles()).map((p) => p.id);
    const observations: Array<Promise<RunState | null>> = [];
    s.runs.subscribe(() => observations.push(s.runs.current()));
    status.mockResolvedValue(wire('NEW', 'queued'));
    await s.runs.start('all');
    expect(await s.runs.current()).toMatchObject({ id: 'NEW', phase: 'queued' });
    expect([...s.runs.runningPiles()]).toEqual(piles);
    release.resolve(undefined);
    expect(await old).toMatchObject({ id: 'NEW', phase: 'queued' });
    expect(observations).toHaveLength(1);
    expect((await Promise.all(observations)).every((r) => r?.id === 'NEW' && !r.report)).toBe(true);
    expect([...s.runs.runningPiles()]).toEqual(piles);
    expect((await s.runs.current())?.report).toBeUndefined();
  });

  it('older run responses cannot replace newer observed state (old report after a newer report)', async () => {
    const { s, status, lastRun } = await controlled();
    await s.runs.current();
    const entered = deferred<undefined>();
    const oldReport = deferred<Awaited<ReturnType<typeof s.vault.lastRun>>>();
    lastRun.mockImplementationOnce(() => { entered.resolve(undefined); return oldReport.promise; });
    status.mockResolvedValue(wire('OLD', 'done'));
    const old = s.runs.current();
    await entered.promise;
    const observations: Array<Promise<RunState | null>> = [];
    s.runs.subscribe(() => observations.push(s.runs.current()));
    status.mockResolvedValue(wire('NEW', 'queued'));
    await s.runs.start('all');
    const newReport: RunReport = { ...report, created: [{ path: 'Areas/Home/Plan.md', what: 'A new plan' }] };
    lastRun.mockResolvedValue({ v: 1, run: { ...wire('NEW', 'done'), report: newReport } });
    status.mockResolvedValue(wire('NEW', 'done'));
    expect(await s.runs.current()).toMatchObject({ id: 'NEW', phase: 'done', report: newReport });
    await s.runs.markSeen('NEW');
    const notifications = observations.length;
    oldReport.resolve({ v: 1, run: { ...wire('OLD', 'done'), report } });
    expect(await old).toMatchObject({ id: 'NEW', phase: 'done', report: newReport, seen: true });
    expect(observations).toHaveLength(notifications);
    expect((await Promise.all(observations)).every((r) => r?.id === 'NEW' && (r.phase !== 'done' || r.report === newReport))).toBe(true);
    expect([...s.runs.runningPiles()]).toEqual([]);
    expect(lastRun).toHaveBeenCalledTimes(2);
  });

  it('older run responses cannot replace newer observed state (sequential phases and initial null)', async () => {
    const { s, status } = await controlled();
    status.mockResolvedValue(null);
    expect(await s.runs.current()).toBeNull();
    for (const phase of ['queued', 'reading', 'writing', 'saving', 'done'] as const) {
      status.mockResolvedValue(wire('OLD', phase));
      expect((await s.runs.current())?.phase).toBe(phase);
      status.mockResolvedValue(wire('OLD', 'queued'));
      expect((await s.runs.current())?.phase).toBe(phase);
    }
    status.mockResolvedValue(wire('OLD', 'failed'));
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await s.runs.current())?.phase).toBe('done');
    expect(diagnostic).toHaveBeenCalled();
    diagnostic.mockRestore();
  });

  it('older run responses cannot replace newer observed state (request and report failures retry)', async () => {
    const { s, status, lastRun } = await controlled();
    const older = deferred<RunWire | null>();
    status.mockImplementationOnce(() => older.promise).mockRejectedValueOnce(new Error('status unavailable'));
    const pending = s.runs.current();
    await expect(s.runs.current()).rejects.toThrow('status unavailable');
    older.resolve(wire('OLD', 'saving'));
    expect((await pending)?.phase).toBe('saving');
    lastRun.mockRejectedValueOnce(new Error('report unavailable'));
    status.mockResolvedValue(wire('OLD', 'done'));
    await expect(s.runs.current()).rejects.toThrow('report unavailable');
    expect(await s.runs.current()).toMatchObject({ phase: 'done', report });
    await s.runs.markSeen('OLD');
    expect((await s.runs.current())?.seen).toBe(true);
  });

  it('older run responses cannot replace newer observed state (report loading is shared and disposal stops polling)', async () => {
    const { s, status, lastRun } = await controlled();
    const entered = deferred<undefined>();
    const release = deferred<undefined>();
    status.mockResolvedValue(wire('OLD', 'done'));
    lastRun.mockImplementation(async () => { entered.resolve(undefined); await release.promise; return { v: 1, run: { ...wire('OLD', 'done'), report } }; });
    const first = s.runs.current();
    await entered.promise;
    const second = s.runs.current();
    release.resolve(undefined);
    expect(await first).toMatchObject({ phase: 'done', report });
    expect(await second).toMatchObject({ phase: 'done', report });
    expect(lastRun).toHaveBeenCalledOnce();
    const reentered: Array<Promise<RunState | null>> = [];
    s.runs.subscribe(() => reentered.push(s.runs.current()));
    await s.runs.markSeen('OLD');
    expect((await Promise.all(reentered)).every((r) => r?.seen && r.report)).toBe(true);
    const calls = status.mock.calls.length;
    s.runs.dispose();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(status).toHaveBeenCalledTimes(calls);
  });

  it('older run responses cannot replace newer observed state (parallel admissions serialize and retry after failure)', async () => {
    const { s, status, process } = await controlled();
    await s.runs.current();
    const entered = deferred<undefined>();
    const admission = deferred<RunWire>();
    process.mockImplementationOnce(() => { entered.resolve(undefined); return admission.promise; });
    const first = s.runs.start('all');
    const second = s.runs.start('all');
    await entered.promise;
    expect(process).toHaveBeenCalledOnce();
    const failure = expect(first).rejects.toThrow('admission unavailable');
    admission.reject(new Error('admission unavailable'));
    await failure;
    expect(await second).toMatchObject({ id: 'NEW', phase: 'queued' });
    expect(process).toHaveBeenCalledTimes(2);
    status.mockResolvedValue(wire('OLD', 'done'));
    expect(await s.runs.current()).toMatchObject({ id: 'NEW', phase: 'queued' });
  });

  it('older run responses cannot replace newer observed state (pending reply after disposal has no effects)', async () => {
    const { s, status, lastRun } = await controlled();
    await s.runs.current();
    const reply = deferred<RunWire | null>();
    status.mockImplementationOnce(() => reply.promise);
    const pending = s.runs.current();
    const changed = vi.fn();
    s.runs.subscribe(changed);
    s.runs.dispose();
    reply.resolve(wire('OLD', 'done'));
    expect(await pending).toMatchObject({ id: 'OLD', phase: 'reading' });
    expect(changed).not.toHaveBeenCalled();
    expect(lastRun).not.toHaveBeenCalled();
    expect(await s.runs.current()).toMatchObject({ phase: 'reading' });
    expect(status).toHaveBeenCalledTimes(2);
    await expect(s.runs.start('all')).rejects.toThrow('Bower is no longer open');
  });

  it.each(['flushJournal', 'piles'] as const)('older run responses cannot replace newer observed state (dispose while %s prepares admission)', async (boundary) => {
    const { s, process } = await controlled();
    const entered = deferred<undefined>();
    const release = deferred<undefined>();
    const readPiles = s.vault.piles.bind(s.vault);
    const piles = vi.spyOn(s.vault, 'piles');
    if (boundary === 'flushJournal') {
      const flush = s.vault.flushJournal.bind(s.vault);
      vi.spyOn(s.vault, 'flushJournal').mockImplementationOnce(async () => { entered.resolve(undefined); await release.promise; await flush(); });
    } else {
      piles.mockImplementationOnce(async () => { entered.resolve(undefined); await release.promise; return readPiles(); });
    }
    const start = s.runs.start('all');
    await entered.promise;
    s.dispose();
    release.resolve(undefined);
    await expect(start).rejects.toMatchObject({ code: 'unknown', message: 'Bower is no longer open on this page.' });
    expect(process).not.toHaveBeenCalled();
    expect(piles).toHaveBeenCalledTimes(boundary === 'flushJournal' ? 0 : 1);
  });

  it('older run responses cannot replace newer observed state (start cannot return discarded state after accepted idle)', async () => {
    const { s, status, process, lastRun } = await controlled();
    const entered = deferred<undefined>();
    const release = deferred<undefined>();
    process.mockResolvedValueOnce(wire('OLD', 'done')).mockResolvedValueOnce(wire('NEXT', 'queued'));
    lastRun.mockImplementationOnce(async () => { entered.resolve(undefined); await release.promise; return { v: 1, run: { ...wire('OLD', 'done'), report } }; });
    const start = s.runs.start('all');
    await entered.promise;
    const observations: Array<Promise<RunState | null>> = [];
    s.runs.subscribe(() => observations.push(s.runs.current()));
    status.mockResolvedValue(null);
    expect(await s.runs.current()).toBeNull();
    expect(await Promise.all(observations)).toEqual([null]);
    expect([...s.runs.runningPiles()]).toEqual([]);
    const retry = s.runs.start('all');
    expect(process).toHaveBeenCalledOnce();
    const superseded = expect(start).rejects.toMatchObject({ code: 'conflict', message: expect.stringMatching(/status.*try again/i) });
    status.mockResolvedValue(wire('NEXT', 'queued'));
    release.resolve(undefined);
    await superseded;
    expect(await retry).toMatchObject({ id: 'NEXT', phase: 'queued' });
    expect(await s.runs.current()).toMatchObject({ id: 'NEXT', phase: 'queued' });
    expect([...s.runs.runningPiles()]).toEqual((await s.vault.piles()).map((p) => p.id));
    expect((await Promise.all(observations)).every((r) => r === null || r.id === 'NEXT')).toBe(true);
    expect(process).toHaveBeenCalledTimes(2);
  });

  it('older run responses cannot replace newer observed state (dispose during admission hydration rejects start)', async () => {
    const { s, process, lastRun } = await controlled();
    const entered = deferred<undefined>();
    const release = deferred<undefined>();
    process.mockResolvedValueOnce(wire('OLD', 'done'));
    lastRun.mockImplementationOnce(async () => { entered.resolve(undefined); await release.promise; return { v: 1, run: { ...wire('OLD', 'done'), report } }; });
    const start = s.runs.start('all');
    await entered.promise;
    const changed = vi.fn();
    s.runs.subscribe(changed);
    s.dispose();
    const closed = expect(start).rejects.toMatchObject({ code: 'unknown', message: 'Bower is no longer open on this page.' });
    release.resolve(undefined);
    await closed;
    expect(changed).not.toHaveBeenCalled();
    expect((await s.runs.current())?.report).toBeUndefined();
    // The request was already admitted; the lifecycle guard does not cancel dispatched work.
    expect(process).toHaveBeenCalledOnce();
  });

  it('a tidy-up does not start while journal lines still wait', async () => {
    const s = await open();
    const create = s.drive.createText.bind(s.drive);
    const list = s.drive.listAll.bind(s.drive);
    const process = vi.spyOn(s.worker, 'process');
    s.drive.createText = async () => { throw new TypeError('Failed to fetch'); };
    await s.vault.addRule('Keep receipts together');
    await expect(s.runs.start('instructions')).rejects.toMatchObject({ code: 'offline', message: expect.stringMatching(/changes.*arrive/i) });
    expect(process).not.toHaveBeenCalled();
    s.drive.listAll = async () => { throw new TypeError('Failed to fetch'); };
    await expect(s.runs.start('instructions')).rejects.toMatchObject({ code: 'offline' });
    expect(process).not.toHaveBeenCalled();
    s.drive.createText = create;
    s.drive.listAll = list;
    await s.runs.start('instructions');
    expect(process).toHaveBeenCalledOnce();
  });

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
    expect(r?.report?.rulesWorded).toBe(1);
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

describe('signing out', () => {
  it('forgets that this person was toured, so the next one gets the tour', async () => {
    const s = await open();
    sessionStorage.setItem('bower:toured', '1');
    await s.session.signOut();
    expect(sessionStorage.getItem('bower:toured')).toBeNull();
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
