import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { FakeDrive } from '../../src/data/drive/fake-drive';
import type { AdmissionManifest } from '../../src/data/spine/admission';
import { parseRunManifestV2 } from '../../src/data/contracts/run-manifest';
import { parseRunCheckpoint, verifyCheckpointChain, type Checkpoint } from '../../src/data/contracts/run-checkpoint';
import { RUNNER_WRITES, isHidden } from '../../src/data/vault/layout';
import { VaultIndex } from '../../src/data/vault/vault-index';
import { serializeRules } from '../../src/data/contracts/rules-format';
import * as reply from '../src/claude';
import { loadCase, type LoadedCase } from '../src/corpus';
import { AT, redispatchCase, replySequence, runOnDrive, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';

const CASE = resolve(import.meta.dirname, '../../harness/corpus/b1-maintenance-crash-resume');
const pacing = { sleep: async (): Promise<void> => undefined };
const emptyReply = { kind: 'tidy-intent', v: 1, things: [] };
const derived = ['.bower/index.md', '.bower/retrieval.json', '.bower/hot.md', '.bower/log.md'];
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(AT); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

/** Missing future exports fail an assertion, never module loading or a call of undefined. */
function requiredFunction<T>(module: object, name: string): T {
  const value: unknown = Reflect.get(module, name);
  expect(value, `production export ${name}`).toBeTypeOf('function');
  return value as T;
}

it('B1a contract: 2: selection is closed candidate ids with five wants and exact step two targets', () => {
  const admission = { v: 1, id: 'admission-1', rootId: 'FOLDER_ID', scope: 'instructions', piles: [], journal: [] } as unknown as AdmissionManifest;
  expect(reply.intentOf(emptyReply, { taken: admission, deferred: [] })).toMatchObject({ ok: true });
  type Selection = { items: Array<{ itemId: string; kind: string; destination: string | { parentId: string; name: string }; wants: string[] }>; asks: unknown[] };
  type Context = { itemIds: string[]; kinds: string[]; candidates: string[]; folders: Array<{ id: string; hubId: string | null }>; pinned: Record<string, string[]> };
  type Result = { ok: true; value: Selection; allowedTargets: Record<string, string[]> } | { ok: false };
  const validate = requiredFunction<(value: unknown, context: Context) => Result>(reply, 'selectionOf');
  const context: Context = { itemIds: ['source-1', 'words-only'], kinds: ['reference'], candidates: ['note-1', 'note-2', 'note-3', 'note-4', 'note-5', 'note-6', 'map-1'], folders: [{ id: 'folder-1', hubId: 'map-1' }], pinned: {} };
  const valid: Selection = { items: [{ itemId: 'source-1', kind: 'reference', destination: 'folder-1', wants: ['note-1', 'note-2', 'note-3', 'note-4', 'note-5'] }], asks: [] };
  expect(validate(valid, context)).toEqual({ ok: true, value: valid, allowedTargets: { 'source-1': ['note-1', 'note-2', 'note-3', 'note-4', 'note-5', 'folder-1', 'map-1'] } });
  for (const patch of [
    { wants: ['outside-note'] }, { wants: ['Resources/Plot.md'] }, { wants: ['new-note'] },
    { wants: context.candidates.slice(0, 6) }, { destination: 'Resources/Gardening' }, { destination: 'new-folder' },
    { destination: { parentId: 'outside-folder', name: 'New' } }, { destination: { parentId: 'folder-1', name: '../New' } },
    { kind: 'invented-type' }, { itemId: 'new-source' }, { extra: 'unclosed' },
  ]) expect(validate({ ...valid, items: [{ ...valid.items[0], ...patch }] }, context), JSON.stringify(patch)).toMatchObject({ ok: false });
  expect(validate({ ...valid, extra: true }, context)).toMatchObject({ ok: false });
  const unknown = { ...valid, items: [{ ...valid.items[0], kind: 'unknown', destination: { parentId: 'folder-1', name: 'New' } }] };
  expect(validate(unknown, context)).toMatchObject({ ok: true, value: unknown });
  // A words-only source and answer/pair pins share that source's five, not a new allowance.
  const words = { items: [{ itemId: 'words-only', kind: 'unknown', destination: 'folder-1', wants: ['note-1', 'note-2', 'note-3'] }], asks: [] };
  const pinned = { ...context, pinned: { 'words-only': ['note-4', 'note-5'] } };
  expect(validate(words, pinned)).toMatchObject({ ok: true });
  expect(validate({ ...words, items: [{ ...words.items[0], wants: ['note-1', 'note-2', 'note-3', 'note-6'] }] }, pinned)).toMatchObject({ ok: false });
});

interface Sent { path: string; text: string }
/** Observe production sends only. Seeding and snapshot reads never contribute to this trace. */
function trace(drive: FakeDrive, root: string, sent: Sent[], lost?: { path: string; reached: boolean; enabled: boolean }) {
  return (fetch: typeof globalThis.fetch): typeof globalThis.fetch => async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = (init.method ?? 'GET').toUpperCase();
    const id = /^\/(?:upload\/)?drive\/v3\/files\/([^/]+)$/.exec(url.pathname)?.[1];
    const body = init.body === undefined || init.body === null ? '' : await new Response(init.body).text();
    const boundary = /^--([^\r\n]+)\r\n/.exec(body)?.[1];
    const parts = boundary ? body.split(`--${boundary}`).slice(1, -1).map((part) => part.slice(part.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, '')) : [];
    const meta = parts[0];
    const json = meta ? JSON.parse(meta) as { name?: string; parents?: string[] } : undefined;
    const path = id ? drive.pathOf(decodeURIComponent(id), root) : json?.name && json.parents?.[0]
      ? [drive.pathOf(json.parents[0], root), json.name].filter(Boolean).join('/') : undefined;
    if (lost?.enabled && lost.reached && path === lost.path) throw new TypeError('Made-up maintenance transport remains disconnected');
    if (url.origin === 'https://www.googleapis.com' && ['POST', 'PATCH'].includes(method) && path && url.pathname.startsWith('/upload/')) {
      const content = url.searchParams.get('uploadType') === 'media' ? body : parts[1] ?? '';
      sent.push({ path, text: content });
      // The write really lands on the existing fake; the caller loses only its reply.
      if (lost?.enabled && path === lost.path) {
        const response = await fetch(input, init);
        expect(response.ok, 'fault fires after a successful stored write').toBe(true);
        lost.reached = true;
        throw new TypeError('Lost made-up write reply');
      }
    }
    return fetch(input, init);
  };
}

