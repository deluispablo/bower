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
import { FAILURE, planRun, type HubUpdate } from './fake-runner';
import type { RunWire } from '../worker/worker-api';
import { CLAIM_MS, FakeRunService, RETRY_MS, type DispatchAt, type FakeRunServiceOptions } from './fake-run-service';
import type { FaultAction, FencedCall } from '../drive/fake-drive';
import { MANIFEST_V2_LIMIT, type EditText, type Manifest, type ManifestV2, type OperationV2, type ReportContribution } from '../contracts/run-manifest';
import { EDIT_FILE_LIMIT, savedLinkKey } from '../contracts/note-edit';
import { canonical, grounded, groundedKeys } from './fake-run-records';
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
  async function bWorld(o: { declared?: boolean; scenario?: Scenario; hooks?: Hooks; updates?: readonly HubUpdate[] } = {}) {
    localStorage.clear();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let now = Date.now();
    const clock = { now: (): number => now, later: (ms = RETRY_MS + 1): void => { now += ms; } };
    const drive = new FakeDrive();
    const runs = new FakeRunService({ drive, clock: clock.now, scale: 'instant', ...(o.hooks ? { hooks: o.hooks } : {}) });
    const worker = new FakeWorker({ drive, scenario: o.scenario ?? 'first', scale: 'instant', rootId: null, runs, ...(o.updates ? { updates: o.updates } : {}) });
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
    await w.uploader.addRule('Keep lease papers together');
    const admitted = await w.worker.process('all');
    await until(w.worker, 'done');
    expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
    expect(await recordsOf(w)).toEqual([]);
    expect(w.calls).toEqual([]);
    expect(viewOf(w)?.run.report?.filed.map((f) => f.name).sort()).toEqual(['idea one.pdf', 'idea two.pdf', 'inventory.pdf', 'lease.pdf']);
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
    // o5-timeline-append: hub Timeline lines are B.2 edits now, and a person's hub note gets none.
    it("takes the B path beside a person's hub note, planning no Timeline line for it", async () => {
      const w = await bWorld();
      const projects = (await w.drive.listAll(w.rootId)).find((f) => f.folder && f.name === 'Projects');
      const hub = await w.drive.createFolder(projects?.id ?? '', 'Flat hunt');
      await w.drive.createText(hub.id, 'Flat hunt.md', '# Flat hunt\n');
      expect(await plan(w)).toMatchObject({ path: 'b', manifest: { v: 1 } });
    });
    // b-path-generated-note (TL-P2-17): a filed thing's own note is a B create-text.
    it('takes the B path for a thing that gets its own note', async () => {
      const w = await bWorld();
      await folderPile(w, 'Offer', [{ name: 'Offer_letter_final(2).pdf', text: '%PDF offer' }, { name: 'other.pdf', text: '%PDF other' }]);
      expect(await plan(w)).toMatchObject({ path: 'b', manifest: { operations: expect.arrayContaining([expect.objectContaining({ effect: expect.objectContaining({ kind: 'create-text', purpose: 'generated' }) })]) } });
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
    it('takes the B path for a note to write from a pile of words', async () => {
      const w = await bWorld();
      await w.uploader.addPile({ text: 'Bins go out on Tuesday nights', items: [] });
      expect(await plan(w)).toMatchObject({ path: 'b', manifest: { operations: expect.arrayContaining([expect.objectContaining({ effect: expect.objectContaining({ kind: 'create-text', purpose: 'generated' }) })]) } });
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
    const leaseTo = (m: Pick<Manifest | ManifestV2, 'reportPlan'> | undefined): string[] => (m?.reportPlan ?? []).flatMap((c) => c.value.filed).filter((f) => f.name === 'lease.pdf' || f.name === 'inventory.pdf').map((f) => f.to);
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

  // b-path-leftover-piles (TL-P2-29 amendment, TL-P2-09, TL-P2-12, TL-P2-21): what a run leaves in a declared pile's
  // folder, once every declared member is accounted for, is an ordinary observed pile for the next run, on the B path.
  describe('leftovers of a held pile take the recoverable path', () => {
    type Where = { drive: FakeDrive; rootId: string };
    const runPlan = (w: Where) => planRun(w.drive, w.rootId, { scope: 'all', allowWeb: false, runId: 'run-plan', requestId: 'request-plan', requestedAt: Date.now() });
    const parentOfFile = async (w: Where, name: string): Promise<string> => (await w.drive.listAll(w.rootId)).find((f) => f.name === name)?.parents[0] ?? '';
    const dispositions = async (w: Where): Promise<string[]> => (await w.drive.listAll(w.rootId)).filter((f) => f.name.startsWith('disposition-')).map((f) => f.id).sort();
    const childNames = async (w: Where, folder: string): Promise<string[]> => (await w.drive.listAll(w.rootId)).filter((f) => f.parents[0] === folder).map((f) => f.name).sort();
    const inInbox = (w: Where, id: string): boolean => w.drive.pathOf(id, w.rootId).startsWith('Inbox/');
    const touches = (ids: ReadonlySet<string>) => (call: FencedCall): boolean => ('id' in call && ids.has(call.id)) || ('parentId' in call && ids.has(call.parentId));

    /** The lease pile's folder and its context note, bound by member key (a declared world). */
    async function leasePile(w: World): Promise<{ folder: string; keyed: DriveFile }> {
      const folder = await parentOfFile(w, 'lease.pdf');
      const keyed = (await w.drive.listAll(w.rootId)).find((f) => f.parents[0] === folder && f.name === 'Pile note.md' && f.appProperties?.bowerItem);
      if (!keyed) throw new Error('missing keyed pile note');
      return { folder, keyed };
    }

    /** A first B run on a declared world that files every member and keeps the lease folder for a file it does not list. */
    async function filedButKept(o: { hooks?: Hooks } = {}) {
      const w = await bWorld({ declared: true, ...(o.hooks ? { hooks: o.hooks } : {}) });
      const lease = await leasePile(w);
      const stray = await w.drive.createText(lease.folder, 'stray.txt', 'not one of its things');
      const leaseId = (await w.drive.listAll(w.rootId)).find((f) => f.name === 'lease.pdf')?.id ?? '';
      const first = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: first.id, phase: 'done' });
      expect(await childNames(w, lease.folder)).toEqual(['Pile note.md', 'stray.txt']);
      await expectFiledOnce(w);
      const disposed = await dispositions(w);
      expect(disposed).toHaveLength(2);
      return { ...w, ...lease, stray: stray.id, leaseId, first, disposed };
    }

    /** The plan of the next run: B, with the leftover captured as an ordinary observed pile. */
    async function plannedLeftover(w: Where, folder: string, things: readonly string[], context: string) {
      const planned = await runPlan(w);
      expect(planned).toMatchObject({ path: 'b' });
      if (planned.path !== 'b') return null;
      const pile = planned.manifest.capture.piles.find((p) => p.anchor?.fileId === folder);
      expect(pile).toMatchObject({ source: { kind: 'observed' }, memberKeys: things.map(() => null), context: { kind: 'text', memberKey: null, file: { fileId: context } } });
      expect(pile?.childFileIds).toEqual([...things, context].sort());
      expect(planned.manifest.capture.members.filter((m) => m.pileId === pile?.pileId).map((m) => ({ id: m.file.fileId, key: m.memberKey }))).toEqual(things.map((id) => ({ id, key: null })));
      return planned;
    }

    it('files a late child left in a declared pile on the next run, as an ordinary pile with its bound note', async () => {
      let drive: FakeDrive | null = null;
      let into = '';
      let late: string | null = null;
      const hooks: Hooks = {
        beforeDispatch: async (at) => {
          if (late || !drive || !into || at.effect.kind !== 'move') return;
          // Alex adds a thing to the lease pile after the first run captured it.
          late = (await drive.createText(into, 'later.txt', 'arrived late')).id;
        },
      };
      const w = await bWorld({ declared: true, hooks });
      drive = w.drive;
      const { folder, keyed } = await leasePile(w);
      into = folder;
      const first = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: first.id, phase: 'done' });
      expect(late).not.toBeNull();
      const lateId = late ?? '';
      expect(await childNames(w, folder)).toEqual(['Pile note.md', 'later.txt']);
      const disposed = await dispositions(w);
      expect(disposed).toHaveLength(2);

      await plannedLeftover(w, folder, [lateId], keyed.id);
      const second = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: second.id, phase: 'done' });
      expect(viewOf(w)?.run.report).toMatchObject({ filed: [{ name: 'later.txt' }], setAside: [] });
      expect(movesOf(w, lateId)).toBe(1);
      expect(inInbox(w, lateId)).toBe(false);
      expect((await w.drive.evidence(folder))?.trashed).toBe(true);
      // The keys the first run disposed of need no new disposition; the declaration stays as history.
      expect(await dispositions(w)).toEqual(disposed);
      expect((await w.drive.listAll(w.rootId)).filter((f) => f.name.startsWith('declaration-'))).toHaveLength(2);
      // Nothing is left to take, and nothing is filed again.
      await expect(w.worker.process('all')).rejects.toMatchObject({ code: 'conflict' });
      for (const id of w.sources) expect(movesOf(w, id), `moves of ${id}`).toBe(1);
      expect(movesOf(w, lateId)).toBe(1);
    });

    it('files what is left beside a second unbound note, with the bound note as its context', async () => {
      const w = await bWorld({ declared: true });
      const { folder, keyed } = await leasePile(w);
      const second = await w.drive.createText(folder, 'Pile note.md', 'A second note about the lease');
      const first = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: first.id, phase: 'done' });
      expect(await childNames(w, folder)).toEqual(['Pile note.md', 'Pile note.md']);
      const disposed = await dispositions(w);
      expect(disposed).toHaveLength(2);
      // Alex adds one more thing to the pile after it was tidied.
      const later = await w.drive.createText(folder, 'later.txt', 'added later');
      const kept = await w.drive.evidence(second.id);

      const planned = await plannedLeftover(w, folder, [later.id], keyed.id);
      expect(planned?.manifest.capture.members.map((m) => m.file.fileId)).not.toContain(second.id);
      const next = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: next.id, phase: 'done' });
      expect(viewOf(w)?.run.report).toMatchObject({ filed: [{ name: 'later.txt' }], setAside: [] });
      expect(inInbox(w, later.id)).toBe(false);
      // The unbound note is an uncaptured child again (TL-P2-21): it stays, and so does the folder.
      expect(await w.drive.evidence(second.id)).toEqual(kept);
      expect((await w.drive.evidence(folder))?.trashed).toBe(false);
      expect(await dispositions(w)).toEqual(disposed);
    });

    it('takes the first note as the context of what is left when the bound note was removed', async () => {
      const w = await filedButKept();
      // Alex removed the pile's note through Bower (a journaled Bin, already archived), then wrote a new one.
      const path = w.drive.pathOf(w.folder, w.rootId);
      const listing = await w.drive.listAll(w.rootId);
      const archive = listing.find((f) => w.drive.pathOf(f.id, w.rootId) === SYSTEM.archive);
      const changes = listing.find((f) => w.drive.pathOf(f.id, w.rootId) === SYSTEM.changes);
      const into = archive ?? (await w.drive.createFolder(changes?.id ?? '', 'archive'));
      const rec: JournalRecord = { v: 1, id: 'LINE_CONTEXT_GONE', at: 1, kind: 'trash', what: 'Removed the note of a pile', device: 'DEVICE_A', path: `${path}/Pile note.md` };
      await w.drive.createText(into.id, 'LINE_CONTEXT_GONE.json', `${JSON.stringify(rec)}\n`);
      await w.drive.trash(w.keyed.id);
      const note = await w.drive.createText(w.folder, 'Pile note.md', 'Papers about the flat');

      await plannedLeftover(w, w.folder, [w.stray], note.id);
      const next = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: next.id, phase: 'done' });
      expect(viewOf(w)?.run.report).toMatchObject({ filed: [{ name: 'stray.txt' }], setAside: [] });
      expect((await w.drive.evidence(w.folder))?.trashed).toBe(true);
      expect(await dispositions(w)).toEqual(w.disposed);
    });

    it('accounts for members a legacy run filed by looking them up, and files what is left on the B path', async () => {
      const w = await bWorld({ declared: true });
      const { folder, keyed } = await leasePile(w);
      const lease = (await w.drive.listAll(w.rootId)).find((f) => f.name === 'lease.pdf')?.id ?? '';
      // A rule to word sends the first run down the legacy path, which writes no disposition.
      await w.uploader.addRule('Keep lease papers together');
      expect(await runPlan(w)).toEqual({ path: 'legacy', why: 'rules' });
      // Alex adds a thing to the lease pile once the legacy run has moved its first member.
      const late: { file: Promise<DriveFile> | null } = { file: null };
      const counted = w.drive.onChange;
      w.drive.onChange = () => {
        counted?.();
        if (!late.file && !w.drive.pathOf(lease, w.rootId).startsWith('Inbox/')) late.file = w.drive.createText(folder, 'later.txt', 'arrived late');
      };
      const first = await w.worker.process('all');
      await until(w.worker, 'done');
      expect(await w.worker.status()).toMatchObject({ id: first.id, phase: 'done' });
      expect(late.file).not.toBeNull();
      const lateId = (await late.file)?.id ?? '';
      expect(await childNames(w, folder)).toEqual(['Pile note.md', 'later.txt']);
      expect(await dispositions(w)).toEqual([]);
      for (const id of w.sources) expect(inInbox(w, id), `${id} still in the Inbox`).toBe(false);

      await plannedLeftover(w, folder, [lateId], keyed.id);
      const next = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: next.id, phase: 'done' });
      expect(viewOf(w)?.run.report).toMatchObject({ filed: [{ name: 'later.txt' }], setAside: [] });
      expect(inInbox(w, lateId)).toBe(false);
      expect((await w.drive.evidence(folder))?.trashed).toBe(true);
      // Lookup is a readiness fact: it never writes a disposition (TL-P2-09).
      expect(await dispositions(w)).toEqual([]);
    });

    it('counts members a consumed disposition covers as accounted for, even when the filed file changed since', async () => {
      const w = await filedButKept();
      // Alex edits the filed lease afterwards: its bytes no longer match the declaration, but the disposition records it.
      const lease = w.leaseId;
      const file = await w.drive.get(lease);
      await w.drive.writeText(lease, '%PDF lease, signed', file.modifiedTime);

      await plannedLeftover(w, w.folder, [w.stray], w.keyed.id);
      const next = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: next.id, phase: 'done' });
      expect(viewOf(w)?.run.report).toMatchObject({ filed: [{ name: 'stray.txt' }], setAside: [] });
      expect(movesOf(w, lease)).toBe(1);
      expect(await dispositions(w)).toEqual(w.disposed);
    });

    it('still holds a declared pile while one of its keys is not accounted for', async () => {
      const w = await bWorld({ declared: true });
      const { folder } = await leasePile(w);
      const projects = (await w.drive.listAll(w.rootId)).find((f) => f.folder && f.name === 'Projects' && f.parents[0] === w.rootId);
      const byName = async (name: string): Promise<DriveFile | undefined> => (await w.drive.listAll(w.rootId)).find((f) => f.name === name);
      // Moved out of the pile outside a run, with no disposition: the lease with its bytes, the inventory edited.
      for (const name of ['lease.pdf', 'inventory.pdf']) {
        const f = await byName(name);
        await w.drive.update(f?.id ?? '', { addParent: projects?.id ?? '', removeParent: folder });
      }
      const inventory = await byName('inventory.pdf');
      await w.drive.writeText(inventory?.id ?? '', '%PDF another inventory', inventory?.modifiedTime ?? '');
      await w.drive.createText(folder, 'later.txt', 'arrived late');
      const ids = new Set([folder, ...(await w.drive.listAll(w.rootId)).filter((f) => f.parents[0] === folder).map((f) => f.id)]);

      const planned = await runPlan(w);
      expect(planned.path).toBe('b');
      if (planned.path !== 'b') return;
      expect(planned.manifest.capture.piles.find((p) => p.anchor?.fileId === folder)).toBeUndefined();
      const from = w.calls.length;
      const admitted = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      expect(viewOf(w)?.run.report?.filed.map((f) => f.name).sort()).toEqual(['idea one.pdf', 'idea two.pdf']);
      expect(w.calls.slice(from).filter(touches(ids))).toEqual([]);
      expect(await childNames(w, folder)).toEqual(['Pile note.md', 'later.txt']);
      expect(await dispositions(w)).toHaveLength(1);
    });

    // TL-P2-29 second amendment: members accounted for count as filed; the ones still inside are declared members of the same pile.
    it('files the members still in a partly filed declared pile on the B path after a legacy run was cut off', async () => {
      const w = await bWorld({ declared: true });
      const { folder, keyed } = await leasePile(w);
      const byName = async (name: string): Promise<DriveFile | undefined> => (await w.drive.listAll(w.rootId)).find((f) => f.name === name);
      const lease = (await byName('lease.pdf'))?.id ?? '';
      const inventory = (await byName('inventory.pdf'))?.id ?? '';
      // A legacy run (a client with no run service) stops at the next Drive call after it moved the lease.
      const cut = { done: false };
      const counted = w.drive.onChange;
      w.drive.onChange = () => {
        counted?.();
        if (cut.done || w.drive.pathOf(lease, w.rootId).startsWith('Inbox/')) return;
        cut.done = true;
        w.drive.failNext('offline');
      };
      const legacy = new FakeWorker({ drive: w.drive, scenario: 'first', scale: 'instant', rootId: w.rootId, fresh: false });
      await legacy.process('all');
      await until(legacy, 'failed');
      expect(await legacy.status()).toMatchObject({ phase: 'failed' });
      w.drive.onChange = counted;
      expect(cut.done).toBe(true);
      expect(inInbox(w, lease)).toBe(false);
      expect(w.drive.pathOf(inventory, w.rootId).startsWith('Inbox/')).toBe(true);
      const leaseAt = await w.drive.evidence(lease);
      const leaseKey = leaseAt?.file.appProperties?.bowerItem;
      const inventoryKey = (await byName('inventory.pdf'))?.appProperties?.bowerItem;
      expect(await dispositions(w)).toEqual([]);

      const planned = await runPlan(w);
      expect(planned).toMatchObject({ path: 'b' });
      if (planned.path !== 'b') return;
      const pile = planned.manifest.capture.piles.find((p) => p.anchor?.fileId === folder);
      expect(pile).toMatchObject({ source: { kind: 'declared' }, memberKeys: [inventoryKey], context: { kind: 'text', file: { fileId: keyed.id } } });
      expect(pile?.childFileIds).toEqual([inventory, keyed.id].sort());
      expect(planned.manifest.capture.members.map((m) => m.file.fileId)).not.toContain(lease);

      const next = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: next.id, phase: 'done' });
      expect(viewOf(w)?.run.report?.filed.map((f) => f.name)).toContain('inventory.pdf');
      expect(viewOf(w)?.run.report?.filed.map((f) => f.name)).not.toContain('lease.pdf');
      expect(movesOf(w, inventory)).toBe(1);
      expect(movesOf(w, lease)).toBe(0);
      expect(inInbox(w, inventory)).toBe(false);
      expect((await w.drive.evidence(lease))?.file).toMatchObject({ parents: leaseAt?.file.parents, name: leaseAt?.file.name });
      expect((await w.drive.evidence(folder))?.trashed).toBe(true);
      // The disposition records the members this run filed, under the pile's declaration.
      const records = await Promise.all((await dispositions(w)).map(async (id) => JSON.parse(await w.drive.readText(id)) as { pileId: string; memberKeys: string[] }));
      const mine = records.filter((d) => d.memberKeys.includes(inventoryKey ?? ''));
      expect(mine).toHaveLength(1);
      expect(mine[0]?.memberKeys).toEqual([inventoryKey]);
      expect(records.some((d) => d.memberKeys.includes(leaseKey ?? ''))).toBe(false);
      // Nothing is left to take, and nothing is filed again.
      await expect(w.worker.process('all')).rejects.toMatchObject({ code: 'conflict' });
      expect(movesOf(w, inventory)).toBe(1);
    });

    it('holds a partly filed declared pile while a member still in it is not ready', async () => {
      const w = await bWorld({ declared: true });
      const { folder } = await leasePile(w);
      const projects = (await w.drive.listAll(w.rootId)).find((f) => f.folder && f.name === 'Projects' && f.parents[0] === w.rootId);
      const byName = async (name: string): Promise<DriveFile | undefined> => (await w.drive.listAll(w.rootId)).find((f) => f.name === name);
      // The lease was filed with its bytes; the inventory still in the pile changed after it was added.
      await w.drive.update((await byName('lease.pdf'))?.id ?? '', { addParent: projects?.id ?? '', removeParent: folder });
      const inventory = await byName('inventory.pdf');
      await w.drive.writeText(inventory?.id ?? '', '%PDF another inventory', inventory?.modifiedTime ?? '');
      const ids = new Set([folder, ...(await w.drive.listAll(w.rootId)).filter((f) => f.parents[0] === folder).map((f) => f.id)]);

      const planned = await runPlan(w);
      expect(planned.path).toBe('b');
      if (planned.path !== 'b') return;
      expect(planned.manifest.capture.piles.find((p) => p.anchor?.fileId === folder)).toBeUndefined();
      const from = w.calls.length;
      const admitted = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      expect(viewOf(w)?.run.report?.filed.map((f) => f.name).sort()).toEqual(['idea one.pdf', 'idea two.pdf']);
      expect(w.calls.slice(from).filter(touches(ids))).toEqual([]);
      expect(await childNames(w, folder)).toEqual(['Pile note.md', 'inventory.pdf']);
      expect(await dispositions(w)).toHaveLength(1);
    });

    it('files a disposed member the person moved back into the pile again, as ordinary input', async () => {
      const w = await filedButKept();
      // Alex puts the filed lease back into the pile: it is no longer a member, just something in the pile.
      const lease = await w.drive.get(w.leaseId);
      await w.drive.update(w.leaseId, { addParent: w.folder, removeParent: lease.parents[0] ?? '' });

      await plannedLeftover(w, w.folder, [w.leaseId, w.stray].sort(), w.keyed.id);
      const next = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: next.id, phase: 'done' });
      expect(viewOf(w)?.run.report?.filed.map((f) => f.name).sort()).toEqual(['lease.pdf', 'stray.txt']);
      expect(movesOf(w, w.leaseId)).toBe(2);
      expect(inInbox(w, w.leaseId)).toBe(false);
      expect((await w.drive.evidence(w.folder))?.trashed).toBe(true);
      expect(await dispositions(w)).toEqual(w.disposed);
    });

    it('recovers the run that files what is left without repeating any effect', async () => {
      let armed = false;
      let held = false;
      let release = (): void => undefined;
      let reachedAt = (_at: DispatchAt): void => undefined;
      const paused = new Promise<DispatchAt>((r) => { reachedAt = r; });
      const gate = new Promise<void>((r) => { release = r; });
      const hooks: Hooks = {
        beforeDispatch: async (at) => {
          if (!armed || held || at.effect.kind !== 'move') return;
          held = true;
          reachedAt(at);
          await gate;
        },
      };
      const w = await filedButKept({ hooks });
      armed = true;
      const admitted = await w.worker.process('all');
      const at = await reached(paused, w.runs);
      expect(at, 'the first move was paused before its dispatch').not.toBeNull();
      if (!at) return;

      // The paused attempt's claim lapses; another client asks, and the service recovers under a newer epoch.
      w.clock.later(CLAIM_MS + 1);
      const other = new FakeWorker({ drive: w.drive, scenario: 'first', scale: 'instant', rootId: w.rootId, runs: w.runs, fresh: false });
      await until(other, 'done');
      expect(await other.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      release();
      await w.runs.settled();
      expect(movesOf(w, w.stray)).toBe(1);
      expect(w.applied.filter((c) => c.op === 'trash' && c.id === w.folder)).toHaveLength(1);
      expect(viewOf(w)?.run.report).toMatchObject({ filed: [{ name: 'stray.txt' }], setAside: [] });
      expect(await dispositions(w)).toEqual(w.disposed);

      // After a reload of the service and the Drive, asking again applies nothing.
      const drive = FakeDrive.restore(await w.drive.snapshot());
      const applied: FencedCall[] = [];
      drive.fault = { applied: (call) => { applied.push(call); } };
      const runs = FakeRunService.restore(w.runs.toJSON(), { drive, clock: w.clock.now, scale: 'instant' });
      const worker = new FakeWorker({ drive, scenario: 'first', scale: 'instant', rootId: w.rootId, runs, fresh: false });
      expect(await after(worker, runs)).toMatchObject({ id: admitted.id, phase: 'done' });
      expect(applied).toEqual([]);
      for (const id of w.sources) expect(movesOf(w, id), `moves of ${id}`).toBe(1);
    });
  });

  // b-path-destinations (TL-P2-17): a name the move must carry and a chain of new folders are planned on the B path.
  describe('destinations take the recoverable path', () => {
    const plan = (w: { drive: FakeDrive; rootId: string }) =>
      planRun(w.drive, w.rootId, { scope: 'all', allowWeb: false, runId: 'run-plan', requestId: 'request-plan', requestedAt: Date.now() });
    const isFolderCall = (name: string) => (call: FencedCall): boolean => call.op === 'create-folder' && call.name === name;
    /** Live folders named `name` whose first parent is `parentId`. */
    const foldersIn = async (w: { drive: FakeDrive; rootId: string }, parentId: string, name: string): Promise<DriveFile[]> =>
      (await w.drive.listAll(w.rootId)).filter((f) => f.folder && f.name === name && f.parents[0] === parentId);

    /** The template with Projects in the Bin, and a pile whose things were added under names a file cannot carry. */
    async function destinations(o: { hooks?: Hooks } = {}) {
      const w = await bWorld(o);
      const projects = (await foldersIn(w, w.rootId, 'Projects'))[0];
      if (!projects) throw new Error('no Projects folder');
      await w.drive.trash(projects.id);
      await w.uploader.addPile({ text: 'Deposit for the lease', items: [pdf('Deposit 1/2.pdf'), pdf('Deposit 2/2.pdf')] });
      await w.uploader.settled();
      const files = (await w.drive.listAll(w.rootId)).filter((f) => !f.folder && f.name.startsWith('Deposit'));
      return { ...w, deposits: files.map((f) => f.id).sort() };
    }

    it('destinations are planned once on the recoverable path', async () => {
      const w = await destinations();
      const out = await plan(w);
      expect(out).toMatchObject({ path: 'b' });
      if (out.path !== 'b') return;
      const ops = out.manifest.operations;
      // Each folder of the chain is one create-folder, keyed once, made inside the one before it.
      const made = ops.filter((o) => o.effect.kind === 'create-folder');
      const projectsOp = made.find((o) => o.effect.kind === 'create-folder' && o.effect.name === 'Projects');
      const flatOp = made.find((o) => o.effect.kind === 'create-folder' && o.effect.name === 'Flat hunt');
      expect(projectsOp?.effect).toMatchObject({ parent: { fileId: w.rootId } });
      expect(flatOp?.effect).toMatchObject({ parent: { createdBy: projectsOp?.operationId } });
      const keys = made.map((o) => (o.effect.kind === 'create-folder' ? o.effect.createKey : ''));
      expect(new Set(keys).size).toBe(keys.length);
      // The move carries the name the file can have there, not the name shown in the Inbox.
      for (const id of w.deposits) {
        const move = ops.find((o) => o.effect.kind === 'move' && o.effect.before.fileId === id);
        expect(move?.effect).toMatchObject({ parent: { createdBy: flatOp?.operationId } });
        const name = move?.effect.kind === 'move' ? move.effect.name : '';
        expect(name === 'Deposit 1 - 2.pdf' || name === 'Deposit 2 - 2.pdf', name).toBe(true);
      }

      // A lost reply on each folder and on one move: recovery reconciles them by evidence, sending none again.
      const [first] = w.deposits;
      w.rules.push(once(isFolderCall('Projects'), 'lose-reply'), once(isFolderCall('Flat hunt'), 'lose-reply'), once(isMoveOf(first ?? ''), 'lose-reply'));
      const admitted = await w.worker.process('all');
      await w.runs.settled();
      for (let i = 0; i < 8 && (await w.worker.status())?.phase !== 'done'; i++) {
        w.clock.later();
        await after(w.worker, w.runs);
      }
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      expect(w.calls.filter(isFolderCall('Projects'))).toHaveLength(1);
      expect(w.calls.filter(isFolderCall('Flat hunt'))).toHaveLength(1);
      const [projects, ...moreProjects] = await foldersIn(w, w.rootId, 'Projects');
      expect(moreProjects).toEqual([]);
      const [flat, ...moreFlats] = await foldersIn(w, projects?.id ?? '', 'Flat hunt');
      expect(moreFlats).toEqual([]);
      for (const id of w.deposits) {
        expect(movesOf(w, id), `moves of ${id}`).toBe(1);
        const ev = await w.drive.evidence(id);
        expect(ev?.file.parents).toEqual([flat?.id]);
      }
      const names = (await Promise.all(w.deposits.map((id) => w.drive.evidence(id)))).map((ev) => ev?.file.name).sort();
      expect(names).toEqual(['Deposit 1 - 2.pdf', 'Deposit 2 - 2.pdf']);
      const filed = viewOf(w)?.run.report?.filed.filter((f) => f.to === 'Projects/Flat hunt').map((f) => f.title).sort();
      expect(filed).toEqual(['Deposit 1 - 2', 'Deposit 2 - 2', 'inventory', 'lease']);
    });
  });

  // b-path-generated-note (TL-P2-17): an empty pile's words and a filed thing's own note are B create-text operations.
  describe('generated notes take the recoverable path', () => {
    const WORDS = 'Bins go out on Tuesday nights';
    const OFFER = 'Offer_letter_final(2).pdf';
    const COMPANION = 'Projects/Job hunt/Applications/Industrial Designer, Ferrowick.md';
    const plan = (w: { drive: FakeDrive; rootId: string }) =>
      planRun(w.drive, w.rootId, { scope: 'all', allowWeb: false, runId: 'run-plan', requestId: 'request-plan', requestedAt: Date.now() });
    type CreateText = Extract<OperationV2['effect'], { kind: 'create-text' }>;
    const createsOf = (ops: readonly OperationV2[]): Array<OperationV2 & { effect: CreateText }> =>
      ops.filter((o): o is OperationV2 & { effect: CreateText } => o.effect.kind === 'create-text');
    const isCreateOf = (name: string) => (call: FencedCall): boolean => call.op === 'create-text' && call.name === name;
    const folderAt = async (w: { drive: FakeDrive; rootId: string }, path: string): Promise<DriveFile | undefined> =>
      (await w.drive.listAll(w.rootId)).find((f) => f.folder && w.drive.pathOf(f.id, w.rootId) === path);

    /** The template with a pile of words only, a pile holding the offer letter, and a note of Alex's where the words would go. */
    async function generating(o: { hooks?: Hooks } = {}) {
      const w = await bWorld(o);
      const pile = await w.uploader.addPile({ text: WORDS, items: [] });
      await w.uploader.settled();
      const inbox = await folderAt(w, 'Inbox');
      const offer = await w.drive.createFolder(inbox?.id ?? '', 'Offer');
      await w.drive.createText(offer.id, OFFER, '%PDF offer');
      await w.drive.createText(offer.id, 'other.pdf', '%PDF other');
      const resources = await folderAt(w, 'Resources');
      const ideas = await w.drive.createFolder(resources?.id ?? '', 'Ideas');
      const alex = await w.drive.createText(ideas.id, `${WORDS}.md`, 'Alex wrote this one.');
      return { ...w, pileId: pile.id, ideas, alex };
    }

    it('a generated note is created once through the recoverable path', async () => {
      const w = await generating();
      const out = await plan(w);
      expect(out).toMatchObject({ path: 'b' });
      if (out.path !== 'b') return;
      const creates = createsOf(out.manifest.operations);
      // The words get a name of their own beside Alex's note; the offer letter gets its note; both keyed, both generated.
      expect(creates.map((o) => [o.effect.name, o.effect.purpose]).sort()).toEqual([[`${WORDS} (2).md`, 'generated'], ['Industrial Designer, Ferrowick.md', 'generated']]);
      expect(new Set(creates.map((o) => o.effect.createKey)).size).toBe(2);
      const words = creates.find((o) => o.effect.name === `${WORDS} (2).md`);
      expect(words?.effect.parent).toEqual({ fileId: w.ideas.id });
      // The pile's folder goes to the Bin only after its words are written.
      const bin = out.manifest.operations.find((o) => o.effect.kind === 'bin' && o.effect.capturedChildIds.length === 1);
      expect(bin?.dependsOn).toContain(words?.operationId);

      // Both replies are lost: recovery finds each note by its key and never writes it again.
      w.rules.push(once(isCreateOf(`${WORDS} (2).md`), 'lose-reply'), once(isCreateOf('Industrial Designer, Ferrowick.md'), 'lose-reply'));
      const admitted = await w.worker.process('all');
      await w.runs.settled();
      for (let i = 0; i < 8 && (await w.worker.status())?.phase !== 'done'; i++) {
        w.clock.later();
        await after(w.worker, w.runs);
      }
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      const [manifest] = await manifestsOf(w);
      for (const op of createsOf(manifest?.operations ?? [])) {
        expect(w.calls.filter(isCreateOf(op.effect.name)), op.effect.name).toHaveLength(1);
        const made = (await w.drive.listAll(w.rootId)).filter((f) => !f.folder && f.name === op.effect.name);
        expect(made, op.effect.name).toHaveLength(1);
        expect(made[0]?.appProperties).toEqual({ by: 'bower', bowerNew: '1', bowerItem: op.effect.createKey });
        expect(w.drive.dump(w.rootId).get(w.drive.pathOf(made[0]?.id ?? '', w.rootId))).toBe(op.effect.text);
      }
      expect(w.drive.dump(w.rootId).get(`Resources/Ideas/${WORDS}.md`)).toBe('Alex wrote this one.');
      const report = viewOf(w)?.run.report;
      expect(report?.created).toEqual(expect.arrayContaining([
        { path: `Resources/Ideas/${WORDS} (2).md`, what: 'Written from a note you added.' },
        { path: COMPANION, what: 'A note for Offer, Industrial Designer, Ferrowick.pdf.' },
      ]));
      expect(report?.filed).toContainEqual({ name: 'Your note', title: `${WORDS} (2)`, kind: 'note', to: 'Resources/Ideas', note: `Resources/Ideas/${WORDS} (2).md` });
      expect(report?.filed.find((f) => f.name === OFFER)).toMatchObject({ to: 'Projects/Job hunt/Applications' });
      expect((await new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set(), device: 'DEVICE_B' }).piles()).some((p) => p.id === w.pileId)).toBe(false);
    });

    it('a lookalike note at the planned place is never taken as ours: the words stay in the inbox', async () => {
      let drive: FakeDrive | null = null;
      let ideas = '';
      const hooks: Hooks = {
        beforeDispatch: async (at) => {
          if (!drive || at.effect.kind !== 'create-text' || at.effect.name !== `${WORDS} (2).md`) return;
          // Alex makes a note with that very name after Bower planned it.
          await drive.createText(ideas, at.effect.name, 'Alex got there first.');
        },
      };
      const w = await generating({ hooks });
      drive = w.drive;
      ideas = w.ideas.id;
      const admitted = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      expect(w.drive.dump(w.rootId).get(`Resources/Ideas/${WORDS} (2).md`)).toBe('Alex got there first.');
      expect(w.applied.filter(isCreateOf(`${WORDS} (2).md`))).toEqual([]);
      const report = viewOf(w)?.run.report;
      expect(report?.filed.map((f) => f.name)).not.toContain('Your note');
      expect(report?.setAside.map((s) => s.why)).toContain('Bower could not write a note from it, so it stays in your inbox.');
      expect((await new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set(), device: 'DEVICE_B' }).piles()).some((p) => p.id === w.pileId)).toBe(true);
    });

    // TL-P2-34 (1): a thing filed without its own note keeps its filed row, plus one sentence about the note.
    it("a thing filed without its note says Bower couldn't write its note", async () => {
      let drive: FakeDrive | null = null;
      let rootId = '';
      const hooks: Hooks = {
        beforeDispatch: async (at) => {
          if (!drive || at.effect.kind !== 'create-text' || at.effect.name !== 'Industrial Designer, Ferrowick.md') return;
          // Alex makes a note with that very name after Bower planned it: Bower's is not written.
          const folder = (await drive.listAll(rootId)).find((f) => f.folder && drive?.pathOf(f.id, rootId) === 'Projects/Job hunt/Applications');
          await drive.createText(folder?.id ?? '', at.effect.name, 'Alex got there first.');
        },
      };
      const w = await generating({ hooks });
      drive = w.drive;
      rootId = w.rootId;
      const admitted = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      expect(w.drive.dump(w.rootId).get(COMPANION)).toBe('Alex got there first.');
      const report = viewOf(w)?.run.report;
      expect(report?.filed.find((f) => f.name === OFFER)).toMatchObject({ to: 'Projects/Job hunt/Applications' });
      expect(report?.setAside.filter((row) => row.name === OFFER)).toEqual([{ name: OFFER, why: "Bower couldn't write its note." }]);
    });
  });

  // b-path-context-restore (TL-P2-32 1): the runner never writes into the Inbox; a pile whose context note is missing
  // waits, held (TL-P2-21), until the app writes it again from its first words (TL-P2-08 b).
  describe('a pile waiting for its context note takes the recoverable path', () => {
    const plan = (w: { drive: FakeDrive; rootId: string }) =>
      planRun(w.drive, w.rootId, { scope: 'all', allowWeb: false, runId: 'run-plan', requestId: 'request-plan', requestedAt: Date.now() });

    it('a pile waiting for its context note is held, never restored by the runner', async () => {
      const w = await bWorld({ declared: true });
      const lease = (await w.uploader.piles()).find((p) => p.text === 'Papers about the lease');
      const folder = (await w.drive.listAll(w.rootId)).find((f) => f.folder && w.drive.pathOf(f.id, w.rootId) === lease?.path);
      if (!lease || !folder) throw new Error('no lease pile');
      const note = (await w.drive.listAll(folder.id)).find((f) => f.parents[0] === folder.id && f.name === 'Pile note.md');
      if (!note) throw new Error('no pile note');
      const key = note.appProperties?.bowerItem;
      // The note goes to the Bin in Drive, not through Bower: nothing in your changes says it was removed.
      await w.drive.trash(note.id);
      const children = async (): Promise<string> => JSON.stringify((await w.drive.listAll(folder.id)).filter((f) => f.parents[0] === folder.id).map((f) => [f.id, f.name, f.modifiedTime]));
      const before = await children();

      const out = await plan(w);
      expect(out).toMatchObject({ path: 'b' });
      if (out.path !== 'b') return;
      expect(out.manifest.capture.piles.map((p) => p.anchor?.fileId)).not.toContain(folder.id);

      const admitted = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      // Nothing written into the pile, nothing of it moved or put in the Bin, and no report row for it.
      expect(w.applied.filter((c) => (c.op === 'create-text' || c.op === 'create-folder') && c.parentId === folder.id)).toEqual([]);
      expect(await children()).toBe(before);
      expect((await w.drive.evidence(folder.id))?.trashed).toBe(false);
      const report = viewOf(w)?.run.report;
      expect(report?.filed.map((f) => f.name).sort()).toEqual(['idea one.pdf', 'idea two.pdf']);
      expect(report?.setAside).toEqual([]);

      // The Inbox says why it waits; Try again writes the note again from its first words, in the app.
      const device = new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set(), declarePiles: true, device: 'DEVICE_B' });
      expect((await device.piles()).find((p) => p.id === lease.id)?.setAside).toBe('not-arrived');
      await device.retryPile(lease.id);
      const back = (await w.drive.listAll(folder.id)).filter((f) => f.parents[0] === folder.id && f.appProperties?.bowerItem === key);
      expect(back).toHaveLength(1);
      expect(await w.drive.readText(back[0]?.id ?? '')).toBe('Papers about the lease');
    });
  });

  // b-path-pile-notes-only (TL-P2-32 1): a pile of notes only is an ordinary note pile on the B path.
  describe('a pile of notes only takes the recoverable path', () => {
    const plan = (w: { drive: FakeDrive; rootId: string }) =>
      planRun(w.drive, w.rootId, { scope: 'all', allowWeb: false, runId: 'run-plan', requestId: 'request-plan', requestedAt: Date.now() });
    const generatedNotes = async (w: { drive: FakeDrive; rootId: string }): Promise<string[]> =>
      (await w.drive.listAll(w.rootId)).filter((f) => !f.folder && f.appProperties?.by === 'bower' && w.drive.pathOf(f.id, w.rootId).startsWith('Resources/')).map((f) => w.drive.pathOf(f.id, w.rootId)).sort();

    it('a pile of notes only is filed through the recoverable path', async () => {
      const w = await bWorld();
      const inbox = (await w.drive.listAll(w.rootId)).find((f) => f.folder && f.name === 'Inbox' && f.parents[0] === w.rootId);
      const folder = await w.drive.createFolder(inbox?.id ?? '', 'Notes');
      const first = await w.drive.createText(folder.id, 'Pile note.md', 'Bins go out on Tuesday nights');
      const second = await w.drive.createText(folder.id, 'Pile note.md', 'Recycling on Fridays');

      const out = await plan(w);
      expect(out.path === 'legacy' ? out.why : out.path).toBe('b');
      if (out.path !== 'b') return;
      // The first note is the context, written as one generated note; the other is an uncaptured child.
      const pile = out.manifest.capture.piles.find((p) => p.anchor?.fileId === folder.id);
      expect(pile?.childFileIds).toEqual([first.id]);
      const creates = out.manifest.operations.filter((o) => o.effect.kind === 'create-text');
      expect(creates.map((o) => (o.effect.kind === 'create-text' ? [o.effect.name, o.effect.purpose] : []))).toEqual([['Bins go out on Tuesday nights.md', 'generated']]);

      const admitted = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      expect(await generatedNotes(w)).toEqual(['Resources/Ideas/Bins go out on Tuesday nights.md']);
      expect(viewOf(w)?.run.report?.filed).toContainEqual({ name: 'Your note', title: 'Bins go out on Tuesday nights', kind: 'note', to: 'Resources/Ideas', note: 'Resources/Ideas/Bins go out on Tuesday nights.md' });
      // The folder stays with the other note (late-child rule); the words it filed are not in it any more.
      expect((await w.drive.evidence(folder.id))?.trashed).toBe(false);
      expect((await w.drive.listAll(folder.id)).filter((f) => f.parents[0] === folder.id).map((f) => f.id)).toEqual([second.id]);
      expect(await w.drive.readText(second.id)).toBe('Recycling on Fridays');

      // The next run files the other note's words once, and never the first ones again.
      w.clock.later();
      const next = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: next.id, phase: 'done' });
      expect(await generatedNotes(w)).toEqual(['Resources/Ideas/Bins go out on Tuesday nights.md', 'Resources/Ideas/Recycling on Fridays.md']);
      expect((await w.drive.evidence(folder.id))?.trashed).toBe(true);
    });
  });

  // Review b-dest-review-1: what a plan names and writes must always encode, and a pile that cannot be held alone.
  describe('destinations and generated notes hold under review', () => {
    const plan = (w: { drive: FakeDrive; rootId: string }) =>
      planRun(w.drive, w.rootId, { scope: 'all', allowWeb: false, runId: 'run-plan', requestId: 'request-plan', requestedAt: Date.now() });

    it('a generated note never splits a character, and a pile Bower cannot write down is held alone', async () => {
      const w = await bWorld();
      const long = `${'a'.repeat(47)}😀 more`;
      await w.uploader.addPile({ text: long, items: [] });
      await w.uploader.settled();
      // A pile note whose text no record can carry (half of a character): only that pile waits.
      const inbox = (await w.drive.listAll(w.rootId)).find((f) => f.folder && f.name === 'Inbox' && f.parents[0] === w.rootId);
      const broken = await w.drive.createFolder(inbox?.id ?? '', 'Broken');
      await w.drive.createText(broken.id, 'Pile note.md', 'Bins go out \ud800 on Tuesday nights');

      // Planning never throws for the whole run.
      const planned = await plan(w).then((value) => ({ value }), (e: unknown) => ({ thrown: e }));
      expect(planned).toMatchObject({ value: { path: 'b' } });
      if (!('value' in planned)) return;
      const out = planned.value;
      if (out.path !== 'b') return;
      const names = out.manifest.operations.flatMap((o) => (o.effect.kind === 'create-text' ? [o.effect.name] : []));
      expect(names).toEqual([`${'a'.repeat(47)}😀.md`]);
      expect(out.manifest.capture.piles.map((p) => p.anchor?.fileId)).not.toContain(broken.id);

      const admitted = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      expect(viewOf(w)?.run.report?.filed.map((f) => f.name).sort()).toEqual(['Your note', 'idea one.pdf', 'idea two.pdf', 'inventory.pdf', 'lease.pdf']);
      expect((await w.drive.evidence(broken.id))?.trashed).toBe(false);
      expect(bowerErrors(w).length).toBeGreaterThan(0);
    });

    // TL-P2-21: a held pile always has a reason the Inbox shows; the runner and the Inbox agree through readiness.
    it('a pile Bower cannot write down is held with a reason the Inbox shows', async () => {
      /** Half of a character in a pile note's words, or in its front matter only: no record can carry either. */
      const NOTES = { words: 'Bins go out \ud800 on Tuesday nights', front: '---\nsummary: Bins \ud800\n---\nBins go out on Tuesday nights\n' };
      const brokenPile = async (w: World, where: keyof typeof NOTES = 'words'): Promise<DriveFile> => {
        const inbox = (await w.drive.listAll(w.rootId)).find((f) => f.folder && f.name === 'Inbox' && f.parents[0] === w.rootId);
        const folder = await w.drive.createFolder(inbox?.id ?? '', 'Broken');
        await w.drive.createText(folder.id, 'Pile note.md', NOTES[where]);
        await w.drive.createText(folder.id, 'bins.pdf', '%PDF bins');
        return folder;
      };
      /** Every name, place and byte of a folder and what is in it. */
      const stateOf = async (w: World, id: string): Promise<string> => JSON.stringify(await Promise.all((await w.drive.listAll(w.rootId))
        .filter((f) => f.id === id || f.parents[0] === id).map(async (f) => [f.id, f.name, f.parents, f.modifiedTime, f.folder ? null : await w.drive.readText(f.id)])));
      const inboxOf = (w: World) => new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set(), device: 'DEVICE_B' }).piles();

      for (const where of ['words', 'front'] as const) {
        // Beside other piles: the others are filed, the held pile shows why it waits and is left as it was.
        const w = await bWorld();
        const broken = await brokenPile(w, where);
        const before = await stateOf(w, broken.id);
        expect((await inboxOf(w)).find((p) => p.path === `Inbox/${broken.name}`)?.setAside, where).toBe('not-checked');
        const admitted = await w.worker.process('all');
        await w.runs.settled();
        expect(await w.worker.status(), where).toMatchObject({ id: admitted.id, phase: 'done' });
        expect(viewOf(w)?.run.report?.filed.map((f) => f.name).sort(), where).toEqual(['idea one.pdf', 'idea two.pdf', 'inventory.pdf', 'lease.pdf']);
        expect(await stateOf(w, broken.id), where).toBe(before);
        expect((await inboxOf(w)).find((p) => p.path === `Inbox/${broken.name}`)?.setAside, where).toBe('not-checked');

        // Alone: the Inbox shows the reason, and the tidy-up says honestly that nothing is ready, touching nothing.
        const alone = await bWorld();
        const sources = new Set(alone.sources);
        for (const p of await alone.uploader.piles()) {
          const folder = (await alone.drive.listAll(alone.rootId)).find((f) => f.folder && alone.drive.pathOf(f.id, alone.rootId) === p.path);
          if (folder && p.items.some((i) => sources.has(i.id))) await alone.drive.trash(folder.id);
        }
        const only = await brokenPile(alone, where);
        const kept = await stateOf(alone, only.id);
        expect((await inboxOf(alone)).map((p) => [p.path, p.setAside]), where).toEqual([[`Inbox/${only.name}`, 'not-checked']]);
        await expect(alone.worker.process('all'), where).rejects.toThrow('Nothing in the inbox is ready yet.');
        expect(await stateOf(alone, only.id), where).toBe(kept);
      }
    });

    // Review of 11e1a76: only the note a run records is read and checked (an observed pile's first, a declared pile's
    // context note), by the tidy-up and the Inbox alike; another pile note is an uncaptured child, never read.
    it('checks only the pile note a tidy-up records, in the Inbox and the tidy-up alike', async () => {
      const inboxOf = (w: World) => new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set(), declarePiles: true, device: 'DEVICE_B' }).piles();
      const leaseOf = async (w: World): Promise<{ pileId: string; folder: DriveFile }> => {
        const pile = (await w.uploader.piles()).find((p) => p.text === 'Papers about the lease');
        const folder = (await w.drive.listAll(w.rootId)).find((f) => f.folder && w.drive.pathOf(f.id, w.rootId) === pile?.path);
        if (!pile || !folder) throw new Error('no lease pile');
        return { pileId: pile.id, folder };
      };
      const captured = (out: Awaited<ReturnType<typeof plan>>, folder: DriveFile): boolean =>
        out.path === 'b' && out.manifest.capture.piles.some((p) => p.anchor?.fileId === folder.id);

      // A second pile note with half a character: the pile is filed, the second note stays in its folder.
      const broken = await bWorld();
      const a = await leaseOf(broken);
      await broken.drive.createText(a.folder.id, 'Pile note.md', 'second \ud800 note');
      expect((await inboxOf(broken)).find((p) => p.id === a.pileId)?.setAside, 'broken second note, Inbox').toBeUndefined();
      expect(captured(await plan(broken), a.folder), 'broken second note, tidy-up').toBe(true);
      await broken.worker.process('all');
      await broken.runs.settled();
      expect(viewOf(broken)?.run.report?.filed.map((f) => f.name), 'broken second note, filed').toEqual(expect.arrayContaining(['lease.pdf', 'inventory.pdf']));

      // A second pile note that cannot be read: it is never read, so the run goes on.
      const unread = await bWorld();
      const b = await leaseOf(unread);
      const second = await unread.drive.createText(b.folder.id, 'Pile note.md', 'second note');
      const real = unread.drive.readText.bind(unread.drive);
      vi.spyOn(unread.drive, 'readText').mockImplementation(async (id) => {
        if (id === second.id) throw driveError('offline');
        return real(id);
      });
      expect(captured(await plan(unread), b.folder), 'unreadable second note').toBe(true);

      // A declared pile whose context note is not the first: checked on its context note, in both places.
      const declared = await bWorld({ declared: true });
      const c = await leaseOf(declared);
      const context = (await declared.drive.listAll(c.folder.id)).find((f) => f.parents[0] === c.folder.id && f.name === 'Pile note.md');
      const key = context?.appProperties?.bowerItem;
      if (!context || !key) throw new Error('no context note');
      await declared.drive.createText(c.folder.id, 'Pile note.md', 'an unbound note, listed first');
      await declared.drive.trash(context.id);
      await declared.drive.createText(c.folder.id, 'Pile note.md', '---\nsummary: Papers \ud800\n---\nPapers about the lease', { bowerItem: key });
      expect((await inboxOf(declared)).find((p) => p.id === c.pileId)?.setAside, 'declared context, Inbox').toBe('not-checked');
      expect(captured(await plan(declared), c.folder), 'declared context, tidy-up').toBe(false);
    });

    it('grounds the root only as the parent of a folder the run makes', async () => {
      const w = await bWorld();
      const out = await plan(w);
      expect(out.path).toBe('b');
      if (out.path !== 'b') return;
      expect(grounded(out.manifest)).toBe(true);
      // A filing move straight into the root, its row saying it went to '': never a verified destination.
      const m = structuredClone(out.manifest);
      const member = new Set(m.capture.members.map((x) => x.file.fileId));
      const move = m.operations.find((o) => o.effect.kind === 'move' && member.has(o.effect.before.fileId));
      if (!move || move.effect.kind !== 'move') throw new Error('no filing move');
      move.effect.parent = { fileId: w.rootId };
      const row = m.reportPlan.find((c) => c.when === 'applied' && c.requires[0] === move.operationId);
      const filed = row?.value.filed[0];
      if (!row || !filed) throw new Error('no filed row');
      row.requires = [move.operationId];
      filed.to = '';
      expect(grounded(m)).toBe(false);
    });

    it('grounds a generated note only under a main folder', async () => {
      const w = await bWorld();
      await w.uploader.addPile({ text: 'Bins go out on Tuesday nights', items: [] });
      await w.uploader.settled();
      const out = await plan(w);
      expect(out.path).toBe('b');
      if (out.path !== 'b') return;
      expect(grounded(out.manifest)).toBe(true);
      const listing = await w.drive.listAll(w.rootId);
      const at = (path: string): DriveFile | undefined => listing.find((f) => f.folder && w.drive.pathOf(f.id, w.rootId) === path);
      /** The same plan with the words' note made straight in `path` ('' is the root), its rows saying so. */
      const placed = (path: string): boolean => {
        const m = structuredClone(out.manifest);
        const op = m.operations.find((o) => o.effect.kind === 'create-text');
        if (!op || op.effect.kind !== 'create-text') throw new Error('no generated note');
        const folder = path ? at(path) : undefined;
        if (path && !folder) throw new Error(`no ${path}`);
        op.effect.parent = { fileId: folder?.id ?? w.rootId };
        if (folder) m.capture.places.push({ file: { fileId: folder.id, name: folder.name, parents: [...folder.parents], folder: true, modifiedTime: folder.modifiedTime }, path });
        const note = path ? `${path}/${op.effect.name}` : op.effect.name;
        for (const c of m.reportPlan.filter((x) => x.requires[0] === op.operationId && x.when === 'applied')) {
          c.requires = [op.operationId];
          c.value.created = [{ path: note, what: c.value.created[0]?.what ?? '' }];
          c.value.filed = c.value.filed.map((f) => ({ ...f, to: path, note }));
        }
        return grounded(m);
      };
      expect(placed('Resources'), 'a main folder').toBe(true);
      expect(placed(''), 'the root').toBe(false);
      expect(placed('Inbox'), 'the Inbox').toBe(false);
      expect(placed('.bower'), '.bower').toBe(false);
    });

    it('recovers a generated note whose new mark was cleared after its reply was lost', async () => {
      const w = await bWorld();
      const words = 'Bins go out on Tuesday nights';
      await w.uploader.addPile({ text: words, items: [] });
      await w.uploader.settled();
      const isWords = (call: FencedCall): boolean => call.op === 'create-text' && call.name === `${words}.md`;
      w.rules.push(once(isWords, 'lose-reply'));
      const admitted = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'saving' });
      const made = (await w.drive.listAll(w.rootId)).filter((f) => !f.folder && f.name === `${words}.md`);
      expect(made).toHaveLength(1);
      // The mark goes before recovery (opened elsewhere): the key, place and bytes still prove the note is this one.
      await w.drive.update(made[0]?.id ?? '', { appProperties: { bowerNew: null } });
      for (let i = 0; i < 5 && (await w.worker.status())?.phase !== 'done'; i++) {
        w.clock.later();
        await after(w.worker, w.runs);
      }
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      expect(w.calls.filter(isWords)).toHaveLength(1);
      expect((await w.drive.listAll(w.rootId)).filter((f) => !f.folder && f.name === `${words}.md`)).toHaveLength(1);
      expect(viewOf(w)?.run.report?.filed.map((f) => f.name)).toContain('Your note');
    });
  });

  // o5-timeline-append (TL-P2-20 B.2, TL-P2-26): a hub note's Timeline line is a v2 `edit-text` authored by `applyChanges`.
  describe('a Timeline line is added once and keeps the rest of the note', () => {
    const FLAT = 'Projects/Flat hunt/Flat hunt.md';
    const JOB = 'Projects/Job hunt/Job hunt.md';
    const FLAT_WHAT = 'A fourth flat added; the shortlist compared by commute.';
    const JOB_WHAT = 'New offer from Ferrowick, scored 7 out of 10 against your CV.';
    type Where = { drive: FakeDrive; rootId: string };
    type Edit = OperationV2 & { effect: EditText };

    /** A legacy note of Bower's (`by: bower`), LF, with the given Timeline lines. */
    const legacyHub = (timeline: string[]): string => [
      '---', 'summary: Flats we looked at.', 'by: bower', '---', '', 'Your own words about the flats.', '- [ ] Ask about the deposit', '',
      '## Timeline', ...timeline, '', "## Bower's note", 'Three flats so far.', '',
    ].join('\n');
    const marker = (edge: 'begin' | 'end', owner: string): string => `<!-- bower:ownership/2 ${edge} ${owner} -->`;
    /** An ownership/2 note, CRLF, with the given Timeline payload lines. */
    const v2Hub = (timeline: string[]): string => [
      '---', 'bower_format: ownership/2', 'summary: Offers so far.', '---',
      marker('begin', 'current'), '## Current state', '- Two offers open', marker('end', 'current'), '',
      marker('begin', 'personal'), 'My own notes on the offers.', '- [ ] Reply to the recruiter', marker('end', 'personal'), '',
      marker('begin', 'timeline'), ...timeline, marker('end', 'timeline'), '',
      marker('begin', 'bower-note'), "## Bower's note", 'Compare by salary.', marker('end', 'bower-note'), '',
    ].join('\r\n');
    const FLAT_BEFORE = legacyHub(['- 2026-10-01 · Started the flat hunt.']);
    const JOB_BEFORE = v2Hub(['## Timeline', '- 2026-10-02 · First offer in.']);
    /** The UTC calendar day of a time, as the contract writes Timeline dates. */
    const day = (at: number): string => new Date(at).toISOString().slice(0, 10);

    /** A hub note at `path` (its folder made under Projects) with exactly these bytes. */
    async function hub(w: Where, path: string, text: string): Promise<DriveFile> {
      const listing = await w.drive.listAll(w.rootId);
      const projects = listing.find((f) => f.folder && f.name === 'Projects' && f.parents[0] === w.rootId);
      const folder = await w.drive.createFolder(projects?.id ?? '', path.split('/')[1] ?? '');
      return w.drive.createText(folder.id, path.split('/')[2] ?? '', text);
    }
    const manifestsV2 = async (w: Where): Promise<ManifestV2[]> =>
      (await recordsOf(w)).filter((r) => r.name.startsWith('manifest-')).map((r) => JSON.parse(r.text) as ManifestV2);
    type Ops = { operations: readonly OperationV2[] } | undefined;
    const editsOf = (m: Ops): Edit[] => (m?.operations ?? []).filter((o): o is Edit => o.effect.kind === 'edit-text');
    const touching = (m: Ops, id: string): OperationV2[] => (m?.operations ?? []).filter((o) => 'before' in o.effect && o.effect.before.fileId === id);
    const writesTo = (calls: FencedCall[], id: string): FencedCall[] => calls.filter((c) => c.op === 'write-text' && c.id === id);
    const textAt = (w: Where, path: string): string | undefined => w.drive.dump(w.rootId).get(path);
    const runPlan = (w: Where) => planRun(w.drive, w.rootId, { scope: 'all', allowWeb: false, runId: 'run-plan', requestId: 'request-plan', requestedAt: Date.now() });
    /** A world whose dispatches a test can act on, right before each one passes the boundary. */
    function acting(): { hooks: Hooks; act: { at: ((at: DispatchAt) => Promise<void>) | null } } {
      const act: { at: ((at: DispatchAt) => Promise<void>) | null } = { at: null };
      return { act, hooks: { beforeDispatch: async (at) => { await act.at?.(at); } } };
    }
    const isEditOf = (path: string) => (at: DispatchAt): boolean => at.effect.kind === 'edit-text' && at.effect.path === path;
    const outcomeOf = async (w: Where, runId: string, op: OperationV2 | undefined) => (await checkpointsOf(w, runId)).at(-1)?.outcomes[op?.ordinal ?? -1];

    it('adds the line inside each Timeline byte for byte, marks the note new, reports it, and never adds it again', async () => {
      const w = await bWorld();
      const flat = await hub(w, FLAT, FLAT_BEFORE);
      const job = await hub(w, JOB, JOB_BEFORE);
      const admitted = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });

      // A v2 manifest: one edit-text per hub note, its Timeline line dated from requestedAt (UTC).
      const [manifest, ...others] = await manifestsV2(w);
      expect(others).toEqual([]);
      expect(manifest?.v).toBe(2);
      const date = day(manifest?.requestedAt ?? 0);
      const edits = editsOf(manifest);
      expect(edits.map((o) => ({ path: o.effect.path, fileId: o.effect.before.fileId, changes: o.effect.changes, dependsOn: o.dependsOn }))).toEqual([
        { path: FLAT, fileId: flat.id, changes: [{ kind: 'timeline-append', recordIds: [], entries: [{ date, text: FLAT_WHAT, source: null }] }], dependsOn: [] },
        { path: JOB, fileId: job.id, changes: [{ kind: 'timeline-append', recordIds: [], entries: [{ date, text: JOB_WHAT, source: null }] }], dependsOn: [] },
      ]);
      // Each edited note: recorded as a captured place, one in-place "new" move after its edit, one updated row on it.
      for (const [edit, file, what] of [[edits[0], flat, FLAT_WHAT], [edits[1], job, JOB_WHAT]] as const) {
        expect(manifest?.capture.places).toContainEqual({ file: edit?.effect.before, path: edit?.effect.path });
        const [, mark, ...more] = touching(manifest, file.id);
        expect(more).toEqual([]);
        expect(mark).toMatchObject({ dependsOn: [edit?.operationId], effect: { kind: 'move', parent: { fileId: file.parents[0] }, name: file.name, properties: { bowerNew: '1' } } });
        expect(manifest?.reportPlan.filter((c) => c.value.updated.length)).toContainEqual({
          requires: [edit?.operationId], when: 'applied', value: { filed: [], created: [], updated: [{ path: edit?.effect.path, what }], setAside: [], questions: [] },
        });
      }
      if (!manifest) return;
      expect(grounded(manifest)).toBe(true);
      // An updated row that no applied Timeline line backs is never grounded.
      const row = manifest.reportPlan.findIndex((c) => c.value.updated.length);
      const plan = (patch: Partial<ReportContribution['value']>, requires?: string[]): ManifestV2 => ({
        ...manifest, reportPlan: manifest.reportPlan.map((c, i) => (i === row ? { ...c, ...(requires ? { requires } : {}), value: { ...c.value, ...patch } } : c)),
      });
      expect(grounded(plan({ updated: [{ path: 'Projects/Elsewhere.md', what: FLAT_WHAT }] }))).toBe(false);
      expect(grounded(plan({ updated: [{ path: FLAT, what: 'Something else.' }] }))).toBe(false);
      const move = manifest.operations.find((o) => o.effect.kind === 'move');
      expect(grounded(plan({}, [move?.operationId ?? '']))).toBe(false);

      // Only the Timeline payload changed: every other byte, line ending and the personal words are as they were.
      expect(textAt(w, FLAT)).toBe(legacyHub(['- 2026-10-01 · Started the flat hunt.', `- ${date} · ${FLAT_WHAT}`]));
      expect(textAt(w, JOB)).toBe(v2Hub(['## Timeline', '- 2026-10-02 · First offer in.', `- ${date} · ${JOB_WHAT}`]));
      for (const file of [flat, job]) {
        expect(writesTo(w.applied, file.id)).toHaveLength(1);
        expect((await w.drive.evidence(file.id))?.file.appProperties?.bowerNew).toBe('1');
      }
      expect(viewOf(w)?.run.report?.updated).toEqual([{ path: FLAT, what: FLAT_WHAT }, { path: JOB, what: JOB_WHAT }]);
      await expectFiledOnce(w);

      // The next tidy-up finds both lines there: a v1 plan with no edit, the notes untouched, nothing reported.
      const flatAfter = textAt(w, FLAT);
      const jobAfter = textAt(w, JOB);
      await w.uploader.addPile({ text: '', items: [pdf('third.pdf'), pdf('fourth.pdf')] });
      await w.uploader.settled();
      const next = await w.worker.process('all');
      expect(next.id).not.toBe(admitted.id);
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: next.id, phase: 'done' });
      const second = (await manifestsV2(w)).find((m) => m.runId === next.id);
      expect(second?.v).toBe(1);
      expect(editsOf(second)).toEqual([]);
      expect(textAt(w, FLAT)).toBe(flatAfter);
      expect(textAt(w, JOB)).toBe(jobAfter);
      for (const file of [flat, job]) expect(writesTo(w.calls, file.id)).toHaveLength(1);
      expect(viewOf(w)?.run.report?.updated).toEqual([]);
    });

    it('skips a line already in the Timeline, even from another day', async () => {
      const w = await bWorld();
      const there = legacyHub(['- 2026-10-01 · Started the flat hunt.', `- 2026-09-30 · ${FLAT_WHAT}`]);
      const flat = await hub(w, FLAT, there);
      const out = await runPlan(w);
      expect(out.path).toBe('b');
      if (out.path !== 'b') return;
      expect(out.manifest.v).toBe(1);
      expect(touching(out.manifest, flat.id)).toEqual([]);
      const admitted = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      expect(textAt(w, FLAT)).toBe(there);
      expect(w.calls.filter((c) => 'id' in c && c.id === flat.id)).toEqual([]);
      expect(viewOf(w)?.run.report?.updated).toEqual([]);
    });

    it("never adds a line to a person's own note", async () => {
      const w = await bWorld();
      const plain = '# Flat hunt\n\nMy own list of flats.\n';
      const mine = '---\nsummary: Offers I keep myself.\n---\n\n## Timeline\n- 2026-10-02 · First offer in.\n';
      const flat = await hub(w, FLAT, plain);
      const job = await hub(w, JOB, mine);
      const out = await runPlan(w);
      expect(out.path).toBe('b');
      if (out.path !== 'b') return;
      expect(out.manifest.v).toBe(1);
      const admitted = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      expect(textAt(w, FLAT)).toBe(plain);
      expect(textAt(w, JOB)).toBe(mine);
      expect(w.calls.filter((c) => 'id' in c && (c.id === flat.id || c.id === job.id))).toEqual([]);
      expect(viewOf(w)?.run.report?.updated).toEqual([]);
      await expectFiledOnce(w);
    });

    it("rejects the edit as a conflict when the note changed after planning, keeping the person's words", async () => {
      const { act, hooks } = acting();
      const w = await bWorld({ hooks });
      const flat = await hub(w, FLAT, FLAT_BEFORE);
      await hub(w, JOB, JOB_BEFORE);
      const theirs = FLAT_BEFORE.replace('Your own words about the flats.', 'Your own words about the flats, and one more.');
      act.at = async (at) => {
        if (at.effect.kind !== 'move' || act.at === null) return;
        act.at = null;
        await w.drive.writeText(flat.id, theirs, (await w.drive.get(flat.id)).modifiedTime);
      };
      const admitted = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      const [manifest] = await manifestsV2(w);
      const [edit, mark] = touching(manifest, flat.id);
      expect(await outcomeOf(w, admitted.id, edit)).toMatchObject({ state: 'rejected', failure: { code: 'conflict' } });
      expect(await outcomeOf(w, admitted.id, mark)).toMatchObject({ state: 'rejected' });
      expect(textAt(w, FLAT)).toBe(theirs);
      expect(w.calls.filter((c) => 'id' in c && c.id === flat.id)).toEqual([]);
      expect((await w.drive.evidence(flat.id))?.file.appProperties?.bowerNew).toBeUndefined();
      expect(viewOf(w)?.run.report?.updated).toEqual([{ path: JOB, what: JOB_WHAT }]);
      await expectFiledOnce(w);
    });

    // Rule 4: the precondition is the content hash of one read plus stillAsSeen (name and place); the write carries
    // the modifiedTime of that read. A newer modifiedTime with the same bytes before that read is no clash; any change
    // after it, even to the same bytes, is.
    it('goes ahead when only the modified time changed before its read, and refuses any change after it', async () => {
      const ahead = acting();
      const w = await bWorld({ hooks: ahead.hooks });
      const flat = await hub(w, FLAT, FLAT_BEFORE);
      let touched = '';
      ahead.act.at = async (at) => {
        if (at.effect.kind !== 'move' || ahead.act.at === null) return;
        ahead.act.at = null;
        touched = (await w.drive.writeText(flat.id, FLAT_BEFORE, (await w.drive.get(flat.id)).modifiedTime)).modifiedTime;
      };
      const admitted = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      const [manifest] = await manifestsV2(w);
      const [edit] = editsOf(manifest);
      expect(touched).not.toBe('');
      expect(touched).not.toBe(edit?.effect.before.modifiedTime);
      expect(writesTo(w.applied, flat.id)).toEqual([expect.objectContaining({ ifModified: touched, text: edit?.effect.text })]);
      expect(textAt(w, FLAT)).toBe(edit?.effect.text);
      expect(await outcomeOf(w, admitted.id, edit)).toMatchObject({ state: 'applied' });

      const after = acting();
      const v = await bWorld({ hooks: after.hooks });
      const late = await hub(v, FLAT, FLAT_BEFORE);
      after.act.at = async (at) => {
        if (!isEditOf(FLAT)(at) || after.act.at === null) return;
        after.act.at = null;
        await v.drive.writeText(late.id, FLAT_BEFORE, (await v.drive.get(late.id)).modifiedTime);
      };
      const second = await v.worker.process('all');
      await v.runs.settled();
      expect(await v.worker.status()).toMatchObject({ id: second.id, phase: 'done' });
      const [plan] = await manifestsV2(v);
      expect(await outcomeOf(v, second.id, editsOf(plan)[0])).toMatchObject({ state: 'rejected', failure: { code: 'conflict' } });
      expect(writesTo(v.applied, late.id)).toEqual([]);
      expect(textAt(v, FLAT)).toBe(FLAT_BEFORE);
      expect(viewOf(v)?.run.report?.updated).toEqual([]);
    });

    // Review M2: a v2 run, and a v2 run whose edit lost its reply, both after the pretend Drive and the service reload.
    it('stays done after a restore, and finishes a lost edit reply after one, with one Timeline line', async () => {
      /** The Drive and the service from a snapshot, a new client on them, and every fenced write the restored Drive sees. */
      async function restored(w: World) {
        const drive = FakeDrive.restore(await w.drive.snapshot());
        const applied: FencedCall[] = [];
        drive.fault = { applied: (call) => { applied.push(call); } };
        const runs = FakeRunService.restore(w.runs.toJSON(), { drive, clock: w.clock.now, scale: 'instant' });
        const worker = new FakeWorker({ drive, scenario: 'first', scale: 'instant', rootId: w.rootId, runs, fresh: false });
        return { drive, rootId: w.rootId, runs, worker, applied };
      }
      async function expectOneLine(r: Awaited<ReturnType<typeof restored>>, id: string, runId: string): Promise<void> {
        expect(await r.worker.status()).toMatchObject({ id: runId, phase: 'done' });
        const [manifest] = await manifestsV2(r);
        const [edit] = editsOf(manifest);
        expect(textAt(r, FLAT)).toBe(edit?.effect.text);
        expect(textAt(r, FLAT)?.split(FLAT_WHAT)).toHaveLength(2);
        expect(viewOf(r)?.run.report?.updated).toEqual([{ path: FLAT, what: FLAT_WHAT }]);
        expect((await r.drive.evidence(id))?.file.appProperties?.bowerNew).toBe('1');
        expect(writesTo(r.applied, id)).toEqual([]);
      }

      const w = await bWorld();
      const flat = await hub(w, FLAT, FLAT_BEFORE);
      const admitted = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      expect(writesTo(w.applied, flat.id)).toHaveLength(1);
      const done = await restored(w);
      expect(await after(done.worker, done.runs)).toMatchObject({ id: admitted.id, phase: 'done' });
      await expectOneLine(done, flat.id, admitted.id);

      const v = await bWorld();
      const late = await hub(v, FLAT, FLAT_BEFORE);
      v.rules.push(once((call) => call.op === 'write-text' && call.id === late.id, 'lose-reply'));
      const cut = await v.worker.process('all');
      await v.runs.settled();
      expect(await v.worker.status()).toMatchObject({ id: cut.id, phase: 'saving' });
      expect(writesTo(v.applied, late.id)).toHaveLength(1);
      const back = await restored(v);
      expect(await back.worker.status()).toMatchObject({ id: cut.id, phase: 'saving' });
      for (let i = 0; i < 4 && (await back.worker.status())?.phase !== 'done'; i++) {
        v.clock.later();
        await after(back.worker, back.runs);
      }
      await expectOneLine(back, late.id, cut.id);
    });

    it('reads a lost reply back: its text is applied once, the old bytes stay possible, anything else stays unresolved', async () => {
      const isWrite = (id: string) => (call: FencedCall): boolean => call.op === 'write-text' && call.id === id;
      /** A run whose write of the Flat hunt note lands and loses its reply; `meanwhile` acts before the recovery. */
      async function lost(meanwhile?: (w: World, id: string) => Promise<void>) {
        const w = await bWorld();
        const flat = await hub(w, FLAT, FLAT_BEFORE);
        w.rules.push(once(isWrite(flat.id), 'lose-reply'));
        const admitted = await w.worker.process('all');
        await w.runs.settled();
        expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'saving' });
        await meanwhile?.(w, flat.id);
        for (let i = 0; i < 4 && (await w.worker.status())?.phase !== 'done'; i++) {
          w.clock.later();
          await after(w.worker, w.runs);
        }
        const [manifest] = await manifestsV2(w);
        return { w, flat, admitted, edit: editsOf(manifest)[0] };
      }
      const reads = (w: World, state: string): boolean => w.errors.mock.calls.some((c) => String(c[0]).includes(`reads back as ${state}`));

      const applied = await lost();
      expect(await applied.w.worker.status()).toMatchObject({ id: applied.admitted.id, phase: 'done' });
      expect(writesTo(applied.w.calls, applied.flat.id)).toHaveLength(1);
      expect(textAt(applied.w, FLAT)).toBe(applied.edit?.effect.text);
      expect(textAt(applied.w, FLAT)?.split(FLAT_WHAT)).toHaveLength(2);
      expect(await outcomeOf(applied.w, applied.admitted.id, applied.edit)).toMatchObject({ state: 'applied' });
      expect(viewOf(applied.w)?.run.report?.updated).toEqual([{ path: FLAT, what: FLAT_WHAT }]);

      const back = async (w: World, id: string, text: string): Promise<void> => {
        await w.drive.writeText(id, text, (await w.drive.get(id)).modifiedTime);
      };
      const before = await lost((w, id) => back(w, id, FLAT_BEFORE));
      const other = FLAT_BEFORE.replace('Three flats so far.', 'Four flats, says Alex.');
      const elsewhere = await lost((w, id) => back(w, id, other));
      for (const [run, text, state] of [[before, FLAT_BEFORE, 'possible-effect'], [elsewhere, other, 'unresolved']] as const) {
        expect(await run.w.worker.status()).toMatchObject({ id: run.admitted.id, phase: 'saving' });
        expect(writesTo(run.w.calls, run.flat.id)).toHaveLength(1);
        expect(textAt(run.w, FLAT)).toBe(text);
        expect(await outcomeOf(run.w, run.admitted.id, run.edit)).toMatchObject({ state: 'possible-effect' });
        expect(reads(run.w, state)).toBe(true);
      }
    });

    // note-edit-consumer-limits (TL-P2-29 (1), corrected): at most 8 edit-text per run in code-point path order, then
    // fewer from the end of that order until the manifest fits the guard's 8 MiB; the rest wait for the next run.
    it('note edits past the size cap wait for the next run', async () => {
      /** Code-point order, the same everywhere (not the locale's). */
      const byCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
      /** A world with these hub notes to bring up to date, each with these bytes. */
      async function hubs(names: string[], text: string) {
        const updates = names.map((n) => ({ path: `Projects/${n}/${n}.md`, what: `${n} brought up to date.` }));
        const w = await bWorld({ updates });
        const files = new Map<string, DriveFile>();
        for (const u of updates) files.set(u.path, await hub(w, u.path, text));
        const sorted = updates.map((u) => u.path).sort(byCodePoint);
        return { w, sorted, idOf: (path: string): string => files.get(path)?.id ?? '', whatOf: (path: string): string => updates.find((u) => u.path === path)?.what ?? '' };
      }
      /** One more full tidy-up, with a pile to take: done on the B path, its v2 manifest's edit paths. */
      async function tidy(w: World, n: number): Promise<{ manifest: ManifestV2 | undefined; paths: string[] }> {
        if (n) {
          await w.uploader.addPile({ text: '', items: [pdf(`third ${n}.pdf`), pdf(`fourth ${n}.pdf`)] });
          await w.uploader.settled();
        }
        const admitted = await w.worker.process('all');
        await w.runs.settled();
        expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
        const manifest = (await manifestsV2(w)).find((m) => m.runId === admitted.id);
        expect(manifest, 'the run took the B path').toBeDefined();
        return { manifest, paths: editsOf(manifest).map((o) => o.effect.path) };
      }

      // Ten small notes: exactly the first 8 in code-point path order ('Hub B' before 'Hub a').
      const names = ['Hub d', 'Hub 03', 'Hub a', 'Hub 01', 'Hub c', 'Hub 05', 'Hub 02', 'Hub B', 'Hub 04', 'Hub 06'];
      const { w, sorted, idOf, whatOf } = await hubs(names, FLAT_BEFORE);
      const first = sorted.slice(0, 8);
      const rest = sorted.slice(8);
      expect(first.slice(6)).toEqual(['Projects/Hub B/Hub B.md', 'Projects/Hub a/Hub a.md']);
      const one = await tidy(w, 0);
      expect(one.manifest?.v).toBe(2);
      expect(one.paths).toEqual(first);
      // The deferred notes: no operation, no captured place, no call at all, no row; their bytes as they were.
      for (const path of rest) {
        expect(touching(one.manifest, idOf(path))).toEqual([]);
        expect(one.manifest?.capture.places.map((p) => p.path)).not.toContain(path);
        expect(w.calls.filter((c) => 'id' in c && c.id === idOf(path))).toEqual([]);
        expect(textAt(w, path)).toBe(FLAT_BEFORE);
      }
      expect(viewOf(w)?.run.report?.updated).toEqual(first.map((path) => ({ path, what: whatOf(path) })));
      await expectFiledOnce(w);
      // The next tidy-up skips the 8 lines already there and adds the rest: every note has its line once.
      const two = await tidy(w, 1);
      expect(two.paths).toEqual(rest);
      for (const path of sorted) {
        expect(writesTo(w.calls, idOf(path))).toHaveLength(1);
        expect(textAt(w, path)?.split(whatOf(path))).toHaveLength(2);
      }
      expect(viewOf(w)?.run.report?.updated).toEqual(rest.map((path) => ({ path, what: whatOf(path) })));

      // Ten notes just under 1 MiB, full of quotes and backslashes that JSON escapes: 8 would pass the guard's 8 MiB,
      // so each run takes fewer, from the start of the path order, stays on the B path, and later runs converge.
      const filler = 'She wrote "keep C:\\notes\\flats" and \\"quoted\\" it twice.\n';
      const personal = filler.repeat(Math.floor((EDIT_FILE_LIMIT - FLAT_BEFORE.length - 1024) / filler.length));
      const big = FLAT_BEFORE.replace('Your own words about the flats.\n', `Your own words about the flats.\n${personal}`);
      expect(new TextEncoder().encode(big).byteLength).toBeLessThan(EDIT_FILE_LIMIT);
      expect(new TextEncoder().encode(big).byteLength).toBeGreaterThan(EDIT_FILE_LIMIT - 2048);
      const large = await hubs(['Big 07', 'Big 02', 'Big 10', 'Big 05', 'Big 01', 'Big 09', 'Big 04', 'Big 08', 'Big 03', 'Big 06'], big);
      const done: string[] = [];
      for (let n = 0; done.length < large.sorted.length && n < 10; n++) {
        const run = await tidy(large.w, n);
        expect(run.manifest?.v).toBe(2);
        expect(run.paths.length).toBeGreaterThan(0);
        expect(run.paths.length).toBeLessThan(8);
        expect(run.paths).toEqual(large.sorted.filter((p) => !done.includes(p)).slice(0, run.paths.length));
        expect(new TextEncoder().encode(JSON.stringify(run.manifest)).byteLength).toBeLessThanOrEqual(MANIFEST_V2_LIMIT);
        done.push(...run.paths);
        for (const path of large.sorted.filter((p) => !done.includes(p))) expect(writesTo(large.w.calls, large.idOf(path))).toEqual([]);
      }
      expect(done).toEqual(large.sorted);
      for (const path of large.sorted) {
        expect(writesTo(large.w.calls, large.idOf(path))).toHaveLength(1);
        expect(textAt(large.w, path)?.split(large.whatOf(path))).toHaveLength(2);
      }
      // Several runs over ten notes of about 1 MiB, each manifest near 8 MiB: hashing takes seconds.
    }, 30_000);

    // TL-P2-20 R3-7 m9: a build that reads manifest versions names a later one plainly, and leaves the run saving;
    // only for the very bytes the run recorded (their digest is the name's), never for damaged ones.
    it('an unknown later manifest version says this tidy-up needs a newer Bower', async () => {
      /** A saving run reloaded on a Drive whose manifest now says v: 3, renamed to its digest when `matching`. */
      async function later(matching: boolean) {
        const w = await refusedView();
        expect(await w.worker.status()).toMatchObject({ id: w.admitted.id, phase: 'saving' });
        const drive = FakeDrive.restore(await w.drive.snapshot());
        const [record] = (await drive.listAll(w.rootId)).filter((f) => !f.folder && f.name.startsWith('manifest-'));
        if (!record) throw new Error('no manifest record');
        const oldHash = record.name.slice('manifest-'.length, -'.json'.length);
        const next = await canonical({ ...(JSON.parse(await drive.readText(record.id)) as Record<string, unknown>), v: 3 });
        await drive.writeText(record.id, next.text, record.modifiedTime);
        let json = w.runs.toJSON();
        if (matching) {
          await drive.update(record.id, { name: `manifest-${next.hash}.json` });
          json = json.split(oldHash).join(next.hash);
        }
        const view = drive.dump(w.rootId).get(SYSTEM.lastRun);
        const applied: FencedCall[] = [];
        drive.fault = { applied: (call) => { applied.push(call); } };
        const runs = FakeRunService.restore(json, { drive, clock: w.clock.now, scale: 'instant' });
        const worker = new FakeWorker({ drive, scenario: 'first', scale: 'instant', rootId: w.rootId, runs, fresh: false });
        const asked = worker.status();
        await expect(asked).rejects.toBeInstanceOf(BowerError);
        const message = await asked.then(() => '', (e: unknown) => (e instanceof Error ? e.message : ''));
        await runs.settled();
        expect(applied).toEqual([]);
        expect(drive.dump(w.rootId).get(SYSTEM.lastRun)).toBe(view);
        expect(w.errors.mock.calls.some((c) => String(c[0]).includes('version'))).toBe(true);
        return message;
      }
      expect(await later(true)).toBe('This tidy-up needs a newer Bower.');
    });

    it('a damaged manifest that says a later version keeps the read failure', async () => {
      const w = await refusedView();
      const drive = FakeDrive.restore(await w.drive.snapshot());
      const [record] = (await drive.listAll(w.rootId)).filter((f) => !f.folder && f.name.startsWith('manifest-'));
      if (!record) throw new Error('no manifest record');
      // The name keeps the old digest: these bytes are not the ones the run recorded.
      const value = { ...(JSON.parse(await drive.readText(record.id)) as Record<string, unknown>), v: 3 };
      await drive.writeText(record.id, (await canonical(value)).text, record.modifiedTime);
      const runs = FakeRunService.restore(w.runs.toJSON(), { drive, clock: w.clock.now, scale: 'instant' });
      const worker = new FakeWorker({ drive, scenario: 'first', scale: 'instant', rootId: w.rootId, runs, fresh: false });
      const asked = worker.status();
      await expect(asked).rejects.toBeInstanceOf(BowerError);
      await expect(asked).rejects.toThrow('Bower could not read what it did. Try again later.');
      await runs.settled();
    });
  });

  // o5-saved-link-note (TL-P2-20 M5, R3-5, R3-6, R4-2, Ratification 6; TL-P2-26 C): the note is a create-text keyed
  // by the link file's id, written before the original link file moves beside it; the link file is never rewritten.
  describe('a saved link note is written once through a recoverable operation', () => {
    const CURRY = { name: 'curry-clipping.example', kind: 'link' as const, origin: 'Pasted', url: 'https://curry.example/weeknight' };
    const NOTE_NAME = 'Weeknight curry, clipping.md';
    const NOTE = `Resources/Cooking/${NOTE_NAME}`;
    const AGAIN = "It couldn't be filed this time.";
    type Where = { drive: FakeDrive; rootId: string };
    type AnyManifest = Manifest | ManifestV2;
    const manifestsAll = async (w: Where): Promise<AnyManifest[]> =>
      (await recordsOf(w)).filter((r) => r.name.startsWith('manifest-')).map((r) => JSON.parse(r.text) as AnyManifest);
    const notesOf = async (w: Where): Promise<DriveFile[]> => (await w.drive.listAll(w.rootId)).filter((f) => !f.folder && f.name === NOTE_NAME);
    const createsOf = (w: Pick<World, 'applied'>): FencedCall[] => w.applied.filter((c) => c.op === 'create-text' && c.name === NOTE_NAME);
    /** A world with a pile holding the saved link and a pdf, every dispatch open to `act`. */
    async function linkWorld(o: { declared?: boolean } = {}) {
      const act: { at: ((at: DispatchAt) => Promise<void>) | null } = { at: null };
      const w = await bWorld({ ...o, hooks: { beforeDispatch: async (at) => { await act.at?.(at); } } });
      await w.uploader.addPile({ text: 'A recipe to keep', items: [CURRY, pdf('shopping list.pdf')] });
      await w.uploader.settled();
      const link = (await w.drive.listAll(w.rootId)).find((f) => !f.folder && f.name.endsWith('.url'));
      if (!link) throw new Error('the saved link did not arrive');
      return { w, act, link, bytes: await w.drive.readText(link.id) };
    }
    const isLinkMove = (id: string) => (at: DispatchAt): boolean => at.effect.kind === 'move' && at.effect.before.fileId === id;
    async function tidy(w: World): Promise<{ id: string; manifest: AnyManifest | undefined }> {
      const admitted = await w.worker.process('all');
      await w.runs.settled();
      const manifest = (await manifestsAll(w)).find((m) => m.runId === admitted.id);
      expect(manifest, 'the run took the B path').toBeDefined();
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      return { id: admitted.id, manifest };
    }
    const opOf = (m: AnyManifest | undefined, match: (o: OperationV2) => boolean): OperationV2 | undefined => (m?.operations as OperationV2[] | undefined)?.find(match);

    it('writes the note first, then files the link file beside it, each once, and reports one filed row', async () => {
      const { w, link, bytes } = await linkWorld();
      const { id, manifest } = await tidy(w);
      if (!manifest) return;
      // Fixed in the manifest before any effect: the create-text keyed by the link file's id, then the move after it.
      const create = opOf(manifest, (o) => o.effect.kind === 'create-text');
      const move = opOf(manifest, (o) => o.effect.kind === 'move' && o.effect.before.fileId === link.id);
      expect(create?.effect).toMatchObject({ kind: 'create-text', name: NOTE_NAME, purpose: 'generated', createKey: await savedLinkKey(link.id) });
      expect(move?.effect).toMatchObject({ kind: 'move', name: link.name });
      if (create?.effect.kind !== 'create-text' || move?.effect.kind !== 'move') return;
      expect(move.effect.parent).toEqual(create.effect.parent);
      expect(move.dependsOn).toContain(create.operationId);
      expect(create.ordinal).toBeLessThan(move.ordinal);
      const filed = manifest.reportPlan.filter((c) => c.value.filed.some((r) => r.name === CURRY.name));
      expect(filed).toHaveLength(1);
      expect(filed[0]?.value.filed).toEqual([{ name: CURRY.name, title: 'Weeknight curry, clipping', kind: 'link', to: 'Resources/Cooking', note: NOTE }]);
      expect(filed[0]?.requires).toEqual(expect.arrayContaining([create.operationId, move.operationId]));
      expect(manifest.reportPlan).toContainEqual({ requires: [move.operationId], when: 'rejected', value: { filed: [], created: [], updated: [], setAside: [{ name: CURRY.name, why: AGAIN }], questions: [] } });
      expect(grounded(manifest)).toBe(true);
      expect(await groundedKeys(manifest)).toBe(true);
      // A filed note that no applied create (or reused note) backs is never grounded, nor a create with another key.
      const at = manifest.reportPlan.indexOf(filed[0] as ReportContribution);
      const plan = (patch: (c: ReportContribution) => ReportContribution): AnyManifest => ({ ...manifest, reportPlan: manifest.reportPlan.map((c, i) => (i === at ? patch(c) : c)) }) as AnyManifest;
      expect(grounded(plan((c) => ({ ...c, requires: c.requires.filter((r) => r !== create.operationId) })))).toBe(false);
      expect(grounded(plan((c) => ({ ...c, value: { ...c.value, filed: c.value.filed.map((r) => ({ ...r, note: 'Resources/Cooking/Elsewhere.md' })) } })))).toBe(false);
      const rekeyed = { ...manifest, operations: (manifest.operations as OperationV2[]).map((o) => (o === create && o.effect.kind === 'create-text' ? { ...o, effect: { ...o.effect, createKey: 'another-key' } } : o)) } as AnyManifest;
      expect(await groundedKeys(rekeyed)).toBe(false);

      // Applied once each: one note with Bower's marks, the link file beside it with its bytes as they were.
      const [note, ...more] = await notesOf(w);
      expect(more).toEqual([]);
      expect(w.drive.pathOf(note?.id ?? '', w.rootId)).toBe(NOTE);
      expect(note?.appProperties).toMatchObject({ by: 'bower', bowerNew: '1', bowerItem: await savedLinkKey(link.id) });
      expect(await w.drive.readText(note?.id ?? '')).toBe(create.effect.text);
      expect(create.effect.text).toContain('curry.example/weeknight');
      expect(w.drive.pathOf(link.id, w.rootId)).toBe(`Resources/Cooking/${link.name}`);
      expect(await w.drive.readText(link.id)).toBe(bytes);
      expect(w.calls.filter((c) => c.op === 'write-text' && c.id === link.id)).toEqual([]);
      expect(createsOf(w)).toHaveLength(1);
      expect(movesOf(w, link.id)).toBe(1);
      expect(viewOf(w)?.run.report?.filed).toContainEqual({ name: CURRY.name, title: 'Weeknight curry, clipping', kind: 'link', to: 'Resources/Cooking', note: NOTE });
      expect((await checkpointsOf(w, id)).at(-1)?.outcomes.every((o) => o.state === 'applied')).toBe(true);
      await expectFiledOnce(w);
    });

    it('reconciles a lost create reply by its key, ending with one note', async () => {
      const { w, link } = await linkWorld();
      w.rules.push(once((c) => c.op === 'create-text' && c.name === NOTE_NAME, 'lose-reply'));
      const admitted = await w.worker.process('all');
      await w.runs.settled();
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'saving' });
      for (let i = 0; i < 4 && (await w.worker.status())?.phase !== 'done'; i++) {
        w.clock.later();
        await after(w.worker, w.runs);
      }
      expect(await w.worker.status()).toMatchObject({ id: admitted.id, phase: 'done' });
      expect(w.calls.filter((c) => c.op === 'create-text' && c.name === NOTE_NAME)).toHaveLength(1);
      expect(await notesOf(w)).toHaveLength(1);
      expect(movesOf(w, link.id)).toBe(1);
      expect(viewOf(w)?.run.report?.filed.map((r) => r.note)).toContain(NOTE);
    });

    it('keeps a declared pile and its record when the link move is rejected, and the next run reuses the note', async () => {
      const { w, act, link } = await linkWorld({ declared: true });
      act.at = async (at) => {
        if (!isLinkMove(link.id)(at) || act.at === null) return;
        act.at = null;
        // Alex renames the link file after Bower checked it and before the move is sent.
        await w.drive.update(link.id, { name: 'curry, mine.url' });
      };
      const first = await tidy(w);
      const pileId = first.manifest?.capture.members.find((m) => m.file.fileId === link.id)?.pileId;
      expect(pileId).toBeDefined();
      // The note was written, the link stays in the inbox, its pile and declaration stay: no consumed disposition.
      expect(await notesOf(w)).toHaveLength(1);
      expect(w.drive.pathOf(link.id, w.rootId).startsWith('Inbox/')).toBe(true);
      expect(viewOf(w)?.run.report?.setAside).toEqual([{ name: CURRY.name, why: AGAIN }]);
      expect(viewOf(w)?.run.report?.filed.map((r) => r.name)).not.toContain(CURRY.name);
      const dispositions = (await w.drive.listAll(w.rootId)).filter((f) => !f.folder && f.name.startsWith('disposition-'));
      const piles = await Promise.all(dispositions.map(async (f) => (JSON.parse(await w.drive.readText(f.id)) as { pileId: string }).pileId));
      expect(piles).not.toContain(pileId);
      expect(piles).toHaveLength(2);

      // Alex names it back; the next run reuses the note: no second create, the link files beside it.
      await w.drive.update(link.id, { name: link.name });
      const [note] = await notesOf(w);
      const second = await tidy(w);
      expect(opOf(second.manifest, (o) => o.effect.kind === 'create-text')).toBeUndefined();
      expect(second.manifest?.capture.places).toContainEqual({ file: expect.objectContaining({ fileId: note?.id }), path: NOTE });
      expect(createsOf(w)).toHaveLength(1);
      expect(await notesOf(w)).toHaveLength(1);
      expect(w.drive.pathOf(link.id, w.rootId)).toBe(`Resources/Cooking/${link.name}`);
      expect(viewOf(w)?.run.report?.filed).toEqual([{ name: CURRY.name, title: 'Weeknight curry, clipping', kind: 'link', to: 'Resources/Cooking', note: NOTE }]);
    });

    it('checks a reused note again in the same step as the move, and sets the link aside when it is no longer the one', async () => {
      const { w, act, link } = await linkWorld();
      act.at = async (at) => {
        if (!isLinkMove(link.id)(at) || act.at === null) return;
        act.at = null;
        await w.drive.update(link.id, { name: 'curry, mine.url' });
      };
      await tidy(w);
      await w.drive.update(link.id, { name: link.name });
      const [note] = await notesOf(w);
      // Right before the move is sent, the note loses Bower's key for this link: the move is refused, nothing else.
      act.at = async (at) => {
        if (!isLinkMove(link.id)(at) || act.at === null) return;
        act.at = null;
        await w.drive.update(note?.id ?? '', { appProperties: { bowerItem: null } });
      };
      const second = await tidy(w);
      const move = opOf(second.manifest, (o) => o.effect.kind === 'move' && o.effect.before.fileId === link.id);
      expect((await checkpointsOf(w, second.id)).at(-1)?.outcomes[move?.ordinal ?? -1]).toMatchObject({ state: 'rejected', failure: { code: 'conflict' } });
      expect(w.drive.pathOf(link.id, w.rootId).startsWith('Inbox/')).toBe(true);
      expect(movesOf(w, link.id)).toBe(0);
      expect(createsOf(w)).toHaveLength(1);
      expect(viewOf(w)?.run.report?.setAside).toEqual([{ name: CURRY.name, why: AGAIN }]);
    });
  });
});
