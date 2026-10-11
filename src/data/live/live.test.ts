import p2Questions from '../contracts/fixtures/p2/questions.json';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { keep as keepDraft, get as getDraft, forget as forgetDraft } from '../../features/piles/draft-files';
import { FakeDrive } from '../drive/fake-drive';
import { driveError, type DriveApi } from '../drive/drive-api';
import { DriveHttp } from '../drive/drive-http';
import { FakeWorker } from '../fake/fake-worker';
import { B_FAILURE, FakeRunService } from '../fake/fake-run-service';
import { seedFakeDrive } from '../fake/seed';
import type { Scenario } from '../demo/scenario';
import { BowerError, type RunReport, type RunState } from '../types';
import type { Me, RunReply, RunWire, StatusReply } from '../worker/worker-api';
import { WorkerHttp } from '../worker/worker-http';
import { makeLiveSources, type LiveSources } from './index';
import { holdChunks } from '@/testing/upload-hook';

let live: LiveSources | null = null;
/** The Worker's answers in the order it gave them: each helper call is a newer revision, unless one is named. */
let seq = 0;
const st = (run: RunWire | null, revision = ++seq): StatusReply => ({ run, revision });
const pr = (run: RunWire, revision = ++seq): RunReply => ({ run, revision });

afterEach(() => {
  live?.dispose();
  live = null;
});