async function setup(): Promise<{ c: LoadedCase; drive: FakeDrive; root: string }> {
  const c = await loadCase(CASE);
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  return { c, drive, root };
}
const manifests = (run: CaseRun): Array<[string, string]> => Object.entries(run.after).filter(([p]) => p.includes('/runs/') && /\/manifest-[^/]+\.json$/.test(p));
const checkpoints = (run: CaseRun): Checkpoint[] => Object.entries(run.after).filter(([p]) => p.includes('/runs/') && /\/checkpoint-[^/]+\.json$/.test(p)).map(([, text]) => JSON.parse(text) as Checkpoint).sort((a, b) => a.revision - b.revision);
const report = (run: CaseRun): { updated: Array<{ path: string }>; created: Array<{ path: string }> } => (run.lastRun as { run: { report: { updated: Array<{ path: string }>; created: Array<{ path: string }> } } }).run.report;

it('B1a contract: 3: retrieval state and cursor commit together before the hidden report barrier', async () => {
  const { c, drive, root } = await setup();
  const sent: Sent[] = [];
  const run = await runOnDrive(c, drive, root, { pacing, claude: replySequence([emptyReply]), around: trace(drive, root, sent) }, 1);
  expect(run.code).toBe(0);
  expect(run.after['Resources/Gardening/Plot.md']).toBe(c.folder['Resources/Gardening/Plot.md']);
  expect(run.after['Rules.md']).toContain('Keep gardening notes in Resources.');
  expect(manifests(run)).toHaveLength(1);
  expect(sent.some((s) => s.path === '.bower/last-run.json'), 'trace observes the real report barrier write').toBe(true);
  expect.soft(run.after['.bower/retrieval.json'], 'durable state is created').toBeDefined();
  const state = JSON.parse(run.after['.bower/retrieval.json'] ?? 'null') as { v: number; folderId: string; account: string; cursor: string; files: Record<string, { path: string; version: string; summary: string; coverage: unknown }> } | null;
  expect.soft(state).toMatchObject({ v: 1, folderId: root, account: expect.any(String), cursor: expect.any(String) });
  const note = Object.entries(run.pathsById).find(([, path]) => path === 'Resources/Gardening/Plot.md')?.[0];
  expect(note).toBeDefined();
  expect.soft(state?.files[note ?? '']).toMatchObject({ path: 'Resources/Gardening/Plot.md', version: expect.any(String), summary: 'Alex grows beans in a raised bed.', coverage: expect.anything() });
  const commits = sent.filter((s) => s.path === '.bower/retrieval.json');
  expect.soft(commits, 'one write includes both source state and cursor').toHaveLength(1);
  if (commits[0]) expect(JSON.parse(commits[0].text) as unknown).toEqual(state);
  expect.soft(run.after['.bower/index.md'] ?? '').toContain('[[Plot]]');
  expect.soft(sent.filter((s) => /cursor\.json$/.test(s.path))).toEqual([]);
  const maintenanceAt = sent.findIndex((s) => s.path === '.bower/retrieval.json');
  const barrierAt = sent.findIndex((s) => s.path === '.bower/last-run.json');
  expect.soft(maintenanceAt).toBeGreaterThanOrEqual(0);
  expect.soft(barrierAt).toBeGreaterThan(maintenanceAt);
  expect([...report(run).updated, ...report(run).created].filter((r) => derived.includes(r.path))).toEqual([]);
});

