import { resolve } from 'node:path';
import { phaseAwareClaude } from './b1-planning-support';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ASK_GONE } from '../../src/data/contracts/questions';
import { applyChanges } from '../../src/data/contracts/note-edit';
import { createOwnershipContext } from '../../src/data/contracts/ownership-format';
import { parseRunManifestV2 } from '../../src/data/contracts/run-manifest';
import { parseRunCheckpoint, verifyCheckpointChain } from '../../src/data/contracts/run-checkpoint';
import { FakeDrive } from '../../src/data/drive/fake-drive';
import { RunRecords } from '../../src/data/spine/records';
import * as signedCopy from '../../src/data/spine/scripted';
import { RUNNER_WRITES, SYSTEM } from '../../src/data/vault/layout';
import type { Request, RunReport } from '../../src/data/contracts/types';
import type { ClaudeSpawn } from '../src/claude';
import { loadCase, type LoadedCase } from '../src/corpus';
import { frameOf, AT, runOnDrive, seedCase, type CaseRun } from './corpus-run';
import { API, paging, RUN_ID } from './drive-v3';
import { finishedBefore } from './earlier-runs';
import { countsOf } from './modelled';

const PATH = 'Areas/Home/Garden plot.md';
const OTHER = 'Areas/Home/Shed roof.md';
const SOURCE = 'Water butt update.txt';
const NEWS = 'The replacement water butt has arrived.';
const WORDS = 'Update the garden plot from this committee letter.';
const encoder = new TextEncoder();
const bytes = (value: unknown) => encoder.encode(JSON.stringify(value));
const idOf = (r: CaseRun, path: string) => Object.entries(r.pathsById).find(([, p]) => p === path)?.[0] ?? '';
const reportOf = (r: CaseRun): RunReport => (r.lastRun as { run?: { report?: RunReport } } | null)?.run?.report
  ?? { filed: [], created: [], updated: [], setAside: [], questions: [] };

// Access future exports as data, so a missing export fails an assertion, never module loading.
function why(name: 'TOO_OLD_WHY' | 'NOTHING_FOUND_WHY'): string {
  const value: unknown = Reflect.get(signedCopy, name);
  expect(typeof value, `${name} must be exported`).toBe('string');
  return value as string;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AT);
  paging.size = 1000;
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); paging.size = 2; });

async function fixture(pile = false): Promise<LoadedCase> {
  const c = await loadCase(resolve(import.meta.dirname, '../../testing/corpus/c05-note-not-written-by-bower'));
  delete c.presses;
  c.expected = {};
  c.journal = [];
  if (!pile) { c.inbox = []; c.scope = 'instructions'; }
  return c;
}

interface AppVault { addRequest(text: string, intent?: string): Promise<Request> }
type AppVaultClass = new (opts: { drive: FakeDrive; rootId: () => Promise<string>;
  runningPiles: () => ReadonlySet<string>; device: string }) => AppVault;

async function appRequest(drive: FakeDrive, root: string, words = WORDS): Promise<Request> {
  // Same dynamic browser-module boundary as the corpus driver's actual app answer path.
  const path = new URL('../../src/data/vault/drive-vault.ts', import.meta.url).pathname;
  const module: unknown = await import(/* @vite-ignore */ path);
  const Export: unknown = Reflect.get(module as object, 'DriveVault');
  expect(typeof Export, 'the app write entry point must be available').toBe('function');
  const Vault = Export as AppVaultClass;
  const request = await new Vault({ drive, rootId: async () => root, runningPiles: () => new Set(), device: 'device-1' })
    .addRequest(words, 'bounded-request');
  const files = await drive.listAll(root);
  const file = files.find((f) => !f.folder && drive.pathOf(f.id, root) === `${SYSTEM.changes}/${request.id}.json`);
  expect(file, 'the real app writes a new request directly in changes').toBeDefined();
  expect(JSON.parse(await drive.readText(file?.id ?? ''))).toEqual(expect.objectContaining({ id: request.id, text: words }));
  return request;
}

function reply(line = false, wants = [PATH]): ClaudeSpawn {
  return async (call) => {
    const context = frameOf(call) as {
      piles: Array<{ things: Array<{ name: string; fileId: string }> }>;
      notes: Array<{ path: string }>;
      selection?: unknown;
      sources: Array<{ itemId: string; candidates: Array<{ id: string; path: string }> }>;
      foldersById: Record<string, string>;
    };
    const source = context.piles.flatMap((p) => p.things).find((t) => t.name === SOURCE)?.fileId;
    const offered = line && source && context.notes.some((note) => note.path === PATH);
    const intent = context.selection === undefined ? {
      items: context.sources.map((source) => ({ itemId: source.itemId, kind: 'unknown',
        destination: Object.entries(context.foldersById).find(([, path]) => path === 'Areas/Home')?.[0],
        wants: source.candidates.filter((candidate) => wants.includes(candidate.path)).map((candidate) => candidate.id),
      })), asks: [],
    } : { kind: 'tidy-intent', v: 1,
      things: source ? [{ fileId: source, to: 'Areas/Home', name: SOURCE,
        ...(!offered ? { note: { name: 'Water butt update.md', summary: NEWS, body: NEWS } } : {}),
      }] : [],
      ...(offered ? { lines: [{ note: PATH, text: NEWS, cites: source }] } : {}),
    };
    return { code: 0, stderr: '', cut: null, stdout: JSON.stringify({ type: 'result', subtype: 'success',
      is_error: false, result: JSON.stringify(intent), usage: { input_tokens: 10, output_tokens: 10 } }) };
  };
}

