import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { SYSTEM } from '../vault/layout';
import { FakeWorker } from './fake-worker';
import { seedFakeDrive } from './seed';
import { DriveVault } from '../vault/drive-vault';
import type { Scenario } from '../demo/scenario';
import { BowerError } from '../types';
import type { LastRunFile } from '../vault/layout';

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
    const { id, found } = await worker.createFolder();
    expect(found).toBe(false);
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

const validRuns = [
  ['done', '{ "v": 1, "run": { "id": "RUN_A", "scope": "all", "phase": "done", "requestedAt": 1, "phaseAt": 2 } }\n'],
  ['failed', '{ "v": 1, "run": { "id": "RUN_A", "scope": "all", "phase": "failed", "requestedAt": 1, "phaseAt": 2, "failure": "Bower stopped. Try again." } }\n'],
  ['report and inert additive metadata', '{ "v": 1, "metadata": "INERT", "run": { "id": "RUN_A", "scope": "instructions", "phase": "done", "requestedAt": 1, "phaseAt": 2, "metadata": "INERT", "report": { "filed": [], "created": [{ "path": "Resources/Example.md", "what": "Added an example." }], "updated": [], "setAside": [], "questions": [], "requests": ["REQUEST_A"], "rulesWorded": 1, "metadata": "INERT" } } }\n'],
] as const;
const invalidRuns = [
  ['malformed JSON', '{ "v": 1, "run":\n'],
  ['array container', '[]\n'],
  ['unsupported version', '{ "v": 2, "run": { "id": "RUN_A", "scope": "all", "phase": "done", "requestedAt": 1, "phaseAt": 2 } }\n'],
  ['missing id', '{ "v": 1, "run": { "scope": "all", "phase": "done", "requestedAt": 1, "phaseAt": 2 } }\n'],
  ['empty id', '{ "v": 1, "run": { "id": "", "scope": "all", "phase": "done", "requestedAt": 1, "phaseAt": 2 } }\n'],
  ['unknown phase', '{ "v": 1, "run": { "id": "RUN_A", "scope": "all", "phase": "waiting", "requestedAt": 1, "phaseAt": 2 } }\n'],
  ['negative timestamp', '{ "v": 1, "run": { "id": "RUN_A", "scope": "all", "phase": "done", "requestedAt": -1, "phaseAt": 2 } }\n'],
  ['fractional total', '{ "v": 1, "run": { "id": "RUN_A", "scope": "all", "phase": "done", "requestedAt": 1, "phaseAt": 2, "total": 1.5 } }\n'],
  ['malformed report question', '{ "v": 1, "run": { "id": "RUN_A", "scope": "all", "phase": "done", "requestedAt": 1, "phaseAt": 2, "report": { "filed": [], "created": [], "updated": [], "setAside": [], "questions": [{}] } } }\n'],
  ['nested report array', '{ "v": 1, "run": { "id": "RUN_A", "scope": "all", "phase": "done", "requestedAt": 1, "phaseAt": 2, "report": { "filed": [], "created": [[]], "updated": [], "setAside": [], "questions": [] } } }\n'],
] as const;
const readMessage = 'Bower could not read its latest update. Try again.';

async function savedRun(text?: string) {
  localStorage.clear(); sessionStorage.clear();
  const drive = new FakeDrive();
  const rootId = (await seedFakeDrive(drive, 'default', Date.now())) ?? '';
  const all = await drive.listAll(rootId);
  const sys = all.find((f) => f.folder && f.name === SYSTEM.dir && f.parents[0] === rootId)?.id ?? '';
  const changes = all.find((f) => f.folder && f.name === 'changes' && f.parents[0] === sys)?.id ?? '';
  await drive.createText(changes, 'change-A.json', '{ "v": 1, "id": "CHANGE_A", "device": "DEVICE_A", "at": 1, "kind": "task", "what": "Completed the example task.", "path": "Resources/Example.md", "text": "Done" }\n');
  const file = text === undefined ? null : await drive.createText(sys, 'last-run.json', text);
  const vault = new DriveVault({ drive, rootId: async () => rootId, runningPiles: () => new Set(), device: 'DEVICE_A' });
  const reopen = (scenario: Scenario = 'default', fresh = false) => new FakeWorker({ drive, rootId, scenario, scale: 'instant', fresh });
  return { drive, rootId, file, vault, reopen };
}

async function result(call: () => Promise<unknown>) {
  try { return { kind: 'resolved' as const, value: await call() }; }
  catch (error) { return { kind: 'rejected' as const, error }; }
}