it('B1a contract: 4: settled maintenance replays without rows or duplicate writes and done skips it', async () => {
  const { c, drive, root } = await setup();
  const sent: Sent[] = [];
  const spawn = vi.fn(replySequence([emptyReply]));
  const run = await runOnDrive(c, drive, root, { pacing, claude: spawn, around: trace(drive, root, sent) }, 1);
  expect(run.code).toBe(0);
  expect(spawn).toHaveBeenCalled();
  expect(run.after['Rules.md']).toContain('Keep gardening notes in Resources.');
  const recorded = manifests(run);
  expect(recorded).toHaveLength(1);
  const manifest = JSON.parse(recorded[0]?.[1] ?? '{}') as { operations: Array<{ operationId: string; effect: { kind: string; inputs?: unknown } }> };
  const maintenance = manifest.operations.filter((o) => o.effect.kind === 'maintain');
  expect.soft(maintenance, 'one declared deterministic manifest effect on a no-item instruction run').toHaveLength(1);
  expect.soft(maintenance[0]?.effect.inputs).toBeDefined();
  const calls = spawn.mock.calls.length;
  sent.length = 0;
  const done = await redispatchCase(c, run, 2, { pacing, claude: spawn, around: trace(drive, root, sent) });
  expect(done.code).toBe(0);
  expect(spawn).toHaveBeenCalledTimes(calls);
  expect(manifests(done)).toEqual(recorded);
  expect(sent.filter((s) => derived.includes(s.path))).toEqual([]);
  for (const path of derived) expect(done.after[path]).toBe(run.after[path]);
  expect([...report(done).updated, ...report(done).created].filter((r) => derived.includes(r.path))).toEqual([]);
});

it('B1a contract: case 6: lost maintenance reply resumes the same manifest before done', async () => {
  const { c, drive, root } = await setup();
  const sent: Sent[] = [];
  const lost = { path: '.bower/retrieval.json', reached: false, enabled: true };
  const spawn = vi.fn(replySequence([emptyReply]));
  const run = await runOnDrive(c, drive, root, { pacing, claude: spawn, around: trace(drive, root, sent, lost) }, 1);
  expect(manifests(run)).toHaveLength(1); // Control: main planned and persisted on the real runner path.
  expect(run.after['Resources/Gardening/Plot.md']).toBe(c.folder['Resources/Gardening/Plot.md']);
  expect.soft(lost.reached, 'lost reply is injected into a real maintain write').toBe(true);
  expect.soft(run.code, 'the interrupted attempt remains resumable').toBe(1);
  expect.soft(run.after['.bower/last-run.json'], 'the report barrier does not land before maintenance settles').toBeUndefined();
  expect.soft(checkpoints(run).at(-1)?.phase).not.toBe('done');
  lost.enabled = false;
  const first = manifests(run);
  const planCalls = spawn.mock.calls.length;
  const resumed = await redispatchCase(c, run, 2, { pacing, claude: spawn, around: trace(drive, root, sent) });
  expect(resumed.code).toBe(0);
  expect(manifests(resumed)).toEqual(first);
  expect(spawn).toHaveBeenCalledTimes(planCalls);
  expect.soft(resumed.after['.bower/retrieval.json']).toBeDefined();
  expect.soft(resumed.after['.bower/index.md'] ?? '').toContain('[[Plot]]');
  const chain = checkpoints(resumed);
  expect(await verifyCheckpointChain(chain)).toMatchObject({ ok: true });
  const parsed = await parseRunManifestV2(new TextEncoder().encode(first[0]?.[1] ?? ''), root, RUNNER_WRITES);
  expect(parsed).toMatchObject({ ok: true });
  if (parsed.ok) {
    for (const cp of chain) expect(await parseRunCheckpoint(new TextEncoder().encode(JSON.stringify(cp)), {
      rootId: root, runId: parsed.value.runId, captureId: parsed.value.captureId, manifestHash: parsed.sha256,
      operationIds: parsed.value.operations.map((o) => o.operationId),
    })).toMatchObject({ ok: true });
    const op = parsed.value.operations.find((o) => String(o.effect.kind) === 'maintain');
    expect.soft(op).toBeDefined();
    if (op) expect(chain.at(-1)?.outcomes.find((o) => o.operationId === op.operationId)?.state).toBe('applied');
  }
  expect(chain.at(-1)?.phase).toBe('done');
  const rows = [...report(resumed).updated, ...report(resumed).created];
  expect(rows.filter((r) => derived.includes(r.path))).toEqual([]);
  if (lost.reached) {
    expect(sent.filter((s) => s.path === '.bower/retrieval.json'), 'the landed state is reconciled by op id, not written again').toHaveLength(1);
    const commit = sent.findIndex((s) => s.path === '.bower/retrieval.json');
    expect(sent.findIndex((s) => s.path === '.bower/last-run.json')).toBeGreaterThan(commit);
    const log = resumed.after['.bower/log.md'] ?? '';
    const lines = log.split('\n').filter((line) => line.trim());
    expect(new Set(lines).size).toBe(lines.length);
  }
  sent.length = 0;
  const done = await redispatchCase(c, resumed, 3, { pacing, claude: spawn, around: trace(drive, root, sent) });
  expect(done.code).toBe(0);
  expect(sent.filter((s) => derived.includes(s.path))).toEqual([]);
});