async function historical(drive: FakeDrive, root: string, count = 25, archived = 50) {
  const folders = await finishedBefore(drive, root, count);
  for (const [i, folder] of [...folders.values()].entries()) {
    drive.setTimes(folder.id, AT - 2000 + i, AT - 1000 + i);
  }
  const all = await drive.listAll(root);
  for (const file of all.filter((f) => f.name.startsWith('manifest-'))) {
    // Unrelated marked append runs used to trigger personalAppendHistory even without a waiting request.
    await drive.update(file.id, { appProperties: { bowerAppends: '1' } });
  }
  const changes = all.find((f) => drive.pathOf(f.id, root) === SYSTEM.changes);
  expect(changes).toBeDefined();
  const archive = await drive.createFolder(changes?.id ?? '', 'archive');
  for (let i = 0; i < archived; i++) await drive.createText(archive.id, `unrelated-${i}.json`, JSON.stringify({
    v: 1, id: `archived-request-${i}`, device: 'device-1', at: AT - 90_000 + i,
    kind: 'request', what: 'Asked Bower to keep a made-up letter', text: 'Keep the made-up letter whole.',
  }));
}

interface Trace { reads: number; media: string[]; calls: number }
async function traced(c: LoadedCase, drive: FakeDrive, root: string, press = 1,
  options: Parameters<typeof runOnDrive>[3] = {}) {
  const paths = new Map((await drive.listAll(root)).map((f) => [f.id, drive.pathOf(f.id, root)]));
  const media: string[] = [];
  let calls = 0;
  const timing: string[] = [];
  const log = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].startsWith('timing: ')) timing.push(args[0]);
  });
  const result = await runOnDrive(c, drive, root, { ...options, around: (inner) => {
    const fetch = options.around ? options.around(inner) : inner;
    return async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (url.origin !== API) {
        calls++;
        if (url.searchParams.get('alt') === 'media') media.push(paths.get(url.pathname.split('/').at(-1) ?? '') ?? url.pathname);
      }
      return fetch(input, init);
    };
  } }, press);
  log.mockRestore();
  expect(timing, 'main must emit exactly one timing summary').toHaveLength(1);
  const reads = countsOf(timing[0] ?? '').phases.reads?.calls;
  expect(reads, 'reads comes from runner timing, not an inferred phase').toBeDefined();
  return { result, trace: { reads: reads ?? -1, media, calls } satisfies Trace };
}

async function records(r: CaseRun, runId: string) {
  const found = await new RunRecords(r.drive, r.root).found(runId);
  expect(found.kind, 'production records must form a verified run').toBe('run');
  if (found.kind !== 'run') throw new Error('Expected a verified run after the assertion.');
  expect((await parseRunManifestV2(bytes(found.manifest), r.root, RUNNER_WRITES)).ok).toBe(true);
  for (const checkpoint of found.chain) expect((await parseRunCheckpoint(bytes(checkpoint), {
    rootId: r.root, runId, captureId: found.manifest.captureId, manifestHash: found.manifestHash,
    operationIds: found.manifest.operations.map((o) => o.operationId),
  })).ok).toBe(true);
  expect((await verifyCheckpointChain(found.chain)).ok).toBe(true);
  return found;
}

async function positiveAppend() {
  const c = await fixture(true);
  const drive = new FakeDrive({ clock: () => AT - 5000 });
  const root = await seedCase(drive, c);
  const request = await appRequest(drive, root);
  const r = await runOnDrive(c, drive, root, { claude: reply(true) }, 1);
  expect(r.code).toBe(0);
  const found = await records(r, RUN_ID);
  const edit = found.manifest.operations.find((o) => o.effect.kind === 'edit-text' && o.effect.before.fileId === idOf(r, PATH));
  expect(edit?.effect.kind).toBe('edit-text');
  if (edit?.effect.kind !== 'edit-text') throw new Error('Expected the admitted edit after the assertion.');
  expect(applyChanges(encoder.encode(c.folder[PATH] ?? ''), edit.effect.changes,
    { fileId: idOf(r, PATH), context: createOwnershipContext() })).toEqual({ ok: true,
    text: r.after[PATH], bytes: encoder.encode(r.after[PATH]) });
  expect(found.chain.at(-1)?.completedAppends).toEqual([{ requestId: request.id, targetFileId: idOf(r, PATH) }]);
  expect(r.after[`${SYSTEM.archive}/${request.id}.json`]).toBeDefined();
  expect(r.after[PATH]).toContain(` · ${NEWS} · [[${SOURCE}]]`);
  expect(r.props[PATH] ?? {}).not.toHaveProperty('by');
  return { c, r };
}