async function settle(worker: FakeWorker) {
  for (let i = 0; i < 200; i++) {
    const status = await result(() => worker.status());
    if (status.kind === 'rejected') return;
    const run = status.value as { phase?: string } | null;
    if (!run || !['queued', 'reading', 'writing', 'saving'].includes(run.phase ?? '')) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('Synthetic work did not settle.');
}

describe('persisted v1 run fixtures agree across current recovery consumers', () => {
  it.each(validRuns)('accepts %s without changing any stored bytes', async (_name, text) => {
    const { drive, vault, reopen } = await savedRun(text);
    const before = await drive.snapshot();
    const expected = JSON.parse(text) as LastRunFile;
    expect(await vault.lastRun()).toEqual(expected);
    const { report: _report, ...wire } = expected.run;
    expect(await reopen().status()).toEqual(wire);
    expect(await drive.snapshot()).toBe(before);
  });

  it.each(invalidRuns)('refuses %s before status or processing can alter the folder', async (_name, text) => {
    const { drive, file, vault, reopen } = await savedRun(text);
    const before = await drive.snapshot();
    let mutations = 0; drive.onChange = () => { mutations++; };
    await expect(vault.lastRun()).rejects.toMatchObject({ code: 'unknown', message: readMessage });
    const worker = reopen();
    // Initialization may settle before there is any caller; it must be handled, never unhandled.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const status = await result(() => worker.status());
    const processing = await result(() => worker.process('all'));
    await settle(worker);
    expect.soft(status).toMatchObject({ kind: 'rejected', error: { code: 'unknown', message: readMessage } });
    expect.soft(processing).toMatchObject({ kind: 'rejected', error: { code: 'unknown', message: readMessage } });
    expect.soft(status.kind === 'rejected' && status.error instanceof BowerError).toBe(true);
    expect.soft(processing.kind === 'rejected' && processing.error instanceof BowerError).toBe(true);
    expect.soft(await drive.readText(file?.id ?? '')).toBe(text);
    expect.soft(await drive.snapshot()).toBe(before);
    expect.soft(mutations).toBe(0);
    // Repair is deliberate and version-correct; recovery uses a fresh consumer.
    const seen = await drive.get(file?.id ?? '');
    await drive.writeText(seen.id, validRuns[0][1], seen.modifiedTime);
    const repaired = await drive.snapshot();
    expect(await vault.lastRun()).toEqual(JSON.parse(validRuns[0][1]));
    expect(await reopen().status()).toMatchObject({ id: 'RUN_A', phase: 'done' });
    expect(await drive.snapshot()).toBe(repaired);
  });

  it('refuses invalid input before the fresh running scenario can dispatch', async () => {
    const { drive, file, reopen } = await savedRun(invalidRuns[0][1]);
    const before = await drive.snapshot();
    let mutations = 0; drive.onChange = () => { mutations++; };
    const worker = reopen('running', true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const status = await result(() => worker.status());
    const processing = await result(() => worker.process('all'));
    await settle(worker);
    expect.soft(status).toMatchObject({ kind: 'rejected', error: { code: 'unknown', message: readMessage } });
    expect.soft(processing).toMatchObject({ kind: 'rejected', error: { code: 'unknown', message: readMessage } });
    expect.soft(await drive.readText(file?.id ?? '')).toBe(invalidRuns[0][1]);
    expect.soft(await drive.snapshot()).toBe(before);
    expect.soft(mutations).toBe(0);
  });

  it('treats a missing file as no previous run and can process waiting input', async () => {
    const { drive, reopen } = await savedRun();
    const before = await drive.snapshot();
    const worker = reopen();
    expect(await worker.status()).toBeNull();
    expect(await drive.snapshot()).toBe(before);
    expect((await worker.process('all')).phase).toBe('queued');
    await until(worker, 'done');
    expect((await worker.status())?.phase).toBe('done');
  });

  it.each(['queued', 'reading', 'writing', 'saving'] as const)('retains the existing legitimate %s reload policy', async (phase) => {
    const text = JSON.stringify({ v: 1, run: { id: 'RUN_A', scope: 'all', phase, requestedAt: 1, phaseAt: 2 } });
    const { vault, reopen } = await savedRun(text);
    expect((await vault.lastRun())?.run.phase).toBe(phase);
    const run = await reopen().status();
    expect(run).toMatchObject({ id: 'RUN_A', phase: 'failed' });
    if (phase === 'saving') {
      expect(run?.failure).toMatch(/Some things may be in their new places already/);
      expect(run?.failure).not.toMatch(/Nothing was moved/);
    } else expect(run?.failure).toMatch(/Nothing was moved/);
    expect((await vault.lastRun())?.run).toEqual(run);
  });

  it('keeps the original read failure readable after initialization has settled', async () => {
    const { drive, reopen } = await savedRun(validRuns[0][1]);
    const before = await drive.snapshot();
    drive.failNext('offline');
    const worker = reopen();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(worker.status()).rejects.toMatchObject({ code: 'offline' });
    await expect(worker.process('all')).rejects.toMatchObject({ code: 'offline' });
    expect(await drive.snapshot()).toBe(before);
  });

  it('can admit and complete waiting work after deliberate repair and a fresh instance', async () => {
    const { drive, rootId, file, vault, reopen } = await savedRun(invalidRuns[5][1]);
    const worker = reopen();
    await expect(worker.status()).rejects.toMatchObject({ code: 'unknown', message: readMessage });
    const seen = await drive.get(file?.id ?? '');
    await drive.writeText(seen.id, validRuns[0][1], seen.modifiedTime);
    const before = await drive.listAll(rootId);
    const inbox = before.find((f) => f.folder && f.name === 'Inbox' && f.parents[0] === rootId)?.id;
    const inputs = before.filter((f) => !f.folder && f.parents[0] === inbox);
    expect(inputs.length).toBeGreaterThan(0);
    const fresh = reopen();
    expect((await fresh.process('all')).phase).toBe('queued');
    await until(fresh, 'done');
    expect((await fresh.status())?.phase).toBe('done');
    expect((await vault.lastRun())?.run.report?.filed.length).toBeGreaterThan(0);
    const after = await drive.listAll(rootId);
    expect(inputs.some((input) => !after.some((f) => f.id === input.id && f.parents[0] === inbox))).toBe(true);
  });
});