it('B1a contract: 4: maintenance uses settled refusals without fabricating rows or log entries', async () => {
  const { c, drive, root } = await setup();
  const rule = await drive.createText(root, 'Rules.md', serializeRules([]), { by: 'bower' });
  const sent: Sent[] = [];
  let changed = false;
  const observed = trace(drive, root, sent);
  const around = (fetch: typeof globalThis.fetch): typeof globalThis.fetch => {
    const traced = observed(fetch);
    return async (input, init) => {
      const count = sent.length;
      const response = await traced(input, init);
      if (!changed && sent.slice(count).some((s) => /\/manifest-[^/]+\.json$/.test(s.path))) {
        drive.touch(rule.id); // After the plan's read, before its real effect: the existing modifiedTime fence refuses.
        changed = true;
      }
      return response;
    };
  };
  const run = await runOnDrive(c, drive, root, { pacing, claude: replySequence([emptyReply]), around }, 1);
  expect(run.code).toBe(0);
  expect(changed, 'the fault is reached after the immutable plan lands').toBe(true);
  const manifest = JSON.parse(manifests(run)[0]?.[1] ?? '{}') as { operations: Array<{ operationId: string; effect: { kind: string; path?: string } }> };
  const edit = manifest.operations.find((o) => o.effect.kind === 'edit-text' && o.effect.path === 'Rules.md');
  expect(edit).toBeDefined();
  const chain = checkpoints(run);
  expect(chain.at(-1)?.outcomes.find((o) => o.operationId === edit?.operationId)).toMatchObject({ state: 'rejected' });
  expect(await drive.readText(rule.id)).toBe(serializeRules([]));
  expect(report(run).updated.filter((r) => r.path === 'Rules.md')).toEqual([]);
  const maintain = manifest.operations.find((o) => o.effect.kind === 'maintain');
  expect.soft(maintain, 'maintenance still runs after a refusal settles').toBeDefined();
  if (maintain) expect(chain.at(-1)?.outcomes.find((o) => o.operationId === maintain.operationId)?.state).toBe('applied');
  expect.soft(run.after['.bower/retrieval.json']).toBeDefined();
  expect((run.after['.bower/log.md'] ?? '').includes(edit?.operationId ?? 'missing-operation')).toBe(false);
  expect([...report(run).updated, ...report(run).created].filter((r) => derived.includes(r.path))).toEqual([]);
});