describe('session and folder isolation', () => {
  afterEach(() => vi.restoreAllMocks());

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((yes) => { resolve = yes; });
    return { promise, resolve };
  }
  const outcome = <T>(p: Promise<T>) => p.then((value) => ({ value }), (error: unknown) => ({ error }));
  async function drain() { for (let i = 0; i < 30; i++) await Promise.resolve(); }

  async function pair(samePerson: boolean) {
    localStorage.clear();
    sessionStorage.clear();
    const drive = new FakeDrive();
    async function seed(name: string, text: string) {
      const root = await drive.createFolder('root', name);
      for (const name of ['Inbox', 'Projects', 'Areas', 'Resources', 'Archive']) await drive.createFolder(root.id, name);
      const system = await drive.createFolder(root.id, '.bower');
      await drive.createFolder(system.id, 'changes');
      await drive.createText(root.id, 'Synthetic.md', text);
      return root;
    }
    const a = await seed('Synthetic A', 'Account A content café.');
    const b = await seed('Synthetic B', 'Account B content café.');
    const userA = { name: 'Alex', email: 'alex@example.com' };
    const userB = samePerson ? userA : { name: 'Sam', email: 'sam@example.com' };
    let context: Me | null = { user: userA, folderId: a.id };
    let next: Me = { user: userB, folderId: b.id };
    const worker = new FakeWorker({ drive, runs: new FakeRunService({ drive, scale: 'instant' }), rootId: a.id, scenario: 'empty' });
    vi.spyOn(worker, 'me').mockImplementation(async () => context);
    vi.spyOn(worker, 'signOut').mockImplementation(async () => { context = null; });
    vi.spyOn(worker, 'signIn').mockImplementation(async () => { context = next; });
    live = makeLiveSources({ drive, worker });
    const s = live;
    await s.vault.flushJournal();
    await s.vault.tree();
    expect((await s.vault.note('Synthetic.md')).body).toBe('Account A content café.');
    const outboxA = localStorage.getItem(`bower:outbox:${a.id}`);
    const outboxB = localStorage.getItem(`bower:outbox:${b.id}`);
    async function domain(rootId: string) {
      const files = await drive.listAll(rootId);
      return Promise.all(files.map(async (file) => ({ ...file, content: file.folder ? null : await drive.readText(file.id) })));
    }
    async function switchToB() {
      await s.session.signOut();
      expect(await s.session.current()).toBeNull();
      expect(await s.session.signIn()).toEqual(userB);
      expect(await s.session.rootId()).toBe(b.id);
    }
    async function returnToA() {
      next = { user: userA, folderId: a.id };
      await s.session.signOut();
      await s.session.signIn();
      expect(await s.session.rootId()).toBe(a.id);
    }
    return { s, drive, worker, a, b, domain, switchToB, returnToA, outboxA, outboxB };
  }

  for (const samePerson of [false, true]) {
    const transition = samePerson ? 'same account, new folder' : 'new account and folder';
    it(`reused sources isolate account and folder changes (${transition}, cached note read)`, async () => {
      const { s, drive, a, b, switchToB, outboxA, outboxB } = await pair(samePerson);
      const before = await drive.snapshot();
      await switchToB();
      expect((await s.vault.note('Synthetic.md')).body).toBe('Account B content café.');
      expect(await drive.snapshot()).toBe(before);
      expect(localStorage.getItem(`bower:outbox:${a.id}`)).toBe(outboxA);
      expect(localStorage.getItem(`bower:outbox:${b.id}`)).toBe(outboxB);
    });

    it(`reused sources isolate account and folder changes (${transition}, creation placement)`, async () => {
      const { s, drive, a, b, domain, switchToB, outboxA } = await pair(samePerson);
      const beforeA = await domain(a.id);
      await switchToB();
      const path = await s.vault.create('', 'note', 'Made after switch');
      await s.vault.settled();
      expect(drive.dump(b.id).has(path)).toBe(true);
      expect(drive.dump(a.id).has(path)).toBe(false);
      expect(await domain(a.id)).toEqual(beforeA);
      const records = [...drive.dump(b.id)].filter(([p]) => /^\.bower\/changes\/[^/]+\.json$/.test(p));
      expect(records).toHaveLength(1);
      expect(records[0]?.[1]).toContain('Made after switch');
      expect(localStorage.getItem(`bower:outbox:${a.id}`)).toBe(outboxA);
    });

    it(`reused sources isolate account and folder changes (${transition}, journal placement)`, async () => {
      const { s, drive, a, b, domain, switchToB, outboxA } = await pair(samePerson);
      const beforeA = await domain(a.id);
      await switchToB();
      const request = await s.vault.addRequest('A request made only for B');
      await s.vault.settled();
      const records = [...drive.dump(b.id)].filter(([p]) => /^\.bower\/changes\/[^/]+\.json$/.test(p));
      expect(records).toHaveLength(1);
      expect(records[0]?.[1]).toContain(request.id);
      expect(records[0]?.[1]).toContain(request.text);
      expect(await domain(a.id)).toEqual(beforeA);
      expect(localStorage.getItem(`bower:outbox:${a.id}`)).toBe(outboxA);
    });
  }

  it.each(['note', 'create', 'request'] as const)('reused sources isolate account and folder changes (signed-out %s refuses)', async (operation) => {
    const { s, drive, a, b, outboxA, outboxB } = await pair(false);
    const before = await drive.snapshot();
    await s.session.signOut();
    expect(await s.session.current()).toBeNull();
    const attempt = operation === 'note' ? s.vault.note('Synthetic.md') : operation === 'create' ? s.vault.create('', 'note', 'Signed-out note') : s.vault.addRequest('Signed-out request');
    await expect(attempt).rejects.toBeInstanceOf(BowerError);
    await expect(attempt).rejects.toMatchObject({ code: 'auth' });
    expect(await drive.snapshot()).toBe(before);
    expect(localStorage.getItem(`bower:outbox:${a.id}`)).toBe(outboxA);
    expect(localStorage.getItem(`bower:outbox:${b.id}`)).toBe(outboxB);
  });

  it.each(['listing', 'text'] as const)('reused sources isolate account and folder changes (old %s cannot publish in B)', async (boundary) => {
    const { s, drive, a, switchToB } = await pair(false);
    const captured = deferred<undefined>();
    const release = deferred<undefined>();
    if (boundary === 'listing') {
      const list = drive.listAll.bind(drive);
      vi.spyOn(drive, 'listAll').mockImplementationOnce(async (id) => { const value = await list(id); captured.resolve(undefined); await release.promise; return value; });
    } else {
      const file = (await drive.listAll(a.id)).find((f) => f.name === 'Synthetic.md');
      if (!file) throw new Error('Expected synthetic A note');
      await drive.writeText(file.id, 'Delayed A bytes.', file.modifiedTime);
      const read = drive.readText.bind(drive);
      vi.spyOn(drive, 'readText').mockImplementation(async (id) => {
        const value = await read(id);
        if (id === file.id) { captured.resolve(undefined); await release.promise; }
        return value;
      });
    }
    const old = outcome<unknown>(boundary === 'listing' ? s.vault.refresh() : s.vault.refresh().then(() => s.vault.note('Synthetic.md')));
    await captured.promise;
    await switchToB();
    const changes = vi.fn();
    s.vault.subscribe(changes);
    release.resolve(undefined);
    const result = await old;
    expect(result).toMatchObject({ error: { name: 'BowerError' } });
    expect(changes).not.toHaveBeenCalled();
    expect((await s.vault.note('Synthetic.md')).body).toBe('Account B content café.');
  });

  it('reused sources isolate account and folder changes (prepared rename stops before dispatch)', async () => {
    const { s, drive, switchToB } = await pair(false);
    const get = drive.get.bind(drive);
    const entered = deferred<undefined>();
    const release = deferred<undefined>();
    vi.spyOn(drive, 'get').mockImplementationOnce(async (id) => { const value = await get(id); entered.resolve(undefined); await release.promise; return value; });
    const old = outcome(s.vault.rename('Synthetic.md', 'Renamed in A'));
    await entered.promise;
    const before = await drive.snapshot();
    await switchToB();
    release.resolve(undefined);
    expect(await old).toMatchObject({ error: { name: 'BowerError' } });
    expect(await drive.snapshot()).toBe(before);
  });

  it('reused sources isolate account and folder changes (late create keeps A bookkeeping without B publication)', async () => {
    const { s, drive, a, b, domain, switchToB, returnToA } = await pair(false);
    const create = drive.createText.bind(drive);
    const entered = deferred<undefined>();
    const release = deferred<undefined>();
    vi.spyOn(drive, 'createText').mockImplementationOnce(async (...args) => { const value = await create(...args); entered.resolve(undefined); await release.promise; return value; });
    const old = outcome(s.vault.create('', 'note', 'Applied in A.md'));
    await entered.promise;
    const beforeB = await domain(b.id);
    await switchToB();
    const changed = vi.fn();
    s.vault.subscribe(changed);
    release.resolve(undefined);
    expect(await old).toMatchObject({ error: { name: 'BowerError' } });
    expect(await domain(b.id)).toEqual(beforeB);
    expect(changed).not.toHaveBeenCalled();
    expect(drive.dump(a.id).has('Applied in A.md')).toBe(true);
    const waiting = localStorage.getItem(`bower:outbox:${a.id}`);
    expect(waiting).toContain('Applied in A');
    expect(localStorage.getItem(`bower:outbox:${b.id}`)).toBeNull();
    await returnToA();
    await s.vault.flushJournal();
    expect((await s.vault.changes()).filter((r) => r.kind === 'create' && r.path === 'Applied in A.md')).toHaveLength(1);
    expect(localStorage.getItem(`bower:outbox:${a.id}`)).toBeNull();
  });

  it('reused sources isolate account and folder changes (disposed late create retains original-owner bookkeeping)', async () => {
    const { s, drive, a, b, domain } = await pair(false);
    const create = drive.createText.bind(drive);
    const entered = deferred<undefined>();
    const release = deferred<undefined>();
    vi.spyOn(drive, 'createText').mockImplementationOnce(async (...args) => {
      const value = await create(...args);
      entered.resolve(undefined);
      await release.promise;
      return value;
    });
    const old = outcome(s.vault.create('', 'note', 'Applied before disposal.md'));
    await entered.promise;
    const before = await drive.snapshot();
    const beforeB = await domain(b.id);
    const changed = vi.fn();
    s.vault.subscribe(changed);
    s.dispose();
    release.resolve(undefined);
    expect(await old).toMatchObject({ error: { name: 'BowerError' } });
    expect(await drive.snapshot()).toBe(before);
    expect(await domain(b.id)).toEqual(beforeB);
    expect(changed).not.toHaveBeenCalled();
    expect(drive.dump(a.id).has('Applied before disposal.md')).toBe(true);
    expect(localStorage.getItem(`bower:outbox:${a.id}`)).toContain('Applied before disposal');
    expect(localStorage.getItem(`bower:outbox:${b.id}`)).toBeNull();
  });

  it.each([false, true])('reused sources isolate account and folder changes (A outbox returns only to A, blocked storage %s)', async (blocked) => {
    const { s, drive, a, b, switchToB, returnToA } = await pair(false);
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fail = vi.spyOn(drive, 'createText').mockRejectedValueOnce(driveError('offline'));
    const storage = blocked ? vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); }) : null;
    const request = outcome(s.vault.addRequest('Retain only in A'));
    if (blocked) expect(await request).toMatchObject({ error: { name: 'BowerError' } });
    else expect(await request).toMatchObject({ value: { text: 'Retain only in A' } });
    fail.mockRestore();
    const waiting = localStorage.getItem(`bower:outbox:${a.id}`);
    expect((await s.vault.requests()).filter((r) => r.text === 'Retain only in A')).toHaveLength(1);
    await switchToB();
    await s.vault.flushJournal();
    expect(await s.vault.requests()).toEqual([]);
    expect([...drive.dump(b.id).values()].join('')).not.toContain('Retain only in A');
    expect(localStorage.getItem(`bower:outbox:${a.id}`)).toBe(waiting);
    storage?.mockRestore();
    await returnToA();
    await s.vault.flushJournal();
    await s.vault.flushJournal();
    expect((await s.vault.requests()).filter((r) => r.text === 'Retain only in A')).toHaveLength(1);
    expect(localStorage.getItem(`bower:outbox:${a.id}`)).toBeNull();
    expect(diagnostic).toHaveBeenCalled();
  });

  it.each([false, true])('reused sources isolate account and folder changes (queued journal keeps its owner, blocked storage %s)', async (blocked) => {
    const { s, drive, b, switchToB } = await pair(false);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const storage = blocked ? vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); }) : null;
    const entered = deferred<undefined>();
    const release = deferred<undefined>();
    const create = drive.createText.bind(drive);
    vi.spyOn(drive, 'createText').mockImplementationOnce(async (...args) => { const value = await create(...args); entered.resolve(undefined); await release.promise; return value; });
    const first = outcome(s.vault.addRequest('First A request'));
    await entered.promise;
    const second = outcome(s.vault.addRequest('Queued A request'));
    await switchToB();
    const fresh = outcome(s.vault.addRequest('Only B request'));
    release.resolve(undefined);
    await Promise.all([first, second, fresh]);
    const texts = [...drive.dump(b.id)].filter(([p]) => /^\.bower\/changes\/[^/]+\.json$/.test(p)).map(([, text]) => text);
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain('Only B request');
    expect(texts.join('')).not.toContain('A request');
    storage?.mockRestore();
  });

  it('reused sources isolate account and folder changes (old Undo and seen cannot act in B)', async () => {
    const { s, drive, switchToB } = await pair(false);
    const rule = await s.vault.addRule('Only A rule');
    const undo = await s.vault.removeRule(rule.id);
    await switchToB();
    const before = await drive.snapshot();
    await expect(undo()).rejects.toBeInstanceOf(BowerError);
    expect(await drive.snapshot()).toBe(before);
    const bRule = await s.vault.addRule('Only B rule');
    const bUndo = await s.vault.removeRule(bRule.id);
    await bUndo();
    expect((await s.vault.rules()).map((r) => r.text)).toEqual(['Only B rule']);
  });

  it('reused sources isolate account and folder changes (late seen cannot repopulate B device state)', async () => {
    const { s, drive, switchToB } = await pair(false);
    const list = drive.listAll.bind(drive);
    const entered = deferred<undefined>();
    const release = deferred<undefined>();
    vi.spyOn(drive, 'listAll').mockImplementationOnce(async (id) => { const value = await list(id); entered.resolve(undefined); await release.promise; return value; });
    const listing = outcome(s.vault.refresh());
    await entered.promise;
    const seen = outcome(s.vault.markSeen('Synthetic.md'));
    await switchToB();
    release.resolve(undefined);
    await listing;
    expect(await seen).toMatchObject({ error: { name: 'BowerError' } });
    expect(localStorage.getItem('bower:seen')).toBeNull();
    await s.vault.markSeen('Synthetic.md');
    expect(localStorage.getItem('bower:seen')).not.toBeNull();
  });

  it('reused sources isolate account and folder changes (disposed pending listing cannot mark seen)', async () => {
    const { s, drive, a, b, outboxA, outboxB } = await pair(false);
    const before = await drive.snapshot();
    const list = drive.listAll.bind(drive);
    const entered = deferred<undefined>();
    const release = deferred<undefined>();
    vi.spyOn(drive, 'listAll').mockImplementationOnce(async (id) => {
      const value = await list(id);
      entered.resolve(undefined);
      await release.promise;
      return value;
    });
    const changed = vi.fn();
    s.vault.subscribe(changed);
    const listing = outcome(s.vault.refresh());
    await entered.promise;
    const seen = outcome(s.vault.markSeen('Synthetic.md'));
    s.dispose();
    release.resolve(undefined);
    const results = await Promise.all([listing, seen]);
    expect(localStorage.getItem('bower:seen')).toBeNull();
    expect(results).toEqual([
      { error: expect.any(BowerError) },
      { error: expect.any(BowerError) },
    ]);
    expect(changed).not.toHaveBeenCalled();
    expect(await drive.snapshot()).toBe(before);
    expect(localStorage.getItem(`bower:outbox:${a.id}`)).toBe(outboxA);
    expect(localStorage.getItem(`bower:outbox:${b.id}`)).toBe(outboxB);
  });

  it('reused sources isolate account and folder changes (stable subscriptions follow fresh B work)', async () => {
    const { s, switchToB } = await pair(false);
    const changed = vi.fn();
    const unsubscribe = s.vault.subscribe(changed);
    await switchToB();
    changed.mockClear();
    await s.vault.addRequest('Fresh B notification');
    expect(changed).toHaveBeenCalledOnce();
    unsubscribe();
    await s.vault.addRequest('No listener now');
    expect(changed).toHaveBeenCalledOnce();
  });

  it('reused sources isolate account and folder changes (late upload cannot trash or continue after transition)', async () => {
    const { s, drive, a, switchToB } = await pair(false);
    const entered = deferred<undefined>();
    const release = deferred<undefined>();
    // The first file arrives in Drive, its answer is held.
    holdChunks(drive, release.promise, true, () => entered.resolve(undefined));
    const sending = vi.spyOn(drive, 'openResumable');
    const trash = vi.spyOn(drive, 'trash');
    await s.vault.addPile({ text: 'Two A files', items: ['first.pdf', 'second.pdf'].map((name) => ({ name, kind: 'pdf', origin: 'Picked', body: new Blob([name]) })) });
    await entered.promise;
    await switchToB();
    release.resolve(undefined);
    await drain();
    expect(sending).toHaveBeenCalledOnce();
    expect(trash).not.toHaveBeenCalled();
    expect((await drive.listAll(a.id)).filter((f) => f.name.endsWith('.pdf')).map((f) => f.name)).toEqual(['first.pdf']);
    expect(await s.vault.piles()).toEqual([]);
    await s.vault.addPile({ text: 'Fresh B pile', items: [] });
    expect((await s.vault.piles()).map((p) => p.text)).toEqual(['Fresh B pile']);
  });

  it('reused sources isolate account and folder changes (transition before upload prevents dispatch)', async () => {
    const { s, drive, switchToB } = await pair(false);
    const create = drive.createFolder.bind(drive);
    const entered = deferred<undefined>();
    const release = deferred<undefined>();
    vi.spyOn(drive, 'createFolder').mockImplementationOnce(async (...args) => { const value = await create(...args); entered.resolve(undefined); await release.promise; return value; });
    const upload = vi.spyOn(drive, 'openResumable');
    const old = outcome(s.vault.addPile({ text: 'A file', items: [{ name: 'first.pdf', kind: 'pdf', origin: 'Picked', body: new Blob(['A bytes']) }] }));
    await entered.promise;
    await switchToB();
    release.resolve(undefined);
    expect(await old).toMatchObject({ error: { name: 'BowerError' } });
    await drain();
    expect(upload).not.toHaveBeenCalled();
  });

  it.each(['flushJournal', 'process'] as const)('reused sources isolate account and folder changes (queued admissions cannot block or dispatch in B, %s)', async (boundary) => {
    const { s, worker, switchToB } = await pair(false);
    const entered = deferred<undefined>();
    const release = deferred<undefined>();
    const wire: RunWire = { id: 'B', scope: 'all', phase: 'queued', requestedAt: 1, phaseAt: 1 };
    const process = vi.spyOn(worker, 'process').mockResolvedValue(pr(wire));
    if (boundary === 'process') process.mockImplementationOnce(async () => { entered.resolve(undefined); await release.promise; return pr({ ...wire, id: 'A' }); });
    else {
      const flush = s.vault.flushJournal.bind(s.vault);
      vi.spyOn(s.vault, 'flushJournal').mockImplementationOnce(async () => { entered.resolve(undefined); await release.promise; return flush(); });
    }
    const first = outcome(s.runs.start('all'));
    await entered.promise;
    const second = outcome(s.runs.start('all'));
    await switchToB();
    const fresh = outcome(s.runs.start('all'));
    try {
      await drain();
      expect(process).toHaveBeenCalledTimes(boundary === 'process' ? 2 : 1);
    } finally { release.resolve(undefined); }
    expect(await fresh).toMatchObject({ value: { id: 'B' } });
    expect(await first).toMatchObject({ error: { name: 'BowerError' } });
    expect(await second).toMatchObject({ error: { name: 'BowerError' } });
    expect([...s.runs.runningPiles()]).toEqual(['*']);
  });

  it('reused sources isolate account and folder changes (old terminal hydration cannot publish in B)', async () => {
    const { s, worker, switchToB } = await pair(false);
    const entered = deferred<undefined>();
    const release = deferred<undefined>();
    const wire: RunWire = { id: 'A', scope: 'all', phase: 'done', requestedAt: 1, phaseAt: 1 };
    const status = vi.spyOn(worker, 'status').mockResolvedValue(st(wire));
    vi.spyOn(s.vault, 'lastRun').mockImplementationOnce(async () => { entered.resolve(undefined); await release.promise; return { v: 1, run: { ...wire, report: { filed: [], created: [], updated: [], setAside: [], questions: [] } } }; });
    const old = outcome(s.runs.current());
    await entered.promise;
    await switchToB();
    status.mockResolvedValue(st(null));
    expect(await s.runs.current()).toBeNull();
    const changed = vi.fn();
    s.runs.subscribe(changed);
    release.resolve(undefined);
    expect(await old).toMatchObject({ error: { name: 'BowerError' } });
    expect(changed).not.toHaveBeenCalled();
    expect(await s.runs.current()).toBeNull();
    expect([...s.runs.runningPiles()]).toEqual([]);
  });

  it('reused sources isolate account and folder changes (old auth reply does not expire B)', async () => {
    const { s, drive, switchToB } = await pair(false);
    const entered = deferred<undefined>();
    const release = deferred<undefined>();
    vi.spyOn(drive, 'listAll').mockImplementationOnce(async () => { entered.resolve(undefined); await release.promise; throw driveError('auth'); });
    const old = outcome(s.vault.refresh());
    await entered.promise;
    await switchToB();
    const changed = vi.fn();
    s.session.subscribe(changed);
    release.resolve(undefined);
    expect(await old).toMatchObject({ error: { name: 'BowerError' } });
    expect(changed).not.toHaveBeenCalled();
    expect((await s.session.current())?.name).toBe('Sam');
  });

  it('reused sources isolate account and folder changes (same-folder sign-in does not reactivate an old read)', async () => {
    const { s, drive, a, returnToA } = await pair(false);
    const list = drive.listAll.bind(drive);
    const entered = deferred<undefined>();
    const release = deferred<undefined>();
    vi.spyOn(drive, 'listAll').mockImplementationOnce(async (id) => { const value = await list(id); entered.resolve(undefined); await release.promise; return value; });
    const old = outcome(s.vault.refresh());
    await entered.promise;
    const file = (await list(a.id)).find((f) => f.name === 'Synthetic.md');
    if (!file) throw new Error('Expected the A note');
    await drive.writeText(file.id, 'Fresh A lifetime.', file.modifiedTime);
    await returnToA();
    release.resolve(undefined);
    expect(await old).toMatchObject({ error: { name: 'BowerError' } });
    expect((await s.vault.note('Synthetic.md')).body).toBe('Fresh A lifetime.');
  });

  it('reused sources isolate account and folder changes (old me reply cannot reveal A after B confirmation)', async () => {
    const { s, worker, a, switchToB } = await pair(false);
    const release = deferred<Me | null>();
    s.session.expire();
    vi.spyOn(worker, 'me').mockImplementationOnce(() => release.promise);
    const old = outcome(s.session.current());
    await switchToB();
    release.resolve({ user: { name: 'Alex', email: 'alex@example.com' }, folderId: a.id });
    expect(await old).toMatchObject({ error: { name: 'BowerError' } });
    expect((await s.session.current())?.name).toBe('Sam');
  });

  it('reused sources isolate account and folder changes (old folder reply cannot publish A steps)', async () => {
    const { s, worker, a, switchToB } = await pair(false);
    const entered = deferred<undefined>();
    const release = deferred<{ id: string; found: boolean }>();
    vi.spyOn(worker, 'createFolder').mockImplementationOnce(() => { entered.resolve(undefined); return release.promise; });
    const steps = vi.fn(() => { throw new Error('Stale progress must not be published'); });
    const old = outcome(s.session.createFolder(steps));
    await entered.promise;
    await switchToB();
    release.resolve({ id: a.id, found: true });
    expect(await old).toMatchObject({ error: { name: 'BowerError' } });
    expect(steps).not.toHaveBeenCalled();
    expect((await s.session.current())?.name).toBe('Sam');
  });

  it.each(['locks', 'seen'] as const)('reused sources isolate account and folder changes (signed-out run %s does not retain A)', async (boundary) => {
    const { s, worker } = await pair(false);
    vi.spyOn(worker, 'status').mockResolvedValue(st({ id: 'A', scope: 'all', phase: 'reading', requestedAt: 1, phaseAt: 1 }));
    await s.runs.current();
    expect([...s.runs.runningPiles()]).toEqual(['*']);
    await s.session.signOut();
    if (boundary === 'locks') expect([...s.runs.runningPiles()]).toEqual([]);
    else {
      await expect(s.runs.markSeen('A')).rejects.toMatchObject({ code: 'auth' });
      expect(localStorage.getItem('bower:run-seen')).toBeNull();
    }
  });

  it('reused sources isolate account and folder changes (late versioned task effect has only A outbox bookkeeping)', async () => {
    const { s, drive, a, b, switchToB } = await pair(false);
    const file = (await drive.listAll(a.id)).find((f) => f.name === 'Synthetic.md');
    if (!file) throw new Error('Expected an A note');
    await drive.writeText(file.id, '- [ ] A task café.\r\n', file.modifiedTime);
    await s.vault.refresh();
    const write = drive.writeText.bind(drive);
    const entered = deferred<undefined>();
    const release = deferred<undefined>();
    vi.spyOn(drive, 'writeText').mockImplementationOnce(async (...args) => { const result = await write(...args); entered.resolve(undefined); await release.promise; return result; });
    const old = outcome(s.vault.toggleTask('Synthetic.md', 0));
    await entered.promise;
    await switchToB();
    const beforeB = Object.fromEntries(drive.dump(b.id));
    drive.failNext('offline'); // The baseline next journal send fails after the already observed A effect.
    release.resolve(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await old).toMatchObject({ error: { name: 'BowerError' } });
    expect(drive.dump(a.id).get('Synthetic.md')).toBe('- [x] A task café.\r\n');
    expect(Object.fromEntries(drive.dump(b.id))).toEqual(beforeB);
    expect(localStorage.getItem(`bower:outbox:${a.id}`)).toContain(file.id);
    expect(localStorage.getItem(`bower:outbox:${a.id}`)).toContain('"kind":"task"');
    expect(localStorage.getItem(`bower:outbox:${b.id}`)).toBeNull();
    expect(localStorage.getItem('bower:seen')).toBeNull();
  });

  it('reused sources isolate account and folder changes (dispose during sign-in prevents late identity publication)', async () => {
    const { s, worker } = await pair(false);
    const entered = deferred<undefined>();
    const release = deferred<undefined>();
    vi.spyOn(worker, 'signIn').mockImplementationOnce(async () => { entered.resolve(undefined); await release.promise; });
    const changed = vi.fn();
    s.session.subscribe(changed);
    const old = outcome(s.session.signIn());
    await entered.promise;
    s.dispose();
    release.resolve(undefined);
    expect(await old).toMatchObject({ error: { name: 'BowerError' } });
    expect(changed).not.toHaveBeenCalled();
  });

  it('reused sources isolate account and folder changes (failed sign-out permits a fresh lifecycle retry)', async () => {
    const { s, worker, switchToB } = await pair(false);
    vi.spyOn(worker, 'signOut').mockRejectedValueOnce(new Error('Synthetic logout unavailable'));
    await expect(s.session.signOut()).rejects.toThrow('Synthetic logout unavailable');
    await switchToB();
    expect((await s.vault.note('Synthetic.md')).body).toBe('Account B content café.');
  });
});