async function oldFormatIsNew() {
  const c = await fixture(true);
  const drive = new FakeDrive({ clock: () => AT - 5000 });
  const root = await seedCase(drive, c);
  const request = await appRequest(drive, root);
  const all = await drive.listAll(root);
  const noteId = all.find((f) => drive.pathOf(f.id, root) === PATH)?.id ?? '';
  const changesId = all.find((f) => drive.pathOf(f.id, root) === SYSTEM.changes)?.id ?? '';
  let clashes = 0;
  const first = await traced(c, drive, root, 1, { claude: reply(true), around: (fetch) => async (input, init) => {
    const response = await fetch(input, init);
    if (!clashes && init?.method === 'POST' && (await new Response(init.body).text()).includes('run-manifest')) {
      clashes++;
      drive.touch(noteId);
    }
    return response;
  } });
  expect(first.result.code).toBe(0); expect(clashes).toBe(1);
  expect(first.result.after[PATH]).toBe(c.folder[PATH]);
  const rec = (await drive.listAll(root)).find((f) => !f.folder && f.name === `${request.id}.json`);
  expect(rec).toBeDefined();
  // A staging request in the old location remains new even if an old record happens to bind it.
  if (rec?.parents[0] !== changesId) await drive.update(rec?.id ?? '', {
    addParent: changesId, removeParent: rec?.parents[0],
  });
  await drive.update(noteId, { name: 'Legacy beds.md' });
  const replacement = await drive.createText(idOf(first.result, 'Areas/Home'), 'Garden plot.md', c.folder[PATH] ?? '');
  const next = await traced(c, drive, root, 2, { claude: reply(), answerStart: { scope: 'instructions', requestId: `${RUN_ID}-2` } });
  expect(next.result.code).toBe(0);
  expect.soft(next.result.after['Areas/Home/Legacy beds.md'], 'no migration: an old-format staging request is new')
    .toBe(first.result.after[PATH]);
  expect(next.result.after[PATH]).toBe(c.folder[PATH]);
  expect.soft(reportOf(next.result).leftAsWritten, 'old-format location grants no inherited binding')
    .toEqual([expect.objectContaining({ fileId: replacement.id, why: why('NOTHING_FOUND_WHY') })]);
  const found = await records(next.result, `${RUN_ID}-2`);
  expect.soft(found.chain.at(-1)?.completedAppends ?? [], 'old-format staging records are not migrated').toEqual([]);
  expect.soft(next.trace.media.filter((p) => p.startsWith('.bower/runs/')), 'changes means zero record reads').toEqual([]);
}

async function completionRecovery() {
  const c = await fixture(true);
  const drive = new FakeDrive({ clock: () => AT - 5000 });
  const root = await seedCase(drive, c);
  const request = await appRequest(drive, root);
  const requestFile = (await drive.listAll(root)).find((f) => f.name === `${request.id}.json`);
  expect(requestFile).toBeDefined();
  let interrupted = 0;
  const first = await traced(c, drive, root, 1, { claude: reply(true), around: (fetch) => async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (init?.method === 'PATCH' && url.pathname === `/drive/v3/files/${requestFile?.id}` && url.searchParams.has('addParents')) {
      interrupted++;
      throw new TypeError('Made-up interruption before the request move landed.');
    }
    return fetch(input, init);
  } });
  expect(interrupted).toBe(1);
  expect(first.result.after[PATH]).toContain(` · ${NEWS} · [[${SOURCE}]]`);
  const found = await records(first.result, RUN_ID);
  expect(found.chain.at(-1)?.completedAppends).toEqual([{ requestId: request.id, targetFileId: idOf(first.result, PATH) }]);
  const before = await drive.readText(requestFile?.id ?? '');
  // A different filename must not change the record identity or the completion.
  await drive.update(requestFile?.id ?? '', { name: 'unfinished-copy.json' });
  await drive.update(idOf(first.result, PATH), { name: 'Completed beds.md' });
  const replacement = await drive.createText(idOf(first.result, 'Areas/Home'), 'Garden plot.md', c.folder[PATH] ?? '');
  await drive.createText(idOf(first.result, 'Inbox'), SOURCE, 'Alex received a different made-up letter.', { pile: 'recovery-source' });
  const next = await traced(c, drive, root, 2, { claude: reply(true, ['Areas/Home/Completed beds.md', PATH]), answerStart: { scope: 'all', requestId: `${RUN_ID}-2` } });
  expect(next.result.code).toBe(0);
  expect(next.result.after['Areas/Home/Completed beds.md']).toBe(first.result.after[PATH]);
  expect(next.result.after[PATH]).toBe(c.folder[PATH]); expect(idOf(next.result, PATH)).toBe(replacement.id);
  expect(next.result.after[`${SYSTEM.archive}/unfinished-copy.json`]).toBe(before);
  expect((await records(next.result, `${RUN_ID}-2`)).chain.at(-1)?.completedAppends ?? []).toEqual([]);
  expect(reportOf(next.result).updated).toEqual([]);
}

async function pileBaseline() {
  const c = await loadCase(resolve(import.meta.dirname, '../../testing/corpus/c04-offer-and-flat'));
  const drive = new FakeDrive({ clock: () => AT - 5000 });
  const root = await seedCase(drive, c);
  const baseline = await traced(c, drive, root);
  expect(baseline.result.code).toBe(0);
  expect(reportOf(baseline.result).filed.length).toBeGreaterThan(0);
  // TL-P4-42 addendum 5: cold questions.json media adds one planning read; no archive media.
  expect(baseline.trace.reads).toBe(25);
  expect(baseline.trace.media.filter((p) => p.startsWith('.bower/runs/'))).toEqual([]);
  return baseline;
}

