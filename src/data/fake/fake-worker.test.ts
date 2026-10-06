import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { SYSTEM } from '../vault/layout';
import { FakeWorker } from './fake-worker';
import { seedFakeDrive } from './seed';
import { DriveVault } from '../vault/drive-vault';
import type { Scenario } from '../demo/scenario';
import { BowerError } from '../types';
import type { LastRunFile } from '../vault/layout';
import { driveError } from '../drive/drive-api';
import { LiveRuns } from '../live/runs';
import { FAILURE } from './fake-runner';

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
