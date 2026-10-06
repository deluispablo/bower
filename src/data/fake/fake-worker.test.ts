import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { SYSTEM } from '../vault/layout';
import { FakeWorker } from './fake-worker';
import { seedFakeDrive } from './seed';
import { DriveVault } from '../vault/drive-vault';
import type { Scenario } from '../demo/scenario';
import { BowerError } from '../types';
import type { LastRunFile, QuestionsFile, RequestsFile } from '../vault/layout';
import type { JournalRecord } from '../vault/journal';
import { driveError, type DriveFile } from '../drive/drive-api';
import { LiveRuns } from '../live/runs';
import { FAILURE, planRun } from './fake-runner';
import type { RunWire } from '../worker/worker-api';
import { CLAIM_MS, FakeRunService, RETRY_MS, type DispatchAt, type FakeRunServiceOptions } from './fake-run-service';
import type { FaultAction, FencedCall } from '../drive/fake-drive';
import type { Manifest } from '../contracts/run-manifest';
import type { Checkpoint, ReportRecord } from '../contracts/run-checkpoint';
import { parsePileDisposition } from '../contracts/pile-disposition';
import type { Declaration } from '../contracts/pile-declaration';
import { ALEX } from '../demo/fixture';
import { pretendDrive, pretendRuns } from './pretend';

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

// Vitest 5 joins suite names with ' > ', so a nested 'on the legacy path' suite could not match the verify pattern;
// one suite carries the whole name, which the parent entry's shorter pattern also selects.
describe('report save failure cannot publish done or repeat effects on the legacy path', () => {
  type Stored = LastRunFile['run'];
  const LAST_RUN = 'last-run.json';

  /** True only for the terminal view: `last-run.json` saying done with its report, or failed. */
  const terminal = (text: string, phase: 'done' | 'failed'): boolean => {
    try {
      const body = JSON.parse(text) as Partial<LastRunFile>;
      return phase === 'done' ? body.run?.phase === 'done' && body.run.report !== undefined : body.run?.phase === 'failed';
    } catch {
      // expected: not JSON, so not the terminal view.
      return false;
    }
  };

  interface Fault {
    scenario?: Scenario;
    /** Which terminal view the fault hits. */
    phase?: 'done' | 'failed';
    /** `refuse`: no effect, as with no network; `lose-reply`: the write lands, then its answer is lost. */
    mode?: 'refuse' | 'lose-reply';
  }

  async function refusingWorld({ scenario = 'default', phase = 'done', mode = 'refuse' }: Fault = {}) {
    const { drive, rootId: seeded, worker } = await world(scenario);
    const rootId = seeded ?? '';
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const refused: string[] = [];
    const fault = { on: true };
    const writeText = drive.writeText.bind(drive);
    const createText = drive.createText.bind(drive);
    vi.spyOn(drive, 'writeText').mockImplementation(async (id, text, ifModified) => {
      if (fault.on && drive.pathOf(id, rootId) === SYSTEM.lastRun && terminal(text, phase)) {
        refused.push(text);
        if (mode === 'lose-reply') await writeText(id, text, ifModified);
        throw driveError('offline');
      }
      return writeText(id, text, ifModified);
    });
    vi.spyOn(drive, 'createText').mockImplementation(async (parentId, name, text, props) => {
      if (fault.on && name === LAST_RUN && terminal(text, phase)) {
        refused.push(text);
        if (mode === 'lose-reply') await createText(parentId, name, text, props);
        throw driveError('offline');
      }
      return createText(parentId, name, text, props);
    });
    const inputs = (await drive.listAll(rootId)).filter((f) => !f.folder && drive.pathOf(f.id, rootId).startsWith('Inbox/')).map((f) => f.id);
    let mutations = 0;
    drive.onChange = () => { mutations++; };
    const vault = new DriveVault({ drive, rootId: async () => rootId, runningPiles: () => new Set(), device: 'DEVICE_A' });
    return { drive, rootId, worker, errors, refused, fault, inputs, vault, writeText, mutations: () => mutations };
  }

  /** Waits for the first refusal and lets the run's own handling of it settle, without asking for status. */
  async function untilRefused(refused: readonly string[]): Promise<void> {
    for (let i = 0; i < 500 && refused.length === 0; i++) await new Promise((r) => setTimeout(r, 1));
    expect(refused.length, 'the terminal report write was refused').toBeGreaterThan(0);
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  }

  /** Everything in the folder but the run's own view: names, places, ids and texts. */
  async function domain(drive: FakeDrive, rootId: string): Promise<string> {
    const files = (await drive.listAll(rootId))
      .filter((f) => drive.pathOf(f.id, rootId) !== SYSTEM.lastRun)
      .map((f) => ({ id: f.id, name: f.name, parents: f.parents, folder: f.folder, path: drive.pathOf(f.id, rootId) }))
      .sort((a, b) => a.id.localeCompare(b.id));
    const texts = [...drive.dump(rootId)].filter(([path]) => path !== SYSTEM.lastRun).sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify({ files, texts });
  }

  const storedView = (drive: FakeDrive, rootId: string): Stored => (JSON.parse(drive.dump(rootId).get(SYSTEM.lastRun) ?? '{}') as LastRunFile).run;

  it('terminal report refusal keeps saving after actual filing', async () => {
    const w = await refusingWorld();
    expect(w.inputs.length).toBeGreaterThan(0);
    const admitted = await w.worker.process('all');
    await untilRefused(w.refused);

    // The run really filed: none of the inputs is in the Inbox and some are live in other places.
    const after = await w.drive.listAll(w.rootId);
    const live = w.inputs.filter((id) => after.some((f) => f.id === id));
    expect(live.length).toBeGreaterThan(0);
    expect(w.inputs.filter((id) => after.some((f) => f.id === id) && w.drive.pathOf(id, w.rootId).startsWith('Inbox/'))).toEqual([]);

    // No public done and no finish time while the report is not saved.
    const before = w.mutations();
    for (let i = 0; i < 3; i++) {
      const status = await w.worker.status();
      expect(status).toMatchObject({ id: admitted.id, phase: 'saving' });
      expect(status?.finishedAt).toBeUndefined();
      await new Promise((r) => setTimeout(r, 1));
    }
    // Asking again returns the same run and never files again.
    const again = await w.worker.process('all');
    expect(again).toMatchObject({ id: admitted.id, phase: 'saving' });
    expect(again.finishedAt).toBeUndefined();
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 1));
    expect(w.mutations() - before).toBe(0);

    // The stored view is this run, still saving, with no report and no finish time.
    const stored = storedView(w.drive, w.rootId);
    expect(stored).toMatchObject({ id: admitted.id, phase: 'saving' });
    expect(stored.report).toBeUndefined();
    expect(stored.finishedAt).toBeUndefined();

    // The refusal is logged as a BowerError, not swallowed.
    const logged = w.errors.mock.calls.map((c) => c[0]).filter((e): e is BowerError => e instanceof BowerError);
    expect(logged.some((e) => e.code === 'offline')).toBe(true);
  });

  it('same-session retry publishes the same report without refiling', async () => {
    const w = await refusingWorld();
    const admitted = await w.worker.process('all');
    await untilRefused(w.refused);
    const refused = JSON.parse(w.refused[0] ?? '{}') as LastRunFile;
    expect(refused.run).toMatchObject({ id: admitted.id, phase: 'done' });
    expect(refused.run.finishedAt).toBeGreaterThan(0);
    const rest = await domain(w.drive, w.rootId);
    const before = w.mutations();

    // Saving works again: the next status call saves the very report that was refused.
    w.fault.on = false;
    const status = await w.worker.status();
    expect(status).toMatchObject({ id: admitted.id, phase: 'done', finishedAt: refused.run.finishedAt });
    expect(JSON.parse(w.drive.dump(w.rootId).get(SYSTEM.lastRun) ?? '{}')).toEqual(refused);
    expect(w.refused.every((text) => JSON.stringify(JSON.parse(text)) === JSON.stringify(refused))).toBe(true);

    // Nothing was filed again: only the run's view changed, once.
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 1));
    expect(await domain(w.drive, w.rootId)).toBe(rest);
    expect(w.mutations() - before).toBe(1);
    expect(await w.worker.status()).toEqual(status);

    // Fresh readers retrieve it: the folder, the screens' run reader and another client.
    const vault = new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set(), device: 'DEVICE_B' });
    expect((await vault.lastRun())?.run).toEqual(refused.run);
    const runs = new LiveRuns(w.worker, vault);
    try {
      const current = await runs.current();
      expect(current).toMatchObject({ id: admitted.id, phase: 'done', finishedAt: refused.run.finishedAt });
      expect(current?.report).toEqual(refused.run.report);
    } finally {
      runs.dispose();
    }
    const other = new FakeWorker({ drive: w.drive, scenario: 'default', scale: 'instant', rootId: w.rootId, fresh: false });
    const { report: _report, ...wire } = refused.run;
    expect(await other.status()).toEqual(wire);
    expect(await domain(w.drive, w.rootId)).toBe(rest);
  });

  it('after reload the cut-off saving run fails honestly and nothing is refiled', async () => {
    const w = await refusingWorld();
    const admitted = await w.worker.process('all');
    await untilRefused(w.refused);
    // The page that ran it never said done.
    expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'saving' });
    const rest = await domain(w.drive, w.rootId);
    const before = w.mutations();

    // The page reloads, with saving working again: a new Worker on the same Drive.
    w.fault.on = false;
    const reloaded = new FakeWorker({ drive: w.drive, scenario: 'default', scale: 'instant', rootId: w.rootId, fresh: false });
    const status = await reloaded.status();
    expect(status).toMatchObject({ id: admitted.id, phase: 'failed' });
    expect(status?.failure).toMatch(/Some things may be in their new places already/);
    expect(status?.failure).not.toMatch(/Nothing was moved/);
    expect(status?.finishedAt).toBeGreaterThan(0);
    const stored = storedView(w.drive, w.rootId);
    expect(stored).toEqual(status);
    expect(stored.report).toBeUndefined();

    // Never done, never filed again: the Inbox is empty, so asking again is refused, and only the view changed.
    for (let i = 0; i < 3; i++) {
      expect((await reloaded.status())?.phase).toBe('failed');
      await new Promise((r) => setTimeout(r, 1));
    }
    await expect(reloaded.process('all')).rejects.toMatchObject({ code: 'conflict' });
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 1));
    expect(await domain(w.drive, w.rootId)).toBe(rest);
    expect(w.mutations() - before).toBe(1);
    expect(storedView(w.drive, w.rootId)).toEqual(stored);
  });

  const later = (): void => { vi.setSystemTime(Date.now() + 5_001); };
  const loggedBowerErrors = (errors: { mock: { calls: unknown[][] } }): BowerError[] => errors.mock.calls.map((c) => c[0]).filter((e): e is BowerError => e instanceof BowerError);

  it('a failed run shows its failure at once and saves the same failed view on retry', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const w = await refusingWorld({ scenario: 'fail-run', phase: 'failed' });
    const rest = await domain(w.drive, w.rootId);
    const admitted = await w.worker.process('all');
    await untilRefused(w.refused);
    const refused = JSON.parse(w.refused[0] ?? '{}') as LastRunFile;
    expect(refused.run).toMatchObject({ id: admitted.id, phase: 'failed', failure: FAILURE });

    // The failure shows at once, with its own words, while the folder still shows the run going.
    expect(await w.worker.status()).toEqual(refused.run);
    expect(storedView(w.drive, w.rootId)).toMatchObject({ id: admitted.id, phase: 'writing' });

    // Saving works again: a later status call saves the very same failed view, once.
    w.fault.on = false;
    later();
    const before = w.mutations();
    expect(await w.worker.status()).toEqual(refused.run);
    expect(JSON.parse(w.drive.dump(w.rootId).get(SYSTEM.lastRun) ?? '{}')).toEqual(refused);
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 1));
    expect(w.mutations() - before).toBe(1);
    expect(await domain(w.drive, w.rootId)).toBe(rest);

    // A fresh reader sees the run's own failure, not the reload wording.
    const vault = new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set(), device: 'DEVICE_B' });
    expect((await vault.lastRun())?.run).toEqual(refused.run);
    const other = await new FakeWorker({ drive: w.drive, scenario: 'default', scale: 'instant', rootId: w.rootId, fresh: false }).status();
    expect(other).toEqual(refused.run);
    expect(other?.failure).not.toMatch(/reload/);
    expect(await domain(w.drive, w.rootId)).toBe(rest);
  });

  it('a done view that landed with its answer lost is taken as saved, not written again', async () => {
    const w = await refusingWorld({ mode: 'lose-reply' });
    const admitted = await w.worker.process('all');
    await untilRefused(w.refused);
    const landed = JSON.parse(w.refused[0] ?? '{}') as LastRunFile;
    expect(storedView(w.drive, w.rootId)).toEqual(landed.run);
    const rest = await domain(w.drive, w.rootId);
    const before = w.mutations();

    const status = await w.worker.status();
    expect(status).toMatchObject({ id: admitted.id, phase: 'done', finishedAt: landed.run.finishedAt });
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 1));
    expect(w.refused).toHaveLength(1);
    expect(w.mutations() - before).toBe(0);
    expect(storedView(w.drive, w.rootId)).toEqual(landed.run);
    expect(await domain(w.drive, w.rootId)).toBe(rest);
  });

  it('retries at most once every 5 seconds while saving keeps failing', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const w = await refusingWorld();
    const admitted = await w.worker.process('all');
    await untilRefused(w.refused);
    expect(w.refused).toHaveLength(1);
    const lists = vi.spyOn(w.drive, 'listAll');

    // The first call after the failure tries once; the polls right after it do not touch the folder.
    expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'saving' });
    expect(w.refused).toHaveLength(2);
    const looked = lists.mock.calls.length;
    for (let i = 0; i < 5; i++) expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'saving' });
    expect(await w.worker.process('all')).toMatchObject({ id: admitted.id, phase: 'saving' });
    expect(w.refused).toHaveLength(2);
    expect(lists.mock.calls.length).toBe(looked);

    // Five seconds on, it tries once more; when saving works again, the next try saves it.
    later();
    expect(await w.worker.status()).toMatchObject({ phase: 'saving' });
    expect(w.refused).toHaveLength(3);
    w.fault.on = false;
    expect(await w.worker.status()).toMatchObject({ phase: 'saving' });
    later();
    expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
  });

  it('concurrent status and process calls share one retry', async () => {
    const w = await refusingWorld();
    const admitted = await w.worker.process('all');
    await untilRefused(w.refused);
    const calls = await Promise.all([w.worker.status(), w.worker.process('all'), w.worker.status(), w.worker.process('all')]);
    for (const call of calls) expect(call).toMatchObject({ id: admitted.id, phase: 'saving' });
    expect(w.refused).toHaveLength(2);
  });

  it('a malformed stored view is reported as a BowerError and never written over', async () => {
    const w = await refusingWorld();
    const admitted = await w.worker.process('all');
    await untilRefused(w.refused);
    const file = (await w.drive.listAll(w.rootId)).find((f) => w.drive.pathOf(f.id, w.rootId) === SYSTEM.lastRun);
    const malformed = '{ "v": 1, "run":\n';
    await w.writeText(file?.id ?? '', malformed, file?.modifiedTime ?? '');
    w.fault.on = false;
    w.errors.mockClear();
    const before = w.mutations();

    expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'saving' });
    expect(loggedBowerErrors(w.errors)).toContainEqual(expect.objectContaining({ code: 'unknown', message: readMessage }));
    expect(w.drive.dump(w.rootId).get(SYSTEM.lastRun)).toBe(malformed);
    expect(w.mutations() - before).toBe(0);
  });
});