it('C05 bounded reads: golden: 50 archived requests and 25 kept runs cost no historical media', async () => {
  const baseline = await pileBaseline();
  const pile = await fixture(true);

  const c = await fixture();
  const freshDrive = new FakeDrive({ clock: () => AT - 5000 });
  const freshRoot = await seedCase(freshDrive, c);
  await appRequest(freshDrive, freshRoot);
  const fresh = await traced(c, freshDrive, freshRoot, 1, { claude: reply() });
  expect(fresh.result.code).toBe(0);
  expect(fresh.trace.reads).toBeLessThanOrEqual(baseline.trace.reads);
  expect(reportOf(fresh.result).leftAsWritten).toEqual([expect.objectContaining({ why: why('NOTHING_FOUND_WHY') })]);

  const drive = new FakeDrive({ clock: () => AT - 5000 });
  const root = await seedCase(drive, c);
  await historical(drive, root);
  const request = await appRequest(drive, root);
  const run = await traced(c, drive, root, 1, { claude: reply() });
  expect(run.result.code).toBe(0);
  expect(reportOf(run.result).leftAsWritten).toEqual([expect.objectContaining({ why: why('NOTHING_FOUND_WHY') })]);
  expect(run.result.after[`${SYSTEM.archive}/${request.id}.json`]).toBeDefined();
  expect.soft(run.trace.media.filter((p) => p.startsWith(`${SYSTEM.archive}/`)), 'archive is never admission evidence').toEqual([]);
  expect.soft(run.trace.media.filter((p) => p.startsWith('.bower/runs/')), 'a new request has zero record reads').toEqual([]);
  expect.soft(run.trace.reads, 'zero waiting requests: pile baseline plus zero').toBeLessThanOrEqual(baseline.trace.reads);

  const noRequestDrive = new FakeDrive({ clock: () => AT - 5000 });
  const noRequestRoot = await seedCase(noRequestDrive, pile);
  await historical(noRequestDrive, noRequestRoot);
  const noRequest = await traced(pile, noRequestDrive, noRequestRoot, 1, { claude: reply() });
  expect(noRequest.result.code).toBe(0);
  expect.soft(noRequest.trace.media.filter((p) => p.startsWith('.bower/runs/')), 'no waiting request means no append history').toEqual([]);
  expect.soft(noRequest.trace.reads).toBeLessThanOrEqual(baseline.trace.reads);
  await oldFormatIsNew();
});

it('C05 bounded reads: pending: a clash moves by run id and retries only its bound evidence', async () => {
  await positiveAppend();
  await completionRecovery();
  const baseline = await pileBaseline();
  const c = await fixture(true);
  c.folder[OTHER] = c.folder[PATH] ?? '';
  const drive = new FakeDrive({ clock: () => AT - 5000 });
  const root = await seedCase(drive, c);
  const request = await appRequest(drive, root, 'Update the garden plot and shed roof from this committee letter.');
  const note = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === PATH);
  expect(note).toBeDefined();
  const noteId = note?.id ?? '';
  let clashes = 0;
  const fresh = (c.folder[PATH] ?? '').replace('## My words\n', '## My words\nAlex added a reminder.\n');
  const first = await traced(c, drive, root, 1, { claude: reply(true, [PATH, OTHER]), around: (fetch) => async (input, init) => {
    const response = await fetch(input, init);
    const body = init?.body ? await new Response(init.body).text() : '';
    if (!clashes && init?.method === 'POST' && body.includes('run-manifest')) {
      clashes++;
      await drive.writeText(noteId, fresh, (await drive.get(noteId)).modifiedTime);
    }
    return response;
  } });
  expect(first.result.code).toBe(0); expect(clashes).toBe(1);
  expect(first.result.after[PATH]).toBe(fresh);
  expect(reportOf(first.result).leftAsWritten).toEqual([expect.objectContaining({ fileId: idOf(first.result, OTHER), why: why('NOTHING_FOUND_WHY') })]);
  const original = await records(first.result, RUN_ID);
  // This fixture has one manifest and four checkpoint files; RunRecords verifies every link.
  const ownRunRecordCount = 5;
  expect(1 + original.chain.length, 'pin the waiting fixture manifest plus checkpoint count').toBe(ownRunRecordCount);
  expect(original.chain.at(-1)?.completedAppends ?? []).toEqual([]);
  const rejected = original.manifest.operations.find((o) => o.effect.kind === 'edit-text' && o.effect.before.fileId === noteId);
  expect(original.chain.at(-1)?.outcomes.find((o) => o.operationId === rejected?.operationId)).toEqual(expect.objectContaining({
    state: 'rejected', failure: expect.objectContaining({ code: 'conflict' }),
  }));
  const pendingPath = `${SYSTEM.changes}/pending/${RUN_ID}/${request.id}.json`;
  expect.soft(first.result.after[pendingPath], 'only the clash carries its request into its evidence run folder').toBeDefined();
  expect.soft(first.result.after[`${SYSTEM.changes}/${request.id}.json`], 'waiting requests leave the new-request inbox').toBeUndefined();
  expect(first.result.after[`${SYSTEM.archive}/${request.id}.json`]).toBeUndefined();
  // Gone targets settle by their bound id; a title match cannot transfer consent.
  const goneDrive = FakeDrive.restore(await drive.snapshot(), { clock: () => AT - 5000 });
  await goneDrive.trash(noteId);
  const gone = await traced(c, goneDrive, root, 2, { claude: reply(), answerStart: { scope: 'instructions', requestId: `${RUN_ID}-2` } });
  expect(gone.result.code).toBe(0);
  expect(gone.result.after[PATH]).toBeUndefined();
  expect((await goneDrive.evidence(noteId))?.trashed).toBe(true);
  expect(JSON.stringify(reportOf(gone.result))).toContain(ASK_GONE);
  expect(gone.result.after[`${SYSTEM.archive}/${request.id}.json`]).toBeDefined();
  expect((await records(gone.result, `${RUN_ID}-2`)).chain.at(-1)?.completedAppends ?? []).toEqual([]);

  const requestFile = (await drive.listAll(root)).find((f) => !f.folder && f.name === `${request.id}.json`);
  expect(requestFile).toBeDefined();
  const requestBytes = await drive.readText(requestFile?.id ?? '');
  await drive.update(requestFile?.id ?? '', { name: 'waiting-copy.json' });
  const sourceId = idOf(first.result, `Areas/Home/${SOURCE}`);
  await drive.update(noteId, { name: 'Beds.md' });
  await drive.update(sourceId, { name: 'Renamed letter.txt' });
  const replacement = await drive.createText(idOf(first.result, 'Areas/Home'), 'Garden plot.md', c.folder[PATH] ?? '');
  await historical(drive, root);
  const next = await traced(c, drive, root, 2, { claude: reply(false, ['Areas/Home/Beds.md']), answerStart: { scope: 'instructions', requestId: `${RUN_ID}-2` } });
  expect(next.result.code).toBe(0);
  expect(next.result.after['Areas/Home/Beds.md']).toBe(fresh.trimEnd() + `\n- 2026-10-07 · ${NEWS} · [[Renamed letter.txt]]\n`);
  expect(next.result.after[PATH]).toBe(c.folder[PATH]); expect(idOf(next.result, PATH)).toBe(replacement.id);
  expect(next.result.after[OTHER]).toBe(first.result.after[OTHER]);
  const retry = await records(next.result, `${RUN_ID}-2`);
  expect(retry.chain.at(-1)?.completedAppends).toEqual([{ requestId: request.id, targetFileId: noteId }]);
  const consents = retry.manifest.operations.flatMap((o) => o.effect.kind === 'edit-text'
    ? o.effect.changes.flatMap((change) => change.kind === 'timeline-append' ? [change.consent] : []) : []);
  expect(consents).toEqual([{ requestId: request.id, targetFileId: noteId, sourceFileId: sourceId }]);
  expect(next.result.after[`${SYSTEM.archive}/waiting-copy.json`]).toBe(requestBytes);
  expect(next.result.after[`${SYSTEM.changes}/pending/${RUN_ID}/waiting-copy.json`]).toBeUndefined();
  expect.soft(next.trace.media.filter((p) => p.startsWith(`${SYSTEM.archive}/`)), 'settled requests are never scanned').toEqual([]);
  const ownRun = `.bower/runs/${RUN_ID}/`;
  expect.soft(next.trace.media.filter((p) => p.startsWith('.bower/runs/') && !p.startsWith(ownRun)), 'waiting request reads only its own run').toEqual([]);
  expect.soft(next.trace.media.filter((p) => p.startsWith(ownRun)).length, 'one waiting request reads at most its five-file run chain').toBeLessThanOrEqual(ownRunRecordCount);
  expect.soft(next.trace.reads, 'one waiting request: pile baseline plus its five-file run chain').toBeLessThanOrEqual(baseline.trace.reads + ownRunRecordCount);
});

