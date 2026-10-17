import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { BOWER_FOLDER, PROP, SYSTEM } from '../vault/layout';
import { FakeWorker } from './fake-worker';
import { seedFakeDrive } from './seed';
import { DriveVault } from '../vault/drive-vault';
import { BowerError, type Pile } from '../types';
import type { LastRunFile, QuestionsFile, RequestsFile } from '../vault/layout';
import type { JournalRecord } from '../vault/journal';
import { driveError, type DriveFile } from '../drive/drive-api';
import { LiveRuns } from '../live/runs';
import { planRun, type HubUpdate } from './fake-runner';
import type { RunWire } from '../worker/worker-api';
import { B_FAILURE, CLAIM_MS, FakeRunService, RETRY_MS, type DispatchAt, type FakeRunServiceOptions } from './fake-run-service';
import type { FaultAction, FencedCall } from '../drive/fake-drive';
import { MANIFEST_V2_LIMIT, type EditText, type Manifest, type ManifestV2, type OperationV2, type ReportContribution } from '../contracts/run-manifest';
import { EDIT_FILE_LIMIT, savedLinkKey } from '../contracts/note-edit';
import { grounded, groundedKeys } from '../spine/grounded';
import { NOTHING_DONE, REQUEST_DONE } from '../spine/scripted';
import { canonical } from '../spine/records';
import { stampOf } from '../spine/write-once';
import { md5Hex } from '../contracts/hashes';
import type { Checkpoint, ReportRecord } from '../contracts/run-checkpoint';
import { parsePileDisposition } from '../contracts/pile-disposition';
import type { Declaration } from '../contracts/pile-declaration';
import { ALEX, MERGES, saltmereQuestion, wordRule } from '../demo/fixture';
import { PHASE_MS, type Scenario } from '../demo/scenario';
import { RULES_TEMPLATE, parseRules, serializeRules } from '../vault/rules-format';
import { nameOf } from '../tree';
import { pretendDrive, pretendRuns } from './pretend';
import { SET_ASIDE_TEXT } from '../pile-readiness';
import * as runner from './fake-runner';
import * as runManifest from '../contracts/run-manifest';
import * as runRecords from '../spine/grounded';
import { beforeUpload } from '@/testing/upload-hook';
import { newLineIndexes } from '@/features/note/new-lines';

beforeEach(() => vi.setSystemTime(new Date('2026-10-10T12:00:00Z')));
afterEach(() => vi.useRealTimers());

async function world(scenario: Scenario) {
  localStorage.clear();
  const drive = new FakeDrive();
  const rootId = await seedFakeDrive(drive, scenario, Date.now());
  return { drive, rootId, worker: new FakeWorker({ drive, runs: new FakeRunService({ drive, scale: 'instant' }), scenario, rootId }) };
}

const until = async (worker: FakeWorker, phase: string): Promise<void> => {
  for (let i = 0; i < 200 && ((await worker.status()).run)?.phase !== phase; i++) await new Promise((r) => setTimeout(r, 1));
};

describe('the fake Worker', () => {
  it('is signed out in the signed-out scenario until you sign in', async () => {
    const { worker } = await world('signed-out');
    expect(await worker.me()).toBeNull();
    await worker.signIn();
    expect((await worker.me())?.user.name).toBe('Alex');
  });

  it('makes Rules.md from the template the real Worker uses', async () => {
    const { drive, worker } = await world('first');
    const { id } = await worker.createFolder();
    const rules = (await drive.listAll(id)).find((f) => f.name === 'Rules.md');
    expect(await drive.readText(rules?.id ?? '')).toBe(RULES_TEMPLATE.text);
    expect(rules?.appProperties).toEqual(RULES_TEMPLATE.appProperties);
    expect(Object.keys(RULES_TEMPLATE.appProperties)).toEqual([PROP.by]);
  });

  it('the fake Worker makes its template by reserved ids, as the Worker', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { drive, worker } = await world('first');
    const reserve = vi.spyOn(drive, 'generateIds');
    const create = drive.createFolder.bind(drive);
    // The Bower folder lands and its answer is lost: found again by the id reserved for it, never made twice.
    const folders = vi.spyOn(drive, 'createFolder').mockImplementationOnce(async (...a) => {
      drive.loseNextReply();
      return create(...a);
    });
    const texts = vi.spyOn(drive, 'createText');
    await expect(worker.createFolder()).resolves.toMatchObject({ found: false });
    const id = (await worker.me())?.folderId ?? '';
    // One call reserves the folder's id and one per template folder and file.
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(folders.mock.calls.every((a) => typeof a[3] === 'string')).toBe(true);
    expect(texts.mock.calls.every((a) => typeof a[4] === 'string')).toBe(true);
    expect(id).toBe(folders.mock.calls[0]?.[3]);
    expect((await drive.listAll('root')).filter((f) => f.name === BOWER_FOLDER && f.parents[0] === 'root')).toHaveLength(1);
    const names = (await drive.listAll(id)).filter((f) => f.parents[0] === id).map((f) => f.name).sort();
    expect(names).toEqual(['.bower', 'About me.md', 'Archive', 'Areas', 'Inbox', 'Projects', 'Resources', 'Rules.md']);
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

  it('the fake answers rising revisions', async () => {
    const { worker } = await world('default');
    const idle = await worker.status();
    const admitted = await worker.process('all');
    expect(admitted).toHaveProperty('revision');
    expect(admitted.run.id).toBeTruthy();
    expect(admitted.revision).toBeGreaterThan(idle.revision);
    let last = admitted.revision;
    let changes = 0;
    for (let i = 0; i < 200; i++) {
      const now = await worker.status();
      expect(now.revision).toBeGreaterThanOrEqual(last);
      if (now.revision > last) changes++;
      last = now.revision;
      if (now.run?.phase === 'done') break;
      await new Promise((r) => setTimeout(r, 1));
    }
    expect(changes).toBeGreaterThan(0);
    // Asking again with nothing changed gives the same revision.
    expect((await worker.status()).revision).toBe(last);
  });

  it('runs a tidy-up to done and writes its report', async () => {
    const { drive, rootId, worker } = await world('default');
    const run = (await worker.process('all')).run;
    expect(run.phase).toBe('queued');
    expect(((await worker.process('all')).run).id).toBe(run.id);
    await until(worker, 'done');
    const done = (await worker.status()).run;
    expect(done).toMatchObject({ id: run.id, phase: 'done' });
    expect(done?.total).toBeGreaterThan(0);
    const last = JSON.parse(drive.dump(rootId ?? '').get(SYSTEM.lastRun) ?? '{}') as { run?: { id: string; report?: { filed: unknown[] } } };
    expect(last.run?.id).toBe(run.id);
    expect(last.run?.report?.filed.length).toBe(done?.total);
  });

  it("a repeat of a press answers that press's run, even once it has ended", async () => {
    const { worker } = await world('default');
    const run = (await worker.process('all', { requestId: 'press-1' })).run;
    expect((await worker.process('instructions', { requestId: 'press-1' })).run).toMatchObject({ id: run.id, scope: 'all' });
    await until(worker, 'done');
    // The inbox is empty now: a new press is refused, but the same press still answers its run.
    await expect(worker.process('all', { requestId: 'press-2' })).rejects.toMatchObject({ code: 'conflict' });
    await expect(worker.process('all', { requestId: 'press-1' })).resolves.toMatchObject({ run: { id: run.id, phase: 'done' } });
  });

  it('an answer during a run waits, and its run starts when the run ends (TL-P4-13 addendum)', async () => {
    const { drive, rootId, worker } = await world('default');
    const going = (await worker.process('all', { requestId: 'press-1' })).run;
    // The answer, one of your changes, written while the run is going (keeping one note: no subject).
    const changes = (await drive.listAll(rootId ?? '')).find((f) => f.folder && f.name === 'changes');
    await drive.createText(changes?.id ?? '', 'change-1.json', JSON.stringify({ v: 1, id: 'change-1', device: 'laptop', at: 1, what: 'A rule', kind: 'rule', text: 'Receipts go to Money' }));
    const reply = await worker.process('instructions', { requestId: 'answer-1', answer: true });
    expect(reply).toMatchObject({ run: { id: going.id }, waits: true });
    // A retry is told the same.
    expect(await worker.process('instructions', { requestId: 'answer-1', answer: true })).toMatchObject({ run: { id: going.id }, waits: true });
    let next = (await worker.status()).run;
    for (let i = 0; i < 500 && next?.id === going.id; i++) {
      await new Promise((r) => setTimeout(r, 1));
      next = (await worker.status()).run;
    }
    expect(next?.id).not.toBe(going.id);
    // Its run, with no press; a retry of the answer now answers that run.
    expect(next?.scope).toBe('instructions');
    const again = await worker.process('instructions', { requestId: 'answer-1', answer: true });
    expect(again.run.id).toBe(next?.id);
    expect(again.waits).toBeUndefined();
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
    expect(((await worker.status()).run)?.failure).toBe(B_FAILURE);
    await worker.process('all');
    await until(worker, 'done');
    expect(((await worker.status()).run)?.phase).toBe('done');
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
    expect(((await worker.status()).run)?.phase).toBe('done');
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
      const after = new FakeWorker({ drive, runs: new FakeRunService({ drive, scale: 'instant' }), scenario: 'default', rootId, fresh: false });
      const out = (await after.status()).run;
      expect(out?.phase, phase).toBe('failed');
      expect(out?.failure, phase).toMatch(says);
      if (phase === 'saving') expect(out?.failure).not.toMatch(/Nothing was moved/);
    }
  });

  it('the running situation starts its run only on a fresh pretend Drive, not on a reload', async () => {
    localStorage.clear();
    const drive = new FakeDrive();
    const rootId = await seedFakeDrive(drive, 'running', Date.now());
    const reloaded = new FakeWorker({ drive, runs: new FakeRunService({ drive, scale: 'instant' }), scenario: 'running', rootId, fresh: false });
    expect(((await reloaded.status()).run)?.phase ?? 'none').not.toMatch(/queued|reading|writing|saving/);
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
  const reopen = (scenario: Scenario = 'default', fresh = false) => new FakeWorker({ drive, runs: new FakeRunService({ drive, scale: 'instant' }), rootId, scenario, fresh });
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
    expect((await reopen().status()).run).toEqual(wire);
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
    // The page lists the folder again to see a change made elsewhere (c2-read-cache: reads are kept by version).
    await vault.refresh();
    expect(await vault.lastRun()).toEqual(JSON.parse(validRuns[0][1]));
    expect((await reopen().status()).run).toMatchObject({ id: 'RUN_A', phase: 'done' });
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
    expect((await worker.status()).run).toBeNull();
    expect(await drive.snapshot()).toBe(before);
    expect(((await worker.process('all')).run).phase).toBe('queued');
    await until(worker, 'done');
    expect(((await worker.status()).run)?.phase).toBe('done');
  });

  it.each(['queued', 'reading', 'writing', 'saving'] as const)('retains the existing legitimate %s reload policy', async (phase) => {
    const text = JSON.stringify({ v: 1, run: { id: 'RUN_A', scope: 'all', phase, requestedAt: 1, phaseAt: 2 } });
    const { vault, reopen } = await savedRun(text);
    expect((await vault.lastRun())?.run.phase).toBe(phase);
    const run = (await reopen().status()).run;
    expect(run).toMatchObject({ id: 'RUN_A', phase: 'failed' });
    if (phase === 'saving') {
      expect(run?.failure).toMatch(/Some things may be in their new places already/);
      expect(run?.failure).not.toMatch(/Nothing was moved/);
    } else expect(run?.failure).toMatch(/Nothing was moved/);
    // The page lists the folder again to see the repair (c2-read-cache: reads are kept by version).
    await vault.refresh();
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
    expect(((await fresh.process('all')).run).phase).toBe('queued');
    await until(fresh, 'done');
    expect(((await fresh.status()).run)?.phase).toBe('done');
    expect((await vault.lastRun())?.run.report?.filed.length).toBeGreaterThan(0);
    const after = await drive.listAll(rootId);
    expect(inputs.some((input) => !after.some((f) => f.id === input.id && f.parents[0] === inbox))).toBe(true);
  });
});