async function open(scenario: Scenario = 'default'): Promise<LiveSources> {
  localStorage.clear();
  sessionStorage.clear();
  const drive = new FakeDrive();
  const rootId = await seedFakeDrive(drive, scenario, Date.now());
  const worker = new FakeWorker({ drive, runs: new FakeRunService({ drive, scale: 'instant' }), scenario, rootId });
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
    const status = vi.spyOn(s.worker, 'status').mockResolvedValue(st(wire('OLD', 'reading')));
    const process = vi.spyOn(s.worker, 'process').mockImplementation(async () => pr(wire('NEW', 'queued')));
    const lastRun = vi.spyOn(s.vault, 'lastRun').mockResolvedValue({ v: 1, run: { ...wire('OLD', 'done'), report } });
    return { s, status, process, lastRun };
  }

  it('each tidy-up press sends one requestId', async () => {
    const { s, process } = await controlled();
    await s.runs.start('all');
    await s.runs.start('instructions', { allowWeb: true });
    const sent = process.mock.calls.map(([, opts]) => opts?.requestId);
    expect(sent).toHaveLength(2);
    expect(sent.every((id) => typeof id === 'string' && /^[a-z0-9-]{1,64}$/.test(id))).toBe(true);
    expect(sent[0]).not.toBe(sent[1]);
    expect(process.mock.calls[1]?.[1]).toMatchObject({ allowWeb: true });
  });

  it('an older status revision arriving last is dropped', async () => {
    const { s } = await controlled();
    // The real client over a fake fetch: the Worker served the first ask after the second, so the first reply carries the newer revision.
    const replies: Array<ReturnType<typeof deferred<Response>>> = [];
    const http = new WorkerHttp('https://worker.example', () => { const d = deferred<Response>(); replies.push(d); return d.promise; });
    vi.spyOn(s.worker, 'status').mockImplementation(() => http.status() as never);
    const body = (run: RunWire | null, revision: number) => new Response(JSON.stringify({ run, revision }), { status: 200, headers: { 'content-type': 'application/json' } });
    const first = s.runs.current();
    const second = s.runs.current();
    await vi.waitFor(() => expect(replies).toHaveLength(2));
    replies[0]?.resolve(body(wire('OLD', 'reading'), 5));
    expect(await first).toMatchObject({ id: 'OLD', phase: 'reading' });
    // The later ask, answered from before: idle at revision 4 must not wipe the running tidy-up.
    replies[1]?.resolve(body(null, 4));
    expect(await second).toMatchObject({ id: 'OLD', phase: 'reading' });
    // Another run's older answer is dropped too.
    const third = s.runs.current();
    await vi.waitFor(() => expect(replies).toHaveLength(3));
    replies[2]?.resolve(body(wire('PREV', 'done'), 3));
    expect(await third).toMatchObject({ id: 'OLD', phase: 'reading' });
  });

  it('older run responses cannot replace newer observed state (reversed terminal replies and subscribers)', async () => {
    const { s, status } = await controlled();
    const older = deferred<StatusReply>();
    const newer = deferred<StatusReply>();
    status.mockImplementationOnce(() => older.promise).mockImplementationOnce(() => newer.promise);
    const first = s.runs.current();
    const second = s.runs.current();
    const observations: Array<Promise<RunState | null>> = [];
    s.runs.subscribe(() => observations.push(s.runs.current()));
    newer.resolve(st(wire('OLD', 'done'), 2));
    expect(await second).toMatchObject({ phase: 'done', report });
    older.resolve(st(wire('OLD', 'reading'), 1));
    expect(await first).toMatchObject({ phase: 'done', report });
    expect(observations).toHaveLength(1);
    expect((await Promise.all(observations)).every((r) => r?.phase === 'done')).toBe(true);
    expect(await s.runs.current()).toMatchObject({ phase: 'done', report });
    expect([...s.runs.runningPiles()]).toEqual([]);
  });

  it.each(['old-id', 'null'] as const)('older run responses cannot replace newer observed state (admission supersedes %s)', async (reply) => {
    const { s, status, process } = await controlled();
    await s.runs.current();
    const admission = deferred<RunReply>();
    const admitted = deferred<undefined>();
    process.mockImplementationOnce(() => { admitted.resolve(undefined); return admission.promise; });
    const start = s.runs.start('all');
    await admitted.promise;
    const pending = deferred<StatusReply>();
    status.mockImplementationOnce(() => pending.promise);
    const current = s.runs.current();
    const piles = (await s.vault.piles()).map((p) => p.id);
    admission.resolve(pr(wire('NEW', 'queued')));
    expect(await start).toMatchObject({ id: 'NEW', phase: 'queued' });
    pending.resolve(st(reply === 'null' ? null : wire('OLD', 'done')));
    expect(await current).toMatchObject({ id: 'NEW', phase: 'queued' });
    expect([...s.runs.runningPiles()]).toEqual(piles);
    status.mockResolvedValue(st(reply === 'null' ? null : wire('OLD', 'reading')));
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
      status.mockResolvedValue(st(null));
    });
    expect((await s.session.current())?.name).toBe('Alex');
    const failedSend = vi.spyOn(s.drive, 'createText').mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await s.vault.addRule('Keep receipts together');
    failedSend.mockRestore();
    const outboxKey = `bower:outbox:${initial.folderId}`;
    const waiting = localStorage.getItem(outboxKey);
    expect(waiting).not.toBeNull();
    status.mockResolvedValue(st(wire('OLD', phase)));
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
    status.mockResolvedValue(st(wire('OLD', 'done')));
    const old = s.runs.current();
    await entered.promise;
    const observations: Array<Promise<RunState | null>> = [];
    s.runs.subscribe(() => observations.push(s.runs.current()));
    status.mockResolvedValue(st(null));
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
    status.mockResolvedValue(st(wire('OLD', 'done')));
    const old = s.runs.current();
    await entered.promise;
    const piles = (await s.vault.piles()).map((p) => p.id);
    const observations: Array<Promise<RunState | null>> = [];
    s.runs.subscribe(() => observations.push(s.runs.current()));
    status.mockResolvedValue(st(wire('NEW', 'queued')));
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
    status.mockResolvedValue(st(wire('OLD', 'done')));
    const old = s.runs.current();
    await entered.promise;
    const observations: Array<Promise<RunState | null>> = [];
    s.runs.subscribe(() => observations.push(s.runs.current()));
    status.mockResolvedValue(st(wire('NEW', 'queued')));
    await s.runs.start('all');
    const newReport: RunReport = { ...report, created: [{ path: 'Areas/Home/Plan.md', what: 'A new plan' }] };
    lastRun.mockResolvedValue({ v: 1, run: { ...wire('NEW', 'done'), report: newReport } });
    status.mockResolvedValue(st(wire('NEW', 'done')));
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
    status.mockResolvedValue(st(null));
    expect(await s.runs.current()).toBeNull();
    for (const phase of ['queued', 'reading', 'writing', 'saving', 'done'] as const) {
      status.mockResolvedValue(st(wire('OLD', phase)));
      expect((await s.runs.current())?.phase).toBe(phase);
      status.mockResolvedValue(st(wire('OLD', 'queued')));
      expect((await s.runs.current())?.phase).toBe(phase);
    }
    status.mockResolvedValue(st(wire('OLD', 'failed')));
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await s.runs.current())?.phase).toBe('done');
    expect(diagnostic).toHaveBeenCalled();
    diagnostic.mockRestore();
  });

  it('older run responses cannot replace newer observed state (request and report failures retry)', async () => {
    const { s, status, lastRun } = await controlled();
    const older = deferred<StatusReply>();
    status.mockImplementationOnce(() => older.promise).mockRejectedValueOnce(new Error('status unavailable'));
    const pending = s.runs.current();
    await expect(s.runs.current()).rejects.toThrow('status unavailable');
    older.resolve(st(wire('OLD', 'saving')));
    expect((await pending)?.phase).toBe('saving');
    lastRun.mockRejectedValueOnce(new Error('report unavailable'));
    status.mockResolvedValue(st(wire('OLD', 'done')));
    await expect(s.runs.current()).rejects.toThrow('report unavailable');
    expect(await s.runs.current()).toMatchObject({ phase: 'done', report });
    await s.runs.markSeen('OLD');
    expect((await s.runs.current())?.seen).toBe(true);
  });

  it('older run responses cannot replace newer observed state (report loading is shared and disposal stops polling)', async () => {
    const { s, status, lastRun } = await controlled();
    const entered = deferred<undefined>();
    const release = deferred<undefined>();
    status.mockResolvedValue(st(wire('OLD', 'done')));
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
    const admission = deferred<RunReply>();
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
    status.mockResolvedValue(st(wire('OLD', 'done')));
    expect(await s.runs.current()).toMatchObject({ id: 'NEW', phase: 'queued' });
  });

  it('older run responses cannot replace newer observed state (pending reply after disposal has no effects)', async () => {
    const { s, status, lastRun } = await controlled();
    await s.runs.current();
    const reply = deferred<StatusReply>();
    status.mockImplementationOnce(() => reply.promise);
    const pending = s.runs.current();
    const changed = vi.fn();
    s.runs.subscribe(changed);
    s.runs.dispose();
    reply.resolve(st(wire('OLD', 'done')));
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
    process.mockResolvedValueOnce(pr(wire('OLD', 'done'))).mockImplementationOnce(async () => pr(wire('NEXT', 'queued')));
    lastRun.mockImplementationOnce(async () => { entered.resolve(undefined); await release.promise; return { v: 1, run: { ...wire('OLD', 'done'), report } }; });
    const start = s.runs.start('all');
    await entered.promise;
    const observations: Array<Promise<RunState | null>> = [];
    s.runs.subscribe(() => observations.push(s.runs.current()));
    status.mockResolvedValue(st(null));
    expect(await s.runs.current()).toBeNull();
    expect(await Promise.all(observations)).toEqual([null]);
    expect([...s.runs.runningPiles()]).toEqual([]);
    const retry = s.runs.start('all');
    expect(process).toHaveBeenCalledOnce();
    const superseded = expect(start).rejects.toMatchObject({ code: 'conflict', message: expect.stringMatching(/status.*try again/i) });
    status.mockResolvedValue(st(wire('NEXT', 'queued')));
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
    process.mockResolvedValueOnce(pr(wire('OLD', 'done')));
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
    // The B path's honest failure: it stopped before any effect.
    expect(r?.failure).toBe(B_FAILURE);
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

  describe('the run status beat', () => {
    afterEach(() => vi.useRealTimers());

    /** Home's run readers: each asks once when it mounts and listens, as `useRun` does. */
    async function readers(s: LiveSources, count: number): Promise<void> {
      for (let i = 0; i < count; i++) {
        s.runs.subscribe(() => undefined);
        await s.runs.current().catch(() => undefined);
      }
    }

    /** The real client over a stub fetch, so the status code goes through its own mapping. */
    function answering(s: LiveSources, httpStatus: number) {
      const http = new WorkerHttp('https://worker.example', () => Promise.resolve(new Response('{}', { status: httpStatus, headers: { 'content-type': 'application/json' } })));
      return vi.spyOn(s.worker, 'status').mockImplementation(() => http.status());
    }

    it('the run status is not asked again after a 4xx', async () => {
      for (const code of [400, 403, 404, 409]) {
        const s = await open();
        const status = answering(s, code);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.useFakeTimers();
        await readers(s, 3);
        await vi.advanceTimersByTimeAsync(10 * 60_000);
        expect(status.mock.calls.length, `after a ${code}`).toBeLessThanOrEqual(2);
        // Coming back into view asks again.
        const asked = status.mock.calls.length;
        status.mockResolvedValue(st(null));
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(0);
        expect(status.mock.calls.length, `after a ${code}`).toBeGreaterThan(asked);
        vi.useRealTimers();
        vi.restoreAllMocks();
        s.dispose();
      }
    });

    it.each([429, 500, 503])('the run status keeps its beat after a %i', async (code) => {
      const s = await open();
      const status = answering(s, code);
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.useFakeTimers();
      s.runs.subscribe(() => undefined);
      await s.runs.current().catch(() => undefined);
      await vi.advanceTimersByTimeAsync(3 * 60_000);
      expect(status.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it("the person's try again asks the run status once after a 4xx", async () => {
      const s = await open();
      const status = answering(s, 404);
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.useFakeTimers();
      await readers(s, 3);
      const asked = status.mock.calls.length;
      await expect(s.runs.current()).rejects.toMatchObject({ code: 'not-found' });
      expect(status.mock.calls.length).toBe(asked);
      status.mockResolvedValue(st(null));
      await expect(s.runs.current({ again: true })).resolves.toBeNull();
      expect(status.mock.calls.length).toBe(asked + 1);
      // The good answer clears it: mounts ask again as before.
      await s.runs.current();
      expect(status.mock.calls.length).toBe(asked + 2);
    });

    it('a run status that fails offline or with a server error is asked again', async () => {
      const s = await open();
      const status = vi.spyOn(s.worker, 'status')
        .mockRejectedValueOnce(new BowerError('offline', 'Offline.'))
        .mockRejectedValueOnce(new BowerError('unknown', 'Server error.'))
        .mockResolvedValue(st(null));
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.useFakeTimers();
      s.runs.subscribe(() => undefined);
      await s.runs.current().catch(() => undefined);
      await vi.advanceTimersByTimeAsync(3 * 60_000);
      expect(status.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('a good answer after a 4xx restarts the run status beat', async () => {
      const s = await open();
      const status = answering(s, 404);
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.useFakeTimers();
      await readers(s, 3);
      const asked = status.mock.calls.length;
      status.mockResolvedValue(st(null));
      await expect(s.runs.current({ again: true })).resolves.toBeNull();
      expect(status.mock.calls.length).toBe(asked + 1);
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(status.mock.calls.length).toBeGreaterThan(asked + 1);
    });

    it('a late 4xx from an older ask does not stop the beat', async () => {
      const s = await open();
      const older = deferred<StatusReply>();
      const status = vi.spyOn(s.worker, 'status');
      let callCount = 0;
      status.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return older.promise;
        return Promise.resolve(st(null));
      });
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.useFakeTimers();
      s.runs.subscribe(() => undefined);
      const first = s.runs.current().catch(() => undefined);
      await vi.advanceTimersByTimeAsync(61_000);
      const afterPoll = status.mock.calls.length;
      older.reject(new BowerError('not-found', 'Not found.'));
      await first;
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(status.mock.calls.length).toBeGreaterThan(afterPoll);
    });
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
    // Each root lands 300 ms after the last, on the welcome screen: fake time moves it.
    vi.useFakeTimers();
    try {
      const made = s.session.createFolder((r) => steps.push(r));
      await vi.advanceTimersByTimeAsync(5 * 300);
      await made;
    } finally {
      vi.useRealTimers();
    }
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
    sessionStorage.clear();
    const drive = new FakeDrive();
    const rootId = await seedFakeDrive(drive, 'running', Date.now());
    const worker = new FakeWorker({ drive, runs: new FakeRunService({ drive, scale: 'instant' }), scenario: 'running', rootId });
    const s = makeLiveSources({ worker, drive, runningPiles: () => worker.runningPiles(), pollMs: 50 });
    const phases: string[] = [];
    s.runs.subscribe(() => void s.runs.current().then((r) => r && phases.push(r.phase)));
    await s.runs.current();
    // Followed from going to done within the fast pace's window: wait for the event, not for a stretch of the clock.
    await vi.waitFor(() => expect(phases).toContain('done'));
    s.dispose();
    // Admitted on load on the B path (TL-P2-38), and followed from going to done within the fast pace's window.
    expect(phases[0]).not.toBe('done');
    expect(phases).toContain('done');
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

describe('foreground discovery', () => {
  let second: LiveSources | null = null;
  afterEach(() => {
    second?.dispose();
    second = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((yes) => { resolve = yes; });
    return { promise, resolve };
  }

  function client(backend: FakeDrive): DriveApi {
    return {
      listAll: (root) => backend.listAll(root), get: (id, opts) => backend.get(id, opts), readText: (id) => backend.readText(id),
      readBytes: (id) => backend.readBytes(id), readPrefix: (id) => backend.readPrefix(id),
      getStartPageToken: () => backend.getStartPageToken(), listChanges: (token) => backend.listChanges(token),
      parents: (id) => backend.parents(id), resolveScope: (root, ids) => backend.resolveScope(root, ids),
      createFolder: (parent, name, props, id) => backend.createFolder(parent, name, props, id),
      createText: (parent, name, text, props, id) => backend.createText(parent, name, text, props, id),
      writeText: (id, text, version, props) => backend.writeText(id, text, version, props), update: (id, patch) => backend.update(id, patch),
      trash: (id, props) => backend.trash(id, props), untrash: (id, props) => backend.untrash(id, props), fullText: (root, query) => backend.fullText(root, query),
      storedDigest: (id, known) => backend.storedDigest(id, known), binnedByItem: (root, keys) => backend.binnedByItem(root, keys),
      generateIds: (count) => backend.generateIds(count), openResumable: (target) => backend.openResumable(target), putChunk: (session, start, chunk, size, signal) => backend.putChunk(session, start, chunk, size, signal),
      sessionStatus: (session, size) => backend.sessionStatus(session, size), getUploaded: (id) => backend.getUploaded(id),
    };
  }

  const prefix = '---\r\nsummary: Synthetic\r\nby: bower\r\n---\r\n\r\n## Current state\r\n- Protected current state.\r\n\r\n';
  const suffix = '\r\n## Timeline\r\n- Today · Protected history.\r\n\r\n## Bower\'s note\r\nProtected wording.\r\n';
  const oldText = `${prefix}- [ ] Old text café.\r\n${suffix}`;
  const freshText = oldText.replace('Old text', 'Remote text');

  async function pair() {
    localStorage.clear();
    sessionStorage.clear();
    const backend = new FakeDrive();
    const root = await seedFakeDrive(backend, 'default', Date.now());
    if (!root) throw new Error('The synthetic folder is missing');
    const file = await backend.createText(root, 'External.md', oldText);
    const a = makeLiveSources({ drive: client(backend), worker: new FakeWorker({ drive: backend, runs: new FakeRunService({ drive: backend, scale: 'instant' }), rootId: root, scenario: 'default' }) });
    const b = makeLiveSources({ drive: client(backend), worker: new FakeWorker({ drive: backend, runs: new FakeRunService({ drive: backend, scale: 'instant' }), rootId: root, scenario: 'default' }) });
    live = a;
    second = b;
    // B represents another device: its run observer does not receive A's document events.
    b.runs.dispose();
    await Promise.all([a.vault.note('External.md'), a.vault.tree(), b.vault.note('External.md'), b.vault.tree(), a.vault.flushJournal(), b.vault.flushJournal()]);
    const list = a.drive.listAll.bind(a.drive);
    const listing = vi.spyOn(a.drive, 'listAll');
    const status = vi.spyOn(a.worker, 'status');
    const process = vi.spyOn(a.worker, 'process');
    vi.useFakeTimers();
    return { a, b, backend, root, file, list, listing, status, process };
  }

  function visibility(value: DocumentVisibilityState): void {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(value);
    document.dispatchEvent(new Event('visibilitychange'));
  }

  function back(): void {
    visibility('hidden');
    visibility('visible');
  }

  it('returning to an idle folder refreshes external changes (two clients share one backend)', async () => {
    const { a, b, backend, root, file, listing, status, process } = await pair();
    const version = await b.drive.get(file.id);
    await b.drive.writeText(file.id, freshText, version.modifiedTime);
    await b.drive.createText(root, 'Remote.md', 'A new remote note.');
    expect((await a.vault.note('External.md')).body).toBe('- [ ] Old text café.');
    expect((await a.vault.tree()).some((n) => n.path === 'Remote.md')).toBe(false);
    const snapshot = await backend.snapshot();
    const reloads: Array<Promise<string>> = [];
    a.vault.subscribe(() => reloads.push(a.vault.note('External.md').then((n) => n.body)));
    back();
    // Drain this event's promise jobs under a controlled clock; no background interval is advanced.
    await vi.advanceTimersByTimeAsync(0);
    expect((await a.vault.note('External.md')).body).toBe('- [ ] Remote text café.');
    expect((await a.vault.tree()).some((n) => n.path === 'Remote.md')).toBe(true);
    expect(await Promise.all(reloads)).toEqual(['- [ ] Remote text café.']);
    expect(await b.drive.readText(file.id)).toBe(freshText);
    expect(await backend.snapshot()).toBe(snapshot);
    expect(listing).toHaveBeenCalledOnce();
    expect(status).toHaveBeenCalledOnce();
    expect(process).not.toHaveBeenCalled();
  });

  it('returning to an idle folder refreshes external changes (ordinary status and timer polls stay status-only)', async () => {
    const { a, listing, status } = await pair();
    a.runs.subscribe(() => undefined);
    await a.runs.current();
    await a.runs.current();
    visibility('hidden');
    expect(status).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(status).toHaveBeenCalledTimes(3);
    expect(listing).not.toHaveBeenCalled();
    back();
    await vi.advanceTimersByTimeAsync(0);
    expect(listing).toHaveBeenCalledOnce();
    await a.runs.current();
    expect(listing).toHaveBeenCalledOnce();
  });

  it('returning to an idle folder refreshes external changes (visible events share one pending wave and later returns retry)', async () => {
    const { a, b, file, list, listing, status } = await pair();
    const release = deferred<undefined>();
    listing.mockImplementationOnce(async (root) => { await release.promise; return list(root); });
    back();
    await vi.advanceTimersByTimeAsync(0);
    expect(listing).toHaveBeenCalledOnce();
    visibility('visible');
    back();
    await vi.advanceTimersByTimeAsync(0);
    expect(status).toHaveBeenCalledOnce();
    expect(listing).toHaveBeenCalledOnce();
    release.resolve(undefined);
    await vi.advanceTimersByTimeAsync(0);
    const version = await b.drive.get(file.id);
    await b.drive.writeText(file.id, freshText, version.modifiedTime);
    back();
    await vi.advanceTimersByTimeAsync(0);
    expect(listing).toHaveBeenCalledTimes(2);
    expect((await a.vault.note('External.md')).body).toBe('- [ ] Remote text café.');
  });

  it('returning to an idle folder refreshes external changes (waiting journal, upload and Undo survive discovery)', async () => {
    const { a, b, root, listing } = await pair();
    await a.vault.trash('External.md');
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(a.drive, 'createText').mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const rule = await a.vault.addRule('Keep receipts together');
    const key = `bower:outbox:${root}`;
    const waiting = localStorage.getItem(key);
    expect(waiting).not.toBeNull();
    const open = a.drive.openResumable.bind(a.drive);
    const release = deferred<undefined>();
    vi.spyOn(a.drive, 'openResumable').mockImplementationOnce(async (...args) => { await release.promise; return open(...args); });
    const pile = await a.vault.addPile({ text: '', items: [{ name: 'New image.png', kind: 'image', origin: 'computer', body: new Blob(['synthetic image']) }] });
    await b.drive.createText(root, 'Remote.md', 'A new remote note.');
    listing.mockClear();
    back();
    await vi.advanceTimersByTimeAsync(0);
    expect(listing).toHaveBeenCalledOnce();
    expect(localStorage.getItem(key)).toBe(waiting);
    expect((await a.vault.changes()).filter((c) => c.id === rule.id)).toHaveLength(1);
    expect((await a.vault.piles()).find((p) => p.id === pile.id)?.items).toMatchObject([{ name: 'New image.png', upload: 0 }]);
    await a.vault.restore('External.md');
    expect((await a.vault.note('External.md')).body).toBe('- [ ] Old text café.');
    // The Undo records its inverse line (TL-P4-27 addendum 2), which sends the waiting line first, in order: nothing is lost.
    expect(localStorage.getItem(key)).toBeNull();
    expect((await a.vault.changes()).filter((c) => c.id === rule.id)).toHaveLength(1);
    release.resolve(undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(diagnostic).toHaveBeenCalledOnce(); // The deliberate failed journal send only.
  });

  it.each(['offline', 'auth'] as const)('returning to an idle folder refreshes external changes (%s listing failure logs once and retries)', async (failure) => {
    const { a, b, root, file, listing } = await pair();
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reload = vi.fn();
    const sessions = vi.fn();
    a.vault.subscribe(reload);
    a.session.subscribe(sessions);
    if (failure === 'auth') await a.worker.signOut();
    const version = await b.drive.get(file.id);
    await b.drive.writeText(file.id, freshText, version.modifiedTime);
    const key = `bower:outbox:${root}`;
    const bytes = '[{"v":1,"id":"waiting","at":1,"kind":"rule","what":"Synthetic rule","device":"test"}]';
    localStorage.setItem(key, bytes);
    listing.mockRejectedValueOnce(driveError(failure));
    back();
    await vi.advanceTimersByTimeAsync(0);
    expect(diagnostic).toHaveBeenCalledOnce();
    expect(diagnostic).toHaveBeenCalledWith(expect.objectContaining({ code: failure, message: expect.any(String) }));
    expect(reload).not.toHaveBeenCalled();
    expect(localStorage.getItem(key)).toBe(bytes);
    if (failure === 'auth') {
      expect(sessions).toHaveBeenCalledOnce();
      expect(await a.session.current()).toBeNull();
      await a.session.signIn();
    }
    back();
    await vi.advanceTimersByTimeAsync(0);
    expect(listing).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledOnce();
    expect((await a.vault.note('External.md')).body).toBe('- [ ] Remote text café.');
    expect(localStorage.getItem(key)).toBe(bytes);
  });

  it('returning to an idle folder refreshes external changes (new admission during status wait keeps its locks and skips discovery)', async () => {
    const { a, status, process, listing } = await pair();
    const reply = deferred<StatusReply>();
    status.mockImplementationOnce(() => reply.promise);
    back();
    await vi.advanceTimersByTimeAsync(0);
    process.mockResolvedValue(pr({ id: 'NEW', phase: 'queued', scope: 'all', requestedAt: 1, phaseAt: 1 }));
    const piles = (await a.vault.piles()).map((p) => p.id);
    await a.runs.start('all');
    reply.resolve(st(null));
    await vi.advanceTimersByTimeAsync(0);
    expect(listing).not.toHaveBeenCalled();
    expect([...a.runs.runningPiles()]).toEqual(piles);
    status.mockResolvedValue(st({ id: 'NEW', phase: 'queued', scope: 'all', requestedAt: 1, phaseAt: 1 }));
    expect(await a.runs.current()).toMatchObject({ id: 'NEW', phase: 'queued' });
  });

  it.each(['status', 'listing'] as const)('returning to an idle folder refreshes external changes (dispose during %s stops continuation)', async (boundary) => {
    const { a, status, list, listing } = await pair();
    const release = deferred<undefined>();
    if (boundary === 'status') status.mockImplementationOnce(async () => { await release.promise; return st(null); });
    else {
      listing.mockImplementationOnce(async (root) => { await release.promise; return list(root); });
    }
    const changed = vi.fn();
    a.vault.subscribe(changed);
    a.runs.subscribe(changed);
    back();
    await vi.advanceTimersByTimeAsync(0);
    expect(listing).toHaveBeenCalledTimes(boundary === 'status' ? 0 : 1);
    a.dispose();
    release.resolve(undefined);
    await vi.advanceTimersByTimeAsync(0);
    back();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(status).toHaveBeenCalledOnce();
    expect(listing).toHaveBeenCalledTimes(boundary === 'status' ? 0 : 1);
    expect(changed).not.toHaveBeenCalled();
  });

  it('returning to an idle folder refreshes external changes (completion shares discovery and cached status does not relist)', async () => {
    const { a, status, listing } = await pair();
    const wire: RunWire = { id: 'DONE', phase: 'done', scope: 'all', requestedAt: 1, phaseAt: 1 };
    const report: RunReport = { filed: [], created: [], updated: [], setAside: [], questions: [] };
    status.mockResolvedValue(st(wire));
    vi.spyOn(a.vault, 'lastRun').mockResolvedValue({ v: 1, run: { ...wire, report } });
    back();
    await vi.advanceTimersByTimeAsync(0);
    expect(await a.runs.current()).toMatchObject({ phase: 'done', report });
    expect(listing).toHaveBeenCalledOnce();
    await a.runs.current();
    expect(listing).toHaveBeenCalledOnce();
    back();
    await vi.advanceTimersByTimeAsync(0);
    expect(listing).toHaveBeenCalledTimes(2);
  });

  it('returning to an idle folder refreshes external changes (completion joins an already pending discovery)', async () => {
    const { a, status, list, listing } = await pair();
    const release = deferred<undefined>();
    listing.mockImplementationOnce(async (root) => { await release.promise; return list(root); });
    back();
    await vi.advanceTimersByTimeAsync(0);
    expect(listing).toHaveBeenCalledOnce();
    const wire: RunWire = { id: 'DONE', phase: 'done', scope: 'all', requestedAt: 1, phaseAt: 1 };
    status.mockResolvedValue(st(wire));
    vi.spyOn(a.vault, 'lastRun').mockResolvedValue({ v: 1, run: { ...wire, report: { filed: [], created: [], updated: [], setAside: [], questions: [] } } });
    const terminal = a.runs.current();
    await vi.advanceTimersByTimeAsync(0);
    expect(listing).toHaveBeenCalledOnce();
    release.resolve(undefined);
    expect((await terminal)?.phase).toBe('done');
    await vi.advanceTimersByTimeAsync(0);
    expect(listing).toHaveBeenCalledOnce();
  });

  it('returning to an idle folder refreshes external changes (a later external write still refuses a stale checkbox edit)', async () => {
    const { a, b, file } = await pair();
    const version = await b.drive.get(file.id);
    await b.drive.writeText(file.id, freshText, version.modifiedTime);
    back();
    await vi.advanceTimersByTimeAsync(0);
    expect((await a.vault.note('External.md')).body).toBe('- [ ] Remote text café.');
    const now = await b.drive.get(file.id);
    const newer = freshText.replace('Remote text', 'Newest text');
    await b.drive.writeText(file.id, newer, now.modifiedTime);
    await expect(a.vault.toggleTask('External.md', 0)).rejects.toMatchObject({ code: 'conflict' });
    expect(await b.drive.readText(file.id)).toBe(newer);
  });

  it.each(['terminal', 'idle'] as const)('returning to an idle folder refreshes external changes (pre-return snapshot cannot satisfy %s discovery)', async (outcome) => {
    const { a, b, root, file, list, listing, status } = await pair();
    expect((await a.vault.note('External.md')).body).toBe('- [ ] Old text café.');
    const captured = deferred<undefined>();
    const release = deferred<undefined>();
    listing.mockImplementationOnce(async (folder) => {
      const snapshot = await list(folder);
      captured.resolve(undefined);
      await release.promise;
      return snapshot;
    });
    const wire: RunWire = { id: 'DONE', phase: 'done', scope: 'all', requestedAt: 1, phaseAt: 1 };
    status.mockResolvedValue(st(wire));
    vi.spyOn(a.vault, 'lastRun').mockResolvedValue({ v: 1, run: { ...wire, report: { filed: [], created: [], updated: [], setAside: [], questions: [] } } });
    const old = a.runs.current();
    await captured.promise;
    const version = await b.drive.get(file.id);
    await b.drive.writeText(file.id, freshText, version.modifiedTime);
    await b.drive.createText(root, 'Remote.md', 'A new remote note.');
    if (outcome === 'idle') status.mockResolvedValue(st(null));
    back();
    await vi.advanceTimersByTimeAsync(0);
    expect(listing).toHaveBeenCalledOnce();
    release.resolve(undefined);
    await old;
    await vi.advanceTimersByTimeAsync(0);
    expect((await a.vault.note('External.md')).body).toBe('- [ ] Remote text café.');
    expect((await a.vault.tree()).some((n) => n.path === 'Remote.md')).toBe(true);
    expect(listing).toHaveBeenCalledTimes(2);
  });

  it.each(['active', 'disposed'] as const)('returning to an idle folder refreshes external changes (pre-return listing wait rechecks %s before starting discovery)', async (change) => {
    const { a, list, listing, status, process } = await pair();
    const captured = deferred<undefined>();
    const release = deferred<undefined>();
    listing.mockImplementationOnce(async (folder) => {
      const snapshot = await list(folder);
      captured.resolve(undefined);
      await release.promise;
      return snapshot;
    });
    status.mockResolvedValue(st({ id: 'DONE', phase: 'done', scope: 'all', requestedAt: 1, phaseAt: 1 }));
    const old = a.runs.current();
    await captured.promise;
    status.mockResolvedValue(st(null));
    back();
    await vi.advanceTimersByTimeAsync(0);
    if (change === 'disposed') a.dispose();
    else {
      const wire: RunWire = { id: 'NEW', phase: 'queued', scope: 'instructions', requestedAt: 1, phaseAt: 1 };
      process.mockResolvedValue(pr(wire));
      await a.runs.start('instructions');
      status.mockResolvedValue(st(wire));
      expect([...a.runs.runningPiles()]).toEqual(['*']);
    }
    release.resolve(undefined);
    await old;
    await vi.advanceTimersByTimeAsync(0);
    expect(listing).toHaveBeenCalledOnce();
    if (change === 'active') expect(await a.runs.current()).toMatchObject({ id: 'NEW', phase: 'queued' });
  });
});


describe('person cleanup forgets pending draft bytes and keeps the folder outbox', () => {
  const personLocal = ['bower:seen', 'bower:dismissed', 'bower:run-seen', 'bower:bookmarks', 'bower:open', 'bower:stopped-away', 'bower:failed-lines'];
  const personSession = ['bower:add-draft', 'bower:add-items', 'bower:toured', 'bower:tabs'];
  const outbox = '[{"v":1,"id":"CHANGE_A","device":"DEVICE_A","at":1,"kind":"create","what":"Synthetic note","fileId":"FILE_A"}]';
  const prefs = '{"theme":"dark"}';
  afterEach(() => { vi.restoreAllMocks(); forgetDraft('LIVE_DRAFT_A'); forgetDraft('LIVE_ORPHAN_A'); });
  async function draft() {
    const s = await open('empty');
    expect((await s.session.current())?.name).toBe('Alex');
    await s.vault.flushJournal();
    const folder = await s.session.rootId();
    for (const key of personLocal) localStorage.setItem(key, '[]');
    for (const key of personSession) sessionStorage.setItem(key, '[]');
    sessionStorage.setItem('bower:add-items', '[{"key":"LIVE_DRAFT_A","name":"Synthetic.txt"}]');
    localStorage.setItem(`bower:outbox:${folder}`, outbox); localStorage.setItem('bower:prefs', prefs);
    const selected = new Blob(['Synthetic live draft.']), orphan = new Blob(['Synthetic live orphan.']);
    keepDraft('LIVE_DRAFT_A', selected); keepDraft('LIVE_ORPHAN_A', orphan);
    expect(getDraft('LIVE_DRAFT_A')).toBe(selected); expect(getDraft('LIVE_ORPHAN_A')).toBe(orphan);
    const retained = () => {
      expect(localStorage.getItem(`bower:outbox:${folder}`)).toBe(outbox);
      expect(localStorage.getItem('bower:outbox:FOLDER_B')).toBeNull();
      expect(localStorage.getItem('bower:prefs')).toBe(prefs);
    };
    const forgotten = () => {
      expect(getDraft('LIVE_DRAFT_A')).toBeUndefined(); expect(getDraft('LIVE_ORPHAN_A')).toBeUndefined();
      for (const key of personLocal) expect(localStorage.getItem(key), key).toBeNull();
      for (const key of personSession) expect(sessionStorage.getItem(key), key).toBeNull();
      retained();
    };
    return { s, selected, orphan, retained, forgotten };
  }
  for (const ending of ['logout', 'delete', 'expiry'] as const) it(`actual LiveSources ${ending} clears current-page bytes after successful cleanup`, async () => {
    const { s, forgotten } = await draft();
    if (ending === 'logout') await s.session.signOut();
    else if (ending === 'delete') await s.session.deleteAccount();
    else {
      await s.worker.signOut();
      (s.drive as FakeDrive).failNext('auth');
      await expect(s.vault.tree()).rejects.toMatchObject({ code: 'auth' });
    }
    expect(await s.session.current()).toBeNull(); forgotten();
    expect(sessionStorage.getItem('bower:bye')).toBe(ending === 'delete' ? '1' : null);
  });
  it('stale-session logout answering 204 forgets this person and keeps the folder outbox', async () => {
    const { s, forgotten } = await draft();
    await s.worker.signOut(); // The remote session ended while this page still kept the person's data.
    const fetchLogout = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    const http = new WorkerHttp('https://worker.example', fetchLogout);
    vi.spyOn(s.worker, 'signOut').mockImplementationOnce(() => http.signOut());
    await expect(s.session.signOut()).resolves.toBeUndefined();
    expect(fetchLogout).toHaveBeenCalledOnce();
    expect(fetchLogout).toHaveBeenCalledWith('https://worker.example/auth/logout', expect.objectContaining({ method: 'POST' }));
    expect(await s.session.current()).toBeNull();
    forgotten();
    expect(sessionStorage.getItem('bower:bye')).toBeNull();
  });
  it('failed remote logout forgets bytes and metadata before the successful retry', async () => {
    const { s, retained, forgotten } = await draft();
    vi.spyOn(s.worker, 'signOut').mockRejectedValueOnce(new BowerError('offline', 'Signing out did not finish. Try again.'));
    await expect(s.session.signOut()).rejects.toMatchObject({ code: 'offline', message: 'Signing out did not finish. Try again.' });
    expect((await s.session.current())?.name).toBe('Alex');
    expect(getDraft('LIVE_DRAFT_A')).toBeUndefined(); expect(getDraft('LIVE_ORPHAN_A')).toBeUndefined();
    for (const key of personLocal) expect(localStorage.getItem(key), key).toBeNull();
    for (const key of personSession) expect(sessionStorage.getItem(key), key).toBeNull();
    expect(sessionStorage.getItem('bower:bye')).toBeNull(); retained();
    await s.session.signOut(); expect(await s.session.current()).toBeNull(); forgotten();
  });
});

describe('c2-create-by-id: a line Drive refuses while nobody waits on it', () => {
  afterEach(() => vi.restoreAllMocks());

  it('a journal line refused in the background shows once in what failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.clear();
    const drive = new FakeDrive();
    const folder = await drive.createFolder('root', 'Synthetic A');
    for (const name of ['Inbox', 'Projects', 'Areas', 'Resources', 'Archive']) await drive.createFolder(folder.id, name);
    await drive.createFolder((await drive.createFolder(folder.id, '.bower')).id, 'changes');
    const worker = new FakeWorker({ drive, runs: new FakeRunService({ drive, scale: 'instant' }), rootId: folder.id, scenario: 'empty' });
    vi.spyOn(worker, 'me').mockResolvedValue({ user: { name: 'Alex', email: 'you@example.com' }, folderId: folder.id });
    // A rule kept on this device while Drive was out of reach, and a move: Drive now refuses their lines for good.
    const line = (id: string, kind: 'rule' | 'move', what: string) => ({ line: { v: 1, id, at: Date.parse('2026-10-09T08:00:00Z'), kind, what, device: 'device-a' } });
    localStorage.setItem(`bower:outbox:${folder.id}`, JSON.stringify([line('L1', 'rule', 'New rule: "receipts go in money"')]));
    const create = drive.createText.bind(drive);
    const refusing = new DriveHttp({ token: async () => 't', fetch: async () => new Response(JSON.stringify({ error: { errors: [{ reason: 'insufficientFilePermissions' }] } }), { status: 403 }), pacing: { baseMs: 0, sleep: async () => {} } });
    drive.createText = async (...a: Parameters<FakeDrive['createText']>) => (a[1].startsWith('L') ? refusing.createText(...a) : create(...a));
    live = makeLiveSources({ drive, worker });
    const s = live;
    const changed = vi.fn();
    s.vault.subscribe(changed);
    // At start the outbox goes by itself; nobody is there to be told, so the refused line is kept among what failed.
    await vi.waitFor(() => expect(localStorage.getItem(`bower:outbox:${folder.id}`)).toBeNull());
    await vi.waitFor(async () => expect(await s.vault.failedChanges?.()).toEqual([{ id: 'L1', what: 'New rule: "receipts go in money"', sentence: "Bower couldn't keep that rule." }]));
    expect(changed).toHaveBeenCalled();
    // Back online, nothing is sent again and nothing is told twice.
    window.dispatchEvent(new Event('online'));
    await s.vault.flushJournal();
    expect(await s.vault.failedChanges?.()).toHaveLength(1);
    // Put away, it is seen: it does not come back.
    await s.vault.putAwayFailed?.('L1');
    expect(await s.vault.failedChanges?.()).toEqual([]);
    // A waiting line refused while the next change goes is kept the same way, once; the new change is noted.
    localStorage.setItem(`bower:outbox:${folder.id}`, JSON.stringify([line('L2', 'move', 'Moved Lease draft to Areas')]));
    await s.vault.tree();
    await s.vault.create('Resources', 'note');
    expect(await s.vault.failedChanges?.()).toEqual([{ id: 'L2', what: 'Moved Lease draft to Areas', sentence: "Your change was made, but Bower couldn't make a note of it." }]);
    expect((await s.vault.changes()).map((c) => c.kind)).toEqual(['create']);
    await s.vault.flushJournal();
    expect(await s.vault.failedChanges?.()).toHaveLength(1);
  });
});

// Q1c: transport fixtures widen the wire without requiring Q1a's unlanded TypeScript exports.
const Q1C_AT = Date.UTC(2026, 9, 10, 12);
const q1cQuestion = (id: string, askedAt = Q1C_AT) => ({ id, text: 'Where should Alex keep this?',
  yes: 'In projects', no: 'Keep here', askedAt });
type Q1cQuestion = ReturnType<typeof q1cQuestion>;
const q1cWire = (questions?: Q1cQuestion[], id = 'Q1C_RUN') => ({ id, phase: 'writing', scope: 'all',
  requestedAt: Q1C_AT, phaseAt: Q1C_AT, ...(questions === undefined ? {} : { questions }) });

async function q1cLive() {
  localStorage.clear(); sessionStorage.clear();
  const drive = new FakeDrive({ clock: () => Q1C_AT });
  const root = (await drive.createFolder('root', 'Bower')).id;
  for (const name of ['Inbox', 'Projects', 'Areas', 'Resources', 'Archive']) await drive.createFolder(root, name);
  const inbox = (await drive.listAll(root)).find((f) => f.folder && f.name === 'Inbox');
  expect(inbox).toBeDefined();
  const thing = await drive.createText(inbox?.id ?? '', 'Waiting.md', 'Made-up waiting words.', { pile: 'Q1C_THING' });
  const pile = await drive.createFolder(inbox?.id ?? '', 'Made-up pile', { pile: 'Q1C_PILE' });
  await drive.createText(pile.id, 'Pile note.md', 'Made-up words for Alex.');
  await drive.createText(pile.id, 'Member.md', 'Made-up member words.');
  const sys = (await drive.createFolder(root, '.bower')).id;
  const changes = (await drive.createFolder(sys, 'changes')).id;
  const legacy = q1cQuestion('Q1C_STORED', Q1C_AT - 100);
  const file = await drive.createText(sys, 'questions.json', JSON.stringify({ v: 1, questions: [legacy] }));
  let reply: unknown = { revision: 1, run: q1cWire() };
  let folder = root;
  const requests: string[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    if (url.pathname === '/me') return Response.json({ user: { name: 'Alex', email: 'you@example.com' }, folderId: folder });
    if (url.pathname === '/status') return Response.json(reply);
    if (url.pathname === '/auth/logout') return new Response(null, { status: 204 });
    throw new Error(`Unexpected Q1c request: ${url.pathname}`);
  };
  live = makeLiveSources({ drive, worker: new WorkerHttp('https://worker.example.com', fetchFn) });
  const s = live;
  await s.vault.flushJournal();
  // Positive control: this is the actual Drive reader, not a replacement vault.
  expect(await s.vault.questions()).toEqual([legacy]);
  const publish = async (questions: Q1cQuestion[] | undefined, revision: number, id = 'Q1C_RUN') => {
    reply = { revision, run: q1cWire(questions, id) };
    return s.runs.current();
  };
  const write = async (questions: Q1cQuestion[]) => {
    const latest = await drive.get(file.id);
    await drive.writeText(file.id, JSON.stringify({ v: 1, questions }), latest.modifiedTime);
    await s.vault.refresh();
  };
  return { s, drive, root, changes, legacy, requests, publish, write,
    subject: { thing: thing.id, pile: 'Q1C_PILE' },
    setReply: (value: unknown) => { reply = value; }, setFolder: (id: string) => { folder = id; } };
}

describe('Q1c live questions through makeLiveSources and WorkerHttp', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  function clock() { vi.useFakeTimers(); vi.setSystemTime(Q1C_AT); }

  it('Q1c v15: a null snapshot means no live questions (vault)', async () => {
    clock();
    const { s, legacy, publish } = await q1cLive();
    const asking = q1cQuestion('Q1C_LIVE');
    await publish([asking], 2);
    expect(await s.vault.questions()).toEqual([legacy, asking]);
    // SQL NULL is omitted by GET /status; a newer omitted snapshot clears the live asking.
    const current = await publish(undefined, 3);
    expect(current).not.toHaveProperty('questions');
    expect(await s.vault.questions()).toEqual([legacy]);
  });

  it('Q1c q1-stored-and-live-question-merge: Drive wins by asking identity and handoff never drops a card', async () => {
    clock();
    const { s, legacy, publish, write } = await q1cLive();
    const asking = q1cQuestion('Q1C_LIVE');
    await publish([asking], 2);
    expect(await s.vault.questions()).toEqual([legacy, asking]);
    const stored = { ...asking, text: 'Drive wording wins.' };
    await write([legacy, stored]);
    expect(await s.vault.questions()).toEqual([legacy, stored]);
    await publish([], 3);
    expect(await s.vault.questions()).toEqual([legacy, stored]);
    // A later asking of the same id is distinct; a matching Drive asking alone takes precedence.
    const later = { ...asking, askedAt: Q1C_AT + 10 };
    await publish([later], 4);
    expect((await s.vault.questions()).filter((q) => q.id === asking.id).map((q) => q.askedAt))
      .toContain(later.askedAt);
  });

  it('Q1c q1-stored-and-live-question-merge: status changes emit the vault and use one polling stream', async () => {
    clock();
    const { s, drive, legacy, requests, publish } = await q1cLive();
    const changed = vi.fn();
    const stop = s.vault.subscribe(changed);
    await publish([], 2);
    changed.mockClear();
    const list = vi.spyOn(drive, 'listAll');
    await publish([q1cQuestion('Q1C_LIVE')], 3);
    expect(changed).toHaveBeenCalled();
    expect(await s.vault.questions()).toHaveLength(2);
    const reads = list.mock.calls.length;
    requests.length = 0;
    const stopRuns = s.runs.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(4_000);
    expect(requests.filter((p) => p.endsWith('/status'))).toHaveLength(1);
    expect(list).toHaveBeenCalledTimes(reads);
    await publish([], 4);
    expect(await s.vault.questions()).toEqual([legacy]);
    stopRuns(); stop();
  });

  it.each(['revision', 'run', 'folder', 'session'] as const)(
    'Q1c q1-stored-and-live-question-merge: %s fence discards an old snapshot', async (fence) => {
      clock();
      const { s, drive, root, legacy, publish, setReply, setFolder } = await q1cLive();
      const current = q1cQuestion('Q1C_CURRENT');
      await publish([current], 10);
      // Positive control: an accepted snapshot is visible before a fence is exercised.
      expect(await s.vault.questions()).toEqual([legacy, current]);
      if (fence === 'revision') {
        await publish([q1cQuestion('Q1C_STALE')], 9);
        expect(await s.vault.questions()).toEqual([legacy, current]);
      } else if (fence === 'run') {
        await publish([q1cQuestion('Q1C_NEW')], 11, 'Q1C_NEW_RUN');
        await publish([q1cQuestion('Q1C_STALE')], 12, 'Q1C_RUN');
        expect((await s.vault.questions()).map((q) => q.id)).toEqual([legacy.id, 'Q1C_NEW']);
      } else {
        let release!: (value: Response) => void;
        const status = vi.spyOn(s.worker, 'status').mockImplementationOnce(async () => {
          const response = await new Promise<Response>((yes) => { release = yes; });
          return response.json();
        });
        const old = s.runs.current().then((value) => ({ value }), (error: unknown) => ({ error }));
        await s.session.signOut();
        if (fence === 'folder') {
          const other = (await drive.createFolder('root', 'Other made-up folder')).id;
          for (const name of ['Inbox', '.bower']) await drive.createFolder(other, name);
          setFolder(other);
        } else setFolder(root);
        setReply({ revision: 1, run: q1cWire([], 'Q1C_NEW_SESSION') });
        vi.spyOn(s.worker, 'signIn').mockResolvedValueOnce(undefined);
        await s.session.signIn();
        await s.runs.current();
        release(Response.json({ revision: 99, run: q1cWire([q1cQuestion('Q1C_STALE')]) }));
        expect(await old).toMatchObject({ error: { name: 'BowerError' } });
        status.mockRestore();
        expect((await s.vault.questions()).some((q) => q.id === 'Q1C_STALE' || q.id === current.id)).toBe(false);
        if (fence === 'session') expect((await s.vault.questions()).map((q) => q.id)).toContain(legacy.id);
      }
    });

  it('Q1c q1-stored-and-live-question-merge: addendum 1 keeps asking order and an answer closes the shared source', async () => {
    clock();
    const { s, legacy, publish } = await q1cLive();
    const early = q1cQuestion('Q1C_EARLY', Q1C_AT + 1), late = q1cQuestion('Q1C_LATE', Q1C_AT + 2);
    await publish([late, early], 2);
    expect((await s.vault.questions()).map((q) => q.id)).toEqual([legacy.id, early.id, late.id]);
    await s.vault.answer(early.id, false);
    expect((await s.vault.questions()).map((q) => q.id)).toEqual([legacy.id, late.id]);
    expect((await s.vault.changes()).filter((c) => c.kind === 'answer')).toHaveLength(1);
    await publish([early, late], 3);
    expect((await s.vault.questions()).map((q) => q.id)).toEqual([legacy.id, late.id]);
  });

  const answers = [true, { option: 'Q1C_OPTION' }, { text: 'Alex keeps this with project words.\nMade-up line.' }];
  const cases = (['thing', 'pile'] as const).flatMap((subject) => answers.map((answer) => [subject, answer] as const));
  it.each(cases)(
    'Q1c q1-stored-and-live-question-merge: addenda 1-2 %s answer %j cannot revive round one or hide round two', async (kind, answer) => {
      clock();
      const { s, drive, changes, legacy, publish, subject } = await q1cLive();
      const first = q1cQuestion(`q-ask-${subject[kind]}`, Q1C_AT + 1), second = q1cQuestion(first.id, Q1C_AT + 2);
      // Q1a owns the value's admission; Q1c pins only the merge of a previously stored answer.
      await drive.createText(changes, 'Q1C_ANSWER.json', JSON.stringify({ v: 1, id: 'Q1C_ANSWER', device: 'Q1C_DEVICE',
        at: Q1C_AT + 3, kind: 'answer', what: 'Answered a made-up question', questionId: first.id,
        askedAt: first.askedAt, answer }));
      await s.vault.refresh();
      await publish([first], 2);
      expect(await s.vault.questions()).toEqual([legacy]);
      await publish([second], 3);
      expect(await s.vault.questions()).toEqual([legacy, second]);
    });

  it('Q1c q1-stored-and-live-question-merge: contract 5 legacy status stays readable beside the additive snapshot', async () => {
    clock();
    const { s, publish, write } = await q1cLive();
    const legacy = p2Questions.files[0]?.content.questions ?? [];
    await write(legacy);
    expect(await publish(undefined, 2)).toMatchObject({ id: 'Q1C_RUN', phase: 'writing', phaseAt: Q1C_AT });
    expect(await s.vault.questions()).toEqual(legacy);
    await publish([q1cQuestion('Q1C_ADDITIVE')], 3);
    expect((await s.vault.questions()).map((q) => q.id)).toEqual([...legacy.map((q) => q.id), 'Q1C_ADDITIVE']);
  });
});