async function waitingRetryArchive(interrupt: boolean, words: string) {
  const c = await fixture(true);
  const drive = new FakeDrive({ clock: () => AT - 5000 });
  const root = await seedCase(drive, c);
  const request = await appRequest(drive, root);
  const files = await drive.listAll(root);
  const noteId = files.find((f) => drive.pathOf(f.id, root) === PATH)?.id ?? '';
  const requestFileId = files.find((f) => f.name === `${request.id}.json`)?.id ?? '';
  const requestBytes = await drive.readText(requestFileId);
  const fresh = (c.folder[PATH] ?? '').replace('## My words\n', '## My words\nAlex added a reminder.\n');
  let clashes = 0;
  const first = await traced(c, drive, root, 1, { claude: reply(true), around: (fetch) => async (input, init) => {
    const response = await fetch(input, init);
    const body = init?.body ? await new Response(init.body).text() : '';
    if (!clashes && init?.method === 'POST' && body.includes('run-manifest')) {
      clashes++;
      await drive.writeText(noteId, fresh, (await drive.get(noteId)).modifiedTime);
    }
    return response;
  } });
  expect(first.result.code).toBe(0);
  expect(clashes).toBe(1);
  expect(first.result.after[PATH]).toBe(fresh);
  expect(first.result.after[`${SYSTEM.changes}/pending/${RUN_ID}/${request.id}.json`]).toBe(requestBytes);
  const original = await records(first.result, RUN_ID);
  const rejected = original.manifest.operations.find((o) => o.effect.kind === 'edit-text' && o.effect.before.fileId === noteId);
  expect(rejected).toBeDefined();
  expect(original.chain.at(-1)?.outcomes.find((o) => o.operationId === rejected?.operationId)).toEqual(expect.objectContaining({
    state: 'rejected', failure: expect.objectContaining({ code: 'conflict' }),
  }));
  expect(original.chain.at(-1)?.completedAppends ?? []).toEqual([]);

  let interruptions = 0;
  const retry = await traced(c, drive, root, 2, { claude: reply(),
    answerStart: { scope: 'instructions', requestId: `${RUN_ID}-2` }, around: (fetch) => async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const parent = url.searchParams.get('addParents');
      if (interrupt && init?.method === 'PATCH' && url.pathname === `/drive/v3/files/${requestFileId}`
        && parent && (await drive.get(parent)).name === 'archive') {
        interruptions++;
        throw new TypeError('Made-up interruption before the waiting retry archive landed.');
      }
      return fetch(input, init);
    },
  });
  expect(interruptions).toBe(interrupt ? 1 : 0);
  expect(retry.result.after[PATH]).toBe(fresh.trimEnd() + `\n- 2026-10-07 · ${NEWS} · [[${SOURCE}]]\n`);
  const completed = await records(retry.result, `${RUN_ID}-2`);
  expect(completed.chain.at(-1)?.completedAppends).toEqual([{ requestId: request.id, targetFileId: noteId }]);
  const destination = (target: { fileId: string } | { createdBy: string }): string | undefined => {
    if ('fileId' in target) return retry.result.pathsById[target.fileId];
    const made = completed.manifest.operations.find((o) => o.operationId === target.createdBy);
    if (made?.effect.kind !== 'create-folder') return undefined;
    const parent = destination(made.effect.parent);
    return parent ? `${parent}/${made.effect.name}` : undefined;
  };
  const archive = completed.manifest.operations.find((o) => o.effect.kind === 'move'
    && o.effect.before.fileId === requestFileId && destination(o.effect.parent) === SYSTEM.archive);
  expect(archive).toBeDefined();
  const outcome = completed.chain.at(-1)?.outcomes.find((o) => o.operationId === archive?.operationId);
  if (interrupt) {
    expect(outcome?.state).not.toBe('applied');
    expect(retry.result.after[`${SYSTEM.archive}/${request.id}.json`]).toBeUndefined();
    expect(await drive.readText(requestFileId)).toBe(requestBytes);
    expect(drive.pathOf(requestFileId, root)).toMatch(/\/pending\//);
  } else {
    expect(retry.result.code).toBe(0);
    expect(outcome?.state).toBe('applied');
    expect(retry.result.after[`${SYSTEM.archive}/${request.id}.json`]).toBe(requestBytes);
  }

  // A real pile invokes the model; it proposes the same bound source with either wording.
  const sourceId = idOf(first.result, `Areas/Home/${SOURCE}`);
  const another = await drive.createText(idOf(first.result, 'Inbox'), 'Another letter.txt', 'A made-up committee letter about the garden plot.', { pile: 'next-pile' });
  let proposals = 0;
  const claude: ClaudeSpawn = phaseAwareClaude(async (_call, _step, attempt, phase) => {
    if (phase === 'execution') proposals++;
    return { code: 0, stderr: '', cut: null, stdout: JSON.stringify({ type: 'result', subtype: 'success',
      is_error: false, result: JSON.stringify({ kind: 'tidy-intent', v: 1,
        things: [{ fileId: another.id, to: 'Areas/Home', name: 'Another letter.txt',
          note: { name: 'Another letter.md', summary: 'A made-up committee letter.', body: 'A made-up committee letter.' } }],
        // With settled consent the planner asks for a correction; keep the ordinary pile work.
        ...(attempt === 0 ? { lines: [{ note: PATH, text: words, cites: sourceId }] } : {}),
      }), usage: { input_tokens: 10, output_tokens: 10 } }) };
  }, () => ({ drive, root }));
  const next = await traced(c, drive, root, 3, { claude, answerStart: { scope: 'all', requestId: `${RUN_ID}-3` } });
  expect(next.result.code).toBe(0);
  expect(proposals, 'the next tidy-up really proposes the selected wording').toBeGreaterThan(0);
  const recovered = await records(next.result, `${RUN_ID}-3`);
  expect.soft(recovered.chain.at(-1)?.completedAppends ?? [], `${words}: no second completion`).toEqual([]);
  expect.soft(next.result.after[PATH], `${words}: no second append`).toBe(retry.result.after[PATH]);
  expect.soft(recovered.manifest.operations.flatMap((o) => o.effect.kind === 'edit-text'
    ? o.effect.changes.filter((change) => change.kind === 'timeline-append') : []), `${words}: no new append effect`).toEqual([]);
  expect.soft(reportOf(next.result).updated, `${words}: no second update`).toEqual([]);
  expect(next.result.after[`${SYSTEM.archive}/${request.id}.json`]).toBe(requestBytes);
}