it('B1a contract: hidden paths addendum: a hidden-only feed advances only the retrieval cursor', async () => {
  const c = await loadCase(CASE);
  c.scope = 'all';
  c.journal = [];
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  expect(isHidden('.obsidian/workspace.json')).toBe(true);
  expect(isHidden('.DS_Store')).toBe(true);
  expect(isHidden('Resources/.x/Note.md')).toBe(true);
  expect(isHidden('Resources/Gardening/Plot.md')).toBe(false);
  const files = await drive.listAll(root);
  const sys = files.find((f) => f.name === '.bower' && f.parents[0] === root)?.id ?? '';
  const plot = files.find((f) => f.name === 'Plot.md');
  expect(plot).toBeDefined();
  const state = { v: 1, folderId: root, account: 'ACCOUNT_ID', cursor: await drive.getStartPageToken(), files: { [plot?.id ?? '']: { path: 'Resources/Gardening/Plot.md', version: plot?.modifiedTime, summary: 'Alex grows beans in a raised bed.', coverage: { kind: 'prefix', bytes: 4096 } } } };
  const stateFile = await drive.createText(sys, 'retrieval.json', JSON.stringify(state));
  await drive.createText(sys, 'index.md', '- [[Plot]] — Alex grows beans in a raised bed.\n');
  await drive.createText(sys, 'hot.md', 'Nothing active.\n');
  await drive.createText(sys, 'log.md', 'Previous operation.\n');
  const obsidian = await drive.createFolder(root, '.obsidian');
  const workspace = await drive.createText(obsidian.id, 'workspace.json', '{"madeUp":true}');
  const dot = await drive.createText(root, '.DS_Store', 'made-up bytes');
  const sent: Sent[] = [];
  const admission: AdmissionManifest = { v: 1, id: 'feed-only', rootId: root, scope: 'all', at: AT, piles: [], journal: [] };
  const run = await runOnDrive(c, drive, root, { admission, pacing, claude: replySequence([emptyReply]), around: trace(drive, root, sent) }, 1);
  expect(run.code).toBe(0);
  expect(run.after['.bower/index.md']).toBe('- [[Plot]] — Alex grows beans in a raised bed.\n');
  expect(run.after['.bower/hot.md']).toBe('Nothing active.\n');
  expect(run.after['.bower/log.md']).toBe('Previous operation.\n');
  const after = JSON.parse(await drive.readText(stateFile.id)) as typeof state;
  expect({ ...after, cursor: state.cursor }).toEqual(state);
  expect.soft(after.cursor, 'hidden changes are drained and the cursor moves with unchanged state').not.toBe(state.cursor);
  expect.soft(run.wire?.requests.some((r) => r.url.pathname === '/drive/v3/changes'), 'real feed entry point is used').toBe(true);
  const hiddenIds = new Set([obsidian.id, workspace.id, dot.id]);
  expect(run.wire?.requests.filter((r) => r.method === 'GET' && hiddenIds.has(decodeURIComponent(/^\/drive\/v3\/files\/([^/]+)$/.exec(r.url.pathname)?.[1] ?? ''))), 'hidden feed entries are dropped before ancestry metadata or content reads').toEqual([]);
  expect(sent.filter((s) => ['.bower/index.md', '.bower/hot.md', '.bower/log.md'].includes(s.path))).toEqual([]);
  expect(manifests(run).flatMap(([, text]) => (JSON.parse(text) as { operations: Array<{ effect: { kind: string } }> }).operations).filter((o) => o.effect.kind === 'maintain')).toEqual([]);
});

it('B1a contract: TL-P4-45 addendum: root index is an ordinary indexed note and dot paths stay hidden', async () => {
  const { c, drive, root } = await setup();
  const ownIndex = await drive.createText(root, 'index.md', '---\nsummary: Alex lists reading plans.\n---\n- [ ] Read\n');
  const listing = await drive.listAll(root);
  const index = VaultIndex.build(root, listing);
  expect(index.entries().has('Resources/Gardening/Plot.md')).toBe(true);
  expect(isHidden('.bower/index.md')).toBe(true);
  expect.soft(index.entries().has('index.md'), 'same listing home exposes the person root index').toBe(true);
  expect.soft(isHidden('index.md')).toBe(false);
  const run = await runOnDrive(c, drive, root, { pacing, claude: replySequence([emptyReply]) }, 1);
  expect(run.code).toBe(0);
  expect(await drive.readText(ownIndex.id)).toBe('---\nsummary: Alex lists reading plans.\n---\n- [ ] Read\n');
  expect.soft(run.after['.bower/index.md'] ?? '', 'projection includes the ordinary root note').toContain('[[index]]');
  const state = JSON.parse(run.after['.bower/retrieval.json'] ?? 'null') as { files?: Record<string, { path: string }> } | null;
  expect.soft(state?.files?.[ownIndex.id]).toMatchObject({ path: 'index.md' });
  const row = readFileSync(resolve(import.meta.dirname, '../../docs/harness/2026-10-08-p4-method-rubric-changes.md'), 'utf8').split('\n').find((l) => l.startsWith('| b1-maintenance-crash-resume |'));
  expect(row).toMatch(/^\| b1-maintenance-crash-resume \| agrees \| .{10,}/);
});