describe('report save failure cannot publish done or repeat effects on the B path', () => {
  type Rule = (call: FencedCall) => FaultAction | undefined;
  type Hooks = FakeRunServiceOptions['hooks'];
  const pdf = (name: string): { name: string; kind: 'pdf'; origin: string; body: Blob } => ({ name, kind: 'pdf', origin: 'From this computer', body: new Blob([`%PDF ${name}`]) });
  const link = { name: 'saved-page.example/a', kind: 'link' as const, origin: 'Pasted', url: 'https://saved-page.example/a' };
  const me = (rootId: string): { account: string; rootId: string } => ({ account: ALEX.email, rootId });

  /**
   * The template folder with two ready piles of plain files (one with a line, one without): only B effects.
   * Every fenced write is seen by `calls`; the ones that changed the Drive by `applied`.
   */
  async function bWorld(o: { declared?: boolean; scenario?: Scenario; hooks?: Hooks } = {}) {
    localStorage.clear();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let now = Date.now();
    const clock = { now: (): number => now, later: (ms = RETRY_MS + 1): void => { now += ms; } };
    const drive = new FakeDrive();
    const runs = new FakeRunService({ drive, clock: clock.now, scale: 'instant', ...(o.hooks ? { hooks: o.hooks } : {}) });
    const worker = new FakeWorker({ drive, scenario: o.scenario ?? 'first', scale: 'instant', rootId: null, runs });
    const rootId = (await worker.createFolder()).id;
    const uploader = new DriveVault({ drive, rootId: async () => rootId, runningPiles: () => new Set(), declarePiles: !!o.declared, device: 'DEVICE_A' });
    await uploader.addPile({ text: 'Papers about the lease', items: [pdf('lease.pdf'), pdf('inventory.pdf')] });
    await uploader.addPile({ text: '', items: [pdf('idea one.pdf'), pdf('idea two.pdf')] });
    await uploader.settled();
    const sources = await inboxPdfs(drive, rootId);
    const rules: Rule[] = [];
    const calls: FencedCall[] = [];
    const applied: FencedCall[] = [];
    drive.fault = {
      before: (call) => {
        calls.push(call);
        for (const rule of rules) {
          const action = rule(call);
          if (action) return action;
        }
        return 'pass';
      },
      applied: (call) => { applied.push(call); },
    };
    let mutations = 0;
    drive.onChange = () => { mutations++; };
    return { drive, rootId, runs, worker, uploader, sources, rules, calls, applied, errors, clock, mutations: () => mutations };
  }
  type World = Awaited<ReturnType<typeof bWorld>>;

  async function inboxPdfs(drive: FakeDrive, rootId: string): Promise<string[]> {
    return (await drive.listAll(rootId)).filter((f) => !f.folder && f.name.endsWith('.pdf') && drive.pathOf(f.id, rootId).startsWith('Inbox/')).map((f) => f.id);
  }

  const once = (match: (call: FencedCall) => boolean, action: FaultAction, seen?: FencedCall[]): Rule => {
    let used = false;
    return (call) => {
      if (used || !match(call)) return undefined;
      used = true;
      seen?.push(call);
      return action;
    };
  };
  const textOf = (call: FencedCall): string | null => (call.op === 'create-text' || call.op === 'write-text' ? call.text : null);
  const isView = (w: { drive: FakeDrive; rootId: string }, call: FencedCall, phase?: 'done' | 'failed'): boolean => {
    const text = call.op === 'create-text' && call.name === 'last-run.json' ? call.text : call.op === 'write-text' && w.drive.pathOf(call.id, w.rootId) === SYSTEM.lastRun ? call.text : null;
    if (text === null) return false;
    if (!phase) return true;
    try {
      return (JSON.parse(text) as LastRunFile).run.phase === phase;
    } catch {
      // expected: not JSON, so not a view of that phase.
      return false;
    }
  };
  const named = (prefix: string) => (call: FencedCall): boolean => call.op === 'create-text' && call.name.startsWith(prefix);
  const isMoveOf = (id: string) => (call: FencedCall): boolean => call.op === 'update' && call.id === id && call.patch.addParent !== undefined;
  const movesOf = (w: Pick<World, 'applied'>, id: string): number => w.applied.filter(isMoveOf(id)).length;
  const bowerErrors = (w: Pick<World, 'errors'>): BowerError[] => w.errors.mock.calls.map((c) => c[0]).filter((e): e is BowerError => e instanceof BowerError);

  /** Every source moved exactly once through the boundary, and the stored evidence shows it out of the Inbox, live. */
  async function expectFiledOnce(w: Pick<World, 'applied' | 'drive' | 'rootId' | 'sources'>): Promise<void> {
    expect(w.sources.length).toBe(4);
    for (const id of w.sources) {
      expect(movesOf(w, id), `moves of ${id}`).toBe(1);
      const ev = await w.drive.evidence(id);
      expect(ev?.trashed, `${id} in the Bin`).toBe(false);
      expect(w.drive.pathOf(id, w.rootId).startsWith('Inbox/'), `${id} still in the Inbox`).toBe(false);
    }
  }

  type Rec = { name: string; path: string; text: string };
  async function recordsOf(w: { drive: FakeDrive; rootId: string }): Promise<Rec[]> {
    const files = (await w.drive.listAll(w.rootId)).filter((f) => !f.folder && w.drive.pathOf(f.id, w.rootId).startsWith('.bower/runs/'));
    const out = await Promise.all(files.map(async (f) => ({ name: f.name, path: w.drive.pathOf(f.id, w.rootId), text: await w.drive.readText(f.id) })));
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }
  const manifestsOf = async (w: { drive: FakeDrive; rootId: string }): Promise<Array<Manifest & { name: string }>> =>
    (await recordsOf(w)).filter((r) => r.name.startsWith('manifest-')).map((r) => ({ ...(JSON.parse(r.text) as Manifest), name: r.name }));
  const checkpointsOf = async (w: { drive: FakeDrive; rootId: string }, runId?: string): Promise<Checkpoint[]> =>
    (await recordsOf(w)).filter((r) => r.name.startsWith('checkpoint-')).map((r) => JSON.parse(r.text) as Checkpoint)
      .filter((c) => !runId || c.runId === runId).sort((a, b) => a.revision - b.revision);
  const reportsOf = async (w: { drive: FakeDrive; rootId: string }): Promise<Array<{ hash: string; body: ReportRecord }>> =>
    (await recordsOf(w)).filter((r) => r.name.startsWith('report-')).map((r) => ({ hash: r.name.slice('report-'.length, -'.json'.length), body: JSON.parse(r.text) as ReportRecord }));
  const viewOf = (w: { drive: FakeDrive; rootId: string }): LastRunFile | null => {
    const text = w.drive.dump(w.rootId).get(SYSTEM.lastRun);
    return text === undefined ? null : (JSON.parse(text) as LastRunFile);
  };

  /** Everything in the folder but the run's own records and view: names, places, ids, marks and texts. */
  async function domain(drive: FakeDrive, rootId: string): Promise<string> {
    const own = (path: string): boolean => path === SYSTEM.lastRun || path.startsWith('.bower/runs') || /^\.bower\/piles\/disposition-/.test(path);
    const files = (await drive.listAll(rootId))
      .filter((f) => !own(drive.pathOf(f.id, rootId)))
      .map((f) => ({ id: f.id, name: f.name, parents: f.parents, folder: f.folder, props: f.appProperties ?? null, path: drive.pathOf(f.id, rootId) }))
      .sort((a, b) => a.id.localeCompare(b.id));
    const texts = [...drive.dump(rootId)].filter(([path]) => !own(path)).sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify({ files, texts });
  }

  /** The run once the recovery that asking started has settled. */
  async function after(worker: FakeWorker, runs: FakeRunService): Promise<RunWire | null> {
    await worker.status();
    await runs.settled();
    return worker.status();
  }

  /** A run whose terminal view is refused: it filed everything and stays saving. */
  async function refusedView(o: { declared?: boolean } = {}) {
    const w = await bWorld(o);
    w.rules.push((call) => (isView(w, call, 'done') ? 'refuse' : undefined));
    const admitted = await w.worker.process('all');
    await w.runs.settled();
    return { ...w, admitted };
  }

  /** Pauses the first attempt right before it dispatches its first filing move. */
  function pauseFirstMove() {
    let release = (): void => undefined;
    let reached = (_at: DispatchAt): void => undefined;
    const paused = new Promise<DispatchAt>((r) => { reached = r; });
    const gate = new Promise<void>((r) => { release = r; });
    let first: string | null = null;
    let held = false;
    const hooks: Hooks = {
      beforeDispatch: async (at) => {
        if (at.effect.kind !== 'move' || held) return;
        first ??= at.attemptId;
        if (at.attemptId !== first) return;
        held = true;
        reached(at);
        await gate;
      },
    };
    return { hooks, paused, release: () => release() };
  }

  /** The paused dispatch, or null when every attempt settled without reaching it. */
  async function reached(paused: Promise<DispatchAt>, runs: FakeRunService): Promise<DispatchAt | null> {
    const none = runs.settled().then(async () => {
      for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 1));
      return null;
    });
    return Promise.race([paused, none]);
  }

  it('sends a plan with an effect outside B down the legacy path, whole', async () => {
    const w = await bWorld();
    await w.uploader.addPile({ text: '', items: [link] });
    await w.uploader.settled();
    const admitted = await w.worker.process('all');
    await until(w.worker, 'done');
    expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
    expect(await recordsOf(w)).toEqual([]);
    expect(w.calls).toEqual([]);
    expect(viewOf(w)?.run.report?.filed.map((f) => f.name)).toContain(link.name);
  });

  it('fixes its classification before any effect', async () => {
    const w = await bWorld();
    const admitted = await w.worker.process('all');
    // Admission confirmed the manifest and the first checkpoint, and nothing in your folders changed yet.
    const manifests = await manifestsOf(w);
    expect(manifests).toHaveLength(1);
    expect(manifests[0]).toMatchObject({ runId: admitted.id, runScope: 'all' });
    expect((await checkpointsOf(w, admitted.id)).map((c) => [c.revision, c.phase])).toContainEqual([0, 'queued']);
    expect(w.applied.filter((c) => c.op === 'update' || c.op === 'trash' || c.op === 'write-text')).toEqual([]);

    // Input only the legacy path could take arrives while the run goes: a typed rule and a saved link.
    await w.uploader.addRule('Keep lease papers together');
    await w.uploader.addPile({ text: '', items: [link] });
    const lines = async (): Promise<string[]> => (await w.drive.listAll(w.rootId)).filter((f) => !f.folder && w.drive.pathOf(f.id, w.rootId).startsWith(`${SYSTEM.changes}/`) && !w.drive.pathOf(f.id, w.rootId).startsWith(`${SYSTEM.archive}/`)).map((f) => f.id);
    const typed = await lines();
    expect(typed).toHaveLength(1);
    await w.uploader.settled();
    await w.runs.settled();
    expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });

    // Same plan, same classification: the late input is untouched and the report names only the four files.
    expect(await manifestsOf(w)).toEqual(manifests);
    expect(viewOf(w)?.run.report?.filed.map((f) => f.name).sort()).toEqual(['idea one.pdf', 'idea two.pdf', 'inventory.pdf', 'lease.pdf']);
    const after = new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set(), device: 'DEVICE_B' });
    expect(await lines()).toEqual(typed);
    expect((await after.piles()).flatMap((p) => p.items.map((i) => i.kind))).toEqual(['link']);
    await expectFiledOnce(w);
  });

  it('keeps saving when its terminal view is refused', async () => {
    const w = await refusedView();
    const { admitted } = w;
    for (let i = 0; i < 3; i++) {
      const status = await w.worker.status();
      expect(status).toMatchObject({ id: admitted.id, phase: 'saving' });
      expect(status?.finishedAt).toBeUndefined();
    }
    const again = await w.worker.process('all');
    expect(again).toMatchObject({ id: admitted.id, phase: 'saving' });
    expect(again.finishedAt).toBeUndefined();
    expect(viewOf(w)).toBeNull();

    // Durably done: the head is the done checkpoint and its report record is saved.
    const head = (await checkpointsOf(w, admitted.id)).at(-1);
    expect(head).toMatchObject({ phase: 'done', report: { state: 'published' } });
    const reports = await reportsOf(w);
    expect(reports).toHaveLength(1);
    expect(head?.report.state === 'published' ? head.report.reportHash : null).toBe(reports[0]?.hash);
    expect(bowerErrors(w).length).toBeGreaterThan(0);
    await expectFiledOnce(w);
  });

  it('lets a second client republish the same run without domain effects', async () => {
    const w = await refusedView();
    const { admitted } = w;
    const rest = await domain(w.drive, w.rootId);
    const records = await recordsOf(w);
    const seen = w.applied.length;
    w.rules.length = 0;
    w.clock.later();

    const second = new FakeWorker({ drive: w.drive, scenario: 'first', scale: 'instant', rootId: w.rootId, runs: w.runs, fresh: false });
    // Asking does not wait for the recovery: it starts it and answers with the run as it stands.
    expect(await second.status()).toMatchObject({ id: admitted.id, phase: 'saving' });
    await w.runs.settled();
    const status = await second.status();
    const done = (await checkpointsOf(w, admitted.id)).find((c) => c.phase === 'done');
    expect(status).toMatchObject({ id: admitted.id, phase: 'done', finishedAt: done?.phaseAt });

    // Only the view was written; no record, place or byte of your folders changed.
    const fresh = w.applied.slice(seen);
    expect(fresh.map((c) => c.op)).toEqual(['create-text']);
    expect(fresh.every((c) => isView(w, c, 'done'))).toBe(true);
    expect(await domain(w.drive, w.rootId)).toBe(rest);
    expect(await recordsOf(w)).toEqual(records);

    // The screens read the very report that was saved, and the first client sees the same run.
    const [report] = await reportsOf(w);
    const runs = new LiveRuns(second, new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set(), device: 'DEVICE_B' }));
    try {
      const current = await runs.current();
      expect(current).toMatchObject({ id: admitted.id, phase: 'done' });
      expect(current?.report).toEqual(report?.body.report);
    } finally {
      runs.dispose();
    }
    expect(await w.worker.status()).toEqual(status);
    await expectFiledOnce(w);
  });

  it('reloads the service and the drive and publishes without the originating closures', async () => {
    const w = await refusedView();
    const { admitted } = w;
    const rest = await domain(w.drive, w.rootId);
    const records = await recordsOf(w);
    const snapshot = await w.drive.snapshot();
    const json = w.runs.toJSON();
    // The page that ran it is gone: its Drive takes nothing more.
    w.rules.length = 0;
    w.rules.push(() => 'refuse');

    const drive = FakeDrive.restore(snapshot);
    const applied: FencedCall[] = [];
    drive.fault = { applied: (call) => { applied.push(call); } };
    const runs = FakeRunService.restore(json, { drive, clock: w.clock.now, scale: 'instant' });
    const worker = new FakeWorker({ drive, scenario: 'first', scale: 'instant', rootId: w.rootId, runs, fresh: false });
    const status = await after(worker, runs);
    expect(status).toMatchObject({ id: admitted.id, phase: 'done' });
    expect(applied.map((c) => c.op)).toEqual(['create-text']);
    const reloaded = { drive, rootId: w.rootId };
    expect(await domain(drive, w.rootId)).toBe(rest);
    expect(await recordsOf(reloaded)).toEqual(records);
    expect(viewOf(reloaded)?.run).toMatchObject({ id: admitted.id, phase: 'done', report: (await reportsOf(reloaded))[0]?.body.report });
    for (const id of w.sources) {
      expect(movesOf(w, id)).toBe(1);
      expect(applied.filter(isMoveOf(id))).toEqual([]);
      expect(drive.pathOf(id, w.rootId).startsWith('Inbox/')).toBe(false);
      expect((await drive.evidence(id))?.trashed).toBe(false);
    }
  });

  it('rebuilds the identical report after its first pending checkpoint is refused', async () => {
    const w = await bWorld();
    const refused: FencedCall[] = [];
    const pending = (call: FencedCall): boolean => {
      const text = textOf(call);
      return named('checkpoint-')(call) && text !== null && (JSON.parse(text) as Checkpoint).report.state === 'pending';
    };
    w.rules.push(once(pending, 'refuse', refused));
    const admitted = await w.worker.process('all');
    await w.runs.settled();
    expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'saving' });
    expect(await reportsOf(w)).toEqual([]);
    expect((await checkpointsOf(w, admitted.id)).every((c) => c.report.state === 'not-ready')).toBe(true);
    expect(bowerErrors(w).length).toBeGreaterThan(0);

    w.clock.later();
    expect(await after(w.worker, w.runs)).toMatchObject({ id: admitted.id, phase: 'done' });
    const first = JSON.parse(textOf(refused[0] ?? { op: 'trash', id: '' }) ?? '{}') as Checkpoint;
    expect(first.report.state).toBe('pending');
    const [report, ...more] = await reportsOf(w);
    expect(more).toEqual([]);
    expect(first.report.state === 'pending' ? [first.report.reportHash, first.report.body] : null).toEqual([report?.hash, report?.body]);
    const kept = (await checkpointsOf(w, admitted.id)).filter((c) => c.report.state === 'pending');
    expect(kept).toHaveLength(1);
    expect(kept[0]?.epoch).toBeGreaterThan(first.epoch);
    expect(viewOf(w)?.run.report).toEqual(report?.body.report);
    expect(await manifestsOf(w)).toHaveLength(1);
    await expectFiledOnce(w);
  });

  it('reconciles a lost move reply without moving it again', async () => {
    const w = await bWorld();
    const lost = w.sources[0] ?? '';
    w.rules.push(once(isMoveOf(lost), 'lose-reply'));
    const admitted = await w.worker.process('all');
    await w.runs.settled();
    expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'saving' });
    const [manifest] = await manifestsOf(w);
    const op = manifest?.operations.find((o) => o.effect.kind === 'move' && o.effect.before.fileId === lost && !('fileId' in o.effect.parent && o.effect.parent.fileId === o.effect.before.parents[0]));
    const head = (await checkpointsOf(w, admitted.id)).at(-1);
    const unresolved = head?.outcomes.find((o) => o.operationId === op?.operationId);
    expect(unresolved?.state).toBe('possible-effect');

    w.clock.later();
    expect(await after(w.worker, w.runs)).toMatchObject({ id: admitted.id, phase: 'done' });
    const chain = await checkpointsOf(w, admitted.id);
    const settled = chain.at(-1)?.outcomes.find((o) => o.operationId === op?.operationId);
    expect(settled?.state).toBe('applied');
    expect(chain.at(-1)?.epoch).toBeGreaterThan(1);
    // The move reached the Drive once and was never sent again.
    expect(w.calls.filter(isMoveOf(lost))).toHaveLength(1);
    await expectFiledOnce(w);
  });

  it('reconciles lost report and view replies by their exact bodies', async () => {
    const w = await bWorld();
    w.rules.push(once(named('report-'), 'lose-reply'), once((call) => isView(w, call, 'done'), 'lose-reply'));
    const admitted = await w.worker.process('all');
    await w.runs.settled();
    const status = await w.worker.status();
    const done = (await checkpointsOf(w, admitted.id)).find((c) => c.phase === 'done');
    expect(status).toMatchObject({ id: admitted.id, phase: 'done', finishedAt: done?.phaseAt });
    const reports = await reportsOf(w);
    expect(reports).toHaveLength(1);
    expect(w.calls.filter(named('report-'))).toHaveLength(1);
    expect(w.calls.filter((call) => isView(w, call))).toHaveLength(1);
    expect(viewOf(w)?.run).toMatchObject({ id: admitted.id, phase: 'done', finishedAt: done?.phaseAt, report: reports[0]?.body.report });
    await expectFiledOnce(w);
  });

  it('refuses a stale attempt at the mutation boundary', async () => {
    const pause = pauseFirstMove();
    const w = await bWorld({ hooks: pause.hooks });
    const admitted = await w.worker.process('all');
    const at = await reached(pause.paused, w.runs);
    expect(at, 'the first move was paused before its dispatch').not.toBeNull();
    if (!at) return;
    const held = at.effect.kind === 'move' ? at.effect.before.fileId : '';
    expect(w.sources).toContain(held);

    // The paused attempt's claim lapses; another client asks, and the service recovers under a newer epoch.
    w.clock.later(CLAIM_MS + 1);
    const second = new FakeWorker({ drive: w.drive, scenario: 'first', scale: 'instant', rootId: w.rootId, runs: w.runs, fresh: false });
    await until(second, 'done');
    expect(await second.status()).toMatchObject({ id: admitted.id, phase: 'done' });
    expect((await checkpointsOf(w, admitted.id)).at(-1)?.epoch).toBeGreaterThan(at.epoch);
    const records = await recordsOf(w);
    const mutations = w.mutations();

    // The stale attempt wakes and tries its move: the boundary refuses it, and nothing changes.
    pause.release();
    await w.runs.settled();
    expect(w.calls.filter(isMoveOf(held))).toHaveLength(2);
    expect(await recordsOf(w)).toEqual(records);
    expect(w.mutations()).toBe(mutations);
    expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
    await expectFiledOnce(w);
  });

  it('refuses other scopes and a revoked session at the mutation boundary', async () => {
    const pause = pauseFirstMove();
    const w = await bWorld({ hooks: pause.hooks });
    const admitted = await w.worker.process('all');
    expect(await reached(pause.paused, w.runs), 'the first move was paused before its dispatch').not.toBeNull();
    const records = await recordsOf(w);
    const mutations = w.mutations();

    // Another account or another folder has no run here and cannot recover this one.
    await expect(w.runs.recover({ account: 'someone@example.com', rootId: w.rootId }, admitted.id)).rejects.toMatchObject({ code: 'auth' });
    await expect(w.runs.recover({ account: ALEX.email, rootId: 'FOLDER_ID' }, admitted.id)).rejects.toMatchObject({ code: 'auth' });
    expect(await w.runs.status({ account: 'someone@example.com', rootId: w.rootId })).toBeNull();

    // The session ends while the attempt waits to move a file: the boundary refuses the move.
    w.runs.revoke(me(w.rootId));
    pause.release();
    await w.runs.settled();
    expect(await recordsOf(w)).toEqual(records);
    expect(w.mutations()).toBe(mutations);
    expect(w.applied.filter((c) => c.op === 'update' || c.op === 'trash')).toEqual([]);
    await expect(w.worker.status()).rejects.toMatchObject({ code: 'auth' });
    expect(w.calls.filter((c) => c.op === 'update')).toHaveLength(1);
    for (const id of w.sources) {
      expect(movesOf(w, id)).toBe(0);
      expect(w.drive.pathOf(id, w.rootId).startsWith('Inbox/')).toBe(true);
    }
  });

  it("never overwrites a later run's view", async () => {
    const w = await refusedView();
    const { admitted } = w;
    w.rules.length = 0;
    const sys = (await w.drive.listAll(w.rootId)).find((f) => f.folder && f.name === SYSTEM.dir && f.parents[0] === w.rootId);
    const at = admitted.requestedAt + 1;
    const later: LastRunFile = { v: 1, run: { id: 'run-later', scope: 'all', phase: 'done', requestedAt: at, phaseAt: at, finishedAt: at, report: { filed: [], created: [], updated: [], setAside: [], questions: [] } } };
    await w.drive.createText(sys?.id ?? '', 'last-run.json', `${JSON.stringify(later, null, 2)}\n`);
    const text = w.drive.dump(w.rootId).get(SYSTEM.lastRun);
    const before = w.mutations();
    w.errors.mockClear();

    w.clock.later();
    expect(await after(w.worker, w.runs)).toMatchObject({ id: admitted.id, phase: 'saving' });
    expect(w.drive.dump(w.rootId).get(SYSTEM.lastRun)).toBe(text);
    expect(w.mutations()).toBe(before);
    expect(bowerErrors(w).some((e) => e.code === 'conflict')).toBe(true);

    // It stays saving, but stops trying after a few attempts instead of retrying every five seconds.
    for (let i = 0; i < 8; i++) {
      w.clock.later();
      expect(await after(w.worker, w.runs)).toMatchObject({ id: admitted.id, phase: 'saving' });
    }
    w.errors.mockClear();
    for (let i = 0; i < 4; i++) {
      w.clock.later();
      expect(await after(w.worker, w.runs)).toMatchObject({ id: admitted.id, phase: 'saving' });
    }
    expect(w.errors.mock.calls).toEqual([]);
    expect(w.drive.dump(w.rootId).get(SYSTEM.lastRun)).toBe(text);
    await expectFiledOnce(w);
  });

  it("publishes a declared pile's consumed disposition before done", async () => {
    const w = await bWorld({ declared: true });
    w.rules.push(once(named('disposition-'), 'refuse'));
    const admitted = await w.worker.process('all');
    await w.runs.settled();
    expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'saving' });
    expect((await checkpointsOf(w, admitted.id)).some((c) => c.phase === 'done')).toBe(false);

    w.clock.later();
    expect(await after(w.worker, w.runs)).toMatchObject({ id: admitted.id, phase: 'done' });
    const listing = await w.drive.listAll(w.rootId);
    const inPiles = listing.filter((f) => !f.folder && w.drive.pathOf(f.id, w.rootId).startsWith(`${SYSTEM.piles}/`));
    const declarations = await Promise.all(inPiles.filter((f) => f.name.startsWith('declaration-')).map(async (f) => JSON.parse(await w.drive.readText(f.id)) as Declaration));
    const dispositions = inPiles.filter((f) => f.name.startsWith('disposition-'));
    expect(declarations).toHaveLength(2);
    expect(dispositions).toHaveLength(2);
    const [report] = await reportsOf(w);
    const piles = new Set<string>();
    for (const f of dispositions) {
      const bytes = await w.drive.readBytes(f.id);
      const pileId = (JSON.parse(new TextDecoder().decode(bytes)) as { pileId: string }).pileId;
      const declaration = declarations.find((d) => d.pileId === pileId);
      const parsed = await parsePileDisposition(bytes, w.rootId, declaration?.members.map((m) => m.memberKey) ?? []);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      expect(f.name).toBe(`disposition-${parsed.sha256}.json`);
      expect(parsed.value).toMatchObject({ action: 'consumed', authority: { kind: 'run', runId: admitted.id, reportHash: report?.hash } });
      piles.add(pileId);
    }
    expect([...piles].sort()).toEqual(declarations.map((d) => d.pileId).sort());

    // Every disposition landed before the done checkpoint, and the done checkpoint before the view.
    const order = w.applied.map((c) => (c.op === 'create-text' ? c.name : c.op === 'write-text' && isView(w, c) ? 'last-run.json' : ''));
    const done = order.findIndex((n) => n.startsWith('checkpoint-') && (JSON.parse(textOf(w.applied[order.indexOf(n)] ?? { op: 'trash', id: '' }) ?? '{}') as Checkpoint).phase === 'done');
    const lastDisposition = order.reduce((at, n, i) => (n.startsWith('disposition-') ? i : at), -1);
    expect(lastDisposition).toBeGreaterThan(-1);
    expect(done).toBeGreaterThan(lastDisposition);
    expect(order.indexOf('last-run.json')).toBeGreaterThan(done);
    await expectFiledOnce(w);
  });

  it('clears the last run\'s new marks as B moves and leaves the report unchanged', async () => {
    const w = await bWorld();
    const first = await w.worker.process('all');
    await w.runs.settled();
    expect(await w.worker.status()).toMatchObject({ id: first.id, phase: 'done' });
    const marked = (await w.drive.listAll(w.rootId)).filter((f) => f.appProperties?.bowerNew === '1');
    expect(marked.map((f) => f.id).sort()).toEqual([...w.sources].sort());

    await w.uploader.addPile({ text: '', items: [pdf('extra one.pdf'), pdf('extra two.pdf')] });
    await w.uploader.settled();
    const extra = await inboxPdfs(w.drive, w.rootId);
    expect(extra).toHaveLength(2);
    const second = await w.worker.process('all');
    await w.runs.settled();
    expect(second.id).not.toBe(first.id);
    expect(await w.worker.status()).toMatchObject({ id: second.id, phase: 'done' });

    const manifest = (await manifestsOf(w)).find((m) => m.runId === second.id);
    const clears = manifest?.operations.flatMap((o) => (o.effect.kind === 'move' && JSON.stringify(o.effect.properties) === '{"bowerNew":null}' ? [o.effect] : [])) ?? [];
    expect(clears.map((e) => e.before.fileId).sort()).toEqual(marked.map((f) => f.id).sort());
    for (const effect of clears) expect({ parent: effect.parent, name: effect.name }).toEqual({ parent: { fileId: effect.before.parents[0] }, name: effect.before.name });
    for (const f of marked) {
      const ev = await w.drive.evidence(f.id);
      expect(ev?.file).toMatchObject({ name: f.name, parents: f.parents });
      expect(ev?.file.appProperties?.bowerNew).toBeUndefined();
      expect(w.applied.filter((c) => c.op === 'update' && c.id === f.id && c.patch.addParent === undefined)).toHaveLength(1);
    }
    const report = viewOf(w)?.run.report;
    expect(report?.filed.map((f) => f.name).sort()).toEqual(['extra one.pdf', 'extra two.pdf']);
    expect(report).toMatchObject({ created: [], updated: [], setAside: [], questions: [] });
    for (const id of extra) expect(movesOf(w, id)).toBe(1);
    await expectFiledOnce(w);
  });

  it('holds back a failed ending until its view is saved', async () => {
    const w = await bWorld({ scenario: 'fail-run' });
    const rest = await domain(w.drive, w.rootId);
    w.rules.push((call) => (isView(w, call, 'failed') ? 'refuse' : undefined));
    const admitted = await w.worker.process('all');
    await w.runs.settled();
    const held = await w.worker.status();
    expect(held).toMatchObject({ id: admitted.id, phase: 'writing' });
    expect(held?.failure).toBeUndefined();
    expect(held?.finishedAt).toBeUndefined();
    expect(await w.worker.process('all')).toMatchObject({ id: admitted.id, phase: 'writing' });
    const head = (await checkpointsOf(w, admitted.id)).at(-1);
    expect(head?.phase).toBe('failed');
    expect(head?.outcomes.every((o) => o.state === 'not-dispatched')).toBe(true);
    expect(viewOf(w)).toBeNull();

    w.rules.length = 0;
    w.clock.later();
    const failed = await after(w.worker, w.runs);
    expect(failed).toMatchObject({ id: admitted.id, phase: 'failed', failure: 'The tidy-up stopped before changing anything. Try again.', finishedAt: head?.phaseAt });
    expect(viewOf(w)?.run).toEqual(failed);
    expect(await domain(w.drive, w.rootId)).toBe(rest);
    for (const id of w.sources) {
      expect(movesOf(w, id)).toBe(0);
      expect(w.drive.pathOf(id, w.rootId).startsWith('Inbox/')).toBe(true);
    }
  });

  it("replaces a late view of a run admitted before it, such as a legacy retry", async () => {
    const w = await refusedView();
    const { admitted } = w;
    w.rules.length = 0;
    const sys = (await w.drive.listAll(w.rootId)).find((f) => f.folder && f.name === SYSTEM.dir && f.parents[0] === w.rootId);
    const at = admitted.requestedAt - 60_000;
    const earlier: LastRunFile = { v: 1, run: { id: 'run-earlier', scope: 'all', phase: 'done', requestedAt: at, phaseAt: at, finishedAt: at, report: { filed: [], created: [], updated: [], setAside: [], questions: [] } } };
    await w.drive.createText(sys?.id ?? '', 'last-run.json', `${JSON.stringify(earlier, null, 2)}\n`);
    const rest = await domain(w.drive, w.rootId);

    w.clock.later();
    const done = (await checkpointsOf(w, admitted.id)).find((c) => c.phase === 'done');
    expect(await after(w.worker, w.runs)).toMatchObject({ id: admitted.id, phase: 'done', finishedAt: done?.phaseAt });
    expect(viewOf(w)?.run).toMatchObject({ id: admitted.id, phase: 'done', report: (await reportsOf(w))[0]?.body.report });
    expect(await domain(w.drive, w.rootId)).toBe(rest);
    await expectFiledOnce(w);
  });

  it('keeps a dispatch that passed the boundary and shows no effect unresolved, never sending it again', async () => {
    const w = await bWorld();
    const lost = w.sources[0] ?? '';
    w.rules.push(once(isMoveOf(lost), 'lose-reply'));
    const admitted = await w.worker.process('all');
    await w.runs.settled();
    // The move landed, then the file went back where it was: the effect no longer shows.
    const inbox = (await w.drive.listAll(w.rootId)).filter((f) => f.folder && w.drive.pathOf(f.id, w.rootId).startsWith('Inbox/'));
    const [manifest] = await manifestsOf(w);
    const before = manifest?.capture.members.find((m) => m.file.fileId === lost)?.file;
    const now = await w.drive.get(lost);
    expect(inbox.some((f) => f.id === before?.parents[0])).toBe(true);
    await w.drive.update(lost, { name: before?.name ?? '', addParent: before?.parents[0] ?? '', removeParent: now.parents[0] ?? '' });
    w.errors.mockClear();
    const records = await recordsOf(w);

    for (let i = 0; i < 3; i++) {
      w.clock.later();
      expect(await after(w.worker, w.runs)).toMatchObject({ id: admitted.id, phase: 'saving' });
    }
    expect(w.calls.filter(isMoveOf(lost))).toHaveLength(1);
    expect(await recordsOf(w)).toEqual(records);
    expect(bowerErrors(w).length).toBeGreaterThan(0);
  });

  it('never reuses an epoch after the service is restored', async () => {
    const w = await bWorld();
    const pending = (call: FencedCall): boolean => {
      const text = textOf(call);
      return named('checkpoint-')(call) && text !== null && (JSON.parse(text) as Checkpoint).report.state === 'pending';
    };
    let refusals = 2;
    w.rules.push((call) => (refusals > 0 && pending(call) ? (refusals--, 'refuse') : undefined));
    const admitted = await w.worker.process('all');
    await w.runs.settled();
    // A recovery under epoch 2 is refused too, and leaves no checkpoint behind.
    w.clock.later();
    expect(await after(w.worker, w.runs)).toMatchObject({ id: admitted.id, phase: 'saving' });
    expect(refusals).toBe(0);
    expect(Math.max(...(await checkpointsOf(w, admitted.id)).map((c) => c.epoch))).toBe(1);

    const drive = FakeDrive.restore(await w.drive.snapshot());
    const runs = FakeRunService.restore(w.runs.toJSON(), { drive, clock: w.clock.now, scale: 'instant' });
    const worker = new FakeWorker({ drive, scenario: 'first', scale: 'instant', rootId: w.rootId, runs, fresh: false });
    expect(await after(worker, runs)).toMatchObject({ id: admitted.id, phase: 'done' });
    const kept = (await checkpointsOf({ drive, rootId: w.rootId }, admitted.id)).filter((c) => c.report.state === 'pending');
    expect(kept.map((c) => c.epoch)).toEqual([3]);
  });

  it('recovers after a reload inside the pretend persistence window', async () => {
    sessionStorage.clear();
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const first = await pretendDrive('first');
    const runs = pretendRuns('first', first.drive, first.fresh, 'instant');
    const worker = new FakeWorker({ drive: first.drive, scenario: 'first', scale: 'instant', rootId: null, runs });
    const rootId = (await worker.createFolder()).id;
    const uploader = new DriveVault({ drive: first.drive, rootId: async () => rootId, runningPiles: () => new Set(), device: 'DEVICE_A' });
    await uploader.addPile({ text: 'Papers about the lease', items: [pdf('lease.pdf'), pdf('inventory.pdf')] });
    await uploader.addPile({ text: '', items: [pdf('idea one.pdf'), pdf('idea two.pdf')] });
    await uploader.settled();
    const sources = await inboxPdfs(first.drive, rootId);
    const view = { drive: first.drive, rootId };
    first.drive.fault = { before: (call) => (isView(view, call, 'done') ? 'refuse' : 'pass') };
    const admitted = await worker.process('all');
    await runs.settled();

    // The page reloads right now, before any delayed save: what the tab kept is all there is.
    const again = await pretendDrive('first');
    expect(again.fresh).toBe(false);
    expect(again.rootId).toBe(rootId);
    const reloadedRuns = pretendRuns('first', again.drive, again.fresh, 'instant');
    const reloaded = new FakeWorker({ drive: again.drive, scenario: 'first', scale: 'instant', rootId: again.rootId, runs: reloadedRuns, fresh: false });
    expect(await after(reloaded, reloadedRuns)).toMatchObject({ id: admitted.id, phase: 'done' });
    expect(sources).toHaveLength(4);
    for (const id of sources) {
      expect(again.drive.pathOf(id, rootId).startsWith('Inbox/')).toBe(false);
      expect((await again.drive.evidence(id))?.trashed).toBe(false);
    }
  });

  it('stays done after a restore from a consistent snapshot, its view unchanged, and admits the next run', async () => {
    const w = await bWorld();
    const first = await w.worker.process('all');
    await w.runs.settled();
    expect(await w.worker.status()).toMatchObject({ id: first.id, phase: 'done' });
    const text = w.drive.dump(w.rootId).get(SYSTEM.lastRun);

    const { snapshot, alongside } = await w.drive.snapshotWith(() => w.runs.toJSON());
    const drive = FakeDrive.restore(snapshot);
    const runs = FakeRunService.restore(alongside, { drive, clock: w.clock.now, scale: 'instant' });
    const worker = new FakeWorker({ drive, scenario: 'first', scale: 'instant', rootId: w.rootId, runs, fresh: false });
    expect(await after(worker, runs)).toMatchObject({ id: first.id, phase: 'done' });
    expect(drive.dump(w.rootId).get(SYSTEM.lastRun)).toBe(text);

    const uploader = new DriveVault({ drive, rootId: async () => w.rootId, runningPiles: () => new Set(), device: 'DEVICE_B' });
    await uploader.addPile({ text: '', items: [pdf('extra one.pdf'), pdf('extra two.pdf')] });
    await uploader.settled();
    const next = await worker.process('all');
    expect(next.id).not.toBe(first.id);
    await runs.settled();
    expect(await worker.status()).toMatchObject({ id: next.id, phase: 'done' });
  });

  it('recovers from a consistent snapshot taken at any moment of the run, each file filed once', async () => {
    const w = await bWorld();
    const moments: Array<Promise<{ snapshot: string; alongside: string }>> = [];
    const appliedAt: number[] = [];
    const before = w.drive.fault?.before;
    w.drive.fault = { ...w.drive.fault, before: (call) => {
      // A save at this instant, as the pretend source takes it: the Drive and the runs together.
      moments.push(w.drive.snapshotWith(() => w.runs.toJSON()));
      appliedAt.push(w.applied.length);
      return before?.(call) ?? 'pass';
    } };
    const admitted = await w.worker.process('all');
    await w.runs.settled();
    expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
    expect(moments.length).toBeGreaterThan(20);
    const taken = await Promise.all(moments);
    for (let i = 0; i < taken.length; i++) {
      const moment = taken[i];
      if (!moment) continue;
      const drive = FakeDrive.restore(moment.snapshot);
      const applied: FencedCall[] = [];
      drive.fault = { applied: (call) => { applied.push(call); } };
      const runs = FakeRunService.restore(moment.alongside, { drive, clock: w.clock.now, scale: 'instant' });
      const rootId = (await drive.listAll('root')).find((f) => f.folder && f.parents[0] === 'root')?.id ?? null;
      const worker = new FakeWorker({ drive, scenario: 'first', scale: 'instant', rootId, runs, fresh: false });
      const status = await after(worker, runs);
      const earlier = w.applied.slice(0, appliedAt[i]);
      if (status === null) {
        // Saved before the admission was acknowledged: no run, and nothing of it took effect.
        expect(earlier.filter((c) => c.op === 'update' || c.op === 'trash'), `moment ${i}`).toEqual([]);
        for (const id of w.sources) expect(drive.pathOf(id, w.rootId).startsWith('Inbox/'), `moment ${i}, ${id}`).toBe(true);
        continue;
      }
      expect(status, `moment ${i}`).toMatchObject({ id: admitted.id, phase: 'done' });
      for (const id of w.sources) {
        expect(earlier.filter(isMoveOf(id)).length + applied.filter(isMoveOf(id)).length, `moment ${i}, ${id}`).toBe(1);
        expect(drive.pathOf(id, w.rootId).startsWith('Inbox/'), `moment ${i}, ${id}`).toBe(false);
      }
    }
  });

  it('returns the same admitted run to quick repeated asks from one or two clients', async () => {
    const w = await bWorld();
    const other = new FakeWorker({ drive: w.drive, scenario: 'first', scale: 'instant', rootId: w.rootId, runs: w.runs, fresh: false });
    const asks = await Promise.all([w.worker.process('all'), w.worker.process('all'), other.process('all')]);
    expect(new Set(asks.map((a) => a.id)).size).toBe(1);
    await w.runs.settled();
    expect(await manifestsOf(w)).toHaveLength(1);
    await expectFiledOnce(w);
  });

  it('checks a source is still as seen inside the boundary, so a rename just before the move is set aside, not undone', async () => {
    let renamed: string | null = null;
    let drive: FakeDrive | null = null;
    const hooks: Hooks = {
      beforeDispatch: async (at) => {
        if (renamed || at.effect.kind !== 'move' || !drive) return;
        renamed = at.effect.before.fileId;
        // Alex renames it in Drive after Bower checked it and before the move is sent.
        await drive.update(renamed, { name: 'renamed by Alex.pdf' });
      },
    };
    const w = await bWorld({ hooks });
    drive = w.drive;
    const admitted = await w.worker.process('all');
    await w.runs.settled();
    expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
    const held = renamed ?? '';
    const ev = await w.drive.evidence(held);
    expect(ev?.file.name).toBe('renamed by Alex.pdf');
    expect(w.drive.pathOf(held, w.rootId).startsWith('Inbox/')).toBe(true);
    expect(movesOf(w, held)).toBe(0);
    const [manifest] = await manifestsOf(w);
    const name = manifest?.capture.members.find((m) => m.file.fileId === held)?.file.name;
    expect(viewOf(w)?.run.report?.setAside).toEqual([{ name, why: 'It was moved, renamed or removed before Bower could file it.' }]);
    for (const id of w.sources.filter((x) => x !== held)) expect(movesOf(w, id)).toBe(1);
  });

  it('recomputes hashes.json from the stored files on the next run after its write was rejected', async () => {
    let moved: string | null = null;
    let drive: FakeDrive | null = null;
    let rootId = '';
    const hooks: Hooks = {
      beforeDispatch: async (at) => {
        if (moved || at.effect.kind !== 'move' || !drive) return;
        moved = at.effect.before.fileId;
        // Alex moves it to Areas in Drive just before Bower's move: that move, the pile's Bin and the hashes are rejected.
        const areas = (await drive.listAll(rootId)).find((f) => f.folder && f.name === 'Areas' && f.parents[0] === rootId);
        await drive.update(moved, { addParent: areas?.id ?? '', removeParent: at.effect.before.parents[0] ?? '' });
      },
    };
    const w = await bWorld({ hooks });
    drive = w.drive;
    rootId = w.rootId;
    const hashesOf = (): Record<string, string> => (JSON.parse(w.drive.dump(w.rootId).get(SYSTEM.hashes) ?? '{}') as { hashes: Record<string, string> }).hashes;
    /** What hashes.json should say: every live file outside the Inbox and Bower's own folder, not a note, by its stored bytes. */
    const stored = async (): Promise<Record<string, string>> => {
      const out: Record<string, string> = {};
      for (const f of await w.drive.listAll(w.rootId)) {
        const path = w.drive.pathOf(f.id, w.rootId);
        if (f.folder || f.name.endsWith('.md') || path.startsWith('Inbox/') || path.split('/').some((part) => part.startsWith('.'))) continue;
        const ev = await w.drive.evidence(f.id);
        if (ev?.content) out[ev.content.sha256] = path;
      }
      return out;
    };
    const first = await w.worker.process('all');
    await w.runs.settled();
    expect(await w.worker.status()).toMatchObject({ id: first.id, phase: 'done' });
    const [manifest] = await manifestsOf(w);
    const head = (await checkpointsOf(w, first.id)).at(-1);
    const write = manifest?.operations.find((o) => o.effect.kind === 'write-runner-json');
    expect(head?.outcomes.find((o) => o.operationId === write?.operationId)?.state).toBe('rejected');
    expect(hashesOf()).not.toEqual(await stored());

    // Alex clears what is left of that pile and adds another; the next run is on the B path too.
    const alex = new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set(), device: 'DEVICE_B' });
    const left = await alex.piles();
    expect(left).toHaveLength(1);
    for (const pile of left) await alex.removePile(pile.id);
    await alex.addPile({ text: '', items: [pdf('extra one.pdf'), pdf('extra two.pdf')] });
    await alex.settled();
    const second = await w.worker.process('all');
    await w.runs.settled();
    expect(await w.worker.status()).toMatchObject({ id: second.id, phase: 'done' });
    expect((await manifestsOf(w)).some((m) => m.runId === second.id)).toBe(true);
    expect(hashesOf()).toEqual(await stored());
    expect(Object.values(hashesOf())).toContain(w.drive.pathOf(moved ?? '', w.rootId));
  });

  it('never keeps a pretend Drive and run service from different instants when the second save fails', async () => {
    sessionStorage.clear();
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const DRIVE_KEY = 'bower:fake:first';
    const RUNS_KEY = 'bower:fake:first:runs';
    const first = await pretendDrive('first');
    const runs = pretendRuns('first', first.drive, first.fresh, 'instant');
    const worker = new FakeWorker({ drive: first.drive, scenario: 'first', scale: 'instant', rootId: null, runs });
    const rootId = (await worker.createFolder()).id;
    const uploader = new DriveVault({ drive: first.drive, rootId: async () => rootId, runningPiles: () => new Set(), device: 'DEVICE_A' });
    await uploader.addPile({ text: 'Papers about the lease', items: [pdf('lease.pdf'), pdf('inventory.pdf')] });
    await uploader.addPile({ text: '', items: [pdf('idea one.pdf'), pdf('idea two.pdf')] });
    await uploader.settled();
    const sources = await inboxPdfs(first.drive, rootId);
    // The admission is saved: the Drive and the runs of one instant.
    const view = { drive: first.drive, rootId };
    first.drive.fault = { before: (call) => (isView(view, call, 'done') ? 'refuse' : 'pass') };
    const admitted = await worker.process('all');
    const saved = { drive: sessionStorage.getItem(DRIVE_KEY), runs: sessionStorage.getItem(RUNS_KEY) };
    expect(saved.drive).not.toBeNull();
    expect(saved.runs).not.toBeNull();

    // The tab's storage is full for the runs: the next save writes the Drive, then fails on the runs.
    const setItem = Storage.prototype.setItem;
    const full = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === RUNS_KEY) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      setItem.call(this, key, value);
    });
    await runs.settled();
    for (let i = 0; i < 60 && !full.mock.calls.some(([key]) => key === RUNS_KEY); i++) await new Promise((r) => setTimeout(r, 25));
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 10));
    expect(full.mock.calls.some(([key]) => key === RUNS_KEY)).toBe(true);
    full.mockRestore();

    // A reader sees both from the same instant, or neither.
    const kept = { drive: sessionStorage.getItem(DRIVE_KEY), runs: sessionStorage.getItem(RUNS_KEY) };
    const oneInstant = (kept.drive === saved.drive && kept.runs === saved.runs) || (kept.drive === null && kept.runs === null);
    expect(oneInstant, 'the kept Drive and runs are from one instant').toBe(true);

    // A reload from what is kept recovers the run, each file filed once.
    if (kept.drive === null) return;
    const again = await pretendDrive('first');
    const reloadedRuns = pretendRuns('first', again.drive, again.fresh, 'instant');
    const reloaded = new FakeWorker({ drive: again.drive, scenario: 'first', scale: 'instant', rootId: again.rootId, runs: reloadedRuns, fresh: false });
    const applied: FencedCall[] = [];
    again.drive.fault = { applied: (call) => { applied.push(call); } };
    expect(await after(reloaded, reloadedRuns)).toMatchObject({ id: admitted.id, phase: 'done' });
    for (const id of sources) {
      expect(applied.filter(isMoveOf(id))).toHaveLength(1);
      expect(again.drive.pathOf(id, rootId).startsWith('Inbox/')).toBe(false);
    }
  });

  describe('classification routes', () => {
    const plan = async (w: { drive: FakeDrive; rootId: string }) =>
      planRun(w.drive, w.rootId, { scope: 'all', allowWeb: false, runId: 'run-plan', requestId: 'request-plan', requestedAt: Date.now() });
    async function folderPile(w: World, name: string, files: Array<{ name: string; text: string; props?: Record<string, string> }>) {
      const inbox = (await w.drive.listAll(w.rootId)).find((f) => f.folder && f.name === 'Inbox' && f.parents[0] === w.rootId);
      const folder = await w.drive.createFolder(inbox?.id ?? '', name);
      for (const f of files) await w.drive.createText(folder.id, f.name, f.text, f.props);
    }

    it('takes the B path for ready plain files', async () => {
      expect((await plan(await bWorld())).path).toBe('b');
    });
    it('sends a run with a rule to word to the legacy path', async () => {
      const w = await bWorld();
      await w.uploader.addRule('Keep lease papers together');
      expect(await plan(w)).toEqual({ path: 'legacy', why: 'rules' });
    });
    it('sends a run with a hub Timeline update to the legacy path', async () => {
      const w = await bWorld();
      const projects = (await w.drive.listAll(w.rootId)).find((f) => f.folder && f.name === 'Projects');
      const hub = await w.drive.createFolder(projects?.id ?? '', 'Flat hunt');
      await w.drive.createText(hub.id, 'Flat hunt.md', '# Flat hunt\n');
      expect(await plan(w)).toEqual({ path: 'legacy', why: 'timeline' });
    });
    it('sends a run with a thing that gets its own note to the legacy path', async () => {
      const w = await bWorld();
      await folderPile(w, 'Offer', [{ name: 'Offer_letter_final(2).pdf', text: '%PDF offer' }, { name: 'other.pdf', text: '%PDF other' }]);
      expect(await plan(w)).toEqual({ path: 'legacy', why: 'note' });
    });
    it('sends a run with a merge to the legacy path', async () => {
      const w = await bWorld();
      await folderPile(w, 'Listing', [{ name: 'listing-88213.example', text: 'a listing', props: { kind: 'other' } }, { name: 'other.pdf', text: '%PDF other' }]);
      expect(await plan(w)).toEqual({ path: 'legacy', why: 'merge' });
    });
    // TL-P2-21: a pile that has not fully arrived is held out of the capture; the run beside it takes the B path.
    it('takes the B path beside a pile that has not fully arrived, leaving that pile out of the capture', async () => {
      const w = await bWorld();
      const declaring = new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set(), declarePiles: true, device: 'DEVICE_A' });
      const upload = w.drive.upload.bind(w.drive);
      w.drive.upload = async (parent, name, body, onProgress, props) => {
        if (name === 'missing.pdf') throw driveError('offline');
        return upload(parent, name, body, onProgress, props);
      };
      await declaring.addPile({ text: 'Papers', items: [pdf('arrived.pdf'), pdf('missing.pdf')] });
      await declaring.settled();
      const out = await plan(w);
      expect(out.path).toBe('b');
      if (out.path !== 'b') return;
      expect(out.manifest.capture.members.map((m) => m.file.name).sort()).toEqual(['idea one.pdf', 'idea two.pdf', 'inventory.pdf', 'lease.pdf']);
      expect(out.manifest.capture.piles).toHaveLength(2);
    });
    it('sends a run with a loose thing to the legacy path', async () => {
      const w = await bWorld();
      await w.uploader.addPile({ text: '', items: [pdf('alone.pdf')] });
      await w.uploader.settled();
      expect(await plan(w)).toEqual({ path: 'legacy', why: 'loose pile' });
    });
    it('sends a run with a note to write to the legacy path', async () => {
      const w = await bWorld();
      await w.uploader.addPile({ text: 'Bins go out on Tuesday nights', items: [] });
      expect(await plan(w)).toEqual({ path: 'legacy', why: 'generated note' });
    });
    it('sends a run that asks a question to the legacy path', async () => {
      const w = await bWorld();
      await w.uploader.addPile({ text: 'Saltmere weekend receipts', items: [pdf('taxi.pdf'), pdf('hotel.pdf')] });
      await w.uploader.settled();
      expect(await plan(w)).toEqual({ path: 'legacy', why: 'question' });
    });
  });

  describe('journal changes take the recoverable path', () => {
    const FOUR = ['idea one.pdf', 'idea two.pdf', 'inventory.pdf', 'lease.pdf'];
    const DONE = 'Done. See what changed in your folders.';
    const plan = async (w: { drive: FakeDrive; rootId: string }, scope: 'all' | 'instructions' = 'all') =>
      planRun(w.drive, w.rootId, { scope, allowWeb: false, runId: 'run-plan', requestId: 'request-plan', requestedAt: Date.now() });
    type Line = { file: DriveFile; rec: JournalRecord };
    /** The journal lines not archived yet, oldest first. */
    async function linesOf(w: { drive: FakeDrive; rootId: string }): Promise<Line[]> {
      const files = (await w.drive.listAll(w.rootId)).filter((f) => {
        const path = w.drive.pathOf(f.id, w.rootId);
        return !f.folder && path.startsWith(`${SYSTEM.changes}/`) && !path.startsWith(`${SYSTEM.archive}/`);
      });
      const out = await Promise.all(files.map(async (file) => ({ file, rec: JSON.parse(await w.drive.readText(file.id)) as JournalRecord })));
      return out.sort((a, b) => a.rec.at - b.rec.at || a.file.id.localeCompare(b.file.id));
    }
    const vaultOf = (w: { drive: FakeDrive; rootId: string }): DriveVault => new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set(), device: 'DEVICE_B' });
    const fileAt = async (w: { drive: FakeDrive; rootId: string }, path: string): Promise<DriveFile> => {
      const f = (await w.drive.listAll(w.rootId)).find((x) => w.drive.pathOf(x.id, w.rootId) === path);
      if (!f) throw new Error(`${path} is missing`);
      return f;
    };
    const isWriteOf = (w: { drive: FakeDrive; rootId: string }, path: string) => (call: FencedCall): boolean => call.op === 'write-text' && w.drive.pathOf(call.id, w.rootId) === path;
    const archiveMoves = (m: Manifest | undefined, fileId: string) => (m?.operations ?? []).filter((o) => o.effect.kind === 'move' && o.effect.before.fileId === fileId);
    const question = (id: string) => ({ id, text: `Question ${id}?`, yes: 'Yes', no: 'No', askedAt: 1 });

    it('keeps the whole plan on the legacy path for a rule, a rename or a move', async () => {
      const rule = await bWorld();
      await rule.uploader.addRule('Keep lease papers together');
      await rule.uploader.addRequest('Put the lease papers together');
      expect(await plan(rule)).toEqual({ path: 'legacy', why: 'rules' });
      expect(await plan(rule, 'instructions')).toEqual({ path: 'legacy', why: 'rules' });

      const renamed = await bWorld();
      const projects = await fileAt(renamed, 'Projects');
      await renamed.drive.createFolder(projects.id, 'Garden');
      await vaultOf(renamed).rename('Projects/Garden', 'Garden plans');
      expect((await linesOf(renamed)).map((l) => l.rec.kind)).toEqual(['rename']);
      expect(await plan(renamed)).toEqual({ path: 'legacy', why: 'renames' });

      const moved = await bWorld();
      await moved.drive.createFolder((await fileAt(moved, 'Projects')).id, 'Garden');
      await vaultOf(moved).move('Projects/Garden', 'Areas');
      expect((await linesOf(moved)).map((l) => l.rec.kind)).toEqual(['move']);
      expect(await plan(moved, 'instructions')).toEqual({ path: 'legacy', why: 'renames' });

      // The legacy path takes the rule's run whole: no run records, nothing through the B boundary.
      const admitted = await rule.worker.process('all');
      await until(rule.worker, 'done');
      expect(await rule.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      expect(await recordsOf(rule)).toEqual([]);
      expect(rule.calls).toEqual([]);
    });

    it('completes a request through requests.json and archives its line only after that write', async () => {
      const w = await bWorld();
      await w.uploader.addRequest('Put the lease papers together');
      const [line, ...more] = await linesOf(w);
      expect(more).toEqual([]);
      if (!line) return;
      const digest = await w.drive.storedDigest(line.file.id);
      const admitted = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });

      // Fixed in the manifest before any effect: the captured line, the write, the archive move after it, the row.
      const [manifest, ...others] = await manifestsOf(w);
      expect(others).toEqual([]);
      expect(manifest?.runId).toBe(admitted.id);
      expect(manifest?.capture.journal).toEqual([{ recordId: line.rec.id, sha256: digest?.sha256, fileIds: [line.file.id] }]);
      const write = manifest?.operations.find((o) => o.effect.kind === 'write-runner-json' && o.effect.path === SYSTEM.requests);
      const [archive, ...again] = archiveMoves(manifest, line.file.id);
      expect(again).toEqual([]);
      expect(archive?.dependsOn).toContain(write?.operationId);
      expect(archive?.ordinal).toBeGreaterThan(write?.ordinal ?? Number.POSITIVE_INFINITY);
      expect(archive?.effect).toMatchObject({ name: line.file.name, properties: {} });
      const rows = manifest?.reportPlan.filter((c) => c.value.requests !== undefined) ?? [];
      expect(rows.map((c) => ({ when: c.when, value: c.value }))).toEqual([{ when: 'applied', value: { filed: [], created: [], updated: [], setAside: [], questions: [], requests: ['Put the lease papers together'] } }]);
      expect(rows[0]?.requires).toEqual(expect.arrayContaining([write?.operationId, archive?.operationId]));

      // Done in requests.json, the line archived once with its bytes, and the report names the request.
      const requests = JSON.parse(w.drive.dump(w.rootId).get(SYSTEM.requests) ?? '') as RequestsFile;
      expect(requests.done).toEqual([{ id: line.rec.id, text: 'Put the lease papers together', at: line.rec.at, done: DONE }]);
      expect(w.drive.pathOf(line.file.id, w.rootId)).toBe(`${SYSTEM.archive}/${line.file.name}`);
      expect(movesOf(w, line.file.id)).toBe(1);
      expect(await w.drive.storedDigest(line.file.id)).toEqual(digest);
      expect(await linesOf(w)).toEqual([]);
      const report = viewOf(w)?.run.report;
      expect(report?.requests).toEqual(['Put the lease papers together']);
      expect(report?.yourChanges).toBeUndefined();
      expect(report?.filed.map((f) => f.name).sort()).toEqual(FOUR);
      await expectFiledOnce(w);
    });

    it('counts each plain change once, archives every copy and drops answered questions', async () => {
      const w = await bWorld();
      const questions = await fileAt(w, SYSTEM.questions);
      await w.drive.writeText(questions.id, `${JSON.stringify({ v: 1, questions: [question('q-keep'), question('q-answered')] }, null, 2)}\n`, questions.modifiedTime);
      const other = vaultOf(w);
      await other.answer('q-answered', false);
      await other.create('Projects', 'folder', 'Garden');
      const lines = await linesOf(w);
      expect(lines.map((l) => l.rec.kind)).toEqual(['answer', 'create']);
      const [answered, made] = lines;
      if (!answered || !made) return;
      // The same line written twice (its first answer was lost) is one change.
      const copy = await w.drive.createText(made.file.parents[0] ?? '', made.file.name, await w.drive.readText(made.file.id));

      const admitted = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      const [manifest] = await manifestsOf(w);
      expect(manifest?.capture.journal.map((j) => ({ recordId: j.recordId, fileIds: [...j.fileIds].sort() }))).toEqual([
        { recordId: answered.rec.id, fileIds: [answered.file.id] },
        { recordId: made.rec.id, fileIds: [made.file.id, copy.id].sort() },
      ]);
      const write = manifest?.operations.find((o) => o.effect.kind === 'write-runner-json' && o.effect.path === SYSTEM.questions);
      expect(write).toBeDefined();
      for (const op of archiveMoves(manifest, answered.file.id)) expect(op.dependsOn).toContain(write?.operationId);
      for (const id of [answered.file.id, made.file.id, copy.id]) {
        expect(archiveMoves(manifest, id)).toHaveLength(1);
        expect(movesOf(w, id)).toBe(1);
        expect(w.drive.pathOf(id, w.rootId).startsWith(`${SYSTEM.archive}/`)).toBe(true);
      }
      expect((JSON.parse(w.drive.dump(w.rootId).get(SYSTEM.questions) ?? '') as QuestionsFile).questions.map((q) => q.id)).toEqual(['q-keep']);
      const report = viewOf(w)?.run.report;
      expect(report?.yourChanges).toBe(2);
      expect(report?.requests).toBeUndefined();
      expect(report?.questions).toEqual([]);
      expect(report?.filed.map((f) => f.name).sort()).toEqual(FOUR);
      expect(await linesOf(w)).toEqual([]);
    });

    it('takes the B path for an instructions run, filing nothing', async () => {
      const w = await bWorld();
      await w.uploader.addRequest('Keep garden notes together');
      expect((await plan(w, 'instructions')).path).toBe('b');
      const admitted = await w.worker.process('instructions');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      const [manifest] = await manifestsOf(w);
      expect(manifest).toMatchObject({ runId: admitted.id, runScope: 'instructions', capture: { piles: [], members: [] } });
      expect(manifest?.operations.some((o) => o.effect.kind === 'write-runner-json' && o.effect.path === SYSTEM.hashes)).toBe(false);
      for (const id of w.sources) expect(movesOf(w, id)).toBe(0);
      expect(await inboxPdfs(w.drive, w.rootId)).toEqual(w.sources);
      expect(viewOf(w)?.run.report).toMatchObject({ filed: [], requests: ['Keep garden notes together'] });
      expect(await linesOf(w)).toEqual([]);
    });

    it('reconciles lost archive and requests.json replies by evidence, archiving and completing once', async () => {
      const w = await bWorld();
      await w.uploader.addRequest('Put the lease papers together');
      await w.uploader.create('Projects', 'folder', 'Garden');
      const lines = await linesOf(w);
      const made = lines.find((l) => l.rec.kind === 'create');
      const asked = lines.find((l) => l.rec.kind === 'request');
      if (!made || !asked) throw new Error('missing journal lines');
      w.rules.push(once(isWriteOf(w, SYSTEM.requests), 'lose-reply'), once(isMoveOf(made.file.id), 'lose-reply'));
      const admitted = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'saving' });
      for (let i = 0; i < 5 && (await w.worker.status())?.phase !== 'done'; i++) {
        w.clock.later();
        await after(w.worker, w.runs);
      }
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      expect(w.calls.filter(isWriteOf(w, SYSTEM.requests))).toHaveLength(1);
      for (const l of lines) {
        expect(w.calls.filter(isMoveOf(l.file.id)), `archive calls of ${l.rec.kind}`).toHaveLength(1);
        expect(w.drive.pathOf(l.file.id, w.rootId)).toBe(`${SYSTEM.archive}/${l.file.name}`);
      }
      const requests = JSON.parse(w.drive.dump(w.rootId).get(SYSTEM.requests) ?? '') as RequestsFile;
      expect(requests.done.filter((r) => r.id === asked.rec.id)).toHaveLength(1);
      expect((await checkpointsOf(w, admitted.id)).at(-1)?.outcomes.every((o) => o.state === 'applied')).toBe(true);
      expect(viewOf(w)?.run.report).toMatchObject({ requests: ['Put the lease papers together'], yourChanges: 1 });
      await expectFiledOnce(w);
    });

    it('keeps a request unarchived and unreported when its requests.json write is rejected', async () => {
      let drive: FakeDrive | null = null;
      let rootId = '';
      const hooks: Hooks = {
        beforeDispatch: async (at) => {
          if (!drive || at.effect.kind !== 'write-runner-json' || at.effect.path !== SYSTEM.requests) return;
          // Another writer changes requests.json after Bower read it.
          const f = (await drive.listAll(rootId)).find((x) => drive?.pathOf(x.id, rootId) === SYSTEM.requests);
          if (f) await drive.writeText(f.id, '{ "v": 1, "done": [] }\n\n', f.modifiedTime);
        },
      };
      const w = await bWorld({ hooks });
      drive = w.drive;
      rootId = w.rootId;
      await w.uploader.addRequest('Put the lease papers together');
      const [line] = await linesOf(w);
      if (!line) throw new Error('missing journal line');
      const admitted = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      const [manifest] = await manifestsOf(w);
      const [archive] = archiveMoves(manifest, line.file.id);
      const outcomes = (await checkpointsOf(w, admitted.id)).at(-1)?.outcomes ?? [];
      expect(outcomes.find((o) => o.operationId === archive?.operationId)?.state).toBe('rejected');
      expect(movesOf(w, line.file.id)).toBe(0);
      expect((await linesOf(w)).map((l) => l.rec.id)).toEqual([line.rec.id]);
      expect(viewOf(w)?.run.report?.requests).toBeUndefined();
      await expectFiledOnce(w);
    });

    it('leaves unreadable lines, differing copies and lines in two places where they are, logs once and goes on', async () => {
      const w = await bWorld();
      await w.uploader.addRequest('Put the lease papers together');
      const [asked] = await linesOf(w);
      if (!asked) throw new Error('missing journal line');
      const changes = asked.file.parents[0] ?? '';
      const line = (id: string): JournalRecord => ({ v: 1, id, at: 1, kind: 'create', what: 'New folder "Garden" in Projects', device: 'DEVICE_X', path: 'Projects/Garden' });
      const broken = await w.drive.createText(changes, 'LINE_BROKEN.json', '{ not a change\n');
      const twin = line('LINE_TWIN');
      const first = await w.drive.createText(changes, 'LINE_TWIN.json', `${JSON.stringify(twin)}\n`);
      const second = await w.drive.createText(changes, 'LINE_TWIN.json', `${JSON.stringify(twin, null, 1)}\n`);
      const shared = await w.drive.createText(changes, 'LINE_SHARED.json', `${JSON.stringify(line('LINE_SHARED'))}\n`);
      await w.drive.update(shared.id, { addParent: (await fileAt(w, 'Projects')).id });
      const kept = [broken, first, second, shared];
      const before = await Promise.all(kept.map(async (f) => ({ id: f.id, text: await w.drive.readText(f.id), file: (await w.drive.evidence(f.id))?.file })));
      expect(await plan(w)).toMatchObject({ path: 'b' });
      // Only the run's own planning counts below.
      w.errors.mockClear();

      const admitted = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      const [manifest] = await manifestsOf(w);
      expect(manifest?.capture.journal.map((j) => j.recordId)).toEqual([asked.rec.id]);
      for (const f of kept) expect(manifest?.operations.some((o) => 'before' in o.effect && o.effect.before.fileId === f.id), `an operation on ${f.name}`).toBe(false);
      expect(w.calls.filter((c) => 'id' in c && kept.some((f) => f.id === c.id))).toEqual([]);
      const after = await Promise.all(kept.map(async (f) => ({ id: f.id, text: await w.drive.readText(f.id), file: (await w.drive.evidence(f.id))?.file })));
      expect(after).toEqual(before);
      expect(w.drive.pathOf(asked.file.id, w.rootId)).toBe(`${SYSTEM.archive}/${asked.file.name}`);
      expect(viewOf(w)?.run.report).toMatchObject({ requests: ['Put the lease papers together'] });
      expect(viewOf(w)?.run.report?.yourChanges).toBeUndefined();
      expect(bowerErrors(w).filter((e) => e.message === 'Bower could not read some of your changes; they stay for the next tidy-up.')).toHaveLength(1);
    });

    it('replaces an unreadable questions.json when an answer needs it, recording the bytes it replaced', async () => {
      const w = await bWorld();
      const questions = await fileAt(w, SYSTEM.questions);
      await w.drive.writeText(questions.id, `${JSON.stringify({ v: 1, questions: [question('q-answered')] }, null, 2)}\n`, questions.modifiedTime);
      await vaultOf(w).answer('q-answered', true);
      const [answered] = await linesOf(w);
      if (!answered) throw new Error('missing journal line');
      const now = await fileAt(w, SYSTEM.questions);
      await w.drive.writeText(now.id, '{ "v": 1, "questions": [', now.modifiedTime);
      const unreadable = await w.drive.storedDigest(now.id);
      expect(await plan(w)).toMatchObject({ path: 'b' });
      // Only the run's own planning counts below.
      w.errors.mockClear();

      const admitted = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      const [manifest] = await manifestsOf(w);
      const write = manifest?.operations.find((o) => o.effect.kind === 'write-runner-json' && o.effect.path === SYSTEM.questions);
      expect(write?.effect.kind === 'write-runner-json' ? write.effect.beforeContent.sha256 : null).toBe(unreadable?.sha256);
      for (const op of archiveMoves(manifest, answered.file.id)) expect(op.dependsOn).toContain(write?.operationId);
      expect(JSON.parse(w.drive.dump(w.rootId).get(SYSTEM.questions) ?? '')).toEqual({ v: 1, questions: [] });
      expect(w.drive.pathOf(answered.file.id, w.rootId)).toBe(`${SYSTEM.archive}/${answered.file.name}`);
      const report = viewOf(w)?.run.report;
      expect(report?.questions).toEqual([]);
      expect(report?.yourChanges).toBe(1);
      expect(bowerErrors(w).filter((e) => e.message === 'Bower replaced its list of questions, which it could not read.')).toHaveLength(1);
    });

    it('takes at most the 20 oldest requests; the rest wait for the next run', async () => {
      const w = await bWorld();
      const texts = Array.from({ length: 21 }, (_, i) => `Request number ${i + 1}`);
      for (const t of texts) await w.uploader.addRequest(t);
      const lines = await linesOf(w);
      expect(lines.map((l) => l.rec.text)).toEqual(texts);
      expect(await plan(w)).toMatchObject({ path: 'b' });
      const admitted = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      const [manifest] = await manifestsOf(w);
      expect(manifest?.capture.journal.map((j) => j.recordId)).toEqual(lines.slice(0, 20).map((l) => l.rec.id));
      expect(viewOf(w)?.run.report?.requests).toEqual(texts.slice(0, 20));
      const done = (JSON.parse(w.drive.dump(w.rootId).get(SYSTEM.requests) ?? '') as RequestsFile).done;
      expect(done.map((r) => r.text)).toEqual(texts.slice(0, 20).reverse());
      expect((await linesOf(w)).map((l) => l.rec.text)).toEqual([texts[20]]);

      const next = await w.worker.process('instructions');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: next.id, phase: 'done' });
      expect(viewOf(w)?.run.report?.requests).toEqual([texts[20]]);
      expect(await linesOf(w)).toEqual([]);
    });

    it('keeps the whole plan legacy for a rule or rename line it cannot capture', async () => {
      const at = (kind: JournalRecord['kind'], id: string): JournalRecord => ({ v: 1, id, at: 1, kind, what: `A ${kind}`, device: 'DEVICE_X', ...(kind === 'rule' ? { path: 'Rules.md', text: 'Keep lease papers together' } : { path: 'Projects/Garden plans', from: 'Projects/Garden' }) });
      for (const [kind, why] of [['rule', 'rules'], ['rename', 'renames']] as const) {
        const w = await bWorld();
        await w.uploader.addRequest('Put the lease papers together');
        const [asked] = await linesOf(w);
        const changes = asked?.file.parents[0] ?? '';
        const rec = at(kind, `LINE_${kind.toUpperCase()}`);
        // Two copies with other bytes: the line is left uncaptured, yet its kind still decides the path.
        await w.drive.createText(changes, `${rec.id}.json`, `${JSON.stringify(rec)}\n`);
        await w.drive.createText(changes, `${rec.id}.json`, `${JSON.stringify(rec, null, 1)}\n`);
        expect(await plan(w), kind).toEqual({ path: 'legacy', why });
      }
    });

    it('refuses an instructions run whose only lines are left uncaptured, as nothing to read', async () => {
      const w = await bWorld();
      const changes = (await fileAt(w, SYSTEM.changes)).id;
      const rec: JournalRecord = { v: 1, id: 'LINE_TWIN', at: 1, kind: 'create', what: 'New folder "Garden" in Projects', device: 'DEVICE_X', path: 'Projects/Garden' };
      await w.drive.createText(changes, 'LINE_TWIN.json', `${JSON.stringify(rec)}\n`);
      await w.drive.createText(changes, 'LINE_TWIN.json', `${JSON.stringify(rec, null, 1)}\n`);
      await expect(w.worker.process('instructions')).rejects.toMatchObject({ code: 'conflict', message: 'There is nothing new for Bower to read.' });
      await w.runs.settled();
      expect(await recordsOf(w)).toEqual([]);
      expect(w.calls).toEqual([]);
      expect(viewOf(w)).toBeNull();
    });

    it('completes a request again without a second done row for it', async () => {
      const w = await bWorld();
      await w.uploader.addRequest('Put the lease papers together');
      const [line] = await linesOf(w);
      if (!line) throw new Error('missing journal line');
      // An earlier run completed it, but its line was not archived then.
      const requests = await fileAt(w, SYSTEM.requests);
      const earlier = { id: line.rec.id, text: 'Put the lease papers together', at: line.rec.at, done: DONE };
      const older = { id: 'REQUEST_OLDER', text: 'An older request', at: 0, done: DONE };
      await w.drive.writeText(requests.id, `${JSON.stringify({ v: 1, done: [earlier, older] }, null, 2)}\n`, requests.modifiedTime);
      const admitted = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      const done = (JSON.parse(w.drive.dump(w.rootId).get(SYSTEM.requests) ?? '') as RequestsFile).done;
      expect(done).toEqual([earlier, older]);
      expect(viewOf(w)?.run.report?.requests).toEqual(['Put the lease papers together']);
      expect(await linesOf(w)).toEqual([]);
    });

    it('reconciles a lost reply of the archive folder it makes, ending with one folder', async () => {
      const w = await bWorld();
      await w.uploader.create('Projects', 'folder', 'Garden');
      const [line] = await linesOf(w);
      if (!line) throw new Error('missing journal line');
      const isArchiveFolder = (call: FencedCall): boolean => call.op === 'create-folder' && call.name === 'archive';
      w.rules.push(once(isArchiveFolder, 'lose-reply'));
      const admitted = await w.worker.process('all');
      await w.runs.settled();
      for (let i = 0; i < 5 && (await w.worker.status())?.phase !== 'done'; i++) {
        w.clock.later();
        await after(w.worker, w.runs);
      }
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      expect(w.calls.filter(isArchiveFolder)).toHaveLength(1);
      const folders = (await w.drive.listAll(w.rootId)).filter((f) => f.folder && w.drive.pathOf(f.id, w.rootId) === SYSTEM.archive);
      expect(folders).toHaveLength(1);
      expect(w.drive.pathOf(line.file.id, w.rootId)).toBe(`${SYSTEM.archive}/${line.file.name}`);
      expect(movesOf(w, line.file.id)).toBe(1);
      expect(viewOf(w)?.run.report?.yourChanges).toBe(1);
    });

    it('never archives or counts a change taken back before its archive move', async () => {
      let drive: FakeDrive | null = null;
      let target: string | null = null;
      const hooks: Hooks = {
        beforeDispatch: async (at) => {
          if (!drive || !target || at.effect.kind !== 'move' || at.effect.before.fileId !== target) return;
          // Undo takes the line back (to the Bin) after Bower checked it and before the move is sent.
          const id = target;
          target = null;
          await drive.trash(id);
        },
      };
      const w = await bWorld({ hooks });
      drive = w.drive;
      await w.uploader.create('Projects', 'folder', 'Garden');
      const [line] = await linesOf(w);
      if (!line) throw new Error('missing journal line');
      target = line.file.id;
      const admitted = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      const ev = await w.drive.evidence(line.file.id);
      expect(ev).toMatchObject({ trashed: true, file: { parents: line.file.parents, name: line.file.name } });
      expect(movesOf(w, line.file.id)).toBe(0);
      const [manifest] = await manifestsOf(w);
      const [archive] = archiveMoves(manifest, line.file.id);
      expect((await checkpointsOf(w, admitted.id)).at(-1)?.outcomes.find((o) => o.operationId === archive?.operationId)?.state).toBe('rejected');
      expect(viewOf(w)?.run.report?.yourChanges).toBeUndefined();
      expect(viewOf(w)?.run.report?.filed.map((f) => f.name).sort()).toEqual(FOUR);
    });
  });

  describe('held piles stay untouched on the recoverable path', () => {
    const FOUR = ['idea one.pdf', 'idea two.pdf', 'inventory.pdf', 'lease.pdf'];
    const DIDNT = 'missing.pdf';
    type Where = { drive: FakeDrive; rootId: string };

    /** A declared pile whose second thing never arrives: readiness holds it. Returns its folder and every id in it. */
    async function addHeld(w: World): Promise<{ folder: string; ids: Set<string> }> {
      const declaring = new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set(), declarePiles: true, device: 'DEVICE_A' });
      const upload = w.drive.upload.bind(w.drive);
      w.drive.upload = async (parent, name, body, onProgress, props) => {
        if (name === DIDNT) throw driveError('offline');
        return upload(parent, name, body, onProgress, props);
      };
      await declaring.addPile({ text: 'Papers still coming', items: [pdf('arrived.pdf'), pdf(DIDNT)] });
      await declaring.settled();
      const listing = await w.drive.listAll(w.rootId);
      const folder = listing.find((f) => f.name === 'arrived.pdf')?.parents[0] ?? '';
      expect(folder).not.toBe('');
      return { folder, ids: new Set([folder, ...listing.filter((f) => f.parents.includes(folder)).map((f) => f.id)]) };
    }

    /** Every byte, name, place, mark and Bin state of these files, and what is in them. */
    async function stateOf(w: Where, ids: ReadonlySet<string>): Promise<string> {
      const files = await Promise.all([...ids].sort().map(async (id) => ({ id, ev: await w.drive.evidence(id) })));
      const kids = (await w.drive.listAll(w.rootId)).filter((f) => f.parents.some((p) => ids.has(p))).map((f) => f.id).sort();
      return JSON.stringify({ files, kids });
    }
    const touches = (ids: ReadonlySet<string>) => (call: FencedCall): boolean => ('id' in call && ids.has(call.id)) || ('parentId' in call && ids.has(call.parentId));
    const parentOfFile = async (w: Where, name: string): Promise<string> => (await w.drive.listAll(w.rootId)).find((f) => f.name === name)?.parents[0] ?? '';
    const dispositions = async (w: Where): Promise<DriveFile[]> => (await w.drive.listAll(w.rootId)).filter((f) => f.name.startsWith('disposition-'));
    const childNames = async (w: Where, folder: string): Promise<string[]> => (await w.drive.listAll(w.rootId)).filter((f) => f.parents[0] === folder).map((f) => f.name).sort();

    /** The lease pile's folder and its context note bound by member key (a declared world). */
    async function leasePile(w: World): Promise<{ folder: string; keyed: DriveFile }> {
      const folder = await parentOfFile(w, 'lease.pdf');
      const keyed = (await w.drive.listAll(w.rootId)).find((f) => f.parents[0] === folder && f.name === 'Pile note.md' && f.appProperties?.bowerItem);
      if (!keyed) throw new Error('missing keyed pile note');
      return { folder, keyed };
    }
    /** Where the plan files the lease pile's two things. */
    const leaseTo = (m: Manifest | undefined): string[] => (m?.reportPlan ?? []).flatMap((c) => c.value.filed).filter((f) => f.name === 'lease.pdf' || f.name === 'inventory.pdf').map((f) => f.to);
    const runPlan = (w: Where) => planRun(w.drive, w.rootId, { scope: 'all', allowWeb: false, runId: 'run-plan', requestId: 'request-plan', requestedAt: Date.now() });

    it('leaves a file that is not a member of a declared pile in its folder as an uncaptured child', async () => {
      const w = await bWorld({ declared: true });
      const { folder } = await leasePile(w);
      const stray = await w.drive.createText(folder, 'stray.txt', 'not one of its things');
      const kept = await w.drive.evidence(stray.id);
      const planned = await runPlan(w);
      expect(planned.path).toBe('b');
      if (planned.path !== 'b') return;
      const pile = planned.manifest.capture.piles.find((p) => p.anchor?.fileId === folder);
      expect(pile?.childFileIds).not.toContain(stray.id);
      expect(planned.manifest.capture.members.map((m) => m.file.fileId)).not.toContain(stray.id);

      const admitted = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      const [manifest] = await manifestsOf(w);
      const captured = manifest?.capture.piles.find((p) => p.anchor?.fileId === folder);
      expect((await checkpointsOf(w, admitted.id)).at(-1)?.retainedPileIds).toEqual([captured?.pileId]);
      expect((await w.drive.evidence(folder))?.trashed).toBe(false);
      expect(await childNames(w, folder)).toEqual(['Pile note.md', 'stray.txt']);
      expect(await w.drive.evidence(stray.id)).toEqual(kept);
      expect(viewOf(w)?.run.report?.filed.map((f) => f.name).sort()).toEqual(FOUR);
      expect(viewOf(w)?.run.report?.setAside).toEqual([]);
      await expectFiledOnce(w);
    });

    it('files a declared pile whose context was removed without context, leaving a later pile note as an uncaptured child', async () => {
      const w = await bWorld({ declared: true });
      const { folder, keyed } = await leasePile(w);
      const path = w.drive.pathOf(folder, w.rootId);
      // Alex removed the pile's note through Bower (a journaled Bin, already archived), then wrote a new one in Drive.
      const listing = await w.drive.listAll(w.rootId);
      const changes = listing.find((f) => w.drive.pathOf(f.id, w.rootId) === SYSTEM.changes);
      const archive = listing.find((f) => w.drive.pathOf(f.id, w.rootId) === SYSTEM.archive) ?? (await w.drive.createFolder(changes?.id ?? '', 'archive'));
      const rec: JournalRecord = { v: 1, id: 'LINE_CONTEXT_GONE', at: 1, kind: 'trash', what: 'Removed the note of a pile', device: 'DEVICE_A', path: `${path}/Pile note.md` };
      await w.drive.createText(archive.id, 'LINE_CONTEXT_GONE.json', `${JSON.stringify(rec)}\n`);
      await w.drive.trash(keyed.id);
      const later = await w.drive.createText(folder, 'Pile note.md', 'Soup recipes to try');
      const kept = await w.drive.evidence(later.id);

      const planned = await runPlan(w);
      expect(planned.path).toBe('b');
      if (planned.path !== 'b') return;
      const pile = planned.manifest.capture.piles.find((p) => p.anchor?.fileId === folder);
      expect(pile?.context).toEqual({ kind: 'absent' });
      expect(pile?.childFileIds).not.toContain(later.id);
      // Without its context the pile is filed by its things' names alone, never by the later note's words.
      expect(leaseTo(planned.manifest)).toEqual(['Projects/Flat hunt', 'Resources/Ideas']);

      const admitted = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      expect((await checkpointsOf(w, admitted.id)).at(-1)?.retainedPileIds).toEqual([pile?.pileId]);
      expect((await w.drive.evidence(folder))?.trashed).toBe(false);
      expect(await childNames(w, folder)).toEqual(['Pile note.md']);
      expect(await w.drive.evidence(later.id)).toEqual(kept);
      expect(viewOf(w)?.run.report?.filed.map((f) => f.name).sort()).toEqual(FOUR);
      await expectFiledOnce(w);
    });

    it('guesses where a declared pile goes from its bound note, not from another pile note listed first', async () => {
      const w = await bWorld({ declared: true });
      const { folder, keyed } = await leasePile(w);
      const text = await w.drive.readText(keyed.id);
      // An unbound note comes first in the folder; the bound note is the person's same words, written again.
      const other = await w.drive.createText(folder, 'Pile note.md', 'Soup recipes to try');
      const bound = await w.drive.createText(folder, 'Pile note.md', text, { ...keyed.appProperties });
      await w.drive.trash(keyed.id);

      const planned = await runPlan(w);
      expect(planned.path).toBe('b');
      if (planned.path !== 'b') return;
      const pile = planned.manifest.capture.piles.find((p) => p.anchor?.fileId === folder);
      expect(pile?.context).toMatchObject({ kind: 'text', file: { fileId: bound.id } });
      expect(pile?.childFileIds).not.toContain(other.id);
      expect(leaseTo(planned.manifest)).toEqual(['Projects/Flat hunt', 'Projects/Flat hunt']);
    });

    it('admits the run on the B path, files the ready things and leaves a held pile out of it, untouched', async () => {
      const w = await bWorld();
      const held = await addHeld(w);
      const before = await stateOf(w, held.ids);
      const admitted = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });

      const [manifest, ...more] = await manifestsOf(w);
      expect(manifest).toBeDefined();
      expect(more).toEqual([]);
      const text = JSON.stringify(manifest);
      for (const id of held.ids) expect(text, `the manifest names ${id}`).not.toContain(JSON.stringify(id));
      expect(w.calls.filter(touches(held.ids))).toEqual([]);
      expect(await stateOf(w, held.ids)).toBe(before);
      expect(await dispositions(w)).toEqual([]);

      // TL-P2-21: the B report covers only what the run captured; the held pile keeps its reason in the Inbox.
      const report = viewOf(w)?.run.report;
      expect(report?.filed.map((f) => f.name).sort()).toEqual(FOUR);
      expect(report).toMatchObject({ created: [], updated: [], setAside: [], questions: [] });
      const inbox = await new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set(), device: 'DEVICE_B' }).piles();
      expect(inbox.map((p) => p.items.map((i) => i.name).sort())).toEqual([['arrived.pdf', DIDNT]]);
      await expectFiledOnce(w);
    });

    it('keeps a pile that gained a child after capture in the Inbox with that child, its captured things filed', async () => {
      let drive: FakeDrive | null = null;
      let into = '';
      let late: string | null = null;
      const hooks: Hooks = {
        beforeDispatch: async (at) => {
          if (late || !drive || !into || at.effect.kind !== 'move') return;
          // Alex adds a thing to the lease pile after the run captured it.
          late = (await drive.createText(into, 'later.txt', 'arrived late')).id;
        },
      };
      const w = await bWorld({ hooks });
      drive = w.drive;
      const held = await addHeld(w);
      const before = await stateOf(w, held.ids);
      const lease = await parentOfFile(w, 'lease.pdf');
      into = lease;
      const admitted = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      expect(late).not.toBeNull();

      const [manifest] = await manifestsOf(w);
      const pile = manifest?.capture.piles.find((p) => p.anchor?.fileId === lease);
      expect(pile).toBeDefined();
      expect(pile?.childFileIds).not.toContain(late);
      const bin = manifest?.operations.find((o) => o.effect.kind === 'bin' && o.effect.before.fileId === lease);
      const head = (await checkpointsOf(w, admitted.id)).at(-1);
      expect(head?.outcomes.find((o) => o.operationId === bin?.operationId)?.state).toBe('rejected');
      expect(head?.retainedPileIds).toEqual([pile?.pileId]);

      // The folder, its note and the late child stay; nothing of them went to the Bin.
      expect((await w.drive.evidence(lease))?.trashed).toBe(false);
      expect(await childNames(w, lease)).toEqual(['Pile note.md', 'later.txt']);
      expect(await w.drive.evidence(late ?? '')).toMatchObject({ trashed: false, file: { parents: [lease], name: 'later.txt' } });
      expect(w.applied.filter((c) => c.op === 'trash' && c.id === lease)).toEqual([]);
      expect(w.calls.filter((c) => 'id' in c && c.id === late)).toEqual([]);

      expect(w.calls.filter(touches(held.ids))).toEqual([]);
      expect(await stateOf(w, held.ids)).toBe(before);
      const report = viewOf(w)?.run.report;
      expect(report?.filed.map((f) => f.name).sort()).toEqual(FOUR);
      expect(report?.setAside).toEqual([]);
      await expectFiledOnce(w);
    });

    it('captures the pile note bound to a pile and leaves a second one in its folder as an uncaptured child', async () => {
      const w = await bWorld();
      const lease = await parentOfFile(w, 'lease.pdf');
      const bound = (await w.drive.listAll(w.rootId)).find((f) => f.parents[0] === lease && f.name === 'Pile note.md');
      expect(bound).toBeDefined();
      const extra = await w.drive.createText(lease, 'Pile note.md', 'A second note about the lease');
      const kept = { bound: await w.drive.evidence(bound?.id ?? ''), extra: await w.drive.evidence(extra.id) };

      const planned = await planRun(w.drive, w.rootId, { scope: 'all', allowWeb: false, runId: 'run-plan', requestId: 'request-plan', requestedAt: Date.now() });
      expect(planned.path).toBe('b');
      if (planned.path !== 'b') return;
      const captured = planned.manifest.capture.piles.find((p) => p.anchor?.fileId === lease);
      expect(captured?.context).toMatchObject({ kind: 'text', file: { fileId: bound?.id } });
      expect(captured?.childFileIds).toContain(bound?.id);
      expect(captured?.childFileIds).not.toContain(extra.id);
      expect(planned.manifest.capture.members.map((m) => m.file.fileId)).not.toContain(extra.id);

      const admitted = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      const [manifest] = await manifestsOf(w);
      const pile = manifest?.capture.piles.find((p) => p.anchor?.fileId === lease);
      expect((await checkpointsOf(w, admitted.id)).at(-1)?.retainedPileIds).toEqual([pile?.pileId]);
      expect((await w.drive.evidence(lease))?.trashed).toBe(false);
      expect(await childNames(w, lease)).toEqual(['Pile note.md', 'Pile note.md']);
      expect({ bound: await w.drive.evidence(bound?.id ?? ''), extra: await w.drive.evidence(extra.id) }).toEqual(kept);
      const report = viewOf(w)?.run.report;
      expect(report?.filed.map((f) => f.name).sort()).toEqual(FOUR);
      expect(report?.setAside).toEqual([]);
      await expectFiledOnce(w);
    });

    it('admits nothing when only held piles are waiting', async () => {
      const w = await bWorld();
      const first = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: first.id, phase: 'done' });
      const held = await addHeld(w);
      const before = await stateOf(w, held.ids);
      const records = await recordsOf(w);
      const view = viewOf(w);
      const rest = await domain(w.drive, w.rootId);
      const calls = w.calls.length;

      await expect(w.worker.process('all')).rejects.toMatchObject({ code: 'conflict', message: 'Nothing in the inbox is ready yet.' });
      await w.runs.settled();
      expect(await recordsOf(w)).toEqual(records);
      expect(w.calls.slice(calls)).toEqual([]);
      expect(viewOf(w)).toEqual(view);
      expect(await domain(w.drive, w.rootId)).toBe(rest);
      expect(await stateOf(w, held.ids)).toBe(before);
      expect(await w.worker.status()).toMatchObject({ id: first.id, phase: 'done' });
    });

    it('recovers a run beside a held pile without ever touching it', async () => {
      const pause = pauseFirstMove();
      const w = await bWorld({ hooks: pause.hooks });
      const held = await addHeld(w);
      const before = await stateOf(w, held.ids);
      const admitted = await w.worker.process('all');
      const at = await reached(pause.paused, w.runs);
      expect(at, 'the first move was paused before its dispatch').not.toBeNull();
      if (!at) return;

      // The paused attempt's claim lapses; another client asks, and the service recovers under a newer epoch.
      w.clock.later(CLAIM_MS + 1);
      const second = new FakeWorker({ drive: w.drive, scenario: 'first', scale: 'instant', rootId: w.rootId, runs: w.runs, fresh: false });
      await until(second, 'done');
      expect(await second.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      expect((await checkpointsOf(w, admitted.id)).at(-1)?.epoch).toBeGreaterThan(at.epoch);
      pause.release();
      await w.runs.settled();
      expect(w.calls.filter(touches(held.ids))).toEqual([]);
      expect(await stateOf(w, held.ids)).toBe(before);

      // After a reload of the service and the Drive, asking again leaves it as it was too.
      const drive = FakeDrive.restore(await w.drive.snapshot());
      const applied: FencedCall[] = [];
      drive.fault = { applied: (call) => { applied.push(call); } };
      const runs = FakeRunService.restore(w.runs.toJSON(), { drive, clock: w.clock.now, scale: 'instant' });
      const worker = new FakeWorker({ drive, scenario: 'first', scale: 'instant', rootId: w.rootId, runs, fresh: false });
      expect(await after(worker, runs)).toMatchObject({ id: admitted.id, phase: 'done' });
      expect(applied.filter(touches(held.ids))).toEqual([]);
      expect(await stateOf({ drive, rootId: w.rootId }, held.ids)).toBe(before);
      expect(viewOf(w)?.run.report?.setAside).toEqual([]);
      await expectFiledOnce(w);
    });
  });
});