async function waitingRetryPending(mode: 'lands' | 'pending-fails' | 'before-append', words: string) {
  const c = await fixture(true);
  const drive = new FakeDrive({ clock: () => AT - 5000 });
  const root = await seedCase(drive, c);
  const request = await appRequest(drive, root);
  const files = await drive.listAll(root);
  const noteId = files.find((f) => drive.pathOf(f.id, root) === PATH)?.id ?? '';
  const requestFileId = files.find((f) => f.name === `${request.id}.json`)?.id ?? '';
  const requestBytes = await drive.readText(requestFileId);
  const fresh = (c.folder[PATH] ?? '').replace('## My words\n', '## My words\nAlex added a reminder.\n');
  let clashes = 0;
  const first = await traced(c, drive, root, 1, { claude: reply(true), around: (fetch) => async (input, init) => {
    const response = await fetch(input, init);
    const body = init?.body ? await new Response(init.body).text() : '';
    if (!clashes && init?.method === 'POST' && body.includes('run-manifest')) {
      clashes++;
      await drive.writeText(noteId, fresh, (await drive.get(noteId)).modifiedTime);
    }
    return response;
  } });
  expect(first.result.code).toBe(0);
  expect(clashes).toBe(1);
  expect(first.result.after[PATH]).toBe(fresh);
  expect(first.result.after[`${SYSTEM.changes}/pending/${RUN_ID}/${request.id}.json`]).toBe(requestBytes);
  const original = await records(first.result, RUN_ID);
  const rejected = original.manifest.operations.find((o) => o.effect.kind === 'edit-text' && o.effect.before.fileId === noteId);
  expect(rejected).toBeDefined();
  expect(original.chain.at(-1)?.outcomes.find((o) => o.operationId === rejected?.operationId)).toEqual(expect.objectContaining({
    state: 'rejected', failure: expect.objectContaining({ code: 'conflict' }),
  }));
  expect(original.chain.at(-1)?.completedAppends ?? []).toEqual([]);

  let interruptions = 0;
  let appendInterruptions = 0;
  let pointerPublished = false;
  const retry = await traced(c, drive, root, 2, { claude: reply(),
    answerStart: { scope: 'instructions', requestId: `${RUN_ID}-2` }, around: (fetch) => async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const parent = url.searchParams.get('addParents');
      if (mode === 'before-append' && init?.method === 'PATCH'
        && url.pathname === `/upload/drive/v3/files/${noteId}`) {
        expect(pointerPublished, 'B publishes its pointer before the interrupted append').toBe(true);
        appendInterruptions++;
        throw new TypeError('Made-up interruption before the waiting retry append landed.');
      }
      if (mode !== 'lands' && init?.method === 'PATCH' && url.pathname === `/drive/v3/files/${requestFileId}`
        && parent && (await drive.get(parent)).name === `${RUN_ID}-2`) {
        expect(pointerPublished, 'B publishes its pointer before the failed pending relocation').toBe(true);
        interruptions++;
        throw new TypeError('Made-up interruption before the waiting retry pending relocation landed.');
      }
      const response = await fetch(input, init);
      if (init?.method === 'PATCH' && url.pathname === `/drive/v3/files/${requestFileId}` && !parent) {
        pointerPublished = (await drive.get(requestFileId)).appProperties?.bowerRun === `${RUN_ID}-2`;
      }
      return response;
    },
  });
  expect(pointerPublished).toBe(true);
  expect(interruptions).toBe(mode === 'pending-fails' ? 1 : 0);
  expect(appendInterruptions).toBe(mode === 'before-append' ? 1 : 0);
  const appended = fresh.trimEnd() + `\n- 2026-10-07 · ${NEWS} · [[${SOURCE}]]\n`;
  expect(retry.result.after[PATH]).toBe(mode === 'before-append' ? fresh : appended);
  const completed = await records(retry.result, `${RUN_ID}-2`);
  expect(completed.chain.at(-1)?.completedAppends ?? []).toEqual(mode === 'before-append'
    ? [] : [{ requestId: request.id, targetFileId: noteId }]);
  const destination = (target: { fileId: string } | { createdBy: string }): string | undefined => {
    if ('fileId' in target) return retry.result.pathsById[target.fileId];
    const made = completed.manifest.operations.find((o) => o.operationId === target.createdBy);
    if (made?.effect.kind !== 'create-folder') return undefined;
    const parent = destination(made.effect.parent);
    return parent ? `${parent}/${made.effect.name}` : undefined;
  };
  const archive = completed.manifest.operations.find((o) => o.effect.kind === 'move'
    && o.effect.before.fileId === requestFileId && destination(o.effect.parent) === SYSTEM.archive);
  expect(archive).toBeDefined();
  const outcome = completed.chain.at(-1)?.outcomes.find((o) => o.operationId === archive?.operationId);
  if (mode !== 'lands') {
    expect(outcome?.state).not.toBe('applied');
    expect(retry.result.after[`${SYSTEM.archive}/${request.id}.json`]).toBeUndefined();
    expect(await drive.readText(requestFileId)).toBe(requestBytes);
    expect(drive.pathOf(requestFileId, root)).toBe(`${SYSTEM.changes}/pending/${RUN_ID}/${request.id}.json`);
    expect((await drive.get(requestFileId)).appProperties?.bowerRun).toBe(`${RUN_ID}-2`);
    expect(retry.result.after[`${SYSTEM.changes}/pending/${RUN_ID}-2/${request.id}.json`]).toBeUndefined();
    const relocation = completed.manifest.operations.find((o) => o.effect.kind === 'move'
      && o.effect.before.fileId === requestFileId
      && destination(o.effect.parent) === `${SYSTEM.changes}/pending/${RUN_ID}-2`);
    expect(relocation).toBeDefined();
    expect(completed.chain.at(-1)?.outcomes.find((o) => o.operationId === relocation?.operationId)?.state)
      .not.toBe('applied');
  } else {
    expect(retry.result.code).toBe(0);
    expect(outcome?.state).toBe('applied');
    expect(retry.result.after[`${SYSTEM.archive}/${request.id}.json`]).toBe(requestBytes);
  }

  // A real pile invokes the model; it proposes the same bound source with either wording.
  const sourceId = idOf(first.result, `Areas/Home/${SOURCE}`);
  const another = await drive.createText(idOf(first.result, 'Inbox'), 'Another letter.txt', 'A made-up committee letter about the garden plot.', { pile: 'next-pile' });
  let proposals = 0;
  const claude: ClaudeSpawn = phaseAwareClaude(async (_call, _step, attempt, phase) => {
    if (phase === 'execution') proposals++;
    return { code: 0, stderr: '', cut: null, stdout: JSON.stringify({ type: 'result', subtype: 'success',
      is_error: false, result: JSON.stringify({ kind: 'tidy-intent', v: 1,
        things: [{ fileId: another.id, to: 'Areas/Home', name: 'Another letter.txt',
          note: { name: 'Another letter.md', summary: 'A made-up committee letter.', body: 'A made-up committee letter.' } }],
        // With settled consent the planner asks for a correction; keep the ordinary pile work.
        ...(attempt === 0 ? { lines: [{ note: PATH, text: words, cites: sourceId }] } : {}),
      }), usage: { input_tokens: 10, output_tokens: 10 } }) };
  }, () => ({ drive, root }));
  const next = await traced(c, drive, root, 3, { claude, answerStart: { scope: 'all', requestId: `${RUN_ID}-3` } });
  expect(next.result.code).toBe(0);
  expect(proposals, 'the next tidy-up really proposes the selected wording').toBeGreaterThan(0);
  const recovered = await records(next.result, `${RUN_ID}-3`);
  const appends = recovered.manifest.operations.flatMap((o) => o.effect.kind === 'edit-text'
    ? o.effect.changes.filter((change) => change.kind === 'timeline-append') : []);
  if (mode === 'before-append') {
    expect.soft(recovered.chain.at(-1)?.completedAppends ?? [], `${words}: the interrupted append completes once`)
      .toEqual([{ requestId: request.id, targetFileId: noteId }]);
    expect.soft([appended, fresh.trimEnd() + `\n- 2026-10-07 · ${words} · [[${SOURCE}]]\n`],
      `${words}: one bound-source line appends exactly once`).toContain(next.result.after[PATH]);
    expect.soft(appends, `${words}: exactly one new append effect`).toHaveLength(1);
    expect.soft(reportOf(next.result).updated, `${words}: exactly one update`).toHaveLength(1);
  } else {
    expect.soft(recovered.chain.at(-1)?.completedAppends ?? [], `${words}: no second completion`).toEqual([]);
    expect.soft(next.result.after[PATH], `${words}: no second append`).toBe(retry.result.after[PATH]);
    expect.soft(appends, `${words}: no new append effect`).toEqual([]);
    expect.soft(reportOf(next.result).updated, `${words}: no second update`).toEqual([]);
  }
  expect(next.result.after[`${SYSTEM.archive}/${request.id}.json`]).toBe(requestBytes);
}