// The legacy runner is gone (TL-P2-38): what is left of this suite pins how a view it left behind is read. Its terminal
// barrier for the B path is the next suite, which the parent entry's shorter pattern also selects.
describe('report save failure cannot publish done or repeat effects on the legacy path', () => {
  it('after reload the cut-off saving run fails honestly and nothing is refiled', async () => {
    localStorage.clear();
    const drive = new FakeDrive();
    const rootId = (await seedFakeDrive(drive, 'default', Date.now())) ?? '';
    // The view a legacy run left when a reload cut it off while it was filing.
    const sys = (await drive.listAll(rootId)).find((f) => f.folder && f.name === SYSTEM.dir && f.parents[0] === rootId);
    await drive.createText(sys?.id ?? '', 'last-run.json', JSON.stringify({ v: 1, run: { id: 'run-legacy', scope: 'all', phase: 'saving', requestedAt: Date.now() - 60_000, phaseAt: Date.now() - 1000 } }));
    const own = (path: string): boolean => path === SYSTEM.lastRun || path.startsWith('.bower/runs');
    const rest = (): string => JSON.stringify([...drive.dump(rootId)].filter(([path]) => !own(path)));
    const before = rest();
    const runs = new FakeRunService({ drive, scale: 'instant' });
    const reloaded = new FakeWorker({ drive, runs, scenario: 'default', rootId, fresh: false });
    const status = (await reloaded.status()).run;
    expect(status).toMatchObject({ id: 'run-legacy', phase: 'failed' });
    expect(status?.failure).toMatch(/Some things may be in their new places already/);
    expect(status?.failure).not.toMatch(/Nothing was moved/);
    expect(status?.finishedAt).toBeGreaterThan(0);
    const stored = (JSON.parse(drive.dump(rootId).get(SYSTEM.lastRun) ?? '{}') as LastRunFile).run;
    expect(stored).toEqual(status);

    // Never done, never filed again by the runner that is gone: only the view changed, and a new tidy-up is a B run.
    for (let i = 0; i < 3; i++) expect(((await reloaded.status()).run)?.phase).toBe('failed');
    expect(rest()).toBe(before);
    const next = (await reloaded.process('all')).run;
    expect(next.id).not.toBe('run-legacy');
    await runs.settled();
    expect((await reloaded.status()).run).toMatchObject({ id: next.id, phase: 'done' });
    expect([...drive.dump(rootId).keys()].some((path) => path.startsWith(`.bower/runs/${next.id}/manifest-`))).toBe(true);
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
    const worker = new FakeWorker({ drive, scenario: o.scenario ?? 'first', rootId: null, runs, ...(o.updates ? { updates: o.updates } : {}) });
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
  /**
   * `match`'s write lands and its answer is lost, and the read-back right after it fails too: the attempt stops there,
   * as a runner killed after the write would (TL-P3-28), and a later attempt reads it back by its stamp.
   */
  const stopsAfter = (drive: FakeDrive, match: (call: FencedCall) => boolean): Rule => {
    const lose = once(match, 'lose-reply');
    return (call) => {
      const action = lose(call);
      if (action) drive.failNext('unknown');
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

  /**
   * A saved link whose file has the name it was added under (no `asAdded`): report rows use the file name
   * (TL-P2-32 (2)), so these tests name the link by the name they added.
   */
  async function plainName(w: { drive: FakeDrive }, f: DriveFile | undefined): Promise<DriveFile> {
    if (!f) throw new Error('the saved link did not arrive');
    const name = f.appProperties?.asAdded;
    if (!name) throw new Error('the saved link has no added name');
    return w.drive.update(f.id, { name, appProperties: { asAdded: null } });
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
    return (await worker.status()).run;
  }

  /** A run whose terminal view is refused: it filed everything and stays saving. */
  async function refusedView(o: { declared?: boolean } = {}) {
    const w = await bWorld(o);
    w.rules.push((call) => (isView(w, call, 'done') ? 'refuse' : undefined));
    const admitted = (await w.worker.process('all')).run;
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

  // Coordinator finding on 07a8bb4 (robustness and qa5 e2e on fake): once Alex's folder took the B path, a tidy-up on
  // the demo pace took about 43 s and the slow situation's Inbox kept loading. The Inbox read every thing's bytes;
  // the run listed its folder again for every record; its queue pace ignored the time planning took; and its things
  // were put away only after the putting-away pace, not within it.
  it('a tidy-up tried again after a failed run is done within the demo pace', async () => {
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const drive = new FakeDrive();
    const rootId = (await seedFakeDrive(drive, 'fail-run', Date.now())) ?? '';
    const listed = async (): Promise<Pile[]> => new DriveVault({ drive, rootId: async () => rootId, runningPiles: () => new Set(), device: 'DEVICE_B' }).piles();
    // The Inbox lists without reading any thing's bytes: on a slow Drive each read is a wait a person sees.
    const things = new Set((await listed()).flatMap((p) => p.items.map((i) => i.id)));
    const read: string[] = [];
    const digest = drive.storedDigest.bind(drive);
    const bytes = drive.readBytes.bind(drive);
    const digests = vi.spyOn(drive, 'storedDigest').mockImplementation(async (id) => (read.push(id), digest(id)));
    const reads = vi.spyOn(drive, 'readBytes').mockImplementation(async (id) => (read.push(id), bytes(id)));
    expect((await listed()).length).toBeGreaterThan(0);
    digests.mockRestore();
    reads.mockRestore();
    expect(read.filter((id) => things.has(id))).toEqual([]);

    // The first run fails before any effect, in the fail-run situation.
    const runs = new FakeRunService({ drive, scale: 'instant' });
    const worker = new FakeWorker({ drive, scenario: 'fail-run', rootId, runs });
    const failed = (await worker.process('all')).run;
    await runs.settled();
    expect((await worker.status()).run).toMatchObject({ id: failed.id, phase: 'failed' });

    // Trying again, on the demo pace, asked for 2 s ago (planning took that long).
    let release = (): void => undefined;
    const sleeps: number[] = [];
    let dispatched = 0;
    const paced = new FakeRunService({
      drive, scale: 'demo',
      sleep: (ms) => {
        sleeps.push(ms);
        // Queued, reading and writing go by at once; the putting-away pace (the fourth) lasts until released.
        return sleeps.length === 4 ? new Promise((r) => { release = r; }) : Promise.resolve();
      },
      hooks: { beforeDispatch: async () => void dispatched++ },
    });
    const { runId, requestId } = paced.ids();
    const plan = await planRun(drive, rootId, { scope: 'all', allowWeb: false, runId, requestId, requestedAt: Date.now() - 2000 });
    const lists = vi.spyOn(drive, 'listAll');
    await paced.admit({ account: ALEX.email, rootId }, plan.manifest);
    const operations = plan.manifest.operations.length;
    for (let i = 0; i < 150 && dispatched < operations; i++) await new Promise((r) => setTimeout(r, 10));
    // It waited in the queue from when it was asked for: at most the second left of the queue's three.
    expect(sleeps[0] ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(PHASE_MS.demo.queued - 2000);
    expect(sleeps.slice(1)).toEqual([PHASE_MS.demo.reading, PHASE_MS.demo.writing, PHASE_MS.demo.saving]);
    // Its things are put away within the putting-away pace, which is still going.
    expect(dispatched).toBe(operations);
    // Each record goes where the run's records already are: the folder is not listed again for every one.
    expect(lists.mock.calls.length).toBeLessThan(operations);
    release();
    await paced.settled();
    expect(await paced.status({ account: ALEX.email, rootId })).toMatchObject({ id: runId, phase: 'done' });
    expect((await listed()).map((p) => p.id)).toEqual([]);
  });

  // Review of 982a75c (I1): a thing whose bytes no run can ever check (kept by name only, with no hash) holds its pile
  // with a reason the Inbox shows, from metadata alone; never a pile shown as ready that every tidy-up leaves.
  it('a thing no run can check holds its pile with a reason, read from metadata only', async () => {
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const first = new FakeDrive();
    const rootId = (await new FakeWorker({ drive: first, scenario: 'first', rootId: null, runs: new FakeRunService({ drive: first, scale: 'instant' }) }).createFolder()).id;
    const up = new DriveVault({ drive: first, rootId: async () => rootId, runningPiles: () => new Set(), device: 'DEVICE_A' });
    await up.addPile({ text: 'Papers about the lease', items: [pdf('lease.pdf'), pdf('inventory.pdf')] });
    await up.addPile({ text: '', items: [pdf('idea one.pdf')] });
    await up.settled();
    // An older snapshot kept lease.pdf by name and size only: its bytes are gone and no hash of them was kept.
    const snap = JSON.parse(await first.snapshot()) as { files: Array<{ meta: { name: string; size?: number }; content: unknown; sha256?: string }> };
    for (const f of snap.files) if (f.meta.name === 'lease.pdf') { f.content = { big: true, type: 'application/pdf' }; delete f.sha256; f.meta.size = 999_999; }
    const drive = FakeDrive.restore(JSON.stringify(snap));
    const listed = async (): Promise<Pile[]> => new DriveVault({ drive, rootId: async () => rootId, runningPiles: () => new Set(), device: 'DEVICE_B' }).piles();
    const lease = (await listed()).find((p) => p.text === 'Papers about the lease');
    // The Inbox says why, without reading any bytes.
    const reads = [vi.spyOn(drive, 'storedDigest'), vi.spyOn(drive, 'readBytes')];
    expect((await listed()).find((p) => p.id === lease?.id)?.setAside).toBe('not-tidied');
    expect(reads.flatMap((r) => r.mock.calls.map(([id]) => id)).filter((id) => lease?.items.some((i) => i.id === id))).toEqual([]);
    for (const r of reads) r.mockRestore();
    // The run holds that pile and files the other; the reason stays, run after run.
    const runs = new FakeRunService({ drive, scale: 'instant' });
    const worker = new FakeWorker({ drive, scenario: 'first', rootId, runs, fresh: false });
    const admitted = (await worker.process('all')).run;
    await runs.settled();
    expect((await worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
    const after = await listed();
    expect(after.map((p) => p.id)).toEqual([lease?.id]);
    expect(after[0]?.setAside).toBe('not-tidied');
    await expect(worker.process('all')).rejects.toMatchObject({ code: 'conflict', message: 'Nothing in the inbox is ready yet.' });
  });

  it('fixes its classification before any effect', async () => {
    const w = await bWorld();
    const admitted = (await w.worker.process('all')).run;
    // Admission confirmed the manifest and the first checkpoint, and nothing in your folders changed yet.
    const manifests = await manifestsOf(w);
    expect(manifests).toHaveLength(1);
    expect(manifests[0]).toMatchObject({ runId: admitted.id, runScope: 'all' });
    expect((await checkpointsOf(w, admitted.id)).map((c) => [c.revision, c.phase])).toContainEqual([0, 'queued']);
    expect(w.applied.filter((c) => c.op === 'update' || c.op === 'trash' || c.op === 'write-text')).toEqual([]);

    // Input the plan did not capture arrives while the run goes: a typed rule and a saved link.
    await w.uploader.addRule('Keep lease papers together');
    await w.uploader.addPile({ text: '', items: [link] });
    const lines = async (): Promise<string[]> => (await w.drive.listAll(w.rootId)).filter((f) => !f.folder && w.drive.pathOf(f.id, w.rootId).startsWith(`${SYSTEM.changes}/`) && !w.drive.pathOf(f.id, w.rootId).startsWith(`${SYSTEM.archive}/`)).map((f) => f.id);
    const typed = await lines();
    expect(typed).toHaveLength(1);
    await w.uploader.settled();
    await w.runs.settled();
    expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });

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
      const status = (await w.worker.status()).run;
      expect(status).toMatchObject({ id: admitted.id, phase: 'saving' });
      expect(status?.finishedAt).toBeUndefined();
    }
    const again = (await w.worker.process('all')).run;
    expect(again).toMatchObject({ id: admitted.id, phase: 'saving' });
    expect(again.finishedAt).toBeUndefined();
    expect(viewOf(w)).toBeNull();

    // Effects done, report pending, its report record saved: done is committed only once the view is read back.
    const head = (await checkpointsOf(w, admitted.id)).at(-1);
    expect(head).toMatchObject({ phase: 'saving', report: { state: 'pending' } });
    const reports = await reportsOf(w);
    expect(reports).toHaveLength(1);
    expect(head?.report.state === 'pending' ? head.report.reportHash : null).toBe(reports[0]?.hash);
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

    const second = new FakeWorker({ drive: w.drive, scenario: 'first', rootId: w.rootId, runs: w.runs, fresh: false });
    // Asking does not wait for the recovery: it starts it and answers with the run as it stands.
    expect((await second.status()).run).toMatchObject({ id: admitted.id, phase: 'saving' });
    await w.runs.settled();
    const status = (await second.status()).run;
    const done = (await checkpointsOf(w, admitted.id)).find((c) => c.phase === 'done');
    expect(status).toMatchObject({ id: admitted.id, phase: 'done', finishedAt: done?.phaseAt });

    // Only the view, then the done checkpoint, were written; no other record, place or byte of your folders changed.
    const fresh = w.applied.slice(seen);
    expect(fresh.map((c) => c.op)).toEqual(['create-text', 'create-text']);
    expect(isView(w, fresh[0] ?? { op: 'trash', id: '' }, 'done')).toBe(true);
    expect(fresh[1]?.op === 'create-text' && fresh[1].name.startsWith('checkpoint-')).toBe(true);
    expect(await domain(w.drive, w.rootId)).toBe(rest);
    expect((await recordsOf(w)).filter((r) => !r.name.startsWith('checkpoint-'))).toEqual(records.filter((r) => !r.name.startsWith('checkpoint-')));

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
    expect((await w.worker.status()).run).toEqual(status);
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
    const worker = new FakeWorker({ drive, scenario: 'first', rootId: w.rootId, runs, fresh: false });
    const status = await after(worker, runs);
    expect(status).toMatchObject({ id: admitted.id, phase: 'done' });
    // The view, then the done checkpoint.
    expect(applied.map((c) => c.op)).toEqual(['create-text', 'create-text']);
    const reloaded = { drive, rootId: w.rootId };
    expect(await domain(drive, w.rootId)).toBe(rest);
    expect((await recordsOf(reloaded)).filter((r) => !r.name.startsWith('checkpoint-'))).toEqual(records.filter((r) => !r.name.startsWith('checkpoint-')));
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
    const admitted = (await w.worker.process('all')).run;
    await w.runs.settled();
    expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'saving' });
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
    w.rules.push(stopsAfter(w.drive, isMoveOf(lost)));
    const admitted = (await w.worker.process('all')).run;
    await w.runs.settled();
    expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'saving' });
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
    const admitted = (await w.worker.process('all')).run;
    await w.runs.settled();
    const status = (await w.worker.status()).run;
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
    const admitted = (await w.worker.process('all')).run;
    const at = await reached(pause.paused, w.runs);
    expect(at, 'the first move was paused before its dispatch').not.toBeNull();
    if (!at) return;
    const held = at.effect.kind === 'move' ? at.effect.before.fileId : '';
    expect(w.sources).toContain(held);

    // The paused attempt's claim lapses; another client asks, and the service recovers under a newer epoch.
    w.clock.later(CLAIM_MS + 1);
    const second = new FakeWorker({ drive: w.drive, scenario: 'first', rootId: w.rootId, runs: w.runs, fresh: false });
    await until(second, 'done');
    expect((await second.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
    expect((await checkpointsOf(w, admitted.id)).at(-1)?.epoch).toBeGreaterThan(at.epoch);
    const records = await recordsOf(w);
    const mutations = w.mutations();

    // The stale attempt wakes and tries its move: the boundary refuses it, and nothing changes.
    pause.release();
    await w.runs.settled();
    expect(w.calls.filter(isMoveOf(held))).toHaveLength(2);
    expect(await recordsOf(w)).toEqual(records);
    expect(w.mutations()).toBe(mutations);
    expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
    await expectFiledOnce(w);
  });

  it('refuses other scopes and a revoked session at the mutation boundary', async () => {
    const pause = pauseFirstMove();
    const w = await bWorld({ hooks: pause.hooks });
    const admitted = (await w.worker.process('all')).run;
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
    const admitted = (await w.worker.process('all')).run;
    await w.runs.settled();
    expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'saving' });
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

    // Every disposition landed before the view, and the view before the done checkpoint (the runner's barrier).
    const order = w.applied.map((c) => (c.op === 'create-text' ? c.name : c.op === 'write-text' && isView(w, c) ? 'last-run.json' : ''));
    const done = order.findIndex((n) => n.startsWith('checkpoint-') && (JSON.parse(textOf(w.applied[order.indexOf(n)] ?? { op: 'trash', id: '' }) ?? '{}') as Checkpoint).phase === 'done');
    const lastDisposition = order.reduce((at, n, i) => (n.startsWith('disposition-') ? i : at), -1);
    expect(lastDisposition).toBeGreaterThan(-1);
    expect(order.indexOf('last-run.json')).toBeGreaterThan(lastDisposition);
    expect(done).toBeGreaterThan(order.indexOf('last-run.json'));
    await expectFiledOnce(w);
  });

  it('clears the last run\'s new marks as B moves and leaves the report unchanged', async () => {
    const w = await bWorld();
    const first = (await w.worker.process('all')).run;
    await w.runs.settled();
    expect((await w.worker.status()).run).toMatchObject({ id: first.id, phase: 'done' });
    const marked = (await w.drive.listAll(w.rootId)).filter((f) => f.appProperties?.bowerNew === '1');
    expect(marked.map((f) => f.id).sort()).toEqual([...w.sources].sort());

    await w.uploader.addPile({ text: '', items: [pdf('extra one.pdf'), pdf('extra two.pdf')] });
    await w.uploader.settled();
    const extra = await inboxPdfs(w.drive, w.rootId);
    expect(extra).toHaveLength(2);
    const second = (await w.worker.process('all')).run;
    await w.runs.settled();
    expect(second.id).not.toBe(first.id);
    expect((await w.worker.status()).run).toMatchObject({ id: second.id, phase: 'done' });

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
    const admitted = (await w.worker.process('all')).run;
    await w.runs.settled();
    const held = (await w.worker.status()).run;
    expect(held).toMatchObject({ id: admitted.id, phase: 'writing' });
    expect(held?.failure).toBeUndefined();
    expect(held?.finishedAt).toBeUndefined();
    expect((await w.worker.process('all')).run).toMatchObject({ id: admitted.id, phase: 'writing' });
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
    const status = await after(w.worker, w.runs);
    const done = (await checkpointsOf(w, admitted.id)).find((c) => c.phase === 'done');
    expect(status).toMatchObject({ id: admitted.id, phase: 'done', finishedAt: done?.phaseAt });
    expect(viewOf(w)?.run).toMatchObject({ id: admitted.id, phase: 'done', report: (await reportsOf(w))[0]?.body.report });
    expect(await domain(w.drive, w.rootId)).toBe(rest);
    await expectFiledOnce(w);
  });

  it('keeps a landed move the person undid before its read-back as they left it, never sending it again', async () => {
    const w = await bWorld();
    const lost = w.sources[0] ?? '';
    w.rules.push(stopsAfter(w.drive, isMoveOf(lost)));
    const admitted = (await w.worker.process('all')).run;
    await w.runs.settled();
    expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'saving' });
    // The move landed, then the file went back where it was: its stamp still says the move was Bower's.
    const inbox = (await w.drive.listAll(w.rootId)).filter((f) => f.folder && w.drive.pathOf(f.id, w.rootId).startsWith('Inbox/'));
    const [manifest] = await manifestsOf(w);
    const before = manifest?.capture.members.find((m) => m.file.fileId === lost)?.file;
    const now = await w.drive.get(lost);
    expect(inbox.some((f) => f.id === before?.parents[0])).toBe(true);
    await w.drive.update(lost, { name: before?.name ?? '', addParent: before?.parents[0] ?? '', removeParent: now.parents[0] ?? '' });

    w.clock.later();
    expect(await after(w.worker, w.runs)).toMatchObject({ id: admitted.id, phase: 'done' });
    expect(w.calls.filter(isMoveOf(lost))).toHaveLength(1);
    expect((await w.drive.get(lost)).parents).toEqual(before?.parents);
    const op = manifest?.operations.find((o) => o.effect.kind === 'move' && o.effect.before.fileId === lost && !('fileId' in o.effect.parent && o.effect.parent.fileId === o.effect.before.parents[0]));
    expect((await checkpointsOf(w, admitted.id)).at(-1)?.outcomes.find((o) => o.operationId === op?.operationId)?.state).toBe('applied');
  });

  it('never reuses an epoch after the service is restored', async () => {
    const w = await bWorld();
    const pending = (call: FencedCall): boolean => {
      const text = textOf(call);
      return named('checkpoint-')(call) && text !== null && (JSON.parse(text) as Checkpoint).report.state === 'pending';
    };
    let refusals = 2;
    w.rules.push((call) => (refusals > 0 && pending(call) ? (refusals--, 'refuse') : undefined));
    const admitted = (await w.worker.process('all')).run;
    await w.runs.settled();
    // A recovery under epoch 2 is refused too, and leaves no checkpoint behind.
    w.clock.later();
    expect(await after(w.worker, w.runs)).toMatchObject({ id: admitted.id, phase: 'saving' });
    expect(refusals).toBe(0);
    expect(Math.max(...(await checkpointsOf(w, admitted.id)).map((c) => c.epoch))).toBe(1);

    const drive = FakeDrive.restore(await w.drive.snapshot());
    const runs = FakeRunService.restore(w.runs.toJSON(), { drive, clock: w.clock.now, scale: 'instant' });
    const worker = new FakeWorker({ drive, scenario: 'first', rootId: w.rootId, runs, fresh: false });
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
    const worker = new FakeWorker({ drive: first.drive, scenario: 'first', rootId: null, runs });
    const rootId = (await worker.createFolder()).id;
    const uploader = new DriveVault({ drive: first.drive, rootId: async () => rootId, runningPiles: () => new Set(), device: 'DEVICE_A' });
    await uploader.addPile({ text: 'Papers about the lease', items: [pdf('lease.pdf'), pdf('inventory.pdf')] });
    await uploader.addPile({ text: '', items: [pdf('idea one.pdf'), pdf('idea two.pdf')] });
    await uploader.settled();
    const sources = await inboxPdfs(first.drive, rootId);
    const view = { drive: first.drive, rootId };
    first.drive.fault = { before: (call) => (isView(view, call, 'done') ? 'refuse' : 'pass') };
    const admitted = (await worker.process('all')).run;
    await runs.settled();

    // The page reloads right now, before any delayed save: what the tab kept is all there is.
    const again = await pretendDrive('first');
    expect(again.fresh).toBe(false);
    expect(again.rootId).toBe(rootId);
    const reloadedRuns = pretendRuns('first', again.drive, again.fresh, 'instant');
    const reloaded = new FakeWorker({ drive: again.drive, scenario: 'first', rootId: again.rootId, runs: reloadedRuns, fresh: false });
    expect(await after(reloaded, reloadedRuns)).toMatchObject({ id: admitted.id, phase: 'done' });
    expect(sources).toHaveLength(4);
    for (const id of sources) {
      expect(again.drive.pathOf(id, rootId).startsWith('Inbox/')).toBe(false);
      expect((await again.drive.evidence(id))?.trashed).toBe(false);
    }
  });

  it('stays done after a restore from a consistent snapshot, its view unchanged, and admits the next run', async () => {
    const w = await bWorld();
    const first = (await w.worker.process('all')).run;
    await w.runs.settled();
    expect((await w.worker.status()).run).toMatchObject({ id: first.id, phase: 'done' });
    const text = w.drive.dump(w.rootId).get(SYSTEM.lastRun);

    const { snapshot, alongside } = await w.drive.snapshotWith(() => w.runs.toJSON());
    const drive = FakeDrive.restore(snapshot);
    const runs = FakeRunService.restore(alongside, { drive, clock: w.clock.now, scale: 'instant' });
    const worker = new FakeWorker({ drive, scenario: 'first', rootId: w.rootId, runs, fresh: false });
    expect(await after(worker, runs)).toMatchObject({ id: first.id, phase: 'done' });
    expect(drive.dump(w.rootId).get(SYSTEM.lastRun)).toBe(text);

    const uploader = new DriveVault({ drive, rootId: async () => w.rootId, runningPiles: () => new Set(), device: 'DEVICE_B' });
    await uploader.addPile({ text: '', items: [pdf('extra one.pdf'), pdf('extra two.pdf')] });
    await uploader.settled();
    const next = (await worker.process('all')).run;
    expect(next.id).not.toBe(first.id);
    await runs.settled();
    expect((await worker.status()).run).toMatchObject({ id: next.id, phase: 'done' });
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
    const admitted = (await w.worker.process('all')).run;
    await w.runs.settled();
    expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
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
      const worker = new FakeWorker({ drive, scenario: 'first', rootId, runs, fresh: false });
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
    const other = new FakeWorker({ drive: w.drive, scenario: 'first', rootId: w.rootId, runs: w.runs, fresh: false });
    const asks = await Promise.all([w.worker.process('all'), w.worker.process('all'), other.process('all')]);
    expect(new Set(asks.map((a) => a.run.id)).size).toBe(1);
    await w.runs.settled();
    expect(await manifestsOf(w)).toHaveLength(1);
    await expectFiledOnce(w);
  });

  // TL-P2-34: a rejected move's sentence by its cause, decided once where the report is materialized.
  it('an ordinary item is set aside by its cause: moved away, or not filed this time', async () => {
    const MOVED = 'It was moved, renamed or removed before Bower could file it.';
    const AGAIN = "It couldn't be filed this time.";
    const act: { at: ((at: DispatchAt) => Promise<void>) | null } = { at: null };
    const w = await bWorld({ hooks: { beforeDispatch: async (at) => { await act.at?.(at); } } });
    await w.uploader.addPile({ text: 'A recipe to keep', items: [pdf('soup.pdf'), pdf('cake.pdf')] });
    await w.uploader.settled();
    const lease = (await w.drive.listAll(w.rootId)).find((f) => f.name === 'lease.pdf');
    let renamed = false;
    act.at = async (at) => {
      // A conflict: Alex renames lease.pdf after Bower checked it and before it moves.
      if (lease && at.effect.kind === 'move' && at.effect.before.fileId === lease.id && !renamed) {
        renamed = true;
        await w.drive.update(lease.id, { name: 'lease, mine.pdf' });
      }
      // Any other cause: the folder the recipes go to cannot be made, as its parent went to the Bin meanwhile.
      if (at.effect.kind === 'create-folder' && at.effect.name === 'Cooking' && 'fileId' in at.effect.parent) await w.drive.trash(at.effect.parent.fileId);
    };
    const admitted = (await w.worker.process('all')).run;
    await w.runs.settled();
    expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
    const setAside = viewOf(w)?.run.report?.setAside ?? [];
    expect(setAside).toContainEqual({ name: 'lease.pdf', why: MOVED });
    expect(setAside).toContainEqual({ name: 'soup.pdf', why: AGAIN });
    expect(setAside).toContainEqual({ name: 'cake.pdf', why: AGAIN });
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
    const admitted = (await w.worker.process('all')).run;
    await w.runs.settled();
    expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
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
    const first = (await w.worker.process('all')).run;
    await w.runs.settled();
    expect((await w.worker.status()).run).toMatchObject({ id: first.id, phase: 'done' });
    const [manifest] = await manifestsOf(w);
    const head = (await checkpointsOf(w, first.id)).at(-1);
    const write = manifest?.operations.find((o) => o.effect.kind === 'write-runner-json' && o.effect.path === SYSTEM.hashes);
    expect(head?.outcomes.find((o) => o.operationId === write?.operationId)?.state).toBe('rejected');
    expect(hashesOf()).not.toEqual(await stored());

    // Alex clears what is left of that pile and adds another; the next run is on the B path too.
    const alex = new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set(), device: 'DEVICE_B' });
    const left = await alex.piles();
    expect(left).toHaveLength(1);
    for (const pile of left) await alex.removePile(pile.id);
    await alex.addPile({ text: '', items: [pdf('extra one.pdf'), pdf('extra two.pdf')] });
    await alex.settled();
    const second = (await w.worker.process('all')).run;
    await w.runs.settled();
    expect((await w.worker.status()).run).toMatchObject({ id: second.id, phase: 'done' });
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
    const worker = new FakeWorker({ drive: first.drive, scenario: 'first', rootId: null, runs });
    const rootId = (await worker.createFolder()).id;
    const uploader = new DriveVault({ drive: first.drive, rootId: async () => rootId, runningPiles: () => new Set(), device: 'DEVICE_A' });
    await uploader.addPile({ text: 'Papers about the lease', items: [pdf('lease.pdf'), pdf('inventory.pdf')] });
    await uploader.addPile({ text: '', items: [pdf('idea one.pdf'), pdf('idea two.pdf')] });
    await uploader.settled();
    const sources = await inboxPdfs(first.drive, rootId);
    // The admission is saved: the Drive and the runs of one instant.
    const view = { drive: first.drive, rootId };
    first.drive.fault = { before: (call) => (isView(view, call, 'done') ? 'refuse' : 'pass') };
    const admitted = (await worker.process('all')).run;
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
    const reloaded = new FakeWorker({ drive: again.drive, scenario: 'first', rootId: again.rootId, runs: reloadedRuns, fresh: false });
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
    // o5-rules-wording: a rule to word is a B.2 edit of Rules.md now.
    it('takes the B path for a rule to word', async () => {
      const w = await bWorld();
      await w.uploader.addRule('Keep lease papers together');
      expect(await plan(w)).toMatchObject({ path: 'b', manifest: { v: 2 } });
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
    // b-path-merges: a thing that could be merged, with no "yes" to merging, is filed on the B path as usual.
    it('takes the B path for a thing that could be merged when nobody said yes', async () => {
      const w = await bWorld();
      await folderPile(w, 'Listing', [{ name: 'listing-88213.example', text: 'a listing', props: { kind: 'other' } }, { name: 'other.pdf', text: '%PDF other' }]);
      expect((await plan(w)).path).toBe('b');
    });
    // TL-P2-21: a pile that has not fully arrived is held out of the capture; the run beside it takes the B path.
    it('takes the B path beside a pile that has not fully arrived, leaving that pile out of the capture', async () => {
      const w = await bWorld();
      const declaring = new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set(), declarePiles: true, device: 'DEVICE_A' });
      beforeUpload(w.drive, ({ name }) => {
        if (name === 'missing.pdf') throw driveError('offline');
      });
      await declaring.addPile({ text: 'Papers', items: [pdf('arrived.pdf'), pdf('missing.pdf')] });
      await declaring.settled();
      const out = await plan(w);
      expect(out.path).toBe('b');
      if (out.path !== 'b') return;
      expect(out.manifest.capture.members.map((m) => m.file.name).sort()).toEqual(['idea one.pdf', 'idea two.pdf', 'inventory.pdf', 'lease.pdf']);
      expect(out.manifest.capture.piles).toHaveLength(2);
    });
    it('keeps a run with a loose thing on the B path (b-path-loose-piles)', async () => {
      const w = await bWorld();
      await w.uploader.addPile({ text: '', items: [pdf('alone.pdf')] });
      await w.uploader.settled();
      expect((await plan(w)).path).toBe('b');
    });
    it('takes the B path for a note to write from a pile of words', async () => {
      const w = await bWorld();
      await w.uploader.addPile({ text: 'Bins go out on Tuesday nights', items: [] });
      expect(await plan(w)).toMatchObject({ path: 'b', manifest: { operations: expect.arrayContaining([expect.objectContaining({ effect: expect.objectContaining({ kind: 'create-text', purpose: 'generated' }) })]) } });
    });
    // b-path-asked-question (TL-P2-37 Q1 (a)): the run's question is a B questions.json write.
    it('takes the B path for a run that asks a question', async () => {
      const w = await bWorld();
      await w.uploader.addPile({ text: 'Saltmere weekend receipts', items: [pdf('taxi.pdf'), pdf('hotel.pdf')] });
      await w.uploader.settled();
      expect(await plan(w)).toMatchObject({ path: 'b', manifest: { operations: expect.arrayContaining([expect.objectContaining({ effect: expect.objectContaining({ kind: 'write-runner-json', path: SYSTEM.questions }) })]) } });
    });
  });

  describe('journal changes take the recoverable path', () => {
    const FOUR = ['idea one.pdf', 'idea two.pdf', 'inventory.pdf', 'lease.pdf'];
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

    // o5-rules-wording and o5-rename-link-rewrite: a rule, a rename or a move takes the B path.
    it('takes the B path for a rule, a rename or a move', async () => {
      const rule = await bWorld();
      await rule.uploader.addRule('Keep lease papers together');
      await rule.uploader.addRequest('Put the lease papers together');
      expect(await plan(rule)).toMatchObject({ path: 'b' });
      expect(await plan(rule, 'instructions')).toMatchObject({ path: 'b' });

      const renamed = await bWorld();
      const projects = await fileAt(renamed, 'Projects');
      await renamed.drive.createFolder(projects.id, 'Garden');
      await vaultOf(renamed).rename('Projects/Garden', 'Garden plans');
      expect((await linesOf(renamed)).map((l) => l.rec.kind)).toEqual(['rename']);
      expect((await plan(renamed)).path).toBe('b');

      const moved = await bWorld();
      await moved.drive.createFolder((await fileAt(moved, 'Projects')).id, 'Garden');
      await vaultOf(moved).move('Projects/Garden', 'Areas');
      expect((await linesOf(moved)).map((l) => l.rec.kind)).toEqual(['move']);
      expect((await plan(moved, 'instructions')).path).toBe('b');

      // The rule's run takes the B path whole: its manifest is recorded and it ends done.
      const admitted = (await rule.worker.process('all')).run;
      await rule.runs.settled();
      expect((await rule.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
      expect((await manifestsOf(rule)).some((m) => m.runId === admitted.id)).toBe(true);
    });

    it('completes a request through requests.json and archives its line only after that write', async () => {
      const w = await bWorld();
      await w.uploader.addRequest('Put the lease papers together');
      const [line, ...more] = await linesOf(w);
      expect(more).toEqual([]);
      if (!line) return;
      const digest = await w.drive.storedDigest(line.file.id);
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });

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
      // qa7-refused-words: the pretend planner does nothing for it, so no row lists it; its archive's row counts no change.
      expect(manifest?.reportPlan.filter((c) => c.value.requests !== undefined)).toEqual([]);
      const rows = manifest?.reportPlan.filter((c) => c.requires.includes(archive?.operationId ?? '')) ?? [];
      expect(rows.map((c) => ({ when: c.when, value: c.value }))).toEqual([{ when: 'applied', value: { filed: [], created: [], updated: [], setAside: [], questions: [], yourChanges: 0 } }]);

      // Settled in requests.json as not done, the line archived once with its bytes, and the report does not call it done.
      const requests = JSON.parse(w.drive.dump(w.rootId).get(SYSTEM.requests) ?? '') as RequestsFile;
      expect(requests.done).toEqual([{ id: line.rec.id, text: 'Put the lease papers together', at: line.rec.at, done: NOTHING_DONE }]);
      expect(w.drive.pathOf(line.file.id, w.rootId)).toBe(`${SYSTEM.archive}/${line.file.name}`);
      expect(movesOf(w, line.file.id)).toBe(1);
      expect(await w.drive.storedDigest(line.file.id)).toEqual(digest);
      expect(await linesOf(w)).toEqual([]);
      const report = viewOf(w)?.run.report;
      expect(report?.requests).toBeUndefined();
      expect(report?.yourChanges ?? 0).toBe(0);
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

      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
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
      const admitted = (await w.worker.process('instructions')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
      const [manifest] = await manifestsOf(w);
      expect(manifest).toMatchObject({ runId: admitted.id, runScope: 'instructions', capture: { piles: [], members: [] } });
      expect(manifest?.operations.some((o) => o.effect.kind === 'write-runner-json' && o.effect.path === SYSTEM.hashes)).toBe(false);
      for (const id of w.sources) expect(movesOf(w, id)).toBe(0);
      expect(await inboxPdfs(w.drive, w.rootId)).toEqual(w.sources);
      // qa7-refused-words: the pretend planner does nothing for the request, so it is not listed done.
      expect(viewOf(w)?.run.report).toMatchObject({ filed: [] });
      expect(viewOf(w)?.run.report?.requests).toBeUndefined();
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
      w.rules.push(stopsAfter(w.drive, isWriteOf(w, SYSTEM.requests)), once(isMoveOf(made.file.id), 'lose-reply'));
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'saving' });
      for (let i = 0; i < 5 && ((await w.worker.status()).run)?.phase !== 'done'; i++) {
        w.clock.later();
        await after(w.worker, w.runs);
      }
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
      expect(w.calls.filter(isWriteOf(w, SYSTEM.requests))).toHaveLength(1);
      for (const l of lines) {
        expect(w.calls.filter(isMoveOf(l.file.id)), `archive calls of ${l.rec.kind}`).toHaveLength(1);
        expect(w.drive.pathOf(l.file.id, w.rootId)).toBe(`${SYSTEM.archive}/${l.file.name}`);
      }
      const requests = JSON.parse(w.drive.dump(w.rootId).get(SYSTEM.requests) ?? '') as RequestsFile;
      expect(requests.done.filter((r) => r.id === asked.rec.id)).toHaveLength(1);
      expect((await checkpointsOf(w, admitted.id)).at(-1)?.outcomes.every((o) => o.state === 'applied')).toBe(true);
      // qa7-refused-words: the request the pretend planner did nothing for is not listed done; the folder counts once.
      expect(requests.done.find((r) => r.id === asked.rec.id)?.done).toBe(NOTHING_DONE);
      expect(viewOf(w)?.run.report).toMatchObject({ yourChanges: 1 });
      expect(viewOf(w)?.run.report?.requests).toBeUndefined();
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
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
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

      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
      const [manifest] = await manifestsOf(w);
      expect(manifest?.capture.journal.map((j) => j.recordId)).toEqual([asked.rec.id]);
      for (const f of kept) expect(manifest?.operations.some((o) => 'before' in o.effect && o.effect.before?.fileId === f.id), `an operation on ${f.name}`).toBe(false);
      expect(w.calls.filter((c) => 'id' in c && kept.some((f) => f.id === c.id))).toEqual([]);
      const after = await Promise.all(kept.map(async (f) => ({ id: f.id, text: await w.drive.readText(f.id), file: (await w.drive.evidence(f.id))?.file })));
      expect(after).toEqual(before);
      expect(w.drive.pathOf(asked.file.id, w.rootId)).toBe(`${SYSTEM.archive}/${asked.file.name}`);
      // qa7-refused-words: the request the pretend planner did nothing for is not listed done, nor counted.
      expect(viewOf(w)?.run.report?.requests).toBeUndefined();
      expect(viewOf(w)?.run.report?.yourChanges ?? 0).toBe(0);
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

      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
      const [manifest] = await manifestsOf(w);
      const write = manifest?.operations.find((o) => o.effect.kind === 'write-runner-json' && o.effect.path === SYSTEM.questions);
      expect(write?.effect.kind === 'write-runner-json' ? write.effect.beforeContent?.sha256 : null).toBe(unreadable?.sha256);
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
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
      const [manifest] = await manifestsOf(w);
      expect(manifest?.capture.journal.map((j) => j.recordId)).toEqual(lines.slice(0, 20).map((l) => l.rec.id));
      // qa7-refused-words: the pretend planner does nothing for them: settled, each saying so, none listed done.
      expect(viewOf(w)?.run.report?.requests).toBeUndefined();
      const done = (JSON.parse(w.drive.dump(w.rootId).get(SYSTEM.requests) ?? '') as RequestsFile).done;
      expect(done.map((r) => r.text)).toEqual(texts.slice(0, 20).reverse());
      expect(done.every((r) => r.done === NOTHING_DONE)).toBe(true);
      expect((await linesOf(w)).map((l) => l.rec.text)).toEqual([texts[20]]);

      const next = (await w.worker.process('instructions')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: next.id, phase: 'done' });
      // qa7-refused-words: the 21st is taken this time, and settled as not done.
      expect(viewOf(w)?.run.report?.requests).toBeUndefined();
      expect((JSON.parse(w.drive.dump(w.rootId).get(SYSTEM.requests) ?? '') as RequestsFile).done[0]).toMatchObject({ text: texts[20], done: NOTHING_DONE });
      expect(await linesOf(w)).toEqual([]);
    });

    it('leaves a rule or rename line it cannot capture in place, on the B path', async () => {
      const at = (kind: JournalRecord['kind'], id: string): JournalRecord => ({ v: 1, id, at: 1, kind, what: `A ${kind}`, device: 'DEVICE_X', ...(kind === 'rule' ? { path: 'Rules.md', text: 'Keep lease papers together' } : { path: 'Projects/Garden plans', from: 'Projects/Garden' }) });
      for (const kind of ['rule', 'rename'] as const) {
        const w = await bWorld();
        await w.uploader.addRequest('Put the lease papers together');
        const [asked] = await linesOf(w);
        const changes = asked?.file.parents[0] ?? '';
        const rec = at(kind, `LINE_${kind.toUpperCase()}`);
        // Two copies with other bytes: the line is left uncaptured, yet a rule's kind still decides the path.
        await w.drive.createText(changes, `${rec.id}.json`, `${JSON.stringify(rec)}\n`);
        await w.drive.createText(changes, `${rec.id}.json`, `${JSON.stringify(rec, null, 1)}\n`);
        const out = await plan(w);
        // o5-rules-wording, o5-rename-link-rewrite: a rule or rename line it cannot capture stays where it is, on B.
        expect(out.path, kind).toBe('b');
        expect(out.path === 'b' ? out.manifest.capture.journal.map((j) => j.recordId) : null, kind).toEqual([asked?.rec.id]);
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
      const earlier = { id: line.rec.id, text: 'Put the lease papers together', at: line.rec.at, done: REQUEST_DONE };
      const older = { id: 'REQUEST_OLDER', text: 'An older request', at: 0, done: REQUEST_DONE };
      await w.drive.writeText(requests.id, `${JSON.stringify({ v: 1, done: [earlier, older] }, null, 2)}\n`, requests.modifiedTime);
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
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
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      for (let i = 0; i < 5 && ((await w.worker.status()).run)?.phase !== 'done'; i++) {
        w.clock.later();
        await after(w.worker, w.runs);
      }
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
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
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
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

  // TL-P2-17 and TL-P2-23: Bower's own files never send a run down the legacy path.
  describe("Bower's own files take the recoverable path", () => {
    const OWN_FILES = "Bower couldn't read its own files. Try again.";
    const LEASE = 'Put the lease papers together';
    const plan = async (w: { drive: FakeDrive; rootId: string }, scope: 'all' | 'instructions' = 'all') =>
      planRun(w.drive, w.rootId, { scope, allowWeb: false, runId: 'run-plan', requestId: 'request-plan', requestedAt: Date.now() });
    const fileAt = async (w: { drive: FakeDrive; rootId: string }, path: string): Promise<DriveFile> => {
      const f = (await w.drive.listAll(w.rootId)).find((x) => w.drive.pathOf(x.id, w.rootId) === path);
      if (!f) throw new Error(`${path} is missing`);
      return f;
    };
    const saying = (w: Pick<World, 'errors'>, message: string): BowerError[] => bowerErrors(w).filter((e) => e.message === message);
    const operationsOf = (m: Manifest | ManifestV2 | undefined): OperationV2[] => (m?.operations ?? []) as OperationV2[];
    const writeOf = (m: Manifest | undefined, path: string): Extract<OperationV2['effect'], { kind: 'write-runner-json' }> | undefined => {
      const effect = m?.operations.find((o) => o.effect.kind === 'write-runner-json' && o.effect.path === path)?.effect;
      return effect?.kind === 'write-runner-json' ? effect : undefined;
    };
    /** A world whose run needs all three runner files: a request to complete and an answer to drop. */
    async function needingAll(): Promise<World> {
      const w = await bWorld();
      const questions = await fileAt(w, SYSTEM.questions);
      await w.drive.writeText(questions.id, `${JSON.stringify({ v: 1, questions: [{ id: 'q-answered', text: 'Question?', yes: 'Yes', no: 'No', askedAt: 1 }] }, null, 2)}\n`, questions.modifiedTime);
      await new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set(), device: 'DEVICE_B' }).answer('q-answered', true);
      await w.uploader.addRequest(LEASE);
      return w;
    }

    it('unreadable runner files never send a run down the legacy path', async () => {
      // A read that fails refuses before admission and before any effect, with one plain sentence and no manifest.
      for (const [path, how] of [[SYSTEM.requests, 'text'], [SYSTEM.hashes, 'text'], [SYSTEM.questions, 'text'], [SYSTEM.requests, 'digest'], [SYSTEM.hashes, 'digest']] as const) {
        const w = await needingAll();
        const target = await fileAt(w, path);
        const before = await domain(w.drive, w.rootId);
        if (how === 'text') {
          const readText = w.drive.readText.bind(w.drive);
          w.drive.readText = async (id) => (id === target.id ? Promise.reject(driveError('offline')) : readText(id));
        } else {
          const storedDigest = w.drive.storedDigest.bind(w.drive);
          w.drive.storedDigest = async (id) => (id === target.id ? Promise.reject(driveError('offline')) : storedDigest(id));
        }
        await expect(w.worker.process('all'), `${how} of ${path}`).rejects.toMatchObject({ message: OWN_FILES });
        await w.runs.settled();
        expect(await recordsOf(w), `${how} of ${path}`).toEqual([]);
        expect(w.calls, `${how} of ${path}`).toEqual([]);
        expect(viewOf(w), `${how} of ${path}`).toBeNull();
        expect(await domain(w.drive, w.rootId), `${how} of ${path}`).toBe(before);
      }

      // A runner file that reads but is malformed is Bower's own: replaced through write-runner-json on the B path.
      const w = await needingAll();
      const broken: Record<string, string> = { [SYSTEM.requests]: '{ "v": 1, "done": [', [SYSTEM.hashes]: '{ "v": 1, "hashes": { "nope": 3 } }\n', [SYSTEM.questions]: '{ "v": 1, "questions": [' };
      const digests = new Map<string, string | undefined>();
      for (const [path, text] of Object.entries(broken)) {
        const f = await fileAt(w, path);
        await w.drive.writeText(f.id, text, f.modifiedTime);
        digests.set(path, (await w.drive.storedDigest(f.id))?.sha256);
      }
      expect(await plan(w)).toMatchObject({ path: 'b' });
      // Only the run's own planning counts below.
      w.errors.mockClear();
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
      const [manifest, ...others] = await manifestsOf(w);
      expect(others).toEqual([]);
      // Each write records the hash of the bytes it could not parse; Drive keeps that revision.
      for (const path of Object.keys(broken)) expect(writeOf(manifest, path)?.beforeContent?.sha256, path).toBe(digests.get(path));
      const dump = w.drive.dump(w.rootId);
      // The fresh files hold only what this run knows: the old entries are never claimed.
      expect((JSON.parse(dump.get(SYSTEM.requests) ?? '') as RequestsFile).done.map((r) => r.text)).toEqual([LEASE]);
      expect(JSON.parse(dump.get(SYSTEM.questions) ?? '')).toEqual({ v: 1, questions: [] });
      const hashes = JSON.parse(dump.get(SYSTEM.hashes) ?? '') as { v: number; hashes: Record<string, string> };
      expect(hashes.v).toBe(1);
      expect(Object.keys(hashes.hashes).every((h) => /^[0-9a-f]{64}$/.test(h))).toBe(true);
      for (const id of w.sources) expect(Object.values(hashes.hashes)).toContain(w.drive.pathOf(id, w.rootId));
      // qa7-refused-words: the request the pretend planner did nothing for is not listed done.
      expect(viewOf(w)?.run.report).toMatchObject({ yourChanges: 1 });
      expect(viewOf(w)?.run.report?.requests).toBeUndefined();
      expect(saying(w, 'Bower replaced its list of done requests, which it could not read.')).toHaveLength(1);
      expect(saying(w, 'Bower replaced its list of your files, which it could not read.')).toHaveLength(1);
      expect(saying(w, 'Bower replaced its list of questions, which it could not read.')).toHaveLength(1);
      await expectFiledOnce(w);

      // A malformed file never blocks a later run: the next one is on the B path too.
      await w.uploader.addPile({ text: 'Papers about the car', items: [pdf('insurance.pdf'), pdf('service.pdf')] });
      await w.uploader.settled();
      const next = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: next.id, phase: 'done' });
      expect((await manifestsOf(w)).some((m) => m.runId === next.id)).toBe(true);
    });

    // b-path-missing-journal (TL-P2-33 §1).
    it('a missing journal plans as an empty one on the recoverable path', async () => {
      /** The journal's own folders a plan makes: `.bower/changes` or its archive. */
      const folders = (m: Manifest | ManifestV2 | undefined): string[] => operationsOf(m).flatMap((o) => (o.effect.kind === 'create-folder' && ['changes', 'archive'].includes(o.effect.name) ? [o.effect.name] : []));
      const isFolderMade = (name: string) => (c: FencedCall): boolean => c.op === 'create-folder' && c.name === name;

      // Neither `.bower/changes` nor its archive: the journal is empty, the run is B, and neither folder is made.
      const gone = await bWorld();
      await gone.drive.trash((await fileAt(gone, SYSTEM.changes)).id);
      const planned = await plan(gone);
      expect(planned).toMatchObject({ path: 'b' });
      if (planned.path !== 'b') return;
      expect(planned.manifest.capture.journal).toEqual([]);
      expect(folders(planned.manifest)).toEqual([]);
      const admitted = (await gone.worker.process('all')).run;
      await gone.runs.settled();
      expect((await gone.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
      expect(gone.calls.filter((c) => isFolderMade('changes')(c) || isFolderMade('archive')(c))).toEqual([]);
      expect(viewOf(gone)?.run.report?.yourChanges).toBeUndefined();
      await expectFiledOnce(gone);

      // No archive and no line to put in it: no folder is made for it.
      const none = await bWorld();
      const quiet = await plan(none);
      expect(quiet.path === 'b' ? folders(quiet.manifest) : null).toEqual([]);
      // A line to archive: the archive is made once, with its key, for that line only.
      const one = await bWorld();
      await one.uploader.addRequest(LEASE);
      const out = await plan(one);
      expect(out.path === 'b' ? operationsOf(out.manifest).filter((o) => o.effect.kind === 'create-folder' && o.effect.name === 'archive').map((o) => o.effect) : null).toEqual([
        { kind: 'create-folder', parent: { fileId: (await fileAt(one, SYSTEM.changes)).id }, name: 'archive', createKey: expect.stringMatching(/^folder-[0-9a-f]{24}$/) },
      ]);

      // A journal read that fails refuses before admission and before any effect, with one plain sentence.
      for (const how of ['text', 'digest'] as const) {
        const w = await bWorld();
        await w.uploader.addRequest(LEASE);
        const line = (await w.drive.listAll(w.rootId)).find((f) => !f.folder && w.drive.pathOf(f.id, w.rootId).startsWith(`${SYSTEM.changes}/`));
        const before = await domain(w.drive, w.rootId);
        if (how === 'text') {
          const readText = w.drive.readText.bind(w.drive);
          w.drive.readText = async (id) => (id === line?.id ? Promise.reject(driveError('offline')) : readText(id));
        } else {
          const storedDigest = w.drive.storedDigest.bind(w.drive);
          w.drive.storedDigest = async (id) => (id === line?.id ? Promise.reject(driveError('offline')) : storedDigest(id));
        }
        for (const scope of ['all', 'instructions'] as const) {
          await expect(w.worker.process(scope), `${how}, ${scope}`).rejects.toMatchObject({ message: OWN_FILES });
        }
        await w.runs.settled();
        expect(await recordsOf(w), how).toEqual([]);
        expect(w.calls, how).toEqual([]);
        expect(viewOf(w), how).toBeNull();
        expect(await domain(w.drive, w.rootId), how).toBe(before);
      }
    });

    it('refuses before admission when the digest of questions.json cannot be read', async () => {
      const w = await needingAll();
      const questions = await fileAt(w, SYSTEM.questions);
      const before = await domain(w.drive, w.rootId);
      const storedDigest = w.drive.storedDigest.bind(w.drive);
      w.drive.storedDigest = async (id) => (id === questions.id ? Promise.reject(driveError('offline')) : storedDigest(id));
      await expect(w.worker.process('all')).rejects.toMatchObject({ message: OWN_FILES });
      await w.runs.settled();
      expect(await recordsOf(w)).toEqual([]);
      expect(w.calls).toEqual([]);
      expect(await domain(w.drive, w.rootId)).toBe(before);
    });

    // TL-P2-33 §2a: a runner file is made only at its supported path under the verified `.bower/`.
    it('grounds a runner file made again only at its own path in .bower', async () => {
      const w = await bWorld();
      await w.drive.trash((await fileAt(w, SYSTEM.hashes)).id);
      const out = await plan(w);
      expect(out.path).toBe('b');
      if (out.path !== 'b') return;
      expect(grounded(out.manifest)).toBe(true);
      const made = operationsOf(out.manifest).findIndex((o) => o.effect.kind === 'create-text' && o.effect.purpose === 'runner-json');
      expect(made).toBeGreaterThanOrEqual(0);
      const tampered = (patch: Record<string, unknown>): Manifest | ManifestV2 => ({
        ...out.manifest,
        operations: operationsOf(out.manifest).map((o, i) => (i === made ? { ...o, effect: { ...o.effect, ...patch } } : o)),
      }) as Manifest | ManifestV2;
      for (const patch of [{ name: 'questions.json' }, { name: 'last-run.json' }, { name: 'notes.json' }, { parent: { fileId: w.rootId } }]) {
        expect(grounded(tampered(patch)), JSON.stringify(patch)).toBe(false);
      }
    });

    it('makes a missing runner file again on the recoverable path', async () => {
      const w = await bWorld();
      await w.uploader.addRequest(LEASE);
      for (const path of [SYSTEM.requests, SYSTEM.hashes]) await w.drive.trash((await fileAt(w, path)).id);
      expect(await plan(w)).toMatchObject({ path: 'b' });
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
      const [manifest] = await manifestsOf(w);
      const made = (manifest?.operations ?? []).flatMap((o) => (o.effect.kind === 'create-text' ? [o.effect] : []));
      expect(made.map((e) => [e.name, e.purpose]).sort()).toEqual([['hashes.json', 'runner-json'], ['requests.json', 'runner-json']]);
      const dump = w.drive.dump(w.rootId);
      expect((JSON.parse(dump.get(SYSTEM.requests) ?? '') as RequestsFile).done.map((r) => r.text)).toEqual([LEASE]);
      expect(Object.values((JSON.parse(dump.get(SYSTEM.hashes) ?? '') as { hashes: Record<string, string> }).hashes)).toHaveLength(4);
      // qa7-refused-words: the request the pretend planner did nothing for is settled, not listed done.
      expect(viewOf(w)?.run.report?.requests).toBeUndefined();
      // One file each, made once.
      for (const name of ['requests.json', 'hashes.json']) expect(w.calls.filter((c) => c.op === 'create-text' && c.name === name)).toHaveLength(1);
      await expectFiledOnce(w);
    });
  });

  // o5-rules-wording: wording a rule in Rules.md is a fixed B operation (TL-P2-20 rules-wording, R3-4, TL-P2-26).
  describe('rules are worded on the recoverable path', () => {
    const RULES = 'Rules.md';
    const LEASE_RULE = 'Keep lease papers together';
    const RECEIPTS_RULE = 'Never file receipts under Projects';
    const plan = async (w: { drive: FakeDrive; rootId: string }, scope: 'all' | 'instructions' = 'all') =>
      planRun(w.drive, w.rootId, { scope, allowWeb: false, runId: 'run-plan', requestId: 'request-plan', requestedAt: Date.now() });
    const fileAt = async (w: { drive: FakeDrive; rootId: string }, path: string): Promise<DriveFile> => {
      const f = (await w.drive.listAll(w.rootId)).find((x) => w.drive.pathOf(x.id, w.rootId) === path);
      if (!f) throw new Error(`${path} is missing`);
      return f;
    };
    const vaultOf = (w: { drive: FakeDrive; rootId: string }): DriveVault => new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set(), device: 'DEVICE_B' });
    /** The journal lines not archived yet, oldest first. */
    async function linesOf(w: { drive: FakeDrive; rootId: string }): Promise<Array<{ file: DriveFile; rec: JournalRecord }>> {
      const files = (await w.drive.listAll(w.rootId)).filter((f) => {
        const path = w.drive.pathOf(f.id, w.rootId);
        return !f.folder && path.startsWith(`${SYSTEM.changes}/`) && !path.startsWith(`${SYSTEM.archive}/`);
      });
      const out = await Promise.all(files.map(async (file) => ({ file, rec: JSON.parse(await w.drive.readText(file.id)) as JournalRecord })));
      return out.sort((a, b) => a.rec.at - b.rec.at || a.file.id.localeCompare(b.file.id));
    }
    const operationsOf = (m: Manifest | ManifestV2 | undefined): OperationV2[] => (m?.operations ?? []) as OperationV2[];
    const archivesOf = (m: Manifest | undefined, fileId: string): OperationV2[] => operationsOf(m).filter((o) => o.effect.kind === 'move' && o.effect.before.fileId === fileId);
    const isRulesWrite = (w: { drive: FakeDrive; rootId: string }) => (c: FencedCall): boolean => c.op === 'write-text' && w.drive.pathOf(c.id, w.rootId) === RULES;
    const isRulesMade = (w: { rootId: string }) => (c: FencedCall): boolean => c.op === 'create-text' && c.parentId === w.rootId && c.name === RULES;
    /** Runs until the run is over, letting a lost reply be reconciled by a later attempt. */
    async function settle(w: World): Promise<RunWire | null> {
      await w.runs.settled();
      for (let i = 0; i < 5 && !['done', 'failed'].includes(((await w.worker.status()).run)?.phase ?? ''); i++) {
        w.clock.later();
        await after(w.worker, w.runs);
      }
      return (await w.worker.status()).run;
    }

    it('a rule is worded once through a recoverable operation', async () => {
      const w = await bWorld();
      await w.uploader.addRule(LEASE_RULE);
      const [line, ...more] = await linesOf(w);
      expect(more).toEqual([]);
      if (!line) return;
      const rules = await fileAt(w, RULES);
      const digest = await w.drive.storedDigest(rules.id);
      expect(await plan(w)).toMatchObject({ path: 'b', manifest: { v: 2 } });

      // The Rules.md write's answer is lost: the run reconciles it from what is stored and never words it twice.
      w.rules.push(once(isRulesWrite(w), 'lose-reply'));
      const admitted = (await w.worker.process('all')).run;
      expect(await settle(w)).toMatchObject({ id: admitted.id, phase: 'done' });
      const [manifest] = await manifestsOf(w);
      const edit = operationsOf(manifest).find((o) => o.effect.kind === 'edit-text');
      // One fixed operation, planned on the bytes it read: their hash and the modified time it read them at.
      expect(edit?.effect).toMatchObject({
        path: RULES,
        before: { fileId: rules.id, modifiedTime: rules.modifiedTime },
        beforeContent: { size: digest?.size, sha256: digest?.sha256 },
        changes: [{ kind: 'rules-wording', add: [{ recordId: line.rec.id, text: wordRule(LEASE_RULE), yourWords: LEASE_RULE, since: line.rec.at }], remove: [] }],
      });
      expect(manifest?.capture.places.map((p) => p.path)).toContain(RULES);
      for (const archive of archivesOf(manifest, line.file.id)) expect(archive.dependsOn).toContain(edit?.operationId);
      expect(w.calls.filter(isRulesWrite(w))).toHaveLength(1);
      const worded = (): Array<[string, string | undefined]> => parseRules(w.drive.dump(w.rootId).get(RULES) ?? '').map((r) => [r.text, r.yourWords]);
      expect(worded()).toEqual([[wordRule(LEASE_RULE), LEASE_RULE]]);
      expect(viewOf(w)?.run.report).toMatchObject({ rulesWorded: 1 });
      expect(viewOf(w)?.run.report?.yourChanges).toBeUndefined();
      expect(await linesOf(w)).toEqual([]);

      // A later run never words it again.
      const wordedText = w.drive.dump(w.rootId).get(RULES);
      await vaultOf(w).addRequest('Put the lease papers together');
      const later = (await w.worker.process('instructions')).run;
      expect(await settle(w)).toMatchObject({ id: later.id, phase: 'done' });
      expect(w.drive.dump(w.rootId).get(RULES)).toBe(wordedText);
      expect(w.calls.filter(isRulesWrite(w))).toHaveLength(1);

      // Taking it out is a recoverable edit too: the rule goes with its "You wrote" line, and no rule is counted.
      const [rule] = (await vaultOf(w).rules()).filter((r) => !r.pending);
      if (!rule) throw new Error('the worded rule is missing');
      await vaultOf(w).removeRule(rule.id);
      const removal = (await w.worker.process('instructions')).run;
      expect(await settle(w)).toMatchObject({ id: removal.id, phase: 'done' });
      expect(worded()).toEqual([]);
      expect(w.drive.dump(w.rootId).get(RULES)).not.toContain('You wrote');
      expect(viewOf(w)?.run.report?.rulesWorded).toBeUndefined();
      expect(await linesOf(w)).toEqual([]);

      // A missing Rules.md is made with create-text, marked as Bower's; each rule's archive is held by it.
      const m = await bWorld();
      await m.drive.trash((await fileAt(m, RULES)).id);
      await vaultOf(m).addRule(LEASE_RULE);
      // Typed a moment later, so it is the newer rule.
      vi.setSystemTime(Date.now() + 2);
      await vaultOf(m).addRule(RECEIPTS_RULE);
      const lines = await linesOf(m);
      expect(lines).toHaveLength(2);
      m.rules.push(once(isRulesMade(m), 'lose-reply'));
      const made = (await m.worker.process('all')).run;
      expect(await settle(m)).toMatchObject({ id: made.id, phase: 'done' });
      const [created] = await manifestsOf(m);
      const create = operationsOf(created).find((o) => o.effect.kind === 'create-text' && o.effect.name === RULES);
      expect(create?.effect).toMatchObject({ parent: { fileId: m.rootId }, purpose: 'generated' });
      for (const l of lines) for (const archive of archivesOf(created, l.file.id)) expect(archive.dependsOn).toContain(create?.operationId);
      expect(m.calls.filter(isRulesMade(m))).toHaveLength(1);
      const files = (await m.drive.listAll(m.rootId)).filter((f) => m.drive.pathOf(f.id, m.rootId) === RULES);
      expect(files).toHaveLength(1);
      const createKey = create?.effect.kind === 'create-text' ? create.effect.createKey : '';
      const text = m.drive.dump(m.rootId).get(RULES) ?? '';
      // With the MD5 of the very text it sent (TL-P4-10).
      expect(files[0]?.appProperties).toEqual({ by: 'bower', bowerNew: '1', bowerItem: createKey, bowerOp: stampOf(made.id, create?.operationId ?? '') });
      expect(text).toContain('by: bower');
      // Newest first, and the count is what the made file holds.
      expect(parseRules(text).map((r) => r.yourWords)).toEqual([RECEIPTS_RULE, LEASE_RULE]);
      expect(viewOf(m)?.run.report?.rulesWorded).toBe(parseRules(text).length);
      expect(await linesOf(m)).toEqual([]);
    });

    // TL-P2-20 rule 3: Rules.md gets one edit per run, its link rewrite and its rules together, within the edit cap.
    it('words a rule and rewrites the links in Rules.md in one edit', async () => {
      const w = await bWorld();
      const rules = await fileAt(w, RULES);
      await w.drive.writeText(rules.id, serializeRules([{ id: 'rule-1', text: 'Keep [[Garden]] receipts together.', yourWords: 'keep garden receipts together', since: Date.parse('2026-10-01T00:00:00Z') }]), rules.modifiedTime);
      await w.drive.createText((await fileAt(w, 'Projects')).id, 'Garden.md', '# Garden\n');
      await vaultOf(w).rename('Projects/Garden.md', 'Garden plans');
      await vaultOf(w).addRule(LEASE_RULE);
      const out = await plan(w);
      expect(out.path).toBe('b');
      if (out.path !== 'b') return;
      const edits = operationsOf(out.manifest).flatMap((o) => (o.effect.kind === 'edit-text' && o.effect.path === RULES ? [o.effect] : []));
      expect(edits.map((e) => e.changes.map((c) => c.kind))).toEqual([['link-rewrite', 'rules-wording']]);
      const admitted = (await w.worker.process('all')).run;
      expect(await settle(w)).toMatchObject({ id: admitted.id, phase: 'done' });
      const text = w.drive.dump(w.rootId).get(RULES) ?? '';
      expect(parseRules(text).map((r) => r.text)).toEqual([wordRule(LEASE_RULE), 'Keep [[Garden plans]] receipts together.']);
      expect(viewOf(w)?.run.report?.rulesWorded).toBe(1);
      expect(await linesOf(w)).toEqual([]);
    });

    // TL-P2-33 §3: yourChanges on B counts archived records that are not requests or rules (TL-P2-23).
    it('counts a rule taken out and a rule already there as none of your changes', async () => {
      const w = await bWorld();
      await w.uploader.addRule(LEASE_RULE);
      const first = (await w.worker.process('all')).run;
      expect(await settle(w)).toMatchObject({ id: first.id, phase: 'done' });
      /** The report contribution that claims a captured line: the one requiring that line's archive move. */
      const rowOf = async (runId: string, recordId: string): Promise<ReportContribution['value'] | undefined> => {
        const manifest = (await manifestsOf(w)).find((m) => m.runId === runId);
        const files = manifest?.capture.journal.find((j) => j.recordId === recordId)?.fileIds ?? [];
        const archives = new Set(files.flatMap((id) => archivesOf(manifest, id).map((o) => o.operationId)));
        return manifest?.reportPlan.find((c) => c.requires.some((id) => archives.has(id)))?.value;
      };

      // The same rule typed again on a device that had not seen it worded, beside a new one.
      const changes = await fileAt(w, SYSTEM.changes);
      const again: JournalRecord = { v: 1, id: 'LINE_AGAIN', at: Date.now(), kind: 'rule', what: `New rule: "${LEASE_RULE}"`, device: 'DEVICE_X', path: RULES, text: LEASE_RULE };
      await w.drive.createText(changes.id, 'LINE_AGAIN.json', `${JSON.stringify(again)}\n`);
      vi.setSystemTime(Date.now() + 2);
      await vaultOf(w).addRule(RECEIPTS_RULE);
      const added = (await linesOf(w)).find((l) => l.rec.id !== again.id);
      const second = (await w.worker.process('instructions')).run;
      expect(await settle(w)).toMatchObject({ id: second.id, phase: 'done' });
      expect(parseRules(w.drive.dump(w.rootId).get(RULES) ?? '').map((r) => r.yourWords)).toEqual([RECEIPTS_RULE, LEASE_RULE]);
      expect(await rowOf(second.id, again.id)).toMatchObject({ yourChanges: 0 });
      expect(await rowOf(second.id, added?.rec.id ?? '')).toMatchObject({ rulesWorded: 1 });
      expect(viewOf(w)?.run.report?.rulesWorded).toBe(1);
      expect(viewOf(w)?.run.report?.yourChanges ?? 0).toBe(0);
      expect(await linesOf(w)).toEqual([]);

      // A rule taken out shows in Rules.md itself, not as one of your changes.
      const [rule] = (await vaultOf(w).rules()).filter((r) => !r.pending && r.yourWords === LEASE_RULE);
      if (!rule) throw new Error('the worded rule is missing');
      await vaultOf(w).removeRule(rule.id);
      const [removal] = await linesOf(w);
      const third = (await w.worker.process('instructions')).run;
      expect(await settle(w)).toMatchObject({ id: third.id, phase: 'done' });
      expect(parseRules(w.drive.dump(w.rootId).get(RULES) ?? '').map((r) => r.yourWords)).toEqual([RECEIPTS_RULE]);
      expect(await rowOf(third.id, removal?.rec.id ?? '')).toMatchObject({ yourChanges: 0 });
      expect(viewOf(w)?.run.report?.rulesWorded).toBeUndefined();
      expect(viewOf(w)?.run.report?.yourChanges ?? 0).toBe(0);
      expect(await linesOf(w)).toEqual([]);
    });

    // TL-P2-20 I10: what is counted is what the written edit words, its link rewrite applied first.
    it('never counts a rule the link rewrite makes a repeat of one already there', async () => {
      const w = await bWorld();
      const rules = await fileAt(w, RULES);
      await w.drive.writeText(rules.id, serializeRules([{ id: 'rule-1', text: 'Keep [[Garden]] receipts together.', yourWords: 'keep garden receipts together', since: Date.parse('2026-10-01T00:00:00Z') }]), rules.modifiedTime);
      await w.drive.createText((await fileAt(w, 'Projects')).id, 'Garden.md', '# Garden\n');
      await vaultOf(w).rename('Projects/Garden.md', 'Garden plans');
      await vaultOf(w).addRule('Keep [[Garden plans]] receipts together');
      const line = (await linesOf(w)).find((l) => l.rec.kind === 'rule');
      const admitted = (await w.worker.process('all')).run;
      expect(await settle(w)).toMatchObject({ id: admitted.id, phase: 'done' });
      const [manifest] = await manifestsOf(w);
      const files = manifest?.capture.journal.find((j) => j.recordId === line?.rec.id)?.fileIds ?? [];
      const archives = new Set(files.flatMap((id) => archivesOf(manifest, id).map((o) => o.operationId)));
      expect(manifest?.reportPlan.find((c) => c.requires.some((id) => archives.has(id)))?.value).toMatchObject({ yourChanges: 0 });
      expect(parseRules(w.drive.dump(w.rootId).get(RULES) ?? '').map((r) => r.text)).toEqual(['Keep [[Garden plans]] receipts together.']);
      expect(viewOf(w)?.run.report?.rulesWorded).toBeUndefined();
      expect(await linesOf(w)).toEqual([]);
    });

    // TL-P2-38: a removal is matched with the same renames the edit's link rewrite applies.
    it('takes out a rule whose link is renamed in the same tidy-up', async () => {
      const w = await bWorld();
      const rules = await fileAt(w, RULES);
      const garden = 'Keep [[Garden]] receipts together.';
      await w.drive.writeText(rules.id, serializeRules([
        { id: 'rule-1', text: garden, yourWords: 'keep garden receipts together', since: Date.parse('2026-10-01T00:00:00Z') },
        { id: 'rule-2', text: wordRule(RECEIPTS_RULE), yourWords: RECEIPTS_RULE, since: Date.parse('2026-10-02T00:00:00Z') },
      ]), rules.modifiedTime);
      await w.drive.createText((await fileAt(w, 'Projects')).id, 'Garden.md', '# Garden\n');
      // Alex takes the rule out, then renames the note it links to, before the next tidy-up.
      const [rule] = (await vaultOf(w).rules()).filter((r) => r.text === garden);
      if (!rule) throw new Error('the rule is missing');
      await vaultOf(w).removeRule(rule.id);
      const removal = (await linesOf(w)).find((l) => l.rec.kind === 'rule');
      await vaultOf(w).rename('Projects/Garden.md', 'Garden plans');
      const admitted = (await w.worker.process('all')).run;
      expect(await settle(w)).toMatchObject({ id: admitted.id, phase: 'done' });
      const text = w.drive.dump(w.rootId).get(RULES) ?? '';
      expect(parseRules(text).map((r) => r.text)).toEqual([wordRule(RECEIPTS_RULE)]);
      expect(text).not.toContain('Garden');
      expect((await linesOf(w)).map((l) => l.rec.id)).not.toContain(removal?.rec.id);
      expect(await linesOf(w)).toEqual([]);
      expect(viewOf(w)?.run.report?.rulesWorded).toBeUndefined();
    });

    it('refuses an instructions run whose only line is a rule left pending, as nothing to read', async () => {
      const w = await bWorld();
      const rules = await fileAt(w, RULES);
      await w.drive.writeText(rules.id, '# My rules\n\n## Rules\n\n- Mine.\n', rules.modifiedTime);
      await w.uploader.addRule(LEASE_RULE);
      await expect(w.worker.process('instructions')).rejects.toMatchObject({ code: 'conflict', message: 'There is nothing new for Bower to read.' });
      await w.runs.settled();
      expect(await recordsOf(w)).toEqual([]);
      expect(w.calls).toEqual([]);
      expect(viewOf(w)).toBeNull();
      expect(await linesOf(w)).toHaveLength(1);
    });

    it('refuses before admission when Rules.md cannot be read', async () => {
      for (const how of ['bytes', 'digest'] as const) {
        const w = await bWorld();
        await w.uploader.addRule(LEASE_RULE);
        const rules = await fileAt(w, RULES);
        const before = await domain(w.drive, w.rootId);
        if (how === 'bytes') {
          const readBytes = w.drive.readBytes.bind(w.drive);
          w.drive.readBytes = async (id) => (id === rules.id ? Promise.reject(driveError('offline')) : readBytes(id));
        } else {
          const storedDigest = w.drive.storedDigest.bind(w.drive);
          w.drive.storedDigest = async (id) => (id === rules.id ? Promise.reject(driveError('offline')) : storedDigest(id));
        }
        await expect(w.worker.process('all'), how).rejects.toMatchObject({ message: "Bower couldn't read its own files. Try again." });
        await w.runs.settled();
        expect(await recordsOf(w), how).toEqual([]);
        expect(w.calls, how).toEqual([]);
        expect(await domain(w.drive, w.rootId), how).toBe(before);
      }
    });

    it('leaves the rules pending past the edit cap, with one BowerError, and words them in a later run', async () => {
      const PENDING = 'Bower could not word some of your rules; they wait for the next tidy-up.';
      // Eight hub notes of Bower's come before Rules.md in path order: their Timeline lines fill the cap.
      const hubs = Array.from({ length: 8 }, (_, i) => ({ path: `Projects/Hub ${i + 1}.md`, what: `Hub ${i + 1} brought up to date.` }));
      const w = await bWorld({ updates: hubs });
      const projects = await fileAt(w, 'Projects');
      for (const hub of hubs) await w.drive.createText(projects.id, nameOf(hub.path), ['---', 'summary: A hub.', 'by: bower', '---', '', 'Words about it.', '', '## Timeline', '- 2026-10-01 · Started.', '', "## Bower's note", 'So far.', ''].join('\n'));
      await w.uploader.addRule(LEASE_RULE);
      const [line] = await linesOf(w);
      const rulesBefore = w.drive.dump(w.rootId).get(RULES);
      const out = await planRun(w.drive, w.rootId, { scope: 'all', allowWeb: false, runId: 'run-plan', requestId: 'request-plan', requestedAt: Date.now(), updates: hubs });
      expect(out.path).toBe('b');
      if (out.path !== 'b') return;
      expect(operationsOf(out.manifest).filter((o) => o.effect.kind === 'edit-text').map((o) => (o.effect.kind === 'edit-text' ? o.effect.path : ''))).toEqual(hubs.map((h) => h.path));
      expect(out.manifest.capture.journal).toEqual([]);
      w.errors.mockClear();
      const admitted = (await w.worker.process('all')).run;
      expect(await settle(w)).toMatchObject({ id: admitted.id, phase: 'done' });
      expect(bowerErrors(w).filter((e) => e.message === PENDING)).toHaveLength(1);
      expect(w.drive.dump(w.rootId).get(RULES)).toBe(rulesBefore);
      expect((await linesOf(w)).map((l) => l.rec.id)).toEqual([line?.rec.id]);
      expect(viewOf(w)?.run.report?.rulesWorded).toBeUndefined();

      // The hub lines are there now: the next run has room, and words the rule.
      const next = (await w.worker.process('instructions')).run;
      expect(await settle(w)).toMatchObject({ id: next.id, phase: 'done' });
      expect(parseRules(w.drive.dump(w.rootId).get(RULES) ?? '').map((r) => r.yourWords)).toEqual([LEASE_RULE]);
      expect(viewOf(w)?.run.report?.rulesWorded).toBe(1);
    });

    it("logs one BowerError for rules left pending in a Rules.md that is not Bower's", async () => {
      const w = await bWorld();
      const rules = await fileAt(w, RULES);
      await w.drive.writeText(rules.id, '# My rules\n\n## Rules\n\n- Mine.\n', rules.modifiedTime);
      await w.uploader.addRule(LEASE_RULE);
      await w.uploader.addRule(RECEIPTS_RULE);
      w.errors.mockClear();
      const admitted = (await w.worker.process('all')).run;
      expect(await settle(w)).toMatchObject({ id: admitted.id, phase: 'done' });
      expect(bowerErrors(w).filter((e) => e.message === 'Bower could not word some of your rules; they wait for the next tidy-up.')).toHaveLength(1);
      expect(await linesOf(w)).toHaveLength(2);
    });

    it("leaves rules pending when Rules.md is not Bower's, and files the rest on the recoverable path", async () => {
      const w = await bWorld();
      const rules = await fileAt(w, RULES);
      await w.drive.writeText(rules.id, '# My rules\n\n## Rules\n\n- Mine.\n', rules.modifiedTime);
      await w.uploader.addRule(LEASE_RULE);
      const [line] = await linesOf(w);
      const out = await plan(w);
      expect(out.path).toBe('b');
      if (out.path !== 'b') return;
      expect(out.manifest.capture.journal).toEqual([]);
      const admitted = (await w.worker.process('all')).run;
      expect(await settle(w)).toMatchObject({ id: admitted.id, phase: 'done' });
      expect(w.drive.dump(w.rootId).get(RULES)).toBe('# My rules\n\n## Rules\n\n- Mine.\n');
      expect((await linesOf(w)).map((l) => l.rec.id)).toEqual([line?.rec.id]);
      expect(viewOf(w)?.run.report?.rulesWorded).toBeUndefined();
      await expectFiledOnce(w);
    });
  });

  // b-path-asked-question (TL-P2-37 Q1 (a)): the run's own question is written by B's questions.json write, and its
  // report row is grounded by that write (contract B: questions equal the validated entries written).
  describe('a question the run asks takes the recoverable path', () => {
    const SALTMERE = 'Saltmere weekend receipts';
    const plan = async (w: { drive: FakeDrive; rootId: string }) =>
      planRun(w.drive, w.rootId, { scope: 'all', allowWeb: false, runId: 'run-plan', requestId: 'request-plan', requestedAt: Date.now() });
    const isQuestionsWrite = (w: { drive: FakeDrive; rootId: string }) => (c: FencedCall): boolean => c.op === 'write-text' && w.drive.pathOf(c.id, w.rootId) === SYSTEM.questions;
    const askedIn = (text: string | undefined): QuestionsFile['questions'] => (text === undefined ? [] : (JSON.parse(text) as QuestionsFile).questions);
    async function settle(w: World): Promise<RunWire | null> {
      await w.runs.settled();
      for (let i = 0; i < 5 && !['done', 'failed'].includes(((await w.worker.status()).run)?.phase ?? ''); i++) {
        w.clock.later();
        await after(w.worker, w.runs);
      }
      return (await w.worker.status()).run;
    }
    async function saltmere(w: World, names = ['taxi.pdf', 'hotel.pdf']): Promise<void> {
      await w.uploader.addPile({ text: SALTMERE, items: names.map(pdf) });
      await w.uploader.settled();
    }

    it('a question the run asks is written once through the recoverable path', async () => {
      const w = await bWorld();
      await saltmere(w);
      // Planned on B: the question goes into the questions.json write, its row requires only that write, with the
      // same fields and askedAt = requestedAt.
      const planned = await plan(w);
      expect(planned.path).toBe('b');
      if (planned.path !== 'b') return;
      const write = planned.manifest.operations.find((o) => o.effect.kind === 'write-runner-json' && o.effect.path === SYSTEM.questions);
      const asked = saltmereQuestion(planned.manifest.requestedAt);
      expect(askedIn(write?.effect.kind === 'write-runner-json' ? write.effect.text : undefined)).toEqual([asked]);
      const rows = planned.manifest.reportPlan.filter((c) => c.value.questions.length);
      expect(rows).toEqual([{ requires: [write?.operationId], when: 'applied', value: { filed: [], created: [], updated: [], setAside: [], questions: [asked] } }]);
      expect(grounded(planned.manifest)).toBe(true);

      // The write's answer is lost: the run reconciles it from what is stored and never asks twice.
      w.rules.push(once(isQuestionsWrite(w), 'lose-reply'));
      const admitted = (await w.worker.process('all')).run;
      expect(await settle(w)).toMatchObject({ id: admitted.id, phase: 'done' });
      const [manifest] = await manifestsOf(w);
      const ran = saltmereQuestion(manifest?.requestedAt ?? -1);
      expect(askedIn(w.drive.dump(w.rootId).get(SYSTEM.questions))).toEqual([ran]);
      expect(w.calls.filter(isQuestionsWrite(w))).toHaveLength(1);
      expect(viewOf(w)?.run.report?.questions).toEqual([ran]);
      expect(viewOf(w)?.run.report?.filed.map((f) => f.name).sort()).toEqual(['hotel.pdf', 'idea one.pdf', 'idea two.pdf', 'inventory.pdf', 'lease.pdf', 'taxi.pdf']);
      expect((await new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set(), device: 'DEVICE_B' }).questions()).map((q) => q.id)).toEqual([ran.id]);

      // A later run with another such pile does not ask it again while it is open.
      await saltmere(w, ['parking.pdf']);
      const later = (await w.worker.process('all')).run;
      expect(await settle(w)).toMatchObject({ id: later.id, phase: 'done' });
      expect(askedIn(w.drive.dump(w.rootId).get(SYSTEM.questions))).toEqual([ran]);
      expect(viewOf(w)?.run.report?.questions).toEqual([]);
      expect(w.calls.filter(isQuestionsWrite(w))).toHaveLength(1);
    });

    it('makes the list of questions again when it is missing, to ask its question', async () => {
      const w = await bWorld();
      await saltmere(w);
      const list = (await w.drive.listAll(w.rootId)).find((f) => w.drive.pathOf(f.id, w.rootId) === SYSTEM.questions);
      await w.drive.trash(list?.id ?? '');
      const planned = await plan(w);
      expect(planned.path).toBe('b');
      if (planned.path !== 'b') return;
      const made = planned.manifest.operations.find((o) => o.effect.kind === 'create-text' && o.effect.name === 'questions.json');
      expect(made?.effect).toMatchObject({ kind: 'create-text', purpose: 'runner-json' });
      expect(planned.manifest.reportPlan.filter((c) => c.value.questions.length).map((c) => c.requires)).toEqual([[made?.operationId]]);
      expect(grounded(planned.manifest)).toBe(true);
      const admitted = (await w.worker.process('all')).run;
      expect(await settle(w)).toMatchObject({ id: admitted.id, phase: 'done' });
      const [manifest] = await manifestsOf(w);
      expect(askedIn(w.drive.dump(w.rootId).get(SYSTEM.questions))).toEqual([saltmereQuestion(manifest?.requestedAt ?? -1)]);
      expect(viewOf(w)?.run.report?.questions).toEqual([saltmereQuestion(manifest?.requestedAt ?? -1)]);
    });
  });

  describe('held piles stay untouched on the recoverable path', () => {
    const FOUR = ['idea one.pdf', 'idea two.pdf', 'inventory.pdf', 'lease.pdf'];
    const DIDNT = 'missing.pdf';
    type Where = { drive: FakeDrive; rootId: string };

    /** A declared pile whose second thing never arrives: readiness holds it. Returns its folder and every id in it. */
    async function addHeld(w: World): Promise<{ folder: string; ids: Set<string> }> {
      const declaring = new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set(), declarePiles: true, device: 'DEVICE_A' });
      beforeUpload(w.drive, ({ name }) => {
        if (name === DIDNT) throw driveError('offline');
      });
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

    // b-path-loose-piles (TL-P2-16 item 5): one file in the Inbox, declared or observed, is a B move on the file as seen.
    it('a loose pile is filed through the recoverable path', async () => {
      const w = await bWorld({ declared: true });
      const declaredPile = await w.uploader.addPile({ text: '', items: [pdf('declared loose.pdf')] });
      const observer = new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set(), device: 'DEVICE_B' });
      await observer.addPile({ text: '', items: [pdf('observed loose.pdf')] });
      await w.uploader.settled();
      await observer.settled();
      const loose = async (name: string): Promise<DriveFile> => {
        const f = (await w.drive.listAll(w.rootId)).find((x) => x.name === name);
        if (!f) throw new Error(`no ${name}`);
        return f;
      };
      const declared = await loose('declared loose.pdf');
      const observed = await loose('observed loose.pdf');

      // Planned on the B path: each is captured with no folder, its file as seen, and nothing goes to the Bin for it.
      const planned = await runPlan(w);
      expect(planned.path).toBe('b');
      if (planned.path !== 'b') return;
      const captured = planned.manifest.capture.piles.filter((p) => p.childFileIds.includes(declared.id) || p.childFileIds.includes(observed.id));
      expect(captured.map((p) => [p.source.kind, p.anchor, p.memberKeys.length])).toEqual(expect.arrayContaining([['declared', null, 1], ['observed', null, 1]]));
      expect(captured.find((p) => p.source.kind === 'declared')?.pileId).toBe(declaredPile.id);
      for (const f of [declared, observed]) {
        expect(planned.manifest.capture.members.find((m) => m.file.fileId === f.id)?.file).toEqual({ fileId: f.id, name: f.name, parents: f.parents, folder: false, modifiedTime: f.modifiedTime });
        expect(planned.manifest.operations.filter((o) => o.effect.kind === 'bin' && o.effect.before.fileId === f.id)).toEqual([]);
      }

      // The declared one's move loses its reply: recovery reconciles it and never moves it twice.
      w.rules.push(once(isMoveOf(declared.id), 'lose-reply'));
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      w.clock.later();
      expect(await after(w.worker, w.runs)).toMatchObject({ id: admitted.id, phase: 'done' });
      expect(w.calls.filter(isMoveOf(declared.id))).toHaveLength(1);
      expect(movesOf(w, observed.id)).toBe(1);
      for (const f of [declared, observed]) expect(w.drive.pathOf(f.id, w.rootId).startsWith('Inbox/')).toBe(false);
      expect(viewOf(w)?.run.report?.filed.map((f) => f.name)).toEqual(expect.arrayContaining(['declared loose.pdf', 'observed loose.pdf']));

      // The declared one is retired by a consumed disposition (TL-P2-03), so it never comes back as a row to choose
      // again, not even once its file leaves the Bower folder (TL-P2-30).
      const consumed = await Promise.all((await dispositions(w)).map(async (f) => parsePileDisposition(await w.drive.readBytes(f.id), w.rootId)));
      expect(consumed.flatMap((d) => (d.ok && d.value.pileId === declaredPile.id ? [d.value.action] : []))).toEqual(['consumed']);
      const reader = (): DriveVault => new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set() });
      expect((await reader().piles()).some((p) => p.id === declaredPile.id)).toBe(false);
      const filed = await w.drive.get(declared.id);
      await w.drive.update(declared.id, { addParent: 'root', removeParent: filed.parents[0] ?? '' });
      expect((await reader().piles()).some((p) => p.id === declaredPile.id)).toBe(false);
    });

    // Final review of loose-pile-declaration: a declared single file given a note becomes an ordinary pile (TL-P2-31 amendment).
    it('a declared single file given a note leaves no row behind once filed and deleted for good', async () => {
      const w = await bWorld({ declared: true });
      const pile = await w.uploader.addPile({ text: '', items: [pdf('loose.pdf')] });
      await w.uploader.settled();
      await w.uploader.updatePile(pile.id, 'About the flat');
      const live = async (): Promise<number> => {
        const copies = (await w.drive.listAll(w.rootId)).filter((f) => !f.folder && w.drive.pathOf(f.id, w.rootId).startsWith('.bower/piles/declaration-'));
        const texts = await Promise.all(copies.map((f) => w.drive.readText(f.id)));
        return texts.filter((t) => t.includes(pile.id)).length;
      };
      expect(await live()).toBe(0);
      await w.worker.process('all');
      await w.runs.settled();
      const filed = (await w.drive.listAll(w.rootId)).find((f) => f.name === 'loose.pdf');
      expect(w.drive.pathOf(filed?.id ?? '', w.rootId).startsWith('Inbox/')).toBe(false);
      // Deleted for good: gone from Drive, not in the Bin.
      (w.drive as unknown as { files: Map<string, unknown> }).files.delete(filed?.id ?? '');
      const reader = new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set() });
      expect((await reader.piles()).some((p) => p.id === pile.id)).toBe(false);
    });

    // Final review of b-path-loose-piles: a held loose file shows its reason in the Inbox, as the run holds it (TL-P2-21, TL-P2-29).
    for (const why of ['changed', 'not-checked', 'unreadable'] as const) {
      it(`an arrived declared loose file the run holds as ${why} shows that reason in the inbox`, async () => {
        const w = await bWorld({ declared: true });
        const pile = await w.uploader.addPile({ text: '', items: [pdf('loose.pdf')] });
        await w.uploader.settled();
        const file = (await w.drive.listAll(w.rootId)).find((f) => f.name === 'loose.pdf');
        if (!file) throw new Error('no loose file');
        if (why === 'changed') await w.drive.writeText(file.id, '%PDF edited', file.modifiedTime);
        if (why === 'not-checked') {
          const real = w.drive.storedDigest.bind(w.drive);
          vi.spyOn(w.drive, 'storedDigest').mockImplementation(async (id) => {
            if (id === file.id) throw driveError('offline');
            return real(id);
          });
        }
        if (why === 'unreadable') {
          const declarationId = file.appProperties?.bowerDeclaration ?? '';
          const copy = (await w.drive.listAll(w.rootId)).find((f) => f.name.startsWith(`declaration-${declarationId}-`));
          const real = w.drive.readBytes.bind(w.drive);
          vi.spyOn(w.drive, 'readBytes').mockImplementation(async (id) => {
            if (id === copy?.id) throw driveError('offline');
            return real(id);
          });
        }
        const reader = new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set() });
        const seen = (await reader.piles()).find((p) => p.id === pile.id);
        expect(seen?.setAside).toBe(why);
        expect(seen?.items.map((i) => [i.name, i.changed])).toEqual([['loose.pdf', why === 'changed' ? true : undefined]]);
        const planned = await runPlan(w);
        expect(planned.manifest.capture.members.map((m) => m.file.fileId)).not.toContain(file.id);
      });
    }

    it('a retired loose declaration costs the inbox no digest and no lookup of its member', async () => {
      const w = await bWorld({ declared: true });
      await w.uploader.addPile({ text: '', items: [pdf('declared loose.pdf')] });
      await w.uploader.settled();
      const file = (await w.drive.listAll(w.rootId)).find((f) => f.name === 'declared loose.pdf');
      await w.worker.process('all');
      await w.runs.settled();
      expect(w.drive.pathOf(file?.id ?? '', w.rootId).startsWith('Inbox/')).toBe(false);
      const digests = vi.spyOn(w.drive, 'storedDigest');
      const bin = vi.spyOn(w.drive, 'binnedByItem');
      await new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set() }).piles();
      expect(digests.mock.calls.filter(([id]) => id === file?.id)).toEqual([]);
      expect(bin).not.toHaveBeenCalled();
    });

    it('keeps the B path while a declared loose file has not arrived, and captures nothing for it', async () => {
      const w = await bWorld({ declared: true });
      beforeUpload(w.drive, ({ name }) => {
        if (name === 'loose.pdf') throw driveError('offline');
      });
      const loose = await w.uploader.addPile({ text: '', items: [pdf('loose.pdf')] });
      await w.uploader.settled();
      const planned = await runPlan(w);
      expect(planned.path).toBe('b');
      if (planned.path !== 'b') return;
      expect(planned.manifest.capture.piles.map((p) => p.pileId)).not.toContain(loose.id);
      expect(planned.manifest.capture.members.map((m) => m.pileId)).not.toContain(loose.id);
    });

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

      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
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

      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
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
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });

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
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
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

      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
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

    // pile-note-read-isolation (TL-P2-08 (a)): the run holds only the pile whose recorded note Drive cannot give back.
    it('holds a pile whose recorded note cannot be read and files the others', async () => {
      const w = await bWorld();
      const lease = await parentOfFile(w, 'lease.pdf');
      const note = (await w.drive.listAll(w.rootId)).find((f) => f.parents[0] === lease && f.name === 'Pile note.md');
      if (!note) throw new Error('missing pile note');
      const ids = new Set([lease, ...(await w.drive.listAll(w.rootId)).filter((f) => f.parents[0] === lease).map((f) => f.id)]);
      const before = await stateOf(w, ids);
      const real = w.drive.readText.bind(w.drive);
      const readText = vi.spyOn(w.drive, 'readText').mockImplementation(async (id) => {
        if (id === note.id) throw driveError('offline');
        return real(id);
      });

      // One note Drive cannot give back never refuses the whole tidy-up.
      const admitting = w.worker.process('all');
      await expect(admitting).resolves.toMatchObject({ run: { id: expect.any(String) } });
      const admitted = (await admitting).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
      const [manifest, ...more] = await manifestsOf(w);
      expect(more).toEqual([]);
      const text = JSON.stringify(manifest);
      for (const id of ids) expect(text, `the manifest names ${id}`).not.toContain(JSON.stringify(id));
      expect(w.calls.filter(touches(ids))).toEqual([]);
      expect(await stateOf(w, ids)).toBe(before);
      expect(viewOf(w)?.run.report?.filed.map((f) => f.name).sort()).toEqual(['idea one.pdf', 'idea two.pdf']);
      const inbox = (): Promise<Pile[]> => new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set(), device: 'DEVICE_B' }).piles();
      expect((await inbox()).map((p) => [p.items.map((i) => i.name).sort(), p.setAside])).toEqual([[['inventory.pdf', 'lease.pdf'], 'not-checked']]);

      // Once Drive answers, the pile is itself again and the next run takes it.
      readText.mockRestore();
      expect((await inbox()).map((p) => [p.text, p.setAside])).toEqual([['Papers about the lease', undefined]]);
    });

    it('holds a pile whose recorded note fails to read only when the plan captures it, and plans the others', async () => {
      const w = await bWorld();
      const lease = await parentOfFile(w, 'lease.pdf');
      const note = (await w.drive.listAll(w.rootId)).find((f) => f.parents[0] === lease && f.name === 'Pile note.md');
      if (!note) throw new Error('missing pile note');
      const real = w.drive.readText.bind(w.drive);
      // The Inbox listing reads it; the next read, the capture's, fails; any later one reads again.
      let reads = 0;
      vi.spyOn(w.drive, 'readText').mockImplementation(async (id) => {
        if (id === note.id && ++reads === 2) throw driveError('offline');
        return real(id);
      });
      const planning = runPlan(w);
      await expect(planning).resolves.toMatchObject({ path: 'b' });
      const planned = await planning;
      if (planned.path !== 'b') return;
      expect(planned.manifest.capture.piles.map((p) => p.anchor?.fileId)).not.toContain(lease);
      expect(planned.manifest.capture.members.map((m) => m.file.name).sort()).toEqual(['idea one.pdf', 'idea two.pdf']);
      expect(reads).toBe(2);
    });

    // note-read-review-1, Minor 2: each read of the recorded note, listing, capture and plan, holds only its pile.
    const failingRead = async (w: World, failAt: number, error: BowerError): Promise<{ lease: string; reads: () => number }> => {
      const lease = await parentOfFile(w, 'lease.pdf');
      const note = (await w.drive.listAll(w.rootId)).find((f) => f.parents[0] === lease && f.name === 'Pile note.md');
      if (!note) throw new Error('missing pile note');
      const real = w.drive.readText.bind(w.drive);
      let reads = 0;
      vi.spyOn(w.drive, 'readText').mockImplementation(async (id) => {
        if (id === note.id && ++reads === failAt) throw error;
        return real(id);
      });
      return { lease, reads: () => reads };
    };

    it('holds a pile the Inbox could not check even when the capture reads its note', async () => {
      const w = await bWorld();
      const { lease, reads } = await failingRead(w, 1, driveError('offline'));
      const planned = await runPlan(w);
      expect(planned.manifest.capture.piles.map((p) => p.anchor?.fileId)).not.toContain(lease);
      expect(planned.manifest.capture.members.map((m) => m.file.name).sort()).toEqual(['idea one.pdf', 'idea two.pdf']);
      expect(reads()).toBe(2);
    });

    it('holds a pile whose note fails to read only when the plan records it, and a sign-out there stops the plan', async () => {
      const w = await bWorld();
      const { lease, reads } = await failingRead(w, 3, driveError('offline'));
      const planned = await runPlan(w);
      expect(reads()).toBe(3);
      expect(planned.manifest.capture.piles.map((p) => p.anchor?.fileId)).not.toContain(lease);
      expect(planned.manifest.capture.members.map((m) => m.file.name).sort()).toEqual(['idea one.pdf', 'idea two.pdf']);
      vi.restoreAllMocks();
      const signedOut = driveError('auth');
      await failingRead(w, 3, signedOut);
      await expect(runPlan(w)).rejects.toBe(signedOut);
    });

    // Final delta review (Important, pile-note-format-visible): the refusal is checked on the note a run records.
    it.each([
      ['---\nbower_format: ownership/9\n---\nPapers about the lease\n', 'note-format'],
      ['---\nbower_format: ownership/2\n---\nPapers about the lease\n', 'note-damaged'],
    ] as const)('holds a declared pile whose context note, not listed first, Bower refuses (%#), and files the others', async (body, reason) => {
      const w = await bWorld({ declared: true });
      const { folder, keyed } = await leasePile(w);
      await w.drive.createText(folder, 'Pile note.md', 'Soup recipes to try');
      const context = await w.drive.createText(folder, 'Pile note.md', body, { ...keyed.appProperties });
      await w.drive.trash(keyed.id);
      const ids = new Set([folder, ...(await w.drive.listAll(w.rootId)).filter((f) => f.parents[0] === folder).map((f) => f.id)]);
      const before = await stateOf(w, ids);
      const inbox = await new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set(), declarePiles: true, device: 'DEVICE_B' }).piles();
      expect(inbox.find((p) => p.items.some((i) => i.name === 'lease.pdf'))).toMatchObject({ setAside: reason, noteLocked: true });
      const planning = runPlan(w);
      await expect(planning).resolves.toMatchObject({ path: 'b' });
      const planned = await planning;
      if (planned.path !== 'b') return;
      expect(planned.manifest.capture.piles.map((p) => p.anchor?.fileId)).not.toContain(folder);
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
      expect(viewOf(w)?.run.report?.filed.map((f) => f.name).sort()).toEqual(['idea one.pdf', 'idea two.pdf']);
      expect(await stateOf(w, ids)).toBe(before);
      expect(await w.drive.readText(context.id)).toBe(body);
    });

    // Final review: the capture checks the refusal itself, even when the listing it starts from read the note before.
    it('holds a declared pile whose context note became a newer format after the listing read it', async () => {
      const w = await bWorld({ declared: true });
      const { folder, keyed } = await leasePile(w);
      await w.drive.createText(folder, 'Pile note.md', 'Soup recipes to try');
      const bound = await w.drive.createText(folder, 'Pile note.md', 'Papers about the lease', { ...keyed.appProperties });
      await w.drive.trash(keyed.id);
      const real = w.drive.readText.bind(w.drive);
      let reads = 0;
      // The listing reads the context note as it was; by the capture, another device wrote a newer format into it.
      vi.spyOn(w.drive, 'readText').mockImplementation(async (id) => {
        if (id === bound.id && ++reads >= 2) return '---\nbower_format: ownership/9\n---\nPapers\n';
        return real(id);
      });
      const planned = await runPlan(w);
      expect(reads).toBe(2);
      expect(planned.manifest.capture.piles.map((p) => p.anchor?.fileId)).not.toContain(folder);
      expect(planned.manifest.capture.members.map((m) => m.file.name).sort()).toEqual(['idea one.pdf', 'idea two.pdf']);
    });

    it('holds a declared pile whose bound note, not listed first, cannot be read, and plans the others', async () => {
      const w = await bWorld({ declared: true });
      const { folder, keyed } = await leasePile(w);
      const text = await w.drive.readText(keyed.id);
      await w.drive.createText(folder, 'Pile note.md', 'Soup recipes to try');
      const bound = await w.drive.createText(folder, 'Pile note.md', text, { ...keyed.appProperties });
      await w.drive.trash(keyed.id);
      const real = w.drive.readText.bind(w.drive);
      vi.spyOn(w.drive, 'readText').mockImplementation(async (id) => {
        if (id === bound.id) throw driveError('offline');
        return real(id);
      });
      // One note Drive cannot give back never refuses the whole plan.
      const planning = runPlan(w);
      await expect(planning).resolves.toMatchObject({ path: 'b' });
      const planned = await planning;
      if (planned.path !== 'b') return;
      expect(planned.manifest.capture.piles.map((p) => p.anchor?.fileId)).not.toContain(folder);
      expect(planned.manifest.capture.members.map((m) => m.file.name).sort()).toEqual(['idea one.pdf', 'idea two.pdf']);
      // A sign-out still stops the plan.
      vi.spyOn(w.drive, 'readText').mockImplementation(async (id) => {
        if (id === bound.id) throw driveError('auth');
        return real(id);
      });
      await expect(runPlan(w)).rejects.toMatchObject({ code: 'auth' });
    });

    it('admits nothing when only held piles are waiting', async () => {
      const w = await bWorld();
      const first = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: first.id, phase: 'done' });
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
      expect((await w.worker.status()).run).toMatchObject({ id: first.id, phase: 'done' });
    });

    it('recovers a run beside a held pile without ever touching it', async () => {
      const pause = pauseFirstMove();
      const w = await bWorld({ hooks: pause.hooks });
      const held = await addHeld(w);
      const before = await stateOf(w, held.ids);
      const admitted = (await w.worker.process('all')).run;
      const at = await reached(pause.paused, w.runs);
      expect(at, 'the first move was paused before its dispatch').not.toBeNull();
      if (!at) return;

      // The paused attempt's claim lapses; another client asks, and the service recovers under a newer epoch.
      w.clock.later(CLAIM_MS + 1);
      const second = new FakeWorker({ drive: w.drive, scenario: 'first', rootId: w.rootId, runs: w.runs, fresh: false });
      await until(second, 'done');
      expect((await second.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
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
      const worker = new FakeWorker({ drive, scenario: 'first', rootId: w.rootId, runs, fresh: false });
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
      const first = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: first.id, phase: 'done' });
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
      const byId = (a: { id: string }, b: { id: string }): number => a.id.localeCompare(b.id);
      expect(planned.manifest.capture.members.filter((m) => m.pileId === pile?.pileId).map((m) => ({ id: m.file.fileId, key: m.memberKey })).sort(byId)).toEqual(things.map((id) => ({ id, key: null })).sort(byId));
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
      const first = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: first.id, phase: 'done' });
      expect(late).not.toBeNull();
      const lateId = late ?? '';
      expect(await childNames(w, folder)).toEqual(['Pile note.md', 'later.txt']);
      const disposed = await dispositions(w);
      expect(disposed).toHaveLength(2);

      await plannedLeftover(w, folder, [lateId], keyed.id);
      const second = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: second.id, phase: 'done' });
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
      const first = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: first.id, phase: 'done' });
      expect(await childNames(w, folder)).toEqual(['Pile note.md', 'Pile note.md']);
      const disposed = await dispositions(w);
      expect(disposed).toHaveLength(2);
      // Alex adds one more thing to the pile after it was tidied.
      const later = await w.drive.createText(folder, 'later.txt', 'added later');
      const kept = await w.drive.evidence(second.id);

      const planned = await plannedLeftover(w, folder, [later.id], keyed.id);
      expect(planned?.manifest.capture.members.map((m) => m.file.fileId)).not.toContain(second.id);
      const next = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: next.id, phase: 'done' });
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
      const next = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: next.id, phase: 'done' });
      expect(viewOf(w)?.run.report).toMatchObject({ filed: [{ name: 'stray.txt' }], setAside: [] });
      expect((await w.drive.evidence(w.folder))?.trashed).toBe(true);
      expect(await dispositions(w)).toEqual(w.disposed);
    });

    /**
     * Members a legacy run filed, as it left them: moved out of the inbox under their names, with no disposition. A
     * pile folder left empty went to the Bin. The legacy runner is gone (TL-P2-38); folders keep its work.
     */
    async function asALegacyRunLeftIt(w: World, ids: readonly string[]): Promise<void> {
      const resources = (await w.drive.listAll(w.rootId)).find((f) => f.folder && f.name === 'Resources' && f.parents[0] === w.rootId);
      const folders = new Set<string>();
      for (const id of ids) {
        const f = await w.drive.get(id);
        folders.add(f.parents[0] ?? '');
        await w.drive.update(id, { addParent: resources?.id ?? '', removeParent: f.parents[0] ?? '', appProperties: { bowerNew: '1', asAdded: null, origin: null, kind: null, pile: null } });
      }
      for (const folder of folders) if (!(await w.drive.listAll(folder)).some((f) => f.parents[0] === folder)) await w.drive.trash(folder);
    }

    it('accounts for members a legacy run filed by looking them up, and files what is left on the B path', async () => {
      const w = await bWorld({ declared: true });
      const { folder, keyed } = await leasePile(w);
      // What a legacy run left, which wrote no disposition and can no longer run (TL-P2-38): every member filed, the
      // ideas pile's folder in the Bin, and a thing Alex added to the lease pile while it ran.
      await asALegacyRunLeftIt(w, w.sources);
      const lateId = (await w.drive.createText(folder, 'later.txt', 'arrived late')).id;
      expect(await recordsOf(w)).toEqual([]);
      expect(await childNames(w, folder)).toEqual(['Pile note.md', 'later.txt']);
      expect(await dispositions(w)).toEqual([]);
      for (const id of w.sources) expect(inInbox(w, id), `${id} still in the Inbox`).toBe(false);

      await plannedLeftover(w, folder, [lateId], keyed.id);
      const next = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: next.id, phase: 'done' });
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
      const next = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: next.id, phase: 'done' });
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
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
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
      // What a legacy run cut off right after it moved the lease left (it wrote no disposition, TL-P2-38).
      await asALegacyRunLeftIt(w, [lease]);
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

      const next = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: next.id, phase: 'done' });
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
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
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
      const next = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: next.id, phase: 'done' });
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
      const admitted = (await w.worker.process('all')).run;
      const at = await reached(paused, w.runs);
      expect(at, 'the first move was paused before its dispatch').not.toBeNull();
      if (!at) return;

      // The paused attempt's claim lapses; another client asks, and the service recovers under a newer epoch.
      w.clock.later(CLAIM_MS + 1);
      const other = new FakeWorker({ drive: w.drive, scenario: 'first', rootId: w.rootId, runs: w.runs, fresh: false });
      await until(other, 'done');
      expect((await other.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
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
      const worker = new FakeWorker({ drive, scenario: 'first', rootId: w.rootId, runs, fresh: false });
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
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      for (let i = 0; i < 8 && ((await w.worker.status()).run)?.phase !== 'done'; i++) {
        w.clock.later();
        await after(w.worker, w.runs);
      }
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
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
      // The item Bin waits for its words to be written; the parent waits for every item Bin.
      const bin = out.manifest.operations.find((o) => o.effect.kind === 'bin' && o.effect.capturedChildIds.length === 1);
      if (!bin || bin.effect.kind !== 'bin') throw new Error('no pile Bin');
      const parentId = bin.effect.before.fileId;
      const items = out.manifest.operations.filter((o) => o.effect.kind === 'bin' && o.effect.before.parents.includes(parentId));
      expect(items.map((o) => o.effect.kind === 'bin' ? o.effect.before.fileId : '')).toEqual(bin.effect.capturedChildIds);
      expect(bin.dependsOn).toEqual(items.map((o) => o.operationId));
      expect(items).toHaveLength(1);
      expect(items[0]?.dependsOn).toEqual([words?.operationId]);

      // Both replies are lost: recovery finds each note by its key and never writes it again.
      w.rules.push(once(isCreateOf(`${WORDS} (2).md`), 'lose-reply'), once(isCreateOf('Industrial Designer, Ferrowick.md'), 'lose-reply'));
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      for (let i = 0; i < 8 && ((await w.worker.status()).run)?.phase !== 'done'; i++) {
        w.clock.later();
        await after(w.worker, w.runs);
      }
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
      const [manifest] = await manifestsOf(w);
      for (const op of createsOf(manifest?.operations ?? [])) {
        expect(w.calls.filter(isCreateOf(op.effect.name)), op.effect.name).toHaveLength(1);
        const made = (await w.drive.listAll(w.rootId)).filter((f) => !f.folder && f.name === op.effect.name);
        expect(made, op.effect.name).toHaveLength(1);
        expect(made[0]?.appProperties).toEqual({ by: 'bower', bowerNew: '1', bowerItem: op.effect.createKey, bowerOp: stampOf(admitted.id, op.operationId) });
        expect(w.drive.dump(w.rootId).get(w.drive.pathOf(made[0]?.id ?? '', w.rootId))).toBe(op.effect.text);
      }
      expect(w.drive.dump(w.rootId).get(`Resources/Ideas/${WORDS}.md`)).toBe('Alex wrote this one.');
      const report = viewOf(w)?.run.report;
      expect(report?.created).toEqual(expect.arrayContaining([
        { path: `Resources/Ideas/${WORDS} (2).md`, what: 'Written from a note you added.' },
        { path: COMPANION, what: 'A note for Offer, Industrial Designer, Ferrowick.' },
      ]));
      expect(report?.filed).toContainEqual({ name: 'Your note', title: `${WORDS} (2)`, kind: 'note', to: 'Resources/Ideas', note: `Resources/Ideas/${WORDS} (2).md` });
      expect(report?.filed.find((f) => f.name === OFFER)).toMatchObject({ to: 'Projects/Job hunt/Applications' });
      expect((await new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set(), device: 'DEVICE_B' }).piles()).some((p) => p.id === w.pileId)).toBe(false);
    });

    it('a lookalike note at the planned place is never taken as ours: the words stay in the inbox', async () => {
      let drive: FakeDrive | null = null;
      let ideas = '';
      let made = false;
      const hooks: Hooks = {
        beforeDispatch: async (at) => {
          if (!drive || made || (at.effect.kind === 'create-text' && at.effect.name === `${WORDS} (2).md`)) return;
          // Alex makes a note with that very name after Bower planned it, while the run goes and before Bower makes its own.
          made = true;
          await drive.createText(ideas, `${WORDS} (2).md`, 'Alex got there first.');
        },
      };
      const w = await generating({ hooks });
      drive = w.drive;
      ideas = w.ideas.id;
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
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
      let made = false;
      const hooks: Hooks = {
        beforeDispatch: async (at) => {
          if (!drive || made || (at.effect.kind === 'create-text' && at.effect.name === 'Industrial Designer, Ferrowick.md')) return;
          // Alex makes a note with that very name after Bower planned it, before Bower makes its own: Bower's is not written.
          const folder = (await drive.listAll(rootId)).find((f) => f.folder && drive?.pathOf(f.id, rootId) === 'Projects/Job hunt/Applications');
          if (!folder) return;
          made = true;
          await drive.createText(folder.id, 'Industrial Designer, Ferrowick.md', 'Alex got there first.');
        },
      };
      const w = await generating({ hooks });
      drive = w.drive;
      rootId = w.rootId;
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
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
      let w = await bWorld({ declared: true });
      const lease = (await w.uploader.piles()).find((p) => p.text === 'Papers about the lease');
      const folder = (await w.drive.listAll(w.rootId)).find((f) => f.folder && w.drive.pathOf(f.id, w.rootId) === lease?.path);
      if (!lease || !folder) throw new Error('no lease pile');
      const note = (await w.drive.listAll(folder.id)).find((f) => f.parents[0] === folder.id && f.name === 'Pile note.md');
      if (!note) throw new Error('no pile note');
      const key = note.appProperties?.bowerItem;
      // Reload a fixture where the context write never landed: no live note and no Bin entry.
      const kept = JSON.parse(await w.drive.snapshot()) as { files: Array<{ meta: { id: string } }> };
      const drive = FakeDrive.restore(JSON.stringify({ ...kept, files: kept.files.filter((f) => f.meta.id !== note.id) }));
      drive.fault = w.drive.fault;
      drive.onChange = w.drive.onChange;
      const runs = FakeRunService.restore(w.runs.toJSON(), { drive, clock: w.clock.now, scale: 'instant' });
      const worker = new FakeWorker({ drive, runs, scenario: 'first', rootId: w.rootId });
      const uploader = new DriveVault({ drive, rootId: async () => w.rootId, runningPiles: () => new Set(), declarePiles: true, device: 'DEVICE_A' });
      w = { ...w, drive, runs, worker, uploader };
      const children = async (): Promise<string> => JSON.stringify((await w.drive.listAll(folder.id)).filter((f) => f.parents[0] === folder.id).map((f) => [f.id, f.name, f.modifiedTime]));
      const before = await children();

      const out = await plan(w);
      expect(out).toMatchObject({ path: 'b' });
      if (out.path !== 'b') return;
      expect(out.manifest.capture.piles.map((p) => p.anchor?.fileId)).not.toContain(folder.id);

      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
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
      expect(out.path).toBe('b');
      if (out.path !== 'b') return;
      // The first note is the context, written as one generated note; the other is an uncaptured child.
      const pile = out.manifest.capture.piles.find((p) => p.anchor?.fileId === folder.id);
      expect(pile?.childFileIds).toEqual([first.id]);
      const creates = out.manifest.operations.filter((o) => o.effect.kind === 'create-text');
      expect(creates.map((o) => (o.effect.kind === 'create-text' ? [o.effect.name, o.effect.purpose] : []))).toEqual([['Bins go out on Tuesday nights.md', 'generated']]);

      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
      expect(await generatedNotes(w)).toEqual(['Resources/Ideas/Bins go out on Tuesday nights.md']);
      expect(viewOf(w)?.run.report?.filed).toContainEqual({ name: 'Your note', title: 'Bins go out on Tuesday nights', kind: 'note', to: 'Resources/Ideas', note: 'Resources/Ideas/Bins go out on Tuesday nights.md' });
      // The folder stays with the other note (late-child rule); the words it filed are not in it any more.
      expect((await w.drive.evidence(folder.id))?.trashed).toBe(false);
      expect((await w.drive.listAll(folder.id)).filter((f) => f.parents[0] === folder.id).map((f) => f.id)).toEqual([second.id]);
      expect(await w.drive.readText(second.id)).toBe('Recycling on Fridays');

      // The next run files the other note's words once, and never the first ones again.
      w.clock.later();
      const next = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: next.id, phase: 'done' });
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

      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
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
        // TL-P2-36 (9): a note no record can carry is a damaged note (it was not-checked before).
        expect((await inboxOf(w)).find((p) => p.path === `Inbox/${broken.name}`)?.setAside, where).toBe('note-damaged');
        const admitted = (await w.worker.process('all')).run;
        await w.runs.settled();
        expect((await w.worker.status()).run, where).toMatchObject({ id: admitted.id, phase: 'done' });
        expect(viewOf(w)?.run.report?.filed.map((f) => f.name).sort(), where).toEqual(['idea one.pdf', 'idea two.pdf', 'inventory.pdf', 'lease.pdf']);
        expect(await stateOf(w, broken.id), where).toBe(before);
        expect((await inboxOf(w)).find((p) => p.path === `Inbox/${broken.name}`)?.setAside, where).toBe('note-damaged');

        // Alone: the Inbox shows the reason, and the tidy-up says honestly that nothing is ready, touching nothing.
        const alone = await bWorld();
        const sources = new Set(alone.sources);
        for (const p of await alone.uploader.piles()) {
          const folder = (await alone.drive.listAll(alone.rootId)).find((f) => f.folder && alone.drive.pathOf(f.id, alone.rootId) === p.path);
          if (folder && p.items.some((i) => sources.has(i.id))) await alone.drive.trash(folder.id);
        }
        const only = await brokenPile(alone, where);
        const kept = await stateOf(alone, only.id);
        expect((await inboxOf(alone)).map((p) => [p.path, p.setAside]), where).toEqual([[`Inbox/${only.name}`, 'note-damaged']]);
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
      // TL-P2-36 (9): a context note no record can carry is a damaged note (it was not-checked before).
      expect((await inboxOf(declared)).find((p) => p.id === c.pileId)?.setAside, 'declared context, Inbox').toBe('note-damaged');
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
        const context = m.operations.find((o) => o.effect.kind === 'bin' && !o.effect.before.folder && o.dependsOn.includes(op.operationId));
        if (!context) throw new Error('no words Bin');
        const folder = path ? at(path) : undefined;
        if (path && !folder) throw new Error(`no ${path}`);
        op.effect.parent = { fileId: folder?.id ?? w.rootId };
        if (folder) m.capture.places.push({ file: { fileId: folder.id, name: folder.name, parents: [...folder.parents], folder: true, modifiedTime: folder.modifiedTime }, path });
        const note = path ? `${path}/${op.effect.name}` : op.effect.name;
        for (const c of m.reportPlan.filter((x) => x.requires[0] === op.operationId && x.when === 'applied')) {
          c.requires = c.requires.filter((id) => id === op.operationId || id === context.operationId);
          c.value.created = c.value.created.map((row) => ({ ...row, path: note }));
          c.value.filed = c.value.filed.map((f) => ({ ...f, to: path, note }));
        }
        const rows = m.reportPlan.filter((c) => c.requires[0] === op.operationId && c.when === 'applied');
        expect(rows.flatMap((c) => c.value.created)).toHaveLength(1);
        expect(rows.flatMap((c) => c.value.filed)).toHaveLength(1);
        expect(rows.find((c) => c.value.created.length)?.requires).toEqual([op.operationId]);
        expect(rows.find((c) => c.value.filed.length)?.requires).toEqual([op.operationId, context.operationId]);
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
      w.rules.push(stopsAfter(w.drive, isWords));
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'saving' });
      const made = (await w.drive.listAll(w.rootId)).filter((f) => !f.folder && f.name === `${words}.md`);
      expect(made).toHaveLength(1);
      // The mark goes before recovery (opened elsewhere): the key, place and bytes still prove the note is this one.
      await w.drive.update(made[0]?.id ?? '', { appProperties: { bowerNew: null } });
      for (let i = 0; i < 5 && ((await w.worker.status()).run)?.phase !== 'done'; i++) {
        w.clock.later();
        await after(w.worker, w.runs);
      }
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
      expect(w.calls.filter(isWords)).toHaveLength(1);
      expect((await w.drive.listAll(w.rootId)).filter((f) => !f.folder && f.name === `${words}.md`)).toHaveLength(1);
      expect(viewOf(w)?.run.report?.filed.map((f) => f.name)).toContain('Your note');
    });
  });

  // o5-timeline-append (TL-P2-20 B.2, TL-P2-26): a hub note's Timeline line is a v2 `edit-text` authored by `applyChanges`.
  describe('a Timeline line is added once and keeps the rest of the note', () => {
    const FLAT = 'Projects/Flat hunt/Flat hunt.md';
    const JOB = 'Projects/Job hunt/Job hunt.md';
    const FLAT_WHAT = 'A new listing added to the shortlist.';
    const JOB_WHAT = 'New offer from Ferrowick: fully remote, 42,000 a year, start 2 November.';
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
    const touching = (m: Ops, id: string): OperationV2[] => (m?.operations ?? []).filter((o) => 'before' in o.effect && o.effect.before?.fileId === id);
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
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });

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
        // Its row names its line's ordinal, and the note as the run leaves it: the edit's bytes and the mark's stamp.
        const left = { lines: 1, md5: md5Hex(new TextEncoder().encode(edit?.effect.text ?? '')), stamp: stampOf(manifest?.runId ?? '', (mark as OperationV2 | undefined)?.operationId ?? '') };
        expect(manifest?.reportPlan.filter((c) => c.value.updated.length)).toContainEqual({
          requires: [edit?.operationId], when: 'applied', value: { filed: [], created: [], updated: [{ path: edit?.effect.path, what, op: edit?.operationId, line: 0, ...left }], setAside: [], questions: [] },
        });
      }
      if (!manifest) return;
      expect(grounded(manifest)).toBe(true);
      // An edit with a Timeline line and no row of its own is never grounded.
      const row = manifest.reportPlan.findIndex((c) => c.value.updated.length);
      const plan = (patch: Partial<ReportContribution['value']>, requires?: string[]): ManifestV2 => ({
        ...manifest, reportPlan: manifest.reportPlan.map((c, i) => (i === row ? { ...c, ...(requires ? { requires } : {}), value: { ...c.value, ...patch } } : c)),
      });
      const move = manifest.operations.find((o) => o.effect.kind === 'move');
      expect(grounded(plan({}, [move?.operationId ?? '']))).toBe(false);

      // Only the Timeline payload changed: every other byte, line ending and the personal words are as they were.
      expect(textAt(w, FLAT)).toBe(legacyHub(['- 2026-10-01 · Started the flat hunt.', `- ${date} · ${FLAT_WHAT}`]));
      expect(textAt(w, JOB)).toBe(v2Hub(['## Timeline', '- 2026-10-02 · First offer in.', `- ${date} · ${JOB_WHAT}`]));
      for (const file of [flat, job]) {
        expect(writesTo(w.applied, file.id)).toHaveLength(1);
        expect((await w.drive.evidence(file.id))?.file.appProperties?.bowerNew).toBe('1');
      }
      expect(viewOf(w)?.run.report?.updated).toMatchObject([{ path: FLAT, what: FLAT_WHAT }, { path: JOB, what: JOB_WHAT }]);
      await expectFiledOnce(w);

      // The next tidy-up finds both lines there: a v1 plan with no edit, the notes untouched, nothing reported.
      const flatAfter = textAt(w, FLAT);
      const jobAfter = textAt(w, JOB);
      await w.uploader.addPile({ text: '', items: [pdf('third.pdf'), pdf('fourth.pdf')] });
      await w.uploader.settled();
      const next = (await w.worker.process('all')).run;
      expect(next.id).not.toBe(admitted.id);
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: next.id, phase: 'done' });
      const second = (await manifestsV2(w)).find((m) => m.runId === next.id);
      expect(second?.v).toBe(1);
      expect(editsOf(second)).toEqual([]);
      expect(textAt(w, FLAT)).toBe(flatAfter);
      expect(textAt(w, JOB)).toBe(jobAfter);
      for (const file of [flat, job]) expect(writesTo(w.calls, file.id)).toHaveLength(1);
      expect(viewOf(w)?.run.report?.updated).toEqual([]);
    });

    // TL-P4-19 addendum 3: each updated row names the edit that wrote it and its Timeline line (counted from the end),
    // in the plan and in the report the app reads, so the New mark ties by id, never by words.
    it("each updated row carries its edit's op id and its line", async () => {
      const w = await bWorld();
      await hub(w, FLAT, FLAT_BEFORE);
      await hub(w, JOB, JOB_BEFORE);
      await w.worker.process('all');
      await w.runs.settled();
      const [manifest] = await manifestsV2(w);
      const edits = editsOf(manifest);
      const rows = viewOf(w)?.run.report?.updated ?? [];
      expect(rows.map((r) => r.path)).toEqual([FLAT, JOB]);
      for (const row of rows) {
        const edit = edits.find((e) => e.effect.path === row.path);
        // The note as the run left it, as Drive keeps it: its stamp and its checksum (TL-P4-19 addendum 5).
        const stored = await w.drive.get(edit?.effect.before.fileId ?? '', { checksums: true });
        expect(row).toEqual({ path: row.path, what: row.what, op: edit?.operationId, line: 0, lines: 1, md5: stored.md5Checksum, stamp: stored.appProperties?.bowerOp });
        expect(manifest?.reportPlan.filter((c) => c.value.updated.length && c.requires[0] === edit?.operationId).flatMap((c) => c.value.updated)).toEqual([row]);
      }
    });

    // TL-P4-19 addenda 4 and 5: a row's line is its ordinal among the lines its op wrote, and the note screen marks it
    // New only while the note is as the op left it (its stamp and its checksum), read through the app's own note read.
    const NOTE_READ = (w: Where) => new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set(), device: 'DEVICE_B' });
    const SECOND = 'The shortlist cut to two flats near the station.';

    it("with no edit the New mark is on the op's line by its ordinal", async () => {
      const w = await bWorld({ updates: [{ path: FLAT, what: FLAT_WHAT }, { path: FLAT, what: SECOND }] });
      await hub(w, FLAT, FLAT_BEFORE);
      await w.worker.process('all');
      await w.runs.settled();
      const rows = (viewOf(w)?.run.report?.updated ?? []).filter((r) => r.path === FLAT);
      // The smoke's shape: two Timeline lines on Flat hunt, two rows, each its own line counted among the op's lines.
      expect(rows.map((r) => [r.what, r.line])).toEqual([[FLAT_WHAT, 0], [SECOND, 1]]);
      const note = await NOTE_READ(w).note(FLAT);
      const at = (what: string): number => note.timeline.findIndex((t) => t.text === what);
      expect(note.timeline.length).toBe(3);
      for (const row of rows) expect([...newLineIndexes(note, [row])]).toEqual([at(row.what)]);
      expect([...newLineIndexes(note, rows)].sort()).toEqual([1, 2]);
    });

    it("a person's edit after the run drops the New mark and keeps the row", async () => {
      const w = await bWorld({ updates: [{ path: FLAT, what: FLAT_WHAT }] });
      const flat = await hub(w, FLAT, FLAT_BEFORE);
      await w.worker.process('all');
      await w.runs.settled();
      const rows = (viewOf(w)?.run.report?.updated ?? []).filter((r) => r.path === FLAT);
      expect(rows).toHaveLength(1);
      expect([...newLineIndexes(await NOTE_READ(w).note(FLAT), rows)]).toEqual([1]);
      // The person adds a line of their own below Bower's, in another app (no stamp of theirs): the mark is dropped,
      // never moved onto their line.
      const text = textAt(w, FLAT) ?? '';
      const lines = text.split('\n');
      const i = lines.findIndex((l) => l.includes(FLAT_WHAT));
      lines.splice(i + 1, 0, '- 2026-10-09 · Called the agent about the deposit.');
      const now = (await w.drive.listAll(w.rootId)).find((f) => f.id === flat.id);
      await w.drive.writeText(flat.id, lines.join('\n'), now?.modifiedTime ?? '');
      const note = await NOTE_READ(w).note(FLAT);
      expect(note.timeline.map((t) => t.text)).toContain('Called the agent about the deposit.');
      expect([...newLineIndexes(note, rows)]).toEqual([]);
      // The report row stays as the run wrote it.
      expect((viewOf(w)?.run.report?.updated ?? []).filter((r) => r.path === FLAT)).toEqual(rows);
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
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
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
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
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
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
      const [manifest] = await manifestsV2(w);
      const [edit, mark] = touching(manifest, flat.id);
      expect(await outcomeOf(w, admitted.id, edit)).toMatchObject({ state: 'rejected', failure: { code: 'conflict' } });
      expect(await outcomeOf(w, admitted.id, mark)).toMatchObject({ state: 'rejected' });
      expect(textAt(w, FLAT)).toBe(theirs);
      expect(w.calls.filter((c) => 'id' in c && c.id === flat.id)).toEqual([]);
      expect((await w.drive.evidence(flat.id))?.file.appProperties?.bowerNew).toBeUndefined();
      expect(viewOf(w)?.run.report?.updated).toMatchObject([{ path: JOB, what: JOB_WHAT }]);
      await expectFiledOnce(w);
    });

    // Rule 4, as the runner applies it (`spine/engine.ts`): the bytes read must be the planned ones, and the write
    // carries the modifiedTime the plan read, so any change since the plan, even to the same bytes, is a clash.
    it('refuses an edit when the note changed since the plan read it, even only its modified time', async () => {
      const ahead = acting();
      const w = await bWorld({ hooks: ahead.hooks });
      const flat = await hub(w, FLAT, FLAT_BEFORE);
      let touched = '';
      ahead.act.at = async (at) => {
        if (at.effect.kind !== 'move' || ahead.act.at === null) return;
        ahead.act.at = null;
        touched = (await w.drive.writeText(flat.id, FLAT_BEFORE, (await w.drive.get(flat.id)).modifiedTime)).modifiedTime;
      };
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
      const [manifest] = await manifestsV2(w);
      const [edit] = editsOf(manifest);
      expect(touched).not.toBe('');
      expect(touched).not.toBe(edit?.effect.before.modifiedTime);
      expect(writesTo(w.applied, flat.id)).toEqual([]);
      expect(textAt(w, FLAT)).toBe(FLAT_BEFORE);
      expect(await outcomeOf(w, admitted.id, edit)).toMatchObject({ state: 'rejected', failure: { code: 'conflict' } });

      const after = acting();
      const v = await bWorld({ hooks: after.hooks });
      const late = await hub(v, FLAT, FLAT_BEFORE);
      after.act.at = async (at) => {
        if (!isEditOf(FLAT)(at) || after.act.at === null) return;
        after.act.at = null;
        await v.drive.writeText(late.id, FLAT_BEFORE, (await v.drive.get(late.id)).modifiedTime);
      };
      const second = (await v.worker.process('all')).run;
      await v.runs.settled();
      expect((await v.worker.status()).run).toMatchObject({ id: second.id, phase: 'done' });
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
        const worker = new FakeWorker({ drive, scenario: 'first', rootId: w.rootId, runs, fresh: false });
        return { drive, rootId: w.rootId, runs, worker, applied };
      }
      async function expectOneLine(r: Awaited<ReturnType<typeof restored>>, id: string, runId: string): Promise<void> {
        expect((await r.worker.status()).run).toMatchObject({ id: runId, phase: 'done' });
        const [manifest] = await manifestsV2(r);
        const [edit] = editsOf(manifest);
        expect(textAt(r, FLAT)).toBe(edit?.effect.text);
        expect(textAt(r, FLAT)?.split(FLAT_WHAT)).toHaveLength(2);
        expect(viewOf(r)?.run.report?.updated).toMatchObject([{ path: FLAT, what: FLAT_WHAT }]);
        expect((await r.drive.evidence(id))?.file.appProperties?.bowerNew).toBe('1');
        expect(writesTo(r.applied, id)).toEqual([]);
      }

      const w = await bWorld();
      const flat = await hub(w, FLAT, FLAT_BEFORE);
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
      expect(writesTo(w.applied, flat.id)).toHaveLength(1);
      const done = await restored(w);
      expect(await after(done.worker, done.runs)).toMatchObject({ id: admitted.id, phase: 'done' });
      await expectOneLine(done, flat.id, admitted.id);

      const v = await bWorld();
      const late = await hub(v, FLAT, FLAT_BEFORE);
      v.rules.push(stopsAfter(v.drive, (call) => call.op === 'write-text' && call.id === late.id));
      const cut = (await v.worker.process('all')).run;
      await v.runs.settled();
      expect((await v.worker.status()).run).toMatchObject({ id: cut.id, phase: 'saving' });
      expect(writesTo(v.applied, late.id)).toHaveLength(1);
      const back = await restored(v);
      expect((await back.worker.status()).run).toMatchObject({ id: cut.id, phase: 'saving' });
      for (let i = 0; i < 4 && ((await back.worker.status()).run)?.phase !== 'done'; i++) {
        v.clock.later();
        await after(back.worker, back.runs);
      }
      await expectOneLine(back, late.id, cut.id);
    });

    it('reads a lost reply back by its stamp: its text is applied once, and what the person wrote since is kept', async () => {
      const isWrite = (id: string) => (call: FencedCall): boolean => call.op === 'write-text' && call.id === id;
      /** A run whose write of the Flat hunt note lands and loses its reply; `meanwhile` acts before the recovery. */
      async function lost(meanwhile?: (w: World, id: string) => Promise<void>) {
        const w = await bWorld();
        const flat = await hub(w, FLAT, FLAT_BEFORE);
        w.rules.push(stopsAfter(w.drive, isWrite(flat.id)));
        const admitted = (await w.worker.process('all')).run;
        await w.runs.settled();
        expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'saving' });
        await meanwhile?.(w, flat.id);
        for (let i = 0; i < 4 && ((await w.worker.status()).run)?.phase !== 'done'; i++) {
          w.clock.later();
          await after(w.worker, w.runs);
        }
        const [manifest] = await manifestsV2(w);
        return { w, flat, admitted, edit: editsOf(manifest)[0] };
      }

      const applied = await lost();
      expect((await applied.w.worker.status()).run).toMatchObject({ id: applied.admitted.id, phase: 'done' });
      expect(writesTo(applied.w.calls, applied.flat.id)).toHaveLength(1);
      expect(textAt(applied.w, FLAT)).toBe(applied.edit?.effect.text);
      expect(textAt(applied.w, FLAT)?.split(FLAT_WHAT)).toHaveLength(2);
      expect(await outcomeOf(applied.w, applied.admitted.id, applied.edit)).toMatchObject({ state: 'applied' });
      expect(viewOf(applied.w)?.run.report?.updated).toMatchObject([{ path: FLAT, what: FLAT_WHAT }]);

      const back = async (w: World, id: string, text: string): Promise<void> => {
        await w.drive.writeText(id, text, (await w.drive.get(id)).modifiedTime);
      };
      const before = await lost((w, id) => back(w, id, FLAT_BEFORE));
      const other = FLAT_BEFORE.replace('Three flats so far.', 'Four flats, says Alex.');
      const elsewhere = await lost((w, id) => back(w, id, other));
      // The write landed (its stamp is on the note), so it is applied and never sent again; the person's text stays.
      for (const [run, text] of [[before, FLAT_BEFORE], [elsewhere, other]] as const) {
        expect((await run.w.worker.status()).run).toMatchObject({ id: run.admitted.id, phase: 'done' });
        expect(writesTo(run.w.calls, run.flat.id)).toHaveLength(1);
        expect(textAt(run.w, FLAT)).toBe(text);
        expect(await outcomeOf(run.w, run.admitted.id, run.edit)).toMatchObject({ state: 'applied' });
      }
    });

    // note-edit-consumer-limits (TL-P2-29 (1), corrected): at most 8 edit-text per run in code-point path order, then
    // fewer from the end of that order until the manifest fits the guard's 8 MiB; the rest wait for the next run.
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
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
      const manifest = (await manifestsV2(w)).find((m) => m.runId === admitted.id);
      expect(manifest, 'the run took the B path').toBeDefined();
      return { manifest, paths: editsOf(manifest).map((o) => o.effect.path) };
    }


    it('note edits past the size cap wait for the next run', async () => {
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
      expect(viewOf(w)?.run.report?.updated).toMatchObject(first.map((path) => ({ path, what: whatOf(path) })));
      await expectFiledOnce(w);
      // The next tidy-up skips the 8 lines already there and adds the rest: every note has its line once.
      const two = await tidy(w, 1);
      expect(two.paths).toEqual(rest);
      for (const path of sorted) {
        expect(writesTo(w.calls, idOf(path))).toHaveLength(1);
        expect(textAt(w, path)?.split(whatOf(path))).toHaveLength(2);
      }
      expect(viewOf(w)?.run.report?.updated).toMatchObject(rest.map((path) => ({ path, what: whatOf(path) })));
    });

    // The ten notes just under 1 MiB are the heaviest run in the suite. Its time bound is a bound on the work that took
    // the time, so a busy machine cannot move it (CPU seconds did: 9.5 alone, 15.8 inside the full run): the characters
    // handed to the UTF-8 encoder. Measured here with no load, the run encoded 5.96 billion characters (11.4 s of wall
    // time) when every span of a note re-encoded its prefix, and 1.51 billion (6.8 s) with one byte table per note.
    const ENCODE_BOUND = 3_000_000_000;
    it('the size-cap run fits its time bound with no load', async () => {
      let encoded = 0;
      const encode = TextEncoder.prototype.encode;
      TextEncoder.prototype.encode = function (this: TextEncoder, input?: string): Uint8Array<ArrayBuffer> {
        encoded += input?.length ?? 0;
        return encode.call(this, input);
      };
      try {
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
      } finally {
        TextEncoder.prototype.encode = encode;
      }
      expect(encoded).toBeLessThan(ENCODE_BOUND);
    }, 30_000);

    // TL-P2-20 R3-7 m9: a build that reads manifest versions names a later one plainly, and leaves the run saving;
    // only for the very bytes the run recorded (their digest is the name's), never for damaged ones.
    it('an unknown later manifest version says this tidy-up needs a newer Bower', async () => {
      /** A saving run reloaded on a Drive whose manifest now says v: 3, renamed to its digest when `matching`. */
      async function later(matching: boolean) {
        const w = await refusedView();
        expect((await w.worker.status()).run).toMatchObject({ id: w.admitted.id, phase: 'saving' });
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
        const worker = new FakeWorker({ drive, scenario: 'first', rootId: w.rootId, runs, fresh: false });
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
      const worker = new FakeWorker({ drive, scenario: 'first', rootId: w.rootId, runs, fresh: false });
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
    const MOVED = 'It was moved, renamed or removed before Bower could file it.';
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
      const link = await plainName(w, (await w.drive.listAll(w.rootId)).find((f) => !f.folder && f.name.endsWith('.url')));
      return { w, act, link, bytes: await w.drive.readText(link.id) };
    }
    const isLinkMove = (id: string) => (at: DispatchAt): boolean => at.effect.kind === 'move' && at.effect.before.fileId === id;
    async function tidy(w: World): Promise<{ id: string; manifest: AnyManifest | undefined }> {
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      const manifest = (await manifestsAll(w)).find((m) => m.runId === admitted.id);
      expect(manifest, 'the run took the B path').toBeDefined();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
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
      // TL-P2-40: the note it wrote is listed with the notes the run made.
      expect(filed[0]?.value.created).toEqual([{ path: NOTE, what: 'A link you saved.' }]);
      expect(manifest.reportPlan).toContainEqual({ requires: [move.operationId], when: 'rejected', value: { filed: [], created: [], updated: [], setAside: [{ name: CURRY.name, why: AGAIN }], questions: [] } });
      expect(grounded(manifest)).toBe(true);
      expect(await groundedKeys(manifest)).toBe(true);
      // A note's create with no row is never grounded, nor a create with another key.
      const at = manifest.reportPlan.indexOf(filed[0] as ReportContribution);
      const plan = (patch: (c: ReportContribution) => ReportContribution): AnyManifest => ({ ...manifest, reportPlan: manifest.reportPlan.map((c, i) => (i === at ? patch(c) : c)) }) as AnyManifest;
      expect(grounded(plan((c) => ({ ...c, requires: c.requires.filter((r) => r !== create.operationId) })))).toBe(false);
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
      w.rules.push(stopsAfter(w.drive, (c) => c.op === 'create-text' && c.name === NOTE_NAME));
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'saving' });
      for (let i = 0; i < 4 && ((await w.worker.status()).run)?.phase !== 'done'; i++) {
        w.clock.later();
        await after(w.worker, w.runs);
      }
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
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
      expect(viewOf(w)?.run.report?.setAside).toEqual([{ name: CURRY.name, why: MOVED }]);
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
      // A note reused is not one this run made.
      expect(viewOf(w)?.run.report?.created.map((c) => c.path)).not.toContain(NOTE);
    });

    it('checks a reused note again before the move, and sets the link aside when it is no longer the one', async () => {
      const { w, act, link } = await linkWorld();
      act.at = async (at) => {
        if (!isLinkMove(link.id)(at) || act.at === null) return;
        act.at = null;
        await w.drive.update(link.id, { name: 'curry, mine.url' });
      };
      await tidy(w);
      await w.drive.update(link.id, { name: link.name });
      const [note] = await notesOf(w);
      // While the run goes, before the move's checks, the note loses Bower's key for this link: the move is refused, nothing else.
      act.at = async (at) => {
        if (isLinkMove(link.id)(at) || act.at === null) return;
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

    // Review o5-consumers-review-1 I1: rows use the file name; a saved link added under another name is not planned here.
    it('names a saved link by its file in every row, refusing any other name, also when the inbox renamed it', async () => {
      const { w, link } = await linkWorld();
      const { manifest } = await tidy(w);
      if (!manifest) return;
      expect(manifest.reportPlan.flatMap((c) => [...c.value.filed, ...c.value.setAside]).filter((r) => r.name.includes('curry')).map((r) => r.name)).toEqual([link.name, link.name]);
      // A link renamed when it was added (x.example became x.example.url) takes the B path too, named by its file.
      const v = await bWorld();
      await v.uploader.addPile({ text: 'A recipe to keep', items: [CURRY, pdf('shopping list.pdf')] });
      await v.uploader.settled();
      const added = (await v.drive.listAll(v.rootId)).find((f) => !f.folder && f.name.endsWith('.url'));
      expect(added?.name).toBe(`${CURRY.name}.url`);
      await tidy(v);
      expect(v.drive.pathOf(added?.id ?? '', v.rootId)).toBe(`Resources/Cooking/${CURRY.name}.url`);
      expect(viewOf(v)?.run.report?.filed).toContainEqual({ name: `${CURRY.name}.url`, title: 'Weeknight curry, clipping', kind: 'link', to: 'Resources/Cooking', note: NOTE });
      expect(await notesOf(v)).toHaveLength(1);
    });

    // Review at r1 9e57a33: a saved link's note is placed as every generated note is (TL-P2-17), main folders only.
    it("grounds a saved link's note only under a main folder, never in the inbox, Bower's own files or the root", async () => {
      const { w, link } = await linkWorld();
      const { manifest } = await tidy(w);
      if (!manifest) return;
      expect(grounded(manifest)).toBe(true);
      const ops = manifest.operations as OperationV2[];
      const create = ops.find((o) => o.effect.kind === 'create-text');
      const move = ops.find((o) => o.effect.kind === 'move' && o.effect.before.fileId === link.id);
      if (create?.effect.kind !== 'create-text' || move?.effect.kind !== 'move') throw new Error('no saved-link note planned');
      const name = create.effect.name;
      const listing = await w.drive.listAll(w.rootId);
      /** The note and the link both put in `path` (`fileId` that folder), recorded as a captured place. */
      const moved = (fileId: string, path: string): AnyManifest => {
        const to = { fileId };
        const operations = ops.map((o) => (o === create || o === move ? { ...o, effect: { ...o.effect, parent: to } } : o));
        const reportPlan = manifest.reportPlan.map((c) => (c.when === 'applied' && c.requires.includes(move.operationId)
          ? { ...c, requires: c.requires.filter((id) => operations.some((o) => o.operationId === id && o.effect.kind !== 'create-folder')), value: { ...c.value, filed: c.value.filed.map((r) => (r.name === link.name ? { ...r, to: path, note: path ? `${path}/${name}` : name } : r)) } }
          : c));
        const folder = listing.find((f) => f.id === fileId);
        const places = folder ? [...manifest.capture.places, { file: { fileId: folder.id, name: folder.name, parents: folder.parents, folder: true, modifiedTime: folder.modifiedTime }, path }] : manifest.capture.places;
        return { ...manifest, operations, reportPlan, capture: { ...manifest.capture, places } } as AnyManifest;
      };
      for (const path of ['Inbox', SYSTEM.dir]) {
        const folder = listing.find((f) => f.folder && w.drive.pathOf(f.id, w.rootId) === path);
        expect(folder, path).toBeDefined();
        expect(grounded(moved(folder?.id ?? '', path)), path).toBe(false);
      }
      expect(grounded(moved(w.rootId, '')), 'the root').toBe(false);
    });

    it('a saved link is set aside by its cause: moved away, or not filed this time', async () => {
      // A conflict: the link file is renamed right before its move.
      const moved = await linkWorld();
      moved.act.at = async (at) => {
        if (!isLinkMove(moved.link.id)(at) || moved.act.at === null) return;
        moved.act.at = null;
        await moved.w.drive.update(moved.link.id, { name: 'curry, mine.url' });
      };
      await tidy(moved.w);
      expect(viewOf(moved.w)?.run.report?.setAside).toEqual([{ name: CURRY.name, why: MOVED }]);
      // A failed dependency: its note cannot be written, as the folder for it cannot be made; the move waits on it.
      const other = await linkWorld();
      other.act.at = async (at) => {
        if (at.effect.kind === 'create-folder' && at.effect.name === 'Cooking' && 'fileId' in at.effect.parent) await other.w.drive.trash(at.effect.parent.fileId);
      };
      const run = await tidy(other.w);
      const move = opOf(run.manifest, (o) => o.effect.kind === 'move' && o.effect.before.fileId === other.link.id);
      expect((await checkpointsOf(other.w, run.id)).at(-1)?.outcomes[move?.ordinal ?? -1]).toMatchObject({ state: 'rejected' });
      expect(await notesOf(other.w)).toEqual([]);
      expect(viewOf(other.w)?.run.report?.setAside.filter((r) => r.name === CURRY.name)).toEqual([{ name: CURRY.name, why: AGAIN }]);
    });
  });

  // o5-rename-link-rewrite (TL-P2-20 link-rewrite, rule 7, C2/R3-4; TL-P2-29 (1)): after a rename every [[link]] to the
  // old name is one edit-text per note, fixed with its precondition; the rename's line is archived only after every
  // rewrite it needs applied, and stays when one is refused at plan time, rejected, or waits for a later run.
  describe('link rewrites after a rename recover without repeating', () => {
    type Where = { drive: FakeDrive; rootId: string };
    type Edit = OperationV2 & { effect: EditText };
    const WEEKEND = 'Areas/Home/Weekend.md';
    const PLAN = 'Projects/Garden/Plan.md';
    const PLAIN = 'Projects/Garden/Shopping.md';
    /** A person's note: two links to Seeds, one in code, one Markdown link, and their own words. */
    const weekend = (name: string): string => `# Weekend\n\nSow [[${name}]] first, then [[ ${name} #Tomatoes|the tomatoes]].\nKeep \`[[Seeds]]\` and [Seeds](Seeds.md) as they are.\n`;
    const REWRITTEN = '# Weekend\n\nSow [[Seed list]] first, then [[ Seed list #Tomatoes|the tomatoes]].\nKeep `[[Seeds]]` and [Seeds](Seeds.md) as they are.\n';
    /** A legacy note of Bower's, CRLF, a link in its frontmatter and in its Timeline. */
    const plan = (name: string): string => ['---', `related: [[${name}]]`, 'by: bower', '---', '', 'Beds by the fence.', '', '## Timeline', `- 2026-10-01 · Bought [[${name}]].`, ''].join('\r\n');
    const manifestsAll = async (w: Where): Promise<ManifestV2[]> =>
      (await recordsOf(w)).filter((r) => r.name.startsWith('manifest-')).map((r) => JSON.parse(r.text) as ManifestV2);
    const editsOf = (m: { operations: readonly OperationV2[] } | undefined): Edit[] => (m?.operations ?? []).filter((o): o is Edit => o.effect.kind === 'edit-text');
    const textAt = (w: Where, path: string): string | undefined => w.drive.dump(w.rootId).get(path);
    const writesTo = (calls: FencedCall[], id: string): FencedCall[] => calls.filter((c) => c.op === 'write-text' && c.id === id);
    const folderAt = async (w: Where, path: string): Promise<string> => {
      let parent = w.rootId;
      for (const name of path.split('/')) {
        const there = (await w.drive.listAll(w.rootId)).find((f) => f.folder && f.name === name && f.parents[0] === parent);
        parent = there ? there.id : (await w.drive.createFolder(parent, name)).id;
      }
      return parent;
    };
    const note = async (w: Where, path: string, text: string): Promise<DriveFile> => w.drive.createText(await folderAt(w, parentPath(path)), path.split('/').at(-1) ?? '', text);
    const parentPath = (path: string): string => path.split('/').slice(0, -1).join('/');
    /** Unarchived journal lines. */
    const pending = async (w: Where): Promise<JournalRecord[]> => {
      const files = (await w.drive.listAll(w.rootId)).filter((f) => !f.folder && w.drive.pathOf(f.id, w.rootId).startsWith(`${SYSTEM.changes}/`) && !w.drive.pathOf(f.id, w.rootId).startsWith(`${SYSTEM.archive}/`));
      return Promise.all(files.map(async (f) => JSON.parse(await w.drive.readText(f.id)) as JournalRecord));
    };
    /** Seeds and the notes that link to it; then Alex renames Seeds to Seed list (one rename line). */
    async function renamed(o: { hooks?: Hooks } = {}) {
      const w = await bWorld(o);
      await note(w, 'Projects/Garden/Seeds.md', '# Seeds\n');
      const files = { weekend: await note(w, WEEKEND, weekend('Seeds')), plan: await note(w, PLAN, plan('seeds')), plain: await note(w, PLAIN, '# Shopping\n\nCompost and string.\n') };
      const alex = new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set(), device: 'DEVICE_B' });
      await alex.rename('Projects/Garden/Seeds.md', 'Seed list');
      const [line, ...more] = await pending(w);
      expect(more).toEqual([]);
      expect(line?.kind).toBe('rename');
      return { w, files, line: line as JournalRecord };
    }
    async function tidy(w: World, n = 0): Promise<{ id: string; manifest: ManifestV2 | undefined }> {
      if (n) {
        await w.uploader.addPile({ text: '', items: [pdf(`third ${n}.pdf`), pdf(`fourth ${n}.pdf`)] });
        await w.uploader.settled();
      }
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      const manifest = (await manifestsAll(w)).find((m) => m.runId === admitted.id);
      expect(manifest, 'the run took the B path').toBeDefined();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
      return { id: admitted.id, manifest };
    }
    const archivesOf = (m: ManifestV2 | undefined, line: JournalRecord): OperationV2[] => {
      const files = m?.capture.journal.find((j) => j.recordId === line.id)?.fileIds ?? [];
      return (m?.operations ?? []).filter((o) => o.effect.kind === 'move' && files.includes(o.effect.before.fileId));
    };

    it('rewrites each linking note once, only inside its links, and archives the rename after every rewrite', async () => {
      const { w, files, line } = await renamed();
      const { manifest } = await tidy(w);
      // One edit-text per linking note, in path order, with the rename's line as its record; nothing for the rest.
      const edits = editsOf(manifest);
      expect(edits.map((o) => ({ path: o.effect.path, fileId: o.effect.before.fileId, changes: o.effect.changes }))).toEqual([
        { path: WEEKEND, fileId: files.weekend.id, changes: [{ kind: 'link-rewrite', recordIds: [line.id], renames: [{ from: 'seeds', to: 'Seed list' }] }] },
        { path: PLAN, fileId: files.plan.id, changes: [{ kind: 'link-rewrite', recordIds: [line.id], renames: [{ from: 'seeds', to: 'Seed list' }] }] },
      ]);
      for (const edit of edits) {
        expect(manifest?.capture.places).toContainEqual({ file: edit.effect.before, path: edit.effect.path });
        // A link fix never marks a note new (m3): the edit is the only operation on it.
        expect((manifest?.operations ?? []).filter((o) => 'before' in o.effect && o.effect.before?.fileId === edit.effect.before.fileId)).toEqual([edit]);
      }
      expect((manifest?.operations ?? []).some((o) => 'before' in o.effect && o.effect.before?.fileId === files.plain.id)).toBe(false);
      const archives = archivesOf(manifest, line);
      expect(archives).toHaveLength(1);
      for (const archive of archives) expect(archive.dependsOn).toEqual(expect.arrayContaining(edits.map((e) => e.operationId)));
      expect(manifest?.reportPlan.some((c) => c.value.updated.length)).toBe(false);
      if (manifest) expect(grounded(manifest)).toBe(true);

      // Only the link targets changed; code, the Markdown link, the alias, heading, spaces and line endings stay.
      expect(textAt(w, WEEKEND)).toBe(REWRITTEN);
      expect(textAt(w, PLAN)).toBe(plan('Seed list'));
      expect(textAt(w, PLAIN)).toBe('# Shopping\n\nCompost and string.\n');
      for (const f of [files.weekend, files.plan]) expect(writesTo(w.applied, f.id)).toHaveLength(1);
      expect(await pending(w)).toEqual([]);
      expect(viewOf(w)?.run.report).toMatchObject({ yourChanges: 1, updated: [] });
      await expectFiledOnce(w);
    });

    it('reconciles a lost rewrite reply by reading it back, writing it once', async () => {
      const { w, files } = await renamed();
      w.rules.push(stopsAfter(w.drive, (c) => c.op === 'write-text' && c.id === files.weekend.id));
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'saving' });
      for (let i = 0; i < 4 && ((await w.worker.status()).run)?.phase !== 'done'; i++) {
        w.clock.later();
        await after(w.worker, w.runs);
      }
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
      expect(writesTo(w.calls, files.weekend.id)).toHaveLength(1);
      expect(textAt(w, WEEKEND)).toBe(REWRITTEN);
      expect(await pending(w)).toEqual([]);
    });

    it("keeps the rename's line when a rewrite is rejected, keeping Alex's words, and the next run finishes it", async () => {
      const act: { at: ((at: DispatchAt) => Promise<void>) | null } = { at: null };
      const { w, files, line } = await renamed({ hooks: { beforeDispatch: async (at) => { await act.at?.(at); } } });
      const theirs = weekend('Seeds').replace('# Weekend', '# Weekend, and more');
      act.at = async (at) => {
        if (at.effect.kind !== 'edit-text' || at.effect.path !== WEEKEND || act.at === null) return;
        act.at = null;
        await w.drive.writeText(files.weekend.id, theirs, (await w.drive.get(files.weekend.id)).modifiedTime);
      };
      const first = await tidy(w);
      const [edit] = editsOf(first.manifest);
      const head = (await checkpointsOf(w, first.id)).at(-1);
      expect(head?.outcomes[edit?.ordinal ?? -1]).toMatchObject({ state: 'rejected', failure: { code: 'conflict' } });
      for (const archive of archivesOf(first.manifest, line)) expect(head?.outcomes[archive.ordinal]).toMatchObject({ state: 'rejected' });
      expect(textAt(w, WEEKEND)).toBe(theirs);
      expect(textAt(w, PLAN)).toBe(plan('Seed list'));
      expect((await pending(w)).map((l) => l.id)).toEqual([line.id]);
      expect(viewOf(w)?.run.report?.yourChanges ?? 0).toBe(0);

      // The next run rewrites what is left (the other note is done: no edit for it) and archives the line.
      const second = await tidy(w, 1);
      expect(editsOf(second.manifest).map((o) => o.effect.path)).toEqual([WEEKEND]);
      expect(textAt(w, WEEKEND)).toBe(theirs.replace('Sow [[Seeds]]', 'Sow [[Seed list]]').replace('[[ Seeds #', '[[ Seed list #'));
      expect(writesTo(w.applied, files.plan.id)).toHaveLength(1);
      expect(await pending(w)).toEqual([]);
    });

    it('leaves the line unarchived when a linking note cannot be rewritten at plan time', async () => {
      const { w, files, line } = await renamed();
      const damaged = '---\nbower_format: ownership/9\n---\nSee [[Seeds]].\n';
      const odd = await note(w, 'Projects/Garden/Odd.md', damaged);
      const { manifest } = await tidy(w);
      // The others are still rewritten, but no rewrite claims the line and its archive is not planned.
      expect(editsOf(manifest).map((o) => o.effect.path)).toEqual([WEEKEND, PLAN]);
      expect(editsOf(manifest).flatMap((o) => o.effect.changes.flatMap((c) => (c.kind === 'link-rewrite' ? c.recordIds : [])))).toEqual([]);
      expect(manifest?.capture.journal.map((j) => j.recordId)).not.toContain(line.id);
      expect((manifest?.operations ?? []).some((o) => 'before' in o.effect && o.effect.before?.fileId === odd.id)).toBe(false);
      expect(textAt(w, 'Projects/Garden/Odd.md')).toBe(damaged);
      expect(textAt(w, WEEKEND)).toContain('Sow [[Seed list]]');
      expect((await pending(w)).map((l) => l.id)).toEqual([line.id]);
      expect(writesTo(w.applied, files.plan.id)).toHaveLength(1);
    });

    it('keeps the line unarchived while rewrites wait past the edit cap, and archives it once all are done', async () => {
      const { w, line } = await renamed();
      // Seven more linking notes: nine rewrites, so the last in path order waits.
      for (let i = 1; i <= 7; i++) await note(w, `Areas/Notes ${i}/Notes ${i}.md`, `Bought [[Seeds]] (${i}).\n`);
      const first = await tidy(w);
      const paths = editsOf(first.manifest).map((o) => o.effect.path);
      expect(paths).toHaveLength(8);
      expect(paths).not.toContain(PLAN);
      expect(first.manifest?.capture.journal.map((j) => j.recordId)).not.toContain(line.id);
      expect((await pending(w)).map((l) => l.id)).toEqual([line.id]);
      expect(textAt(w, PLAN)).toBe(plan('seeds'));
      const second = await tidy(w, 1);
      expect(editsOf(second.manifest).map((o) => o.effect.path)).toEqual([PLAN]);
      expect(second.manifest?.capture.journal.map((j) => j.recordId)).toContain(line.id);
      expect(textAt(w, PLAN)).toBe(plan('Seed list'));
      expect(await pending(w)).toEqual([]);
    });
  });
  // b-path-merges (TL-P2-20 I4, R3-4, R3-5, R4-1, Ratifications 1 and 2; TL-P2-26 C): a "yes" to keeping one note
  // joins the thing to it: the note's Timeline line first (edit-text), then the thing's move depending on it; the
  // questions.json write that drops the question waits for both, and the answer's archive for that write and both.
  describe('a merge is applied once through the recoverable path', () => {
    type Where = { drive: FakeDrive; rootId: string };
    type Edit = OperationV2 & { effect: EditText };
    const LISTING = { name: 'listing-88213.example', kind: 'link' as const, origin: 'Pasted', url: 'https://listing.example/88213' };
    const INTO = 'Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md';
    const LINE = 'The Wrenfield Road listing is the same building; kept here, as you asked.';
    const JOINED = 'Projects/Flat hunt/Wrenfield Road listing.url';
    const AGAIN = "It couldn't be filed this time.";
    const MOVED = 'It was moved, renamed or removed before Bower could file it.';
    const larkspur = (timeline: string[]): string => ['---', 'summary: A flat we liked.', 'by: bower', '---', '', 'Close to the station.', '', '## Timeline', '- 2026-09-20 · Viewed it.', ...timeline, ''].join('\n');
    const question = (id: string) => ({ id, text: `Question ${id}?`, yes: 'Yes', no: 'No', askedAt: 1 });
    const manifestsAll = async (w: Where): Promise<ManifestV2[]> =>
      (await recordsOf(w)).filter((r) => r.name.startsWith('manifest-')).map((r) => JSON.parse(r.text) as ManifestV2);
    const editsOf = (m: ManifestV2 | undefined): Edit[] => (m?.operations ?? []).filter((o): o is Edit => o.effect.kind === 'edit-text');
    const textAt = (w: Where, path: string): string | undefined => w.drive.dump(w.rootId).get(path);
    const at = async (w: Where, path: string): Promise<DriveFile | undefined> => (await w.drive.listAll(w.rootId)).find((f) => w.drive.pathOf(f.id, w.rootId) === path);
    const folderAt = async (w: Where, path: string): Promise<string> => {
      let parent = w.rootId;
      for (const name of path.split('/')) {
        const there = (await w.drive.listAll(w.rootId)).find((f) => f.folder && f.name === name && f.parents[0] === parent);
        parent = there ? there.id : (await w.drive.createFolder(parent, name)).id;
      }
      return parent;
    };
    const vaultOf = (w: Where): DriveVault => new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set(), device: 'DEVICE_B' });
    const pendingAnswers = async (w: Where): Promise<JournalRecord[]> => {
      const files = (await w.drive.listAll(w.rootId)).filter((f) => !f.folder && w.drive.pathOf(f.id, w.rootId).startsWith(`${SYSTEM.changes}/`) && !w.drive.pathOf(f.id, w.rootId).startsWith(`${SYSTEM.archive}/`));
      return (await Promise.all(files.map(async (f) => JSON.parse(await w.drive.readText(f.id)) as JournalRecord))).filter((r) => r.kind === 'answer');
    };
    const asked = (w: Where): string[] => (JSON.parse(w.drive.dump(w.rootId).get(SYSTEM.questions) ?? '{"questions":[]}') as QuestionsFile).questions.map((q) => q.id);
    /** A Bower note to keep, a question about it answered yes, and the listing waiting in a pile. */
    async function merging(o: { person?: boolean; updates?: readonly HubUpdate[] } = {}) {
      const act: { at: ((at: DispatchAt) => Promise<void>) | null } = { at: null };
      const w = await bWorld({ hooks: { beforeDispatch: async (d) => { await act.at?.(d); } }, ...(o.updates ? { updates: o.updates } : {}) });
      const before = o.person ? '# Flat 3, 12 Larkspur Lane\n\nMy own notes.\n' : larkspur([]);
      const into = await w.drive.createText(await folderAt(w, 'Projects/Flat hunt'), 'Flat 3, 12 Larkspur Lane.md', before);
      const questions = await at(w, SYSTEM.questions);
      if (!questions) throw new Error('no questions file');
      await w.drive.writeText(questions.id, `${JSON.stringify({ v: 1, questions: [question('q-keep'), question('q1')] }, null, 2)}\n`, questions.modifiedTime);
      await vaultOf(w).answer('q1', true);
      const [answer] = await pendingAnswers(w);
      if (!answer) throw new Error('no answer');
      await w.uploader.addPile({ text: 'The Wrenfield listing', items: [LISTING, pdf('floor plan.pdf')] });
      await w.uploader.settled();
      const link = await plainName(w, (await w.drive.listAll(w.rootId)).find((f) => !f.folder && f.name.endsWith('.url')));
      return { w, act, into, before, answer, link };
    }
    async function tidy(w: World, n = 0): Promise<{ id: string; manifest: ManifestV2 | undefined }> {
      if (n) {
        await w.uploader.addPile({ text: '', items: [pdf(`third ${n}.pdf`), pdf(`fourth ${n}.pdf`)] });
        await w.uploader.settled();
      }
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      const manifest = (await manifestsAll(w)).find((m) => m.runId === admitted.id);
      expect(manifest, 'the run took the B path').toBeDefined();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
      return { id: admitted.id, manifest };
    }
    const moveOf = (m: ManifestV2 | undefined, id: string): OperationV2 | undefined =>
      (m?.operations ?? []).find((o) => o.effect.kind === 'move' && o.effect.before.fileId === id && !('fileId' in o.effect.parent && o.effect.before.parents[0] === o.effect.parent.fileId));
    const questionsWrite = (m: ManifestV2 | undefined): OperationV2 | undefined => (m?.operations ?? []).find((o) => o.effect.kind === 'write-runner-json' && o.effect.path === SYSTEM.questions);
    const archivesOf = (m: ManifestV2 | undefined, rec: JournalRecord): OperationV2[] => {
      const files = m?.capture.journal.find((j) => j.recordId === rec.id)?.fileIds ?? [];
      return (m?.operations ?? []).filter((o) => o.effect.kind === 'move' && files.includes(o.effect.before.fileId));
    };

    it('adds the Timeline line, then joins the thing to the note once, and drops the question after both', async () => {
      const { w, into, answer, link } = await merging();
      const { manifest } = await tidy(w);
      const date = new Date(manifest?.requestedAt ?? 0).toISOString().slice(0, 10);
      const [edit, ...others] = editsOf(manifest);
      expect(others).toEqual([]);
      expect(edit?.effect).toMatchObject({ path: INTO, before: { fileId: into.id }, changes: [{ kind: 'timeline-append', recordIds: [answer.id], entries: [{ date, text: LINE, source: null }] }] });
      const move = moveOf(manifest, link.id);
      expect(move?.effect).toMatchObject({ kind: 'move', parent: { fileId: into.parents[0] }, name: 'Wrenfield Road listing.url' });
      expect(move?.dependsOn).toContain(edit?.operationId);
      expect(edit?.ordinal ?? Infinity).toBeLessThan(move?.ordinal ?? -1);
      // R4-1 and Ratification 2: the questions write waits for the line and the move; the answer's archive for all three.
      const write = questionsWrite(manifest);
      expect(write?.dependsOn).toEqual(expect.arrayContaining([edit?.operationId, move?.operationId]));
      const archives = archivesOf(manifest, answer);
      expect(archives).toHaveLength(1);
      for (const a of archives) expect(a.dependsOn).toEqual(expect.arrayContaining([write?.operationId, edit?.operationId, move?.operationId]));
      const filed = manifest?.reportPlan.find((c) => c.when === 'applied' && c.value.filed.some((r) => r.name === LISTING.name));
      expect(filed?.value.filed).toEqual([{ name: LISTING.name, title: 'Flat 3, 12 Larkspur Lane', kind: 'link', to: 'Projects/Flat hunt', note: INTO }]);
      expect(filed?.requires).toEqual(expect.arrayContaining([edit?.operationId, move?.operationId]));
      expect(manifest?.reportPlan).toContainEqual({ requires: [move?.operationId], when: 'rejected', value: { filed: [], created: [], updated: [], setAside: [{ name: LISTING.name, why: AGAIN }], questions: [] } });
      if (!manifest || !filed) return;
      expect(grounded(manifest)).toBe(true);

      expect(textAt(w, INTO)).toBe(larkspur([`- ${date} · ${LINE}`]));
      expect(w.drive.pathOf(link.id, w.rootId)).toBe(JOINED);
      expect(movesOf(w, link.id)).toBe(1);
      expect(w.applied.filter((c) => c.op === 'write-text' && c.id === into.id)).toHaveLength(1);
      expect(asked(w)).toEqual(['q-keep']);
      expect(await pendingAnswers(w)).toEqual([]);
      expect(viewOf(w)?.run.report?.filed).toContainEqual({ name: LISTING.name, title: 'Flat 3, 12 Larkspur Lane', kind: 'link', to: 'Projects/Flat hunt', note: INTO });
      // TL-P2-40: the note the thing joined is listed as brought up to date, by its line.
      const stored = await w.drive.get(into.id, { checksums: true });
      const row = { path: INTO, what: LINE, op: edit?.operationId, line: 0, lines: 1, md5: stored.md5Checksum, stamp: stored.appProperties?.bowerOp };
      expect(manifest.reportPlan).toContainEqual({ requires: [edit?.operationId], when: 'applied', value: { filed: [], created: [], updated: [row], setAside: [], questions: [] } });
      expect(viewOf(w)?.run.report?.updated).toContainEqual(row);
      await expectFiledOnce(w);
    });

    it('reconciles lost replies of the line and the move without merging twice', async () => {
      const { w, into, link } = await merging();
      w.rules.push(once((c) => c.op === 'write-text' && c.id === into.id, 'lose-reply'), once(isMoveOf(link.id), 'lose-reply'));
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      for (let i = 0; i < 6 && ((await w.worker.status()).run)?.phase !== 'done'; i++) {
        w.clock.later();
        await after(w.worker, w.runs);
      }
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
      expect(w.calls.filter((c) => c.op === 'write-text' && c.id === into.id)).toHaveLength(1);
      expect(w.calls.filter(isMoveOf(link.id))).toHaveLength(1);
      expect(textAt(w, INTO)?.split(LINE)).toHaveLength(2);
      expect(w.drive.pathOf(link.id, w.rootId)).toBe(JOINED);
      expect(asked(w)).toEqual(['q-keep']);
    });

    it('keeps the question hidden and the answer when the move is rejected, and the next run converges', async () => {
      const { w, act, into, answer, link } = await merging();
      act.at = async (d) => {
        if (d.effect.kind !== 'move' || d.effect.before.fileId !== link.id || act.at === null) return;
        act.at = null;
        // Alex renames the listing after Bower checked it and before it moves.
        await w.drive.update(link.id, { name: 'listing, mine.url' });
      };
      const first = await tidy(w);
      const head = (await checkpointsOf(w, first.id)).at(-1);
      const [edit] = editsOf(first.manifest);
      expect(head?.outcomes[edit?.ordinal ?? -1]).toMatchObject({ state: 'applied' });
      expect(head?.outcomes[moveOf(first.manifest, link.id)?.ordinal ?? -1]).toMatchObject({ state: 'rejected' });
      expect(head?.outcomes[questionsWrite(first.manifest)?.ordinal ?? -1]).toMatchObject({ state: 'rejected' });
      for (const a of archivesOf(first.manifest, answer)) expect(head?.outcomes[a.ordinal]).toMatchObject({ state: 'rejected' });
      // The question stays in the file with its answer pending: the app hides it and never asks it again.
      expect(asked(w)).toEqual(['q-keep', 'q1']);
      expect((await pendingAnswers(w)).map((r) => r.id)).toEqual([answer.id]);
      expect((await vaultOf(w).questions()).map((q) => q.id)).toEqual(['q-keep']);
      expect(viewOf(w)?.run.report?.setAside).toEqual([{ name: LISTING.name, why: MOVED }]);
      expect(viewOf(w)?.run.report?.filed.map((r) => r.name)).not.toContain(LISTING.name);
      expect(w.drive.pathOf(link.id, w.rootId).startsWith('Inbox/')).toBe(true);

      // Named back, the next run plans the same merge: the line is there already, so only the move, then the question goes.
      await w.drive.update(link.id, { name: link.name });
      const second = await tidy(w, 1);
      expect(editsOf(second.manifest).filter((o) => o.effect.before.fileId === into.id)).toEqual([]);
      expect(w.drive.pathOf(link.id, w.rootId)).toBe(JOINED);
      expect(textAt(w, INTO)?.split(LINE)).toHaveLength(2);
      expect(asked(w)).toEqual(['q-keep']);
      expect(await pendingAnswers(w)).toEqual([]);
      expect(viewOf(w)?.run.report?.filed).toContainEqual({ name: LISTING.name, title: 'Wrenfield Road listing', kind: 'link', to: 'Projects/Flat hunt' });
      expect(viewOf(w)?.run.report?.updated.map((u) => u.path)).not.toContain(INTO);
    });

    it("never merges into a person's own note: the thing is filed as usual and the answer archived", async () => {
      const { w, into, before, answer, link } = await merging({ person: true });
      const { manifest } = await tidy(w);
      expect(editsOf(manifest)).toEqual([]);
      expect(textAt(w, INTO)).toBe(before);
      expect(w.calls.filter((c) => 'id' in c && c.id === into.id)).toEqual([]);
      expect(w.drive.pathOf(link.id, w.rootId)).not.toBe(JOINED);
      expect(w.drive.pathOf(link.id, w.rootId).startsWith('Inbox/')).toBe(false);
      expect(asked(w)).toEqual(['q-keep']);
      expect((await pendingAnswers(w)).map((r) => r.id)).not.toContain(answer.id);
    });

    it('a merged thing is set aside by its cause: moved away, or not filed this time', async () => {
      // A conflict: the listing is renamed right before its move.
      const moved = await merging();
      moved.act.at = async (d) => {
        if (d.effect.kind !== 'move' || d.effect.before.fileId !== moved.link.id || moved.act.at === null) return;
        moved.act.at = null;
        await moved.w.drive.update(moved.link.id, { name: 'listing, mine.url' });
      };
      await tidy(moved.w);
      expect(viewOf(moved.w)?.run.report?.setAside).toEqual([{ name: LISTING.name, why: MOVED }]);
      // A failed dependency: the note changed before its line was added, so the line and then the move are rejected.
      const other = await merging();
      other.act.at = async (d) => {
        if (d.effect.kind !== 'edit-text' || other.act.at === null) return;
        other.act.at = null;
        await other.w.drive.writeText(other.into.id, larkspur(['- 2026-09-21 · Called the agent.']), (await other.w.drive.get(other.into.id)).modifiedTime);
      };
      const run = await tidy(other.w);
      const head = (await checkpointsOf(other.w, run.id)).at(-1);
      expect(head?.outcomes[editsOf(run.manifest)[0]?.ordinal ?? -1]).toMatchObject({ state: 'rejected', failure: { code: 'conflict' } });
      expect(head?.outcomes[moveOf(run.manifest, other.link.id)?.ordinal ?? -1]).toMatchObject({ state: 'rejected' });
      expect(viewOf(other.w)?.run.report?.setAside).toEqual([{ name: LISTING.name, why: AGAIN }]);
      expect(other.w.drive.pathOf(other.link.id, other.w.rootId).startsWith('Inbox/')).toBe(true);
    });

    // TL-P2-35 (replaces the hold of review I2): a merge line refused at plan time files the thing on its own, with a
    // row saying so; the answer is archived and the question dropped once that filing applied (R4-1).
    const ALONE = "Bower couldn't add it to Flat 3, 12 Larkspur Lane, so it was filed on its own.";
    const big = larkspur([]).replace('Close to the station.', `Close to the station.\n${'A long note about the flat.\n'.repeat(Math.ceil(EDIT_FILE_LIMIT / 27))}`);
    const refusals: Array<[string, (w: World, into: DriveFile) => Promise<void>]> = [
      ['too big', async (w, into) => { await w.drive.writeText(into.id, big, (await w.drive.get(into.id)).modifiedTime); }],
      ['unknown format', async (w, into) => { await w.drive.writeText(into.id, '---\nbower_format: ownership/9\nby: bower\n---\n## Timeline\n', (await w.drive.get(into.id)).modifiedTime); }],
      ['invalid UTF-8', async (w, into) => {
        await w.drive.trash(into.id);
        await w.drive.upload(into.parents[0] ?? '', 'Flat 3, 12 Larkspur Lane.md', new Blob([new Uint8Array([0x2d, 0x2d, 0x2d, 0x0a, 0x62, 0x79, 0x3a, 0x20, 0xff, 0xfe, 0x0a])]), () => undefined);
      }],
    ];
    it('files the thing on its own when the merge line cannot be planned, says so, and settles the answer', async () => {
      for (const [cause, make] of refusals) {
        const { w, into, answer, link } = await merging();
        await make(w, into);
        const before = textAt(w, INTO);
        const { manifest } = await tidy(w);
        expect(editsOf(manifest), cause).toEqual([]);
        expect(textAt(w, INTO), cause).toBe(before);
        // Filed as an ordinary thing would be (here a saved link with its own note), plus the row saying why.
        expect(w.drive.pathOf(link.id, w.rootId), cause).toBe(`Projects/Flat hunt/${link.name}`);
        const report = viewOf(w)?.run.report;
        expect(report?.filed, cause).toContainEqual({ name: link.name, title: 'Flat 9, Wrenfield Road', kind: 'link', to: 'Projects/Flat hunt', note: 'Projects/Flat hunt/Flat 9, Wrenfield Road.md' });
        expect(report?.setAside, cause).toEqual([{ name: link.name, why: ALONE }]);
        const move = moveOf(manifest, link.id);
        expect(manifest?.reportPlan, cause).toContainEqual({ requires: [move?.operationId], when: 'applied', value: { filed: [], created: [], updated: [], setAside: [{ name: link.name, why: ALONE }], questions: [] } });
        if (manifest) expect(grounded(manifest), cause).toBe(true);
        // R4-1: the question's write and the answer's archive wait for that filing, and both went.
        expect(questionsWrite(manifest)?.dependsOn, cause).toContain(move?.operationId);
        for (const a of archivesOf(manifest, answer)) expect(a.dependsOn, cause).toContain(move?.operationId);
        expect(asked(w), cause).toEqual(['q-keep']);
        expect(await pendingAnswers(w), cause).toEqual([]);
        await expectFiledOnce(w);
      }
    });

    // c3-planner-split part 3: the row says the note's name from the plan, so the note it could not join is not captured.
    it('a merge that fell back captures no note it could not join', async () => {
      const { w, into } = await merging();
      await refusals[0]?.[1](w, into);
      const { manifest } = await tidy(w);
      expect(viewOf(w)?.run.report?.setAside.map((r) => r.why)).toEqual([ALONE]);
      expect(manifest?.capture.places.map((p) => p.file.fileId)).not.toContain(into.id);
      if (manifest) expect(grounded(manifest)).toBe(true);
    });

    // Coordinator ruling on the delta review: a note changed while read is a passing race, held like the cap deferral.
    it('holds the pile and its answer when the note changed while read, and merges on the next run', async () => {
      const { w, into, answer, link } = await merging();
      const read = w.drive.readBytes.bind(w.drive);
      let once = true;
      w.drive.readBytes = async (id) => {
        if (id !== into.id || !once) return read(id);
        once = false;
        return new TextEncoder().encode(larkspur(['- 2026-09-22 · Changed meanwhile.']));
      };
      const first = await tidy(w);
      expect(editsOf(first.manifest)).toEqual([]);
      expect(first.manifest?.capture.members.map((m) => m.file.fileId)).not.toContain(link.id);
      expect(first.manifest?.capture.journal.map((j) => j.recordId)).not.toContain(answer.id);
      expect(w.drive.pathOf(link.id, w.rootId).startsWith('Inbox/')).toBe(true);
      expect(asked(w)).toEqual(['q-keep', 'q1']);
      const second = await tidy(w, 1);
      expect(editsOf(second.manifest).map((o) => o.effect.path)).toEqual([INTO]);
      expect(w.drive.pathOf(link.id, w.rootId)).toBe(JOINED);
      expect(textAt(w, INTO)?.split(LINE)).toHaveLength(2);
      expect(asked(w)).toEqual(['q-keep']);
      expect(await pendingAnswers(w)).toEqual([]);
    });

    // Review at r1 9e57a33: the note marked new by the last run gets its mark cleared in place; that is no touch.
    it('files the thing on its own beside a refused note still marked new from the last run, on the B path', async () => {
      const { w, into, link } = await merging();
      await refusals[0]?.[1](w, into);
      await w.drive.update(into.id, { appProperties: { bowerNew: '1' } });
      const { manifest } = await tidy(w);
      if (!manifest) return;
      expect(grounded(manifest)).toBe(true);
      expect((manifest.operations as OperationV2[]).some((o) => o.effect.kind === 'move' && o.effect.before.fileId === into.id && o.effect.properties.bowerNew === null)).toBe(true);
      expect(w.drive.pathOf(link.id, w.rootId)).toBe(`Projects/Flat hunt/${link.name}`);
      expect(viewOf(w)?.run.report?.setAside).toEqual([{ name: link.name, why: ALONE }]);
      expect(asked(w)).toEqual(['q-keep']);
    });

    it('keeps the answer and the question when a thing filed on its own is not moved after all', async () => {
      const { w, act, into, answer, link } = await merging();
      await refusals[1]?.[1](w, into);
      act.at = async (d) => {
        if (d.effect.kind !== 'move' || d.effect.before.fileId !== link.id || act.at === null) return;
        act.at = null;
        await w.drive.update(link.id, { name: 'listing, mine.url' });
      };
      await tidy(w);
      expect(w.drive.pathOf(link.id, w.rootId).startsWith('Inbox/')).toBe(true);
      expect(viewOf(w)?.run.report?.setAside).toEqual([{ name: link.name, why: MOVED }]);
      expect(asked(w)).toEqual(['q-keep', 'q1']);
      expect((await pendingAnswers(w)).map((r) => r.id)).toEqual([answer.id]);
    });

    // TL-P2-35 minor: the target is followed through the run's renames, as the resolver follows a link.
    it('adds the line to the note under its new name when it was renamed before the run', async () => {
      const { w, into, answer, link } = await merging();
      await vaultOf(w).rename(INTO, 'Flat 3, renamed');
      const NOW = 'Projects/Flat hunt/Flat 3, renamed.md';
      const { manifest } = await tidy(w);
      const [edit, ...others] = editsOf(manifest);
      expect(others).toEqual([]);
      expect(edit?.effect).toMatchObject({ path: NOW, before: { fileId: into.id } });
      expect(edit?.effect.changes.find((c) => c.kind === 'timeline-append')?.recordIds).toEqual([answer.id]);
      expect(w.drive.pathOf(link.id, w.rootId)).toBe(JOINED);
      expect(textAt(w, NOW)?.split(LINE)).toHaveLength(2);
      expect(viewOf(w)?.run.report?.filed).toContainEqual({ name: link.name, title: 'Flat 3, renamed', kind: 'link', to: 'Projects/Flat hunt', note: NOW });
      expect(asked(w)).toEqual(['q-keep']);
      expect(await pendingAnswers(w)).toEqual([]);
    });

    // Review o5-consumers-review-1 minor (b), Ratification 2: one write drops every answered question, so one
    // answer's rejected work keeps every answer and every question, all hidden, and the next run settles them all.
    it('keeps every answer and question when one answer\'s merge is rejected, and settles them all next run', async () => {
      const { w, act, link } = await merging();
      const questions = await at(w, SYSTEM.questions);
      const value = JSON.parse(await w.drive.readText(questions?.id ?? '')) as QuestionsFile;
      await w.drive.writeText(questions?.id ?? '', `${JSON.stringify({ v: 1, questions: [...value.questions, question('q2')] }, null, 2)}\n`, questions?.modifiedTime ?? '');
      await vaultOf(w).answer('q2', false);
      const answers = await pendingAnswers(w);
      expect(answers).toHaveLength(2);
      act.at = async (d) => {
        if (d.effect.kind !== 'move' || d.effect.before.fileId !== link.id || act.at === null) return;
        act.at = null;
        await w.drive.update(link.id, { name: 'listing, mine.url' });
      };
      const first = await tidy(w);
      const head = (await checkpointsOf(w, first.id)).at(-1);
      for (const a of answers) for (const op of archivesOf(first.manifest, a)) expect(head?.outcomes[op.ordinal], a.questionId).toMatchObject({ state: 'rejected' });
      expect(asked(w)).toEqual(['q-keep', 'q1', 'q2']);
      expect((await pendingAnswers(w)).map((r) => r.id).sort()).toEqual(answers.map((r) => r.id).sort());
      expect((await vaultOf(w).questions()).map((q) => q.id)).toEqual(['q-keep']);
      await w.drive.update(link.id, { name: link.name });
      await tidy(w, 1);
      expect(asked(w)).toEqual(['q-keep']);
      expect(await pendingAnswers(w)).toEqual([]);
      expect(w.drive.pathOf(link.id, w.rootId)).toBe(JOINED);
    });

    it('holds the pile and its answer while the line waits past the edit cap, and merges on the next run', async () => {
      const updates = Array.from({ length: 8 }, (_, i) => ({ path: `Projects/A ${i}/A ${i}.md`, what: `A ${i} brought up to date.` }));
      const { w, into, answer, link } = await merging({ updates });
      for (const u of updates) await w.drive.createText(await folderAt(w, u.path.split('/').slice(0, 2).join('/')), u.path.split('/')[2] ?? '', larkspur([]));
      const first = await tidy(w);
      expect(editsOf(first.manifest).map((o) => o.effect.path)).toEqual(updates.map((u) => u.path));
      expect(first.manifest?.capture.members.map((m) => m.file.fileId)).not.toContain(link.id);
      expect(first.manifest?.capture.journal.map((j) => j.recordId)).not.toContain(answer.id);
      expect(w.drive.pathOf(link.id, w.rootId).startsWith('Inbox/')).toBe(true);
      expect(asked(w)).toEqual(['q-keep', 'q1']);
      const second = await tidy(w, 1);
      expect(editsOf(second.manifest).map((o) => o.effect.path)).toEqual([INTO]);
      expect(w.drive.pathOf(link.id, w.rootId)).toBe(JOINED);
      expect(textAt(w, INTO)?.split(LINE)).toHaveLength(2);
      expect(w.calls.filter((c) => c.op === 'write-text' && c.id === into.id)).toHaveLength(1);
      expect(asked(w)).toEqual(['q-keep']);
      expect(await pendingAnswers(w)).toEqual([]);
    });
  });

  // legacy-runner-write-removal (TL-P2-38): no tidy-up writes through the legacy runner. A pile a plan cannot take is
  // held with "Bower couldn't tidy this up yet. Try again.", in the Inbox and the run alike; the rest of the run takes
  // the B path. The five TL-P2-37 entries it supersedes are pinned here, each by its own verify name.
  describe('no tidy-up takes the legacy path', () => {
    const NOT_TIDIED = "Bower couldn't tidy this up yet. Try again.";
    const plan = async (w: { drive: FakeDrive; rootId: string }) =>
      planRun(w.drive, w.rootId, { scope: 'all', allowWeb: false, runId: 'run-plan', requestId: 'request-plan', requestedAt: Date.now() });
    const vaultOf = (w: { drive: FakeDrive; rootId: string }): DriveVault => new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set(), device: 'DEVICE_B' });
    const fileAt = async (w: { drive: FakeDrive; rootId: string }, path: string): Promise<DriveFile> => {
      const f = (await w.drive.listAll(w.rootId)).find((x) => w.drive.pathOf(x.id, w.rootId) === path);
      if (!f) throw new Error(`${path} is missing`);
      return f;
    };
    /** The piles a plan captured, by id; it must be a B plan. */
    async function captured(w: { drive: FakeDrive; rootId: string }): Promise<string[]> {
      const out = await plan(w);
      expect(out.path).toBe('b');
      return out.path === 'b' ? out.manifest.capture.piles.map((p) => p.pileId).sort() : [];
    }
    async function pilesOf(w: { drive: FakeDrive; rootId: string }): Promise<{ lease: Pile; ideas: Pile }> {
      const piles = await vaultOf(w).piles();
      const lease = piles.find((p) => p.text === 'Papers about the lease');
      const ideas = piles.find((p) => p.items.some((i) => i.name === 'idea one.pdf'));
      if (!lease || !ideas) throw new Error('the two piles are missing');
      return { lease, ideas };
    }
    /** A pile folder made by hand in the inbox, with its files. */
    async function handPile(w: { drive: FakeDrive; rootId: string }, name: string, files: Array<{ name: string; body: Blob }>, props?: Record<string, string>): Promise<DriveFile> {
      const inbox = await fileAt(w, 'Inbox');
      const folder = await w.drive.createFolder(inbox.id, name, props);
      for (const f of files) await w.drive.upload(folder.id, f.name, f.body);
      return folder;
    }
    const pileIdOf = (f: DriveFile): string => f.appProperties?.[PROP.pile] ?? f.id;
    const held = async (w: { drive: FakeDrive; rootId: string }, id: string): Promise<Pile | undefined> => (await vaultOf(w).piles()).find((p) => p.id === id);
    /** Runs the next tidy-up to its end on the B path, and checks it was recorded there. */
    async function tidy(w: World): Promise<Manifest> {
      const admitted = (await w.worker.process('all')).run;
      await w.runs.settled();
      expect((await w.worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
      const manifest = (await manifestsOf(w)).find((m) => m.runId === admitted.id);
      if (!manifest) throw new Error('the run has no manifest: it did not take the B path');
      return manifest;
    }

    it('the legacy runner only reads legacy records', async () => {
      // Only the planner is left of the legacy runner: nothing can write through it.
      expect(Object.keys(runner)).not.toContain('runFake');
      const w = await bWorld();
      // A legacy view a reload cut off while filing is read and repaired as before: failed, honest, never done.
      const sys = await fileAt(w, SYSTEM.dir);
      await w.drive.createText(sys.id, 'last-run.json', JSON.stringify({ v: 1, run: { id: 'run-legacy', scope: 'all', phase: 'saving', requestedAt: Date.now() - 60_000, phaseAt: Date.now() - 1000 } }));
      const before = await domain(w.drive, w.rootId);
      const reopened = new FakeWorker({ drive: w.drive, scenario: 'first', rootId: w.rootId, runs: w.runs, fresh: false });
      const seen = (await reopened.status()).run;
      expect(seen).toMatchObject({ id: 'run-legacy', phase: 'failed' });
      expect(seen?.failure).toMatch(/Some things may be in their new places already/);
      expect(viewOf(w)?.run).toMatchObject({ id: 'run-legacy', phase: 'failed' });
      expect(await domain(w.drive, w.rootId)).toBe(before);
      expect(await recordsOf(w)).toEqual([]);

      // One pile's thing cannot be checked while the run plans: that pile is held for this run, the rest goes on, on
      // B. A listing reads no thing's bytes, so the Inbox shows it as waiting, and the next run tries it again.
      const { lease, ideas } = await pilesOf(w);
      const stored = w.drive.storedDigest.bind(w.drive);
      const unchecked = vi.spyOn(w.drive, 'storedDigest').mockImplementation(async (id) => (id === lease.items[0]?.id ? null : stored(id)));
      expect(SET_ASIDE_TEXT['not-tidied']).toBe(NOT_TIDIED);
      const manifest = await tidy({ ...w, worker: reopened });
      unchecked.mockRestore();
      expect(manifest.capture.piles.map((p) => p.pileId)).toEqual([ideas.id]);
      for (const item of lease.items) expect(w.drive.pathOf(item.id, w.rootId).startsWith('Inbox/'), item.name).toBe(true);
      expect(viewOf(w)?.run.report?.filed.map((f) => f.name).sort()).toEqual(['idea one.pdf', 'idea two.pdf']);

      // Once its thing can be checked, the next tidy-up takes it.
      expect((await held(w, lease.id))?.setAside).toBeUndefined();
      expect((await tidy({ ...w, worker: reopened })).capture.piles.map((p) => p.pileId)).toEqual([lease.id]);
    });

    // b-path-one-snapshot, superseded by TL-P2-38: a race while a run plans holds or skips that pile, never legacy.
    it('a change during planning never sends a run down the legacy path', async () => {
      const piles = DriveVault.prototype.piles;
      type Race = (w: World, listed: Pile[]) => Promise<Pile[]>;
      const races: Array<[string, boolean, Race]> = [
        // A thing arrives in the lease pile after the run listed its folder.
        ['a thing arrives', false, async (_w, listed) => listed.map((p) => (p.text === 'Papers about the lease' ? { ...p, items: [...p.items, { id: 'arrived-later', name: 'late.pdf', kind: 'pdf', origin: 'Added in Drive' }] } : p))],
        // The lease pile's folder goes after the run read the inbox.
        ['a pile vanishes', true, async (w, listed) => {
          const lease = listed.find((p) => p.text === 'Papers about the lease');
          const folder = lease?.path ? await fileAt(w, lease.path) : undefined;
          if (folder) await w.drive.trash(folder.id);
          return listed;
        }],
      ];
      for (const [what, gone, race] of races) {
        const w = await bWorld();
        const { lease, ideas } = await pilesOf(w);
        let raced = false;
        const spy = vi.spyOn(DriveVault.prototype, 'piles').mockImplementation(async function (this: DriveVault) {
          const listed = await piles.call(this);
          if (raced) return listed;
          raced = true;
          return race(w, listed);
        });
        expect(await captured(w), what).toEqual([ideas.id]);
        spy.mockRestore();
        // The race clears on the next run: what is still there is taken.
        expect(await captured(w), what).toEqual(gone ? [ideas.id] : [ideas.id, lease.id].sort());
      }
      // A declared member missing from the run's own listing of its pile.
      const w = await bWorld({ declared: true });
      const { lease, ideas } = await pilesOf(w);
      const spy = vi.spyOn(DriveVault.prototype, 'piles').mockImplementation(async function (this: DriveVault) {
        return (await piles.call(this)).map((p) => (p.id === lease.id ? { ...p, items: p.items.slice(1) } : p));
      });
      expect(await captured(w)).toEqual([ideas.id]);
      spy.mockRestore();
      // The run still takes the B path whole and files the rest.
      const manifest = await tidy(w);
      expect(manifest.capture.piles.map((p) => p.pileId).sort()).toEqual([ideas.id, lease.id].sort());
    });

    // b-path-capture-reads, superseded by TL-P2-38: a pile note the run cannot take from one read holds its pile.
    it('a pile note is captured from one read', async () => {
      const w = await bWorld({ declared: true });
      const { lease, ideas } = await pilesOf(w);
      // A declared pile with no words whose member is named like a pile note.
      const named = await w.uploader.addPile({ text: '', items: [{ name: 'Pile note.md', kind: 'note', origin: 'From this computer', body: new Blob(['# A member\n']) }, pdf('beside.pdf')] });
      await w.uploader.settled();
      // A pile whose note starts with a byte order mark: its text is not the bytes stored.
      const bom = await handPile(w, 'Garden', [{ name: 'Pile note.md', body: new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), 'Garden papers\n']) }, { name: 'garden.pdf', body: new Blob(['%PDF garden']) }]);
      for (const id of [named.id, pileIdOf(bom)]) {
        const pile = await held(w, id);
        expect(pile?.setAside, id).toBe('not-tidied');
      }
      expect(await captured(w)).toEqual([ideas.id, lease.id].sort());
      // A note changed between its read and its digest: held for this run only.
      const note = (await w.drive.listAll(w.rootId)).find((f) => f.name === 'Pile note.md' && w.drive.pathOf(f.id, w.rootId) === `${lease.path ?? ''}/Pile note.md`);
      const stored = w.drive.storedDigest.bind(w.drive);
      const changed = vi.spyOn(w.drive, 'storedDigest').mockImplementation(async (id) => (id === note?.id ? { size: 1, sha256: '0'.repeat(64) } : stored(id)));
      expect(await captured(w)).toEqual([ideas.id]);
      changed.mockRestore();
      // The run takes the B path and files what it can; the held piles stay as they are.
      const manifest = await tidy(w);
      expect(manifest.capture.piles.map((p) => p.pileId).sort()).toEqual([ideas.id, lease.id].sort());
      expect((await held(w, named.id))?.setAside).toBe('not-tidied');
      expect((await held(w, pileIdOf(bom)))?.setAside).toBe('not-tidied');
    });

    // b-path-capture-holds, superseded by TL-P2-38: what a run record cannot carry is held or left, never legacy.
    it('a pile whose names no run record can carry is held, not sent down the legacy path', async () => {
      const w = await bWorld();
      const { lease, ideas } = await pilesOf(w);
      const pdfBody = (name: string): { name: string; body: Blob } => ({ name, body: new Blob([`%PDF ${name}`]) });
      const slash = await handPile(w, 'Back\\slash', [pdfBody('one.pdf')]);
      const control = await handPile(w, 'Bell', [pdfBody('ring\u0007.pdf')]);
      const dots = await handPile(w, 'Dots', [pdfBody('..')]);
      const badId = await handPile(w, 'Odd id', [pdfBody('two.pdf')], { [PROP.pile]: 'not a logical id' });
      const unrecordable = [slash, control, dots, badId].map(pileIdOf);
      for (const id of unrecordable) {
        const pile = await held(w, id);
        expect(pile?.setAside, id).toBe('not-tidied');
      }
      // Journal lines a run record cannot carry stay where they are, uncaptured, with one BowerError.
      const changes = await fileAt(w, SYSTEM.changes);
      const line = (id: string): string => `{ "v": 1, "id": ${id}, "device": "DEVICE_A", "at": 1, "kind": "task", "what": "Completed the example task.", "path": "Resources/Example.md", "text": "Done" }\n`;
      await w.drive.createText(changes.id, 'bell.json', line('"BELL\\u0007"'));
      await w.drive.createText(changes.id, 'long.json', line(JSON.stringify('L'.repeat(1025))));
      await w.drive.createText(changes.id, 'half.json', line('"HALF\\ud800"'));
      await w.drive.createText(changes.id, 'fine.json', line('"FINE"'));
      w.errors.mockClear();
      const out = await plan(w);
      expect(out.path).toBe('b');
      if (out.path !== 'b') return;
      expect(out.manifest.capture.piles.map((p) => p.pileId).sort()).toEqual([ideas.id, lease.id].sort());
      expect(out.manifest.capture.journal.map((j) => j.recordId)).toEqual(['FINE']);
      expect(bowerErrors(w).filter((e) => /some of your changes/.test(e.message))).toHaveLength(1);
      // The run goes on, on the B path; the held piles and the lines stay as they are.
      const manifest = await tidy(w);
      expect(manifest.capture.piles.map((p) => p.pileId).sort()).toEqual([ideas.id, lease.id].sort());
      for (const id of unrecordable) expect((await held(w, id))?.setAside, id).toBe('not-tidied');
      const left = (await w.drive.listAll(w.rootId)).filter((f) => !f.folder && w.drive.pathOf(f.id, w.rootId).startsWith(`${SYSTEM.changes}/`) && !w.drive.pathOf(f.id, w.rootId).startsWith(`${SYSTEM.archive}/`));
      expect(left.map((f) => f.name).sort()).toEqual(['bell.json', 'half.json', 'long.json']);
    });

    // b-plan-guard-refusal (TL-P2-37 Q2), superseded by TL-P2-38: a plan the guard or grounding refuses fails closed.
    it.each(['the manifest guard', 'grounding'] as const)('a plan the guard refuses is refused before any effect (%s)', async (cause) => {
      const w = await bWorld();
      const before = await domain(w.drive, w.rootId);
      const refuse = cause === 'the manifest guard'
        ? vi.spyOn(runManifest, 'parseRunManifestV2').mockResolvedValue({ ok: false, reason: 'shape' })
        : vi.spyOn(runRecords, 'grounded').mockReturnValue(false);
      const refusal = await w.worker.process('all').then(() => null, (e: unknown) => e);
      const checks = refuse.mock.calls.length;
      refuse.mockRestore();
      expect(refusal).toBeInstanceOf(BowerError);
      expect(refusal).toMatchObject({ message: B_FAILURE });
      await w.runs.settled();
      expect(checks).toBeGreaterThan(0);
      // Nothing was admitted or changed: no records, no view, no write of any kind.
      expect(await recordsOf(w)).toEqual([]);
      expect(viewOf(w)).toBeNull();
      expect(w.calls).toEqual([]);
      expect(w.mutations()).toBe(0);
      expect(await domain(w.drive, w.rootId)).toBe(before);
      expect((await w.worker.status()).run).toBeNull();
      expect(bowerErrors(w).map((e) => e.message)).toContain(B_FAILURE);
    });

    // running-scenario-on-b, superseded by TL-P2-38: the running situation's run is admitted on B on load.
    it('the running situation is a recoverable run', async () => {
      localStorage.clear();
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const drive = new FakeDrive();
      const rootId = (await seedFakeDrive(drive, 'running', Date.now())) ?? '';
      const seeded = drive.dump(rootId).get(SYSTEM.lastRun);
      const pause = pauseFirstMove();
      const runs = new FakeRunService({ drive, scale: 'instant', hooks: pause.hooks });
      const before = Date.now();
      const worker = new FakeWorker({ drive, scenario: 'running', rootId, runs });
      await worker.status();
      const at = await reached(pause.paused, runs);
      expect(at).not.toBeNull();
      const admitted = await runs.status({ account: ALEX.email, rootId });
      expect(admitted).toMatchObject({ id: at?.runId, phase: 'saving' });
      expect((await worker.status()).run).toEqual(admitted);
      // As on the demo: a run asked for 70 s ago.
      expect(admitted?.requestedAt).toBeGreaterThanOrEqual(before - 70_000);
      expect(admitted?.requestedAt).toBeLessThanOrEqual(Date.now() - 70_000);
      expect(worker.runningPiles().size).toBeGreaterThan(0);
      expect((await manifestsOf({ drive, rootId })).map((m) => m.runId)).toEqual([at?.runId]);
      // No legacy run: the folder's view is still the one the situation started with, and asking joins the run.
      expect(drive.dump(rootId).get(SYSTEM.lastRun)).toBe(seeded);
      expect(((await worker.process('all')).run).id).toBe(at?.runId);

      // A reload: the page that ran it is gone; the service comes back and recovers it like any other run.
      const drive2 = FakeDrive.restore(await drive.snapshot());
      const runs2 = FakeRunService.restore(runs.toJSON(), { drive: drive2, scale: 'instant' });
      const reloaded = new FakeWorker({ drive: drive2, scenario: 'running', rootId, runs: runs2, fresh: false });
      expect(await after(reloaded, runs2)).toMatchObject({ id: at?.runId, phase: 'done' });
      expect(await manifestsOf({ drive: drive2, rootId })).toHaveLength(1);
      expect(JSON.parse(drive2.dump(rootId).get(SYSTEM.lastRun) ?? '{}')).toMatchObject({ run: { id: at?.runId, phase: 'done' } });
    });
  });

  // o5-no-legacy-run-path (TL-P2-06 §1, TL-P2-38): no tidy-up plan can take the legacy path; legacy records are read.
  describe('every plan takes the recoverable path', () => {
    /** Every source file of the app, by its path under `src`. */
    const sources = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? sources(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
    });
    const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const kindsOf = (m: Manifest | ManifestV2): string[] => [...new Set((m.operations as OperationV2[]).flatMap((o) => {
      const e = o.effect;
      if (e.kind === 'create-text') return [`create-text ${e.purpose}`];
      if (e.kind === 'write-runner-json') return [`write-runner-json ${e.path}`];
      if (e.kind === 'edit-text') return e.changes.map((c) => `edit-text ${c.kind}`);
      return [e.kind];
    }))].sort();

    it('every tidy-up plan takes the recoverable path', async () => {
      // No legacy reason is left in the app's code (its tests aside): the planner has no other path to send a run down.
      const needle = ['legacy', '('].join('');
      const app = sources(SRC).filter((path) => !/\.test\.tsx?$/.test(path));
      expect(app.filter((path) => readFileSync(path, 'utf8').includes(needle)).map((path) => relative(SRC, path))).toEqual([]);

      // A folder with every capability the fake runner supports, Alex's demo folder and more.
      localStorage.clear();
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const drive = new FakeDrive();
      const rootId = (await seedFakeDrive(drive, 'default', Date.now())) ?? '';
      const runs = new FakeRunService({ drive, scale: 'instant' });
      const worker = new FakeWorker({ drive, scenario: 'default', rootId, runs, fresh: false });
      const vault = new DriveVault({ drive, rootId: async () => rootId, runningPiles: () => new Set(), declarePiles: true, device: 'DEVICE_A' });
      const at = async (path: string): Promise<DriveFile> => {
        const f = (await drive.listAll(rootId)).find((x) => drive.pathOf(x.id, rootId) === path);
        if (!f) throw new Error(`${path} is missing`);
        return f;
      };
      // Declared piles (a folder and a loose file), a pile of words, a saved link; the demo's folder piles, loose
      // things, the pile that asks a question and the things with notes of their own come with the folder.
      await vault.addPile({ text: 'Papers about the lease', items: [pdf('lease.pdf'), pdf('inventory.pdf')] });
      await vault.addPile({ text: '', items: [pdf('alone.pdf')] });
      await vault.addPile({ text: 'Bins go out on Tuesday nights', items: [] });
      await vault.addPile({ text: '', items: [link] });
      await vault.settled();
      // A rule, a request, a "yes" to a merge, and a rename whose links are rewritten; a runner file to make again.
      await vault.addRule('Keep lease papers together');
      await vault.addRequest('Put the lease papers together');
      await vault.answer('q1', true);
      await vault.rename('Projects/Flat hunt/Flat 7, Cobble Row.md', 'Cobble Row flat');
      await drive.trash((await at(SYSTEM.hashes)).id);
      // And one pile a run record cannot carry: held, only it.
      const inbox = await at('Inbox');
      const odd = await drive.createFolder(inbox.id, 'Back\\slash');
      await drive.upload(odd.id, 'odd.pdf', new Blob(['%PDF odd']));
      const piles = await new DriveVault({ drive, rootId: async () => rootId, runningPiles: () => new Set(), device: 'DEVICE_B' }).piles();
      expect(piles.find((p) => p.id === odd.id)?.setAside).toBe('not-tidied');

      const plan = (scope: 'all' | 'instructions') => planRun(drive, rootId, { scope, allowWeb: false, runId: `run-${scope}`, requestId: `request-${scope}`, requestedAt: Date.now() });
      const all = await plan('all');
      expect(all.path).toBe('b');
      if (all.path !== 'b') return;
      // Every pile but the one it cannot take: folder piles, loose ones and declared ones.
      expect(all.manifest.capture.piles.map((p) => p.pileId).sort()).toEqual(piles.filter((p) => p.id !== odd.id).map((p) => p.id).sort());
      expect(all.manifest.capture.piles.some((p) => p.source.kind === 'declared' && p.anchor !== null)).toBe(true);
      expect(all.manifest.capture.piles.some((p) => p.source.kind === 'declared' && p.anchor === null)).toBe(true);
      expect(all.manifest.capture.piles.some((p) => p.source.kind === 'observed' && p.anchor === null)).toBe(true);
      // Every effect is a B effect: destinations, filing, generated notes, saved links, Timeline lines, merges, link
      // rewrites, rules, questions, requests and runner files, the Bin.
      expect(kindsOf(all.manifest)).toEqual([
        'bin', 'create-folder', 'create-text generated', 'create-text runner-json',
        'edit-text link-rewrite', 'edit-text rules-wording', 'edit-text timeline-append', 'move',
        'write-runner-json .bower/questions.json', 'write-runner-json .bower/requests.json',
        'write-runner-json .bower/type-table.json',
      ]);
      const edits = (all.manifest.operations as OperationV2[]).flatMap((o) => (o.effect.kind === 'edit-text' ? o.effect.changes : []));
      expect(edits.some((c) => c.kind === 'timeline-append' && c.entries.some((e) => e.text === MERGES[0]?.line))).toBe(true);
      expect(all.manifest.reportPlan.some((c) => c.value.questions.some((q) => q.id === 'q-saltmere'))).toBe(true);
      expect(grounded(all.manifest)).toBe(true);
      // An instructions run is planned on B too.
      expect((await plan('instructions')).path).toBe('b');

      // The run is admitted on B and ends done; only the held pile stays in the inbox.
      const admitted = (await worker.process('all')).run;
      await runs.settled();
      expect((await worker.status()).run).toMatchObject({ id: admitted.id, phase: 'done' });
      expect([...drive.dump(rootId).keys()].some((path) => path.startsWith(`.bower/runs/${admitted.id}/manifest-`))).toBe(true);
      expect((await new DriveVault({ drive, rootId: async () => rootId, runningPiles: () => new Set(), device: 'DEVICE_C' }).piles()).map((p) => p.id)).toEqual([odd.id]);

      // An inbox emptied while a run plans is the Worker's own refusal, before any effect.
      for (const f of (await drive.listAll(rootId)).filter((x) => x.parents[0] === inbox.id)) await drive.trash(f.id);
      await expect(plan('all')).rejects.toMatchObject({ code: 'conflict', message: 'Nothing is waiting in the inbox.' });
    });
  });
});