it('C05 bounded reads: fix 2 control: a waiting retry whose pending relocation lands completes once', async () => {
  for (const words of [NEWS, 'The committee confirmed delivery of the replacement water butt.']) {
    await waitingRetryPending('lands', words);
  }
});

it('C05 bounded reads: fix 2: a waiting retry whose pending relocation failed completes once', async () => {
  for (const words of [NEWS, 'The committee confirmed delivery of the replacement water butt.']) {
    await waitingRetryPending('pending-fails', words);
  }
});

it('C05 bounded reads: fix 2: a waiting retry interrupted after its pointer and before its append appends once', async () => {
  for (const words of [NEWS, 'The committee confirmed delivery of the replacement water butt.']) {
    await waitingRetryPending('before-append', words);
  }
});

it('C05 bounded reads: fix 1 control: a waiting retry whose archive lands completes once', async () => {
  for (const words of [NEWS, 'The committee confirmed delivery of the replacement water butt.']) {
    await waitingRetryArchive(false, words);
  }
});

it('C05 bounded reads: fix 1: a waiting retry whose archive move failed completes once', async () => {
  for (const words of [NEWS, 'The committee confirmed delivery of the replacement water butt.']) {
    await waitingRetryArchive(true, words);
  }
});

it('C05 bounded reads: horizon: past 20 runs uses listing age and TOO_OLD_WHY without a chain walk', async () => {
  await positiveAppend();
  const c = await fixture();
  async function aged(at: number) {
    const drive = new FakeDrive({ clock: () => AT - 5000 });
    const root = await seedCase(drive, c);
    vi.setSystemTime(at);
    const request = await appRequest(drive, root);
    vi.setSystemTime(AT);
    await historical(drive, root);
    const run = await traced(c, drive, root, 1, { claude: reply() });
    expect(run.result.code).toBe(0);
    return { ...run, request };
  }
  const control = await aged(AT + 1);
  expect(reportOf(control.result).leftAsWritten).toEqual([expect.objectContaining({ why: why('NOTHING_FOUND_WHY') })]);
  // Listing creation is AT - 2000, while the historical manifests say AT.
  // This request is inside the metadata horizon and must remain new.
  const metadata = await aged(AT - 1000);
  expect.soft(reportOf(metadata.result).leftAsWritten, 'listing creation time, not manifest requestedAt, sets the horizon')
    .toEqual([expect.objectContaining({ why: why('NOTHING_FOUND_WHY') })]);
  const old = await aged(AT - 60_000);
  expect(old.result.after[PATH]).toBe(c.folder[PATH]);
  expect(reportOf(old.result).updated).toEqual([]);
  expect(reportOf(old.result).leftAsWritten).toEqual([expect.objectContaining({ why: why('TOO_OLD_WHY') })]);
  const found = await records(old.result, RUN_ID);
  expect(found.chain.at(-1)?.completedAppends ?? []).toEqual([]);
  expect(found.manifest.operations.filter((o) => o.effect.kind === 'edit-text')).toEqual([]);
  expect(old.result.after[`${SYSTEM.archive}/${old.request.id}.json`]).toBeDefined();
  expect(old.result.after[`${SYSTEM.changes}/${old.request.id}.json`]).toBeUndefined();
  expect.soft(old.trace.media.filter((p) => p.startsWith('.bower/runs/')), 'retention horizon needs zero manifests or checkpoints').toEqual([]);
  expect.soft(old.trace.media.filter((p) => p.startsWith(`${SYSTEM.archive}/`))).toEqual([]);
});
