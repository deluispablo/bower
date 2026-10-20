import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { FakeDrive } from '../../src/data/drive/fake-drive';
import type { AdmissionManifest } from '../../src/data/spine/admission';
import { parseRunManifestV2 } from '../../src/data/contracts/run-manifest';
import { parseRunCheckpoint, verifyCheckpointChain, type Checkpoint } from '../../src/data/contracts/run-checkpoint';
import { RUNNER_WRITES, isHidden, type RetrievalFile } from '../../src/data/vault/layout';
import { VaultIndex } from '../../src/data/vault/vault-index';
import { serializeRules } from '../../src/data/contracts/rules-format';
import { MOC_REGIONS, parseOwnership } from '../../src/data/contracts/ownership-format';
import { parseNote } from '../../src/data/contracts/note-format';
import { stampOf } from '../../src/data/spine/write-once';
import * as reply from '../src/claude';
import * as maintenance from '../src/index';
import { RunnerDrive } from '../src/drive';
import { loadCase, type LoadedCase } from '../src/corpus';
import { AT, CORPUS_SETUPS, redispatchCase, replySequence, runOnDrive, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';

const CASE = resolve(import.meta.dirname, '../../testing/corpus/b1-maintenance-crash-resume');
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

interface Sent { path: string; text: string; stamp?: string }
/** Observe production sends only. Seeding and snapshot reads never contribute to this trace. */
function trace(drive: FakeDrive, root: string, sent: Sent[]) {
  return (fetch: typeof globalThis.fetch): typeof globalThis.fetch => async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = (init.method ?? 'GET').toUpperCase();
    const id = /^\/(?:upload\/)?drive\/v3\/files\/([^/]+)$/.exec(url.pathname)?.[1];
    const body = init.body === undefined || init.body === null ? '' : await new Response(init.body).text();
    const boundary = /^--([^\r\n]+)\r\n/.exec(body)?.[1];
    const parts = boundary ? body.split(`--${boundary}`).slice(1, -1).map((part) => part.slice(part.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, '')) : [];
    const meta = parts[0] ?? (!url.pathname.startsWith('/upload/') && body ? body : undefined);
    const json = meta ? JSON.parse(meta) as { name?: string; parents?: string[]; appProperties?: { bowerOp?: string } } : undefined;
    const path = id ? drive.pathOf(decodeURIComponent(id), root) : json?.name && json.parents?.[0]
      ? [drive.pathOf(json.parents[0], root), json.name].filter(Boolean).join('/') : undefined;
    if (url.origin === 'https://www.googleapis.com' && ['POST', 'PATCH', 'DELETE'].includes(method) && path) {
      const content = url.searchParams.get('uploadType') === 'media' ? body : parts[1] ?? body;
      sent.push({ path, text: content, stamp: json?.appProperties?.bowerOp });
    }
    return fetch(input, init);
  };
}

/** Listing read-ahead may load admission bytes; discovery still means state/feed/index, in either phase. */
function discoveryReads(requests: Array<{ method: string; url: URL }>, drive: FakeDrive, root: string) {
  return requests.filter((r) => {
    if (r.url.pathname === '/drive/v3/changes') return true;
    const id = /^\/drive\/v3\/files\/([^/]+)$/.exec(r.url.pathname)?.[1];
    return id !== undefined && ['.bower/retrieval.json', '.bower/index.md'].includes(drive.pathOf(id, root));
  });
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

it('B1a contract: addendum 4: a no-change run adds exactly two discovery reads and zero writes', async () => {
  const { c, drive, root } = await setup();
  c.scope = 'all';
  const files = await drive.listAll(root);
  const sys = files.find((f) => f.name === '.bower' && f.parents[0] === root)?.id ?? '';
  const plot = files.find((f) => f.name === 'Plot.md');
  expect(plot).toBeDefined();
  await drive.createText(sys, 'index.md', '- [[Plot]] — Alex grows beans in a raised bed.\n');
  await drive.createText(sys, 'log.md', 'Previous operation.\n');
  // Creating retrieval is the last seed change; its cursor includes that own bookkeeping write.
  const cursor = String(Number(await drive.getStartPageToken()) + 1);
  const state = JSON.stringify({ v: 1, folderId: root, account: 'ACCOUNT_ID', cursor, files: {
    [plot?.id ?? '']: { path: 'Resources/Gardening/Plot.md', version: plot?.modifiedTime,
      summary: 'Alex grows beans in a raised bed.', coverage: { kind: 'prefix', bytes: 4096 } },
  } });
  const retrieval = await drive.createText(sys, 'retrieval.json', state);
  expect(await drive.getStartPageToken()).toBe(cursor);
  expect(await drive.listChanges(cursor)).toEqual({ changes: [], newStartPageToken: cursor });
  const sent: Sent[] = [];
  const requests: Array<{ method: string; url: URL }> = [];
  const refresh = maintenance.refreshPlanning;
  vi.spyOn(maintenance, 'refreshPlanning').mockImplementation(async (...args) => {
    const from = requests.length;
    const refreshed = await refresh(...args);
    expect(discoveryReads(requests.slice(from), drive, root).map((r) => [r.method, r.url.pathname, r.url.searchParams.get('alt')]))
      .toEqual([
        ['GET', `/drive/v3/files/${retrieval.id}`, 'media'],
        ['GET', '/drive/v3/changes', null],
      ]);
    expect(requests.at(-1)?.url.searchParams.get('pageToken')).toBe(cursor);
    return refreshed;
  });
  const original = maintenance.withMaintenance;
  const calls = vi.spyOn(maintenance, 'withMaintenance').mockImplementation(async (adapter, manifest, ...prepared) => {
    expect(manifest.operations).toEqual([]);
    const maintained = await original(adapter, manifest, ...prepared);
    expect(maintained).toEqual(manifest);
    return maintained;
  });
  const observed = trace(drive, root, sent);
  const around = (fetch: typeof globalThis.fetch): typeof globalThis.fetch => {
    const traced = observed(fetch);
    return (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (url.origin === 'https://www.googleapis.com') requests.push({ method: (init?.method ?? 'GET').toUpperCase(), url });
      return traced(input, init);
    };
  };
  const admission: AdmissionManifest = { v: 1, id: 'no-change', rootId: root, scope: 'all', at: AT, piles: [], journal: [] };
  const run = await runOnDrive(c, drive, root, { admission, pacing, around }, 1);
  expect(run.code).toBe(0);
  expect(calls).toHaveBeenCalledTimes(1);
  // Main still persists its normal run records; maintenance adds no writes or derived changes.
  expect(sent.filter((s) => derived.includes(s.path))).toEqual([]);
  expect(run.after['.bower/retrieval.json']).toBe(state);
  expect(run.after['.bower/index.md']).toBe('- [[Plot]] — Alex grows beans in a raised bed.\n');
  expect(run.after['.bower/log.md']).toBe('Previous operation.\n');
});

/** Compare byte spans so a changed MOC payload never grants a write to its surrounding content. */
function mocParts(path: string, text: string): { outside: string; regions: string[] } {
  const bytes = new TextEncoder().encode(text);
  const own = parseOwnership(bytes);
  expect(own.status).toBe('v2');
  if (own.status !== 'v2') throw new Error('Expected framed MOC regions');
  expect(parseNote(path, text).byBower).toBe(true);
  const decode = (start: number, end: number): string => new TextDecoder().decode(bytes.subarray(start, end));
  expect(decode(own.layout.front?.start ?? 0, own.layout.front?.end ?? 0)).toMatch(/^type: moc$/m);
  let from = 0;
  let outside = '';
  const regions = MOC_REGIONS.map((region) => {
    const span = own.payloads[region];
    expect(span, region).toBeDefined();
    if (!span) throw new Error('Expected a MOC payload');
    outside += decode(from, span.start);
    from = span.end;
    return decode(span.start, span.end);
  });
  return { outside: outside + decode(from, bytes.length), regions };
}

it('B1a contract: addendum 4: maintain writes only retrieval index once and changed MOC regions per run', async () => {
  for (const existing of [false, true]) {
    const { c, drive, root } = await setup();
    const frame = (owner: string, text: string): string => `<!-- bower:ownership/2 begin ${owner} -->\n${text}\n<!-- bower:ownership/2 end ${owner} -->\n`;
    const map = '---\nbower_format: ownership/2\ntype: moc\nby: bower\n---\n'
      + frame('current', '## Current state') + frame('personal', 'Alex keeps these words.')
      + frame('timeline', '## Timeline') + frame('bower-note', "## Bower's note")
      + MOC_REGIONS.map((region) => frame(region, `Existing ${region}.`)).join('');
    const resources = (await drive.listAll(root)).find((f) => f.name === 'Resources' && f.folder);
    expect(resources).toBeDefined();
    await drive.createText(resources?.id ?? '', 'Garden map.md', map, { by: 'bower' });
    // Positive control: the fixture has actual independently framed, Bower-owned MOC regions.
    expect(mocParts('Resources/Garden map.md', map).regions).toHaveLength(3);
    if (existing) {
      const sys = (await drive.listAll(root)).find((f) => f.name === '.bower' && f.parents[0] === root)?.id ?? '';
      await drive.createText(sys, 'index.md', 'Previous index.\n');
      await drive.createText(sys, 'log.md', 'Previous operation.\n');
      await drive.createText(sys, 'retrieval.json', JSON.stringify({ v: 1, folderId: root, account: 'ACCOUNT_ID', cursor: '0', files: {} }));
    }
    const press = existing ? 'existing projections' : 'bootstrap';
    const listing = await drive.listAll(root);
    const before = new Map(await Promise.all(listing.filter((f) => !f.folder).map(async (f) => [drive.pathOf(f.id, root), await drive.readText(f.id)] as const)));
    const sent: Sent[] = [];
    const run = await runOnDrive(c, drive, root, { pacing, claude: replySequence([emptyReply]), around: trace(drive, root, sent) }, 1);
    expect(run.code).toBe(0);
    const recorded = manifests(run).find(([, text]) => (JSON.parse(text) as { runId: string }).runId === run.dispatch?.runId);
    expect(recorded, `manifest for run ${run.dispatch?.runId}`).toBeDefined();
    const manifest = JSON.parse(recorded?.[1] ?? '{}') as {
      operations: Array<{ operationId: string; effect: { kind: string } }>;
    };
    const maintain = manifest.operations.filter((op) => op.effect.kind === 'maintain');
    expect(maintain).toHaveLength(1);
    const writes = sent.filter((s) => s.stamp === stampOf(run.dispatch?.runId ?? '', maintain[0]?.operationId ?? ''));
    // Positive control: stamp matching observes the real maintenance state commit, not an empty trace.
    expect(writes.filter((s) => s.path === '.bower/retrieval.json')).toHaveLength(1);
    const counts = new Map<string, number>();
    for (const write of writes) counts.set(write.path, (counts.get(write.path) ?? 0) + 1);
    expect.soft([...counts.values()].every((n) => n <= 1), `one content send per file in run ${press}`).toBe(true);
    for (const write of writes) {
      // TL-P4-42 Q5: hot joins this bounded set; the count assertion above still caps each target at one.
      // B8 (R8): so does Bower's health note, created whole at the root on the first maintaining run.
      if (['.bower/retrieval.json', '.bower/index.md', '.bower/hot.md', 'Bower health.md'].includes(write.path)) continue;
      const prior = before.get(write.path);
      const permittedMoc = prior !== undefined && prior.includes('\ntype: moc\n') && prior.includes('\nby: bower\n');
      expect.soft(permittedMoc, `maintain write set in run ${press}: ${write.path}`).toBe(true);
      if (!permittedMoc || prior === undefined) continue;
      const old = mocParts(write.path, prior);
      const next = mocParts(write.path, write.text);
      expect.soft(next.outside, `only MOC regions change: ${write.path}`).toBe(old.outside);
      expect.soft(next.regions, `unchanged MOC is not written: ${write.path}`).not.toEqual(old.regions);
    }
    expect(run.after['Resources/Gardening/Plot.md']).toBe(before.get('Resources/Gardening/Plot.md'));
  }
});

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
  // The case's registered setup (corpus-live-hooks), as a live run applies it: the landed write's reply and the connection are lost.
  const lost = CORPUS_SETUPS['maintenance-reply-lost'].fault(drive, root);
  const spawn = vi.fn(replySequence([emptyReply]));
  const run = await runOnDrive(c, drive, root, { pacing, claude: spawn, around: (next) => lost.around(trace(drive, root, sent)(next)) }, 1);
  expect(manifests(run)).toHaveLength(1); // Control: main planned and persisted on the real runner path.
  expect(run.after['Resources/Gardening/Plot.md']).toBe(c.folder['Resources/Gardening/Plot.md']);
  expect.soft(lost.state.reached, 'lost reply is injected into a real maintain write').toBe(true);
  expect.soft(run.code, 'the interrupted attempt remains resumable').toBe(1);
  expect.soft(run.after['.bower/last-run.json'], 'the report barrier does not land before maintenance settles').toBeUndefined();
  expect.soft(checkpoints(run).at(-1)?.phase).not.toBe('done');
  lost.state.enabled = false;
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
  if (lost.state.reached) {
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
  const row = readFileSync(resolve(import.meta.dirname, '../../testing/fixtures/p4-method-rubric-changes.md'), 'utf8').split('\n').find((l) => l.startsWith('| b1-maintenance-crash-resume |'));
  expect(row).toMatch(/^\| b1-maintenance-crash-resume \| agrees \| .{10,}/);
});

/** A settled baseline; retrieval's cursor includes its own final seed write. */
async function feedBaseline() {
  const { c, drive, root } = await setup();
  c.scope = 'all';
  c.journal = [];
  const listing = await drive.listAll(root);
  const sys = listing.find((f) => f.name === '.bower' && f.parents[0] === root);
  const plot = listing.find((f) => f.name === 'Plot.md');
  if (!sys || !plot) throw new Error('Expected the corpus system folder and plot');
  const index = '- [[Plot]] — Alex grows beans in a raised bed.\n';
  await drive.createText(sys.id, 'index.md', index);
  await drive.createText(sys.id, 'hot.md', 'Nothing active.\n');
  await drive.createText(sys.id, 'log.md', 'Previous operation.\n');
  const hidden = await drive.createFolder(root, '.obsidian');
  const cursor = String(Number(await drive.getStartPageToken()) + 1);
  const state: RetrievalFile = { v: 1, folderId: root, account: 'ACCOUNT_ID', cursor, files: {
    [plot.id]: { path: 'Resources/Gardening/Plot.md', version: plot.modifiedTime,
      summary: 'Alex grows beans in a raised bed.', coverage: { kind: 'prefix', bytes: 4096 } },
  } };
  await drive.createText(sys.id, 'retrieval.json', JSON.stringify(state));
  expect(await drive.listChanges(cursor)).toEqual({ changes: [], newStartPageToken: cursor });
  const admission: AdmissionManifest = { v: 1, id: 'feed-contract', rootId: root, scope: 'all', at: AT, piles: [], journal: [] };
  return { c, drive, root, plot, hidden, state, index, admission };
}

it('B1a contract: pass 1 1: the committed cursor never passes an unreflected concurrent edit', async () => {
  for (const racing of [false, true]) {
    const { c, drive, root, plot, state, admission } = await feedBaseline();
    const summary = 'Alex now grows peas in a raised bed.';
    const text = `---\nsummary: ${summary}\n---\nAlex changed the planting plan.\n`;
    let version = plot.modifiedTime;
    const edit = async () => { version = (await drive.writeText(plot.id, text, plot.modifiedTime)).modifiedTime; };
    if (!racing) await edit(); // Positive control: the new version is in the planner's listing.
    let feedReads = 0;
    const original = maintenance.withMaintenance;
    const planned = vi.spyOn(maintenance, 'withMaintenance').mockImplementation(async (adapter, manifest, ...prepared) => {
      const listed = (await adapter.planReads().listAll(root)).find((f) => f.id === plot.id);
      expect(listed?.modifiedTime).toBe(version);
      return original(adapter, manifest, ...prepared);
    });
    const around = (fetch: typeof globalThis.fetch): typeof globalThis.fetch => async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (url.pathname === '/drive/v3/changes' && feedReads++ === 0 && racing) await edit();
      return fetch(input, init);
    };
    const run = await runOnDrive(c, drive, root, { admission, pacing, around }, 1);
    expect(run.wire?.statuses.at(-1)?.phase).toBe('done');
    expect(planned).toHaveBeenCalledTimes(1);
    planned.mockRestore();
    expect(feedReads).toBeGreaterThan(0);
    expect(version).not.toBe(state.files[plot.id]?.version);
    expect(await drive.readText(plot.id)).toBe(text);
    const after = JSON.parse(run.after['.bower/retrieval.json'] ?? 'null') as RetrievalFile;
    expect(after).not.toBeNull();
    const remaining = (await drive.listChanges(after.cursor)).changes;
    if (!racing) expect(after.files[plot.id]).toMatchObject({ version, summary });
    expect(remaining.some((change) => change.fileId === plot.id)
      || (after.files[plot.id]?.version === version && after.files[plot.id]?.summary === summary),
    'the edit is reflected in retrieval or remains after its committed cursor').toBe(true);
  }
});

it('B1a contract: pass 1 4: maintain bootstraps and refreshes full valid ownership notes beyond 4096 bytes', async () => {
  const frame = (owner: string, text: string): string => `<!-- bower:ownership/2 begin ${owner} -->\n${text}\n<!-- bower:ownership/2 end ${owner} -->\n`;
  const summary = 'Alex grows beans in a raised bed.';
  const note = (personal: string): string => `---\nbower_format: ownership/2\nby: bower\nsummary: ${summary}\n---\n`
    + frame('current', '## Current state\n- Growing') + frame('personal', personal)
    + frame('timeline', '## Timeline') + frame('bower-note', "## Bower's note");
  const short = note('Alex keeps these words.');
  const long = note('x'.repeat(9198 - new TextEncoder().encode(note('')).length));
  expect(new TextEncoder().encode(long)).toHaveLength(9198);
  expect(parseOwnership(new TextEncoder().encode(short)).status).toBe('v2');
  expect(parseOwnership(new TextEncoder().encode(long)).status).toBe('v2');
  expect(parseNote('Resources/Gardening/Plot.md', long).summary).toBe(summary);
  for (const mode of ['short bootstrap', 'long bootstrap', 'long refresh']) {
    const { c, drive, root } = await setup();
    c.scope = 'all';
    const listing = await drive.listAll(root);
    const plot = listing.find((f) => f.name === 'Plot.md');
    const sys = listing.find((f) => f.name === '.bower' && f.parents[0] === root);
    if (!plot || !sys) throw new Error('Expected the corpus system folder and plot');
    if (mode === 'long refresh') {
      await drive.createText(sys.id, 'index.md', 'Previous projection.\n');
      await drive.createText(sys.id, 'retrieval.json', JSON.stringify({ v: 1, folderId: root, account: 'ACCOUNT_ID',
        cursor: await drive.getStartPageToken(), files: { [plot.id]: { path: 'Resources/Gardening/Plot.md',
          version: plot.modifiedTime, summary: 'Previous summary.', coverage: { kind: 'prefix', bytes: 4096 } } } }));
    }
    const text = mode === 'short bootstrap' ? short : long;
    const updated = await drive.writeText(plot.id, text, plot.modifiedTime);
    const admission: AdmissionManifest = { v: 1, id: 'long-note-contract', rootId: root, scope: 'all', at: AT, piles: [], journal: [] };
    const run = await runOnDrive(c, drive, root, { admission, pacing }, 1);
    expect(await drive.readText(plot.id)).toBe(text);
    const after = JSON.parse(run.after['.bower/retrieval.json'] ?? 'null') as RetrievalFile | null;
    expect.soft(run.wire?.statuses.at(-1)?.phase, `${mode}: valid full framing never fails maintenance`).toBe('done');
    expect.soft(after?.files[plot.id], `${mode}: valid ownership note gets its refreshed version and summary`)
      .toMatchObject({ path: 'Resources/Gardening/Plot.md', version: updated.modifiedTime, summary });
  }
});

it('B1a contract: pass 1 5: newly discovered hidden descendants advance only the cursor', async () => {
  expect(isHidden('.obsidian/workspace.json')).toBe(true);
  expect(isHidden('workspace.json')).toBe(false);
  for (const racing of [false, true]) {
    const { c, drive, root, hidden, state, index, admission } = await feedBaseline();
    let childId = '';
    let throughCursor = state.cursor;
    const create = async () => {
      childId = (await drive.createText(hidden.id, 'workspace.json', '{"madeUp":true}')).id;
      throughCursor = await drive.getStartPageToken();
    };
    if (!racing) await create(); // Positive control: the hidden path is present in the cached listing.
    const original = maintenance.withMaintenance;
    const planned = vi.spyOn(maintenance, 'withMaintenance').mockImplementation(async (adapter, manifest, ...prepared) => {
      const ix = VaultIndex.build(root, await adapter.planReads().listAll(root));
      expect(ix.pathOf(hidden.id)).toBe('.obsidian');
      expect([...ix.entries().keys()].some((path) => isHidden(path))).toBe(false);
      expect(childId ? ix.pathOf(childId) : undefined).toBe('.obsidian/workspace.json');
      return original(adapter, manifest, ...prepared);
    });
    const sent: Sent[] = [];
    const observed = trace(drive, root, sent);
    let feedReads = 0;
    const around = (fetch: typeof globalThis.fetch): typeof globalThis.fetch => {
      const traced = observed(fetch);
      return async (input, init) => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
        if (url.pathname === '/drive/v3/changes' && feedReads++ === 0 && racing) await create();
        return traced(input, init);
      };
    };
    const run = await runOnDrive(c, drive, root, { admission, pacing, around }, 1);
    expect(run.wire?.statuses.at(-1)?.phase).toBe('done');
    expect(planned).toHaveBeenCalledTimes(1);
    planned.mockRestore();
    expect(feedReads).toBeGreaterThan(0);
    expect(await drive.readText(childId)).toBe('{"madeUp":true}');
    const after = JSON.parse(run.after['.bower/retrieval.json'] ?? 'null') as RetrievalFile;
    expect(after.cursor).toBe(throughCursor);
    expect({ ...after, cursor: state.cursor }).toEqual(state);
    expect.soft(run.after['.bower/index.md'], 'hidden-only feed preserves the projection bytes').toBe(index);
    expect(run.after['.bower/hot.md']).toBe('Nothing active.\n');
    expect(run.after['.bower/log.md']).toBe('Previous operation.\n');
    expect.soft(sent.filter((s) => ['.bower/index.md', '.bower/hot.md', '.bower/log.md'].includes(s.path)),
      'the full hidden path permits only a retrieval cursor write').toEqual([]);
    expect.soft(manifests(run).flatMap(([, text]) => (JSON.parse(text) as { operations: Array<{ effect: { kind: string } }> })
      .operations).filter((op) => op.effect.kind === 'maintain'), 'a hidden-only feed never schedules maintain').toEqual([]);
  }
});

it('B1a contract: round 3 1: vanished indexed notes drop without failing and ordinary edits refresh', async () => {
  for (const mode of ['ordinary edit', 'trashed feed', 'removed feed', 'not-found read']) {
    const { c, drive, root, plot, state, admission } = await feedBaseline();
    const summary = 'Alex now grows peas in a raised bed.';
    const text = `---\nsummary: ${summary}\n---\nAlex changed the planting plan.\n`;
    let version = plot.modifiedTime;
    let throughCursor = state.cursor;
    let feedReads = 0;
    // TL-P4-41 addendum 11: observe the actual prefix read outcome, independent of wire status.
    const prefixReads = vi.spyOn(RunnerDrive.prototype, 'readPrefix');
    const original = maintenance.withMaintenance;
    const planned = vi.spyOn(maintenance, 'withMaintenance').mockImplementation(async (adapter, manifest, ...prepared) => {
      const listed = (await adapter.planReads().listAll(root)).find((f) => f.id === plot.id);
      expect(listed?.modifiedTime, `${mode}: planner receives the refreshed listing`).toBe(mode === 'ordinary edit' ? version : undefined);
      return original(adapter, manifest, ...prepared);
    });
    const around = (fetch: typeof globalThis.fetch): typeof globalThis.fetch => async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (url.pathname === '/drive/v3/changes' && feedReads++ === 0) {
        // The real feed read races the planner's cached listing, on the same FakeDrive.
        version = (await drive.writeText(plot.id, text, plot.modifiedTime)).modifiedTime;
        if (mode === 'trashed feed' || mode === 'removed feed') await drive.trash(plot.id);
        const response = await fetch(input, init);
        const feed = await response.json() as { newStartPageToken: string; changes: Array<{
          fileId: string; removed: boolean; file?: { modifiedTime: string; trashed: boolean };
        }> };
        expect(response.ok).toBe(true);
        expect(feed.changes.filter((change) => change.fileId === plot.id).at(-1)?.file)
          .toMatchObject({ modifiedTime: version, trashed: mode === 'trashed feed' || mode === 'removed feed' });
        throughCursor = feed.newStartPageToken;
        if (mode === 'removed feed') {
          // Drive may report a removal without metadata; only the wire representation changes.
          feed.changes = feed.changes.map((change) => change.fileId === plot.id ? { fileId: plot.id, removed: true } : change);
        }
        if (mode === 'not-found read') await drive.trash(plot.id); // Feed drained; maintenance now sees not-found.
        return new Response(JSON.stringify(feed), { status: response.status, headers: response.headers });
      }
      return fetch(input, init);
    };
    const run = await runOnDrive(c, drive, root, { admission, pacing, around }, 1);
    expect(planned).toHaveBeenCalledTimes(1);
    planned.mockRestore();
    expect(feedReads).toBeGreaterThan(0);
    expect(version).not.toBe(state.files[plot.id]?.version);
    // TL-P4-41 addendum 11: not-found can come from the metadata precheck before any media request.
    if (mode === 'not-found read') {
      const attempt = prefixReads.mock.calls.findIndex(([file]) => file.id === plot.id && file.modifiedTime === version);
      const outcome = prefixReads.mock.results[attempt];
      if (!outcome || outcome.type !== 'return') throw new Error('missing maintenance prefix read');
      await expect(outcome.value, 'real maintenance read answers not-found').rejects.toMatchObject({ code: 'not-found' });
    }
    prefixReads.mockRestore();
    expect.soft(run.code, `${mode}: a vanished note never fails the run`).toBe(0);
    expect.soft(run.wire?.statuses.at(-1)?.phase, `${mode}: main reaches done`).toBe('done');
    const after = JSON.parse(run.after['.bower/retrieval.json'] ?? 'null') as RetrievalFile;
    expect(after).not.toBeNull();
    expect.soft(after.cursor, `${mode}: state commits the drained feed cursor`).toBe(throughCursor);
    if (mode === 'ordinary edit') {
      expect(after.files[plot.id]).toMatchObject({ path: 'Resources/Gardening/Plot.md', version, summary });
      expect(run.after['.bower/index.md']).toContain(`[[Plot]] — ${summary}`);
      expect(await drive.readText(plot.id)).toBe(text);
    } else {
      expect((await drive.evidence(plot.id))?.trashed).toBe(true);
      expect.soft(after.files[plot.id], `${mode}: retrieval drops the exact vanished id`).toBeUndefined();
      expect.soft(run.after['.bower/index.md'], `${mode}: projection drops the vanished note`).not.toContain('[[Plot]]');
    }
  }
});

it('B1a contract: round 3 2: unrelated account changes drain once and the next run has two discovery reads', async () => {
  for (const hiddenChange of [false, true]) {
    vi.setSystemTime(AT);
    const { c, drive, root, plot, hidden, state, index, admission } = await feedBaseline();
    const outside = await drive.createFolder('root', 'Elsewhere');
    const unrelated = await drive.createText(outside.id, 'Plot.md', '---\nsummary: Alex keeps an unrelated plan.\n---\n');
    const ignoredIds = new Set([outside.id, unrelated.id]);
    if (hiddenChange) ignoredIds.add((await drive.createText(hidden.id, 'workspace.json', '{"madeUp":true}')).id);
    const throughCursor = await drive.getStartPageToken();
    const drained = await drive.listChanges(state.cursor);
    expect(drained.newStartPageToken).toBe(throughCursor);
    expect(new Set(drained.changes.map((change) => change.fileId))).toEqual(ignoredIds);
    expect(VaultIndex.build(root, await drive.listAll(root)).pathOf(unrelated.id)).toBeUndefined();
    const run = await runOnDrive(c, drive, root, { admission, pacing }, 1);
    expect(run.code).toBe(0);
    expect(run.wire?.statuses.at(-1)?.phase).toBe('done');
    const after = JSON.parse(run.after['.bower/retrieval.json'] ?? 'null') as RetrievalFile;
    expect.soft(after.cursor, 'outside and hidden entries advance to newStartPageToken').toBe(throughCursor);
    expect({ ...after, cursor: state.cursor }).toEqual(state);
    expect(run.after['.bower/index.md']).toBe(index);
    expect(after.files[plot.id]).toEqual(state.files[plot.id]);
    expect.soft((await drive.listChanges(after.cursor)).changes.filter((change) => ignoredIds.has(change.fileId)),
      'drained unrelated entries never remain pending').toEqual([]);

    const requests: Array<{ method: string; url: URL }> = [];
    const discovery: typeof requests = [];
    const refresh = maintenance.refreshPlanning;
    const refreshing = vi.spyOn(maintenance, 'refreshPlanning').mockImplementation(async (...args) => {
      const from = requests.length;
      const value = await refresh(...args);
      discovery.push(...discoveryReads(requests.slice(from), drive, root));
      return value;
    });
    const original = maintenance.withMaintenance;
    const planned = vi.spyOn(maintenance, 'withMaintenance').mockImplementation(async (adapter, manifest, ...prepared) => {
      expect(manifest.operations).toEqual([]);
      const from = requests.length;
      const maintained = await original(adapter, manifest, ...prepared);
      discovery.push(...discoveryReads(requests.slice(from), drive, root));
      return maintained;
    });
    const repeated: string[] = [];
    const around = (fetch: typeof globalThis.fetch): typeof globalThis.fetch => async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (url.origin === 'https://www.googleapis.com') requests.push({ method: (init?.method ?? 'GET').toUpperCase(), url });
      const response = await fetch(input, init);
      if (url.pathname === '/drive/v3/changes') {
        const feed = await response.clone().json() as { changes: Array<{ fileId: string }> };
        repeated.push(...feed.changes.filter((change) => ignoredIds.has(change.fileId)).map((change) => change.fileId));
      }
      return response;
    };
    // The existing dispatch override gives main a fresh run id without adding a journal request.
    vi.setSystemTime(AT + 1);
    const next = await runOnDrive(c, drive, root, { admission: { ...admission, id: 'feed-contract-next', at: AT + 1 }, pacing, around,
      answerStart: { scope: 'all', requestId: 'feed-contract-next' } }, 2);
    expect(next.code).toBe(0);
    expect(next.wire?.statuses.at(-1)?.phase).toBe('done');
    expect(planned).toHaveBeenCalledTimes(1);
    planned.mockRestore(); refreshing.mockRestore();
    const retrieval = (await drive.listAll(root)).find((f) => f.name === 'retrieval.json');
    expect(retrieval).toBeDefined();
    expect.soft(discovery.map((r) => [r.method, r.url.pathname, r.url.searchParams.get('alt')]),
      'the next no-change run makes exactly the two discovery reads').toEqual([
      ['GET', `/drive/v3/files/${retrieval?.id}`, 'media'], ['GET', '/drive/v3/changes', null],
    ]);
    expect.soft(discovery.find((r) => r.url.pathname === '/drive/v3/changes')?.url.searchParams.get('pageToken'),
      'next discovery starts after the unrelated entries').toBe(throughCursor);
    expect.soft(repeated, 'the next feed never repeats outside or hidden entries').toEqual([]);
    expect(next.after['.bower/index.md']).toBe(index);
  }
});

/** Bootstrap through main so the stored tree, summaries and versions are production evidence. */
async function folderFeedBaseline() {
  vi.setSystemTime(AT);
  const { c, drive, root } = await setup();
  c.scope = 'all';
  c.journal = [];
  const listing = await drive.listAll(root);
  const garden = listing.find((f) => f.folder && f.name === 'Gardening');
  const resources = listing.find((f) => f.folder && f.name === 'Resources');
  const plot = listing.find((f) => f.name === 'Plot.md');
  if (!garden || !resources || !plot) throw new Error('Expected the corpus garden and indexed plot');
  const seasons = await drive.createFolder(garden.id, 'Seasons');
  const spring = await drive.createFolder(seasons.id, 'Spring');
  const seeds = await drive.createText(spring.id, 'Seeds.md', '---\nsummary: Alex saves beans for spring.\n---\n');
  const watering = await drive.createText(seasons.id, 'Watering.md', '---\nsummary: Alex waters seedlings weekly.\n---\n');
  const reading = await drive.createFolder(resources.id, 'Reading');
  const book = await drive.createText(reading.id, 'Book.md', '---\nsummary: Alex reads about growing beans.\n---\n');
  const outside = await drive.createFolder('root', 'Elsewhere');
  const admission: AdmissionManifest = { v: 1, id: 'folder-bootstrap', rootId: root, scope: 'all', at: AT, piles: [], journal: [] };
  const boot = await runOnDrive(c, drive, root, { admission, pacing }, 1);
  expect(boot.code, 'positive bootstrap reaches main and stores all descendants').toBe(0);
  expect(boot.wire?.statuses.at(-1)?.phase).toBe('done');
  const state = JSON.parse(boot.after['.bower/retrieval.json'] ?? 'null') as RetrievalFile;
  const descendants = [plot, watering, seeds];
  for (const note of [...descendants, book]) {
    expect(state.files[note.id]).toMatchObject({ path: drive.pathOf(note.id, root), version: note.modifiedTime });
    expect(boot.after['.bower/index.md']).toContain(`[[${note.name.replace(/\.md$/, '')}]] — ${state.files[note.id]?.summary}`);
  }
  expect(state.files[seeds.id]?.path).toBe('Resources/Gardening/Seasons/Spring/Seeds.md');
  return { c, drive, root, garden, seasons, spring, reading, outside, book, descendants, state,
    index: boot.after['.bower/index.md'], admission };
}

type FolderChange = 'live control' | 'trashed' | 'removed' | 'outside' | 'renamed' | 'nested';

/** Change only the folder; descendants never receive their own changes-feed entries. */
async function runFolderChange(mode: FolderChange) {
  const baseline = await folderFeedBaseline();
  const { c, drive, root, garden, reading, outside, descendants, state, admission } = baseline;
  if (mode === 'trashed' || mode === 'removed') await drive.trash(garden.id);
  else if (mode === 'outside' || mode === 'nested') {
    await drive.update(garden.id, { removeParent: garden.parents[0], addParent: mode === 'outside' ? outside.id : reading.id });
  } else await drive.update(garden.id, { name: mode === 'renamed' ? 'Zinnia' : garden.name });
  const throughCursor = await drive.getStartPageToken();
  const drained = await drive.listChanges(state.cursor);
  // Bootstrap bookkeeping is hidden; the folder is the only visible feed change.
  expect(drained.changes.filter((change) => change.fileId === garden.id)).toHaveLength(1);
  expect(drained.changes.filter((change) => descendants.some((note) => note.id === change.fileId))).toEqual([]);
  expect(drained.newStartPageToken).toBe(throughCursor);
  for (const note of descendants) expect((await drive.evidence(note.id))?.file.modifiedTime).toBe(state.files[note.id]?.version);
  const vanished = ['trashed', 'removed', 'outside'].includes(mode);
  const requests: Array<{ method: string; url: URL }> = [];
  const discovery: typeof requests = [];
  let feedReads = 0;
  const sent: Sent[] = [];
  const refresh = maintenance.refreshPlanning;
  const refreshing = vi.spyOn(maintenance, 'refreshPlanning').mockImplementation(async (...args) => {
    const from = requests.length;
    const value = await refresh(...args);
    discovery.push(...discoveryReads(requests.slice(from), drive, root));
    return value;
  });
  const original = maintenance.withMaintenance;
  const planned = vi.spyOn(maintenance, 'withMaintenance').mockImplementation(async (adapter, manifest, ...prepared) => {
    const listed = await adapter.planReads().listAll(root);
    // The change happened before the planner listed: it cannot recover ancestry from the old listing.
    const ix = VaultIndex.build(root, listed);
    expect(ix.pathOf(garden.id)).toBe(vanished ? undefined
      : mode === 'renamed' ? 'Resources/Zinnia' : mode === 'nested' ? 'Resources/Reading/Gardening' : 'Resources/Gardening');
    for (const note of descendants) expect(listed.some((f) => f.id === note.id)).toBe(!vanished);
    const from = requests.length;
    const maintained = await original(adapter, manifest, ...prepared);
    discovery.push(...discoveryReads(requests.slice(from), drive, root));
    return maintained;
  });
  const observe = trace(drive, root, sent);
  const around = (fetch: typeof globalThis.fetch): typeof globalThis.fetch => {
    const traced = observe(fetch);
    return async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (url.origin === 'https://www.googleapis.com') requests.push({ method: (init?.method ?? 'GET').toUpperCase(), url });
      const response = await traced(input, init);
      if (url.pathname !== '/drive/v3/changes') return response;
      feedReads++;
      const feed = await response.json() as { newStartPageToken: string; changes: Array<{
        fileId: string; removed: boolean; file?: { parents: string[]; trashed: boolean };
      }> };
      expect(feed.newStartPageToken).toBe(throughCursor);
      expect(feed.changes.find((change) => change.fileId === garden.id)?.file).toMatchObject({
        parents: mode === 'outside' ? [outside.id] : mode === 'nested' ? [reading.id] : garden.parents,
        trashed: mode === 'trashed' || mode === 'removed',
      });
      if (mode === 'removed') feed.changes = feed.changes.map((change) => change.fileId === garden.id
        ? { fileId: garden.id, removed: true } : change);
      return new Response(JSON.stringify(feed), { status: response.status, headers: response.headers });
    };
  };
  vi.setSystemTime(AT + 1);
  const run = await runOnDrive(c, drive, root, { admission: { ...admission, id: 'folder-feed', at: AT + 1 }, pacing, around,
    answerStart: { scope: 'all', requestId: 'folder-feed' } }, 2);
  expect(planned).toHaveBeenCalledTimes(1);
  planned.mockRestore(); refreshing.mockRestore();
  expect(feedReads, `${mode}: main drains the real feed once`).toBe(1);
  const after = JSON.parse(run.after['.bower/retrieval.json'] ?? 'null') as RetrievalFile;
  expect(after).not.toBeNull();
  return { ...baseline, run, after, throughCursor, requests, discovery, sent };
}

function assertFolderRefresh(result: Awaited<ReturnType<typeof runFolderChange>>, mode: FolderChange) {
  const { run, after, throughCursor, state, book, descendants, discovery, requests, sent } = result;
  const check = mode === 'live control' ? expect : expect.soft;
  check(run.code, `${mode}: folder changes never fail main`).toBe(0);
  check(run.wire?.statuses.at(-1)?.phase, `${mode}: main reaches done`).toBe('done');
  check(after.cursor, `${mode}: cursor commits the state reflecting the drained feed`).toBe(throughCursor);
  // TL-P4-41 addendum 11: fail explicitly if the prior-state control is absent; keep the assertion.
  const priorBook = state.files[book.id];
  if (!priorBook) throw new Error('missing prior-state book');
  expect(after.files[book.id], `${mode}: unrelated indexed note survives by id`).toMatchObject(priorBook);
  // Exactly retrieval media, changes feed and the old index media. No snapshot/media re-reads.
  check(discovery.length, `${mode}: planning refresh and maintain make exactly three discovery calls`).toBe(3);
  check(requests.filter((r) => r.method === 'GET' && r.url.searchParams.get('alt') === 'media'
    && descendants.some((note) => r.url.pathname === `/drive/v3/files/${note.id}`)),
  `${mode}: the whole run makes zero descendant media reads`).toEqual([]);
  check(sent.filter((s) => s.path === '.bower/retrieval.json'), `${mode}: one state/cursor write`).toHaveLength(1);
  check(JSON.parse(sent.find((s) => s.path === '.bower/retrieval.json')?.text ?? 'null') as unknown,
    `${mode}: the cursor and refreshed state are the same stored write`).toEqual(after);
  // TL-P4-41 Q8: metadata/date alone does not change the projection.
  check(sent.filter((s) => s.path === '.bower/index.md'), `${mode}: writes only a changed projection`)
    .toHaveLength(mode === 'live control' ? 0 : 1);
  if (mode === 'live control') {
    for (const note of descendants) {
      // TL-P4-41 addendum 11: narrow the prior-state entry without changing the live-control assertion.
      const priorNote = state.files[note.id];
      if (!priorNote) throw new Error('missing prior-state descendant');
      expect(after.files[note.id]).toMatchObject(priorNote);
    }
    expect(run.after['.bower/index.md']).toBe(result.index);
  }
}

it('B1a contract: round 4 1: a folder binned before planning drops every indexed descendant', async () => {
  assertFolderRefresh(await runFolderChange('live control'), 'live control');
  for (const mode of ['trashed', 'removed'] as const) {
    const result = await runFolderChange(mode);
    assertFolderRefresh(result, mode);
    for (const file of [result.garden, result.seasons, result.spring, ...result.descendants]) {
      expect.soft(result.after.files[file.id], `${mode}: retrieval drops vanished subtree id ${file.id}`).toBeUndefined();
      expect.soft(JSON.stringify(result.after), `${mode}: no stored ancestry retains vanished id ${file.id}`)
        .not.toContain(JSON.stringify(file.id));
    }
    for (const note of result.descendants) {
      expect.soft(result.run.after['.bower/index.md'], `${mode}: projection drops ${note.name}`)
        .not.toContain(`[[${note.name.replace(/\.md$/, '')}]]`);
    }
    expect(result.run.after['.bower/index.md']).toContain('[[Book]]');
  }
});

it('B1a contract: round 4 2: a folder moved outside drops its indexed subtree and commits the cursor', async () => {
  assertFolderRefresh(await runFolderChange('live control'), 'live control');
  const result = await runFolderChange('outside');
  assertFolderRefresh(result, 'outside');
  for (const file of [result.garden, result.seasons, result.spring, ...result.descendants]) {
    expect.soft(result.after.files[file.id], `outside: retrieval drops subtree id ${file.id}`).toBeUndefined();
    expect.soft(JSON.stringify(result.after), `outside: no stored ancestry retains subtree id ${file.id}`)
      .not.toContain(JSON.stringify(file.id));
  }
  for (const note of result.descendants) {
    expect.soft(result.run.after['.bower/index.md'], `outside: projection drops ${note.name}`)
      .not.toContain(`[[${note.name.replace(/\.md$/, '')}]]`);
    expect(await result.drive.readText(note.id), 'moving out preserves the actual note').toContain('summary:');
  }
  expect(result.run.after['.bower/index.md']).toContain('[[Book]]');
});

it('B1a contract: round 4 3: a renamed folder updates descendant paths and index order without media reads', async () => {
  assertFolderRefresh(await runFolderChange('live control'), 'live control');
  const result = await runFolderChange('renamed');
  assertFolderRefresh(result, 'renamed');
  for (const note of result.descendants) {
    const old = result.state.files[note.id];
    expect.soft(result.after.files[note.id], `rename recomputes descendant ${note.id} from state`).toMatchObject({
      ...old, path: old?.path.replace('Resources/Gardening/', 'Resources/Zinnia/'),
    });
  }
  const index = result.run.after['.bower/index.md'] ?? '';
  expect(result.index?.indexOf('[[Plot]]')).toBeLessThan(result.index?.indexOf('[[Book]]') ?? -1);
  for (const note of result.descendants) {
    const link = `[[${note.name.replace(/\.md$/, '')}]]`;
    expect(index).toContain(link);
    expect.soft(index.indexOf('[[Book]]'), `rename regroups ${note.name} after Reading`).toBeLessThan(index.indexOf(link));
  }
});

it('B1a contract: round 4 4: an inside folder move updates recursive paths and regroups without media reads', async () => {
  assertFolderRefresh(await runFolderChange('live control'), 'live control');
  const result = await runFolderChange('nested');
  assertFolderRefresh(result, 'nested');
  for (const note of result.descendants) {
    const old = result.state.files[note.id];
    expect.soft(result.after.files[note.id], `inside move recomputes descendant ${note.id} from state`).toMatchObject({
      ...old, path: old?.path.replace('Resources/Gardening/', 'Resources/Reading/Gardening/'),
    });
  }
  const index = result.run.after['.bower/index.md'] ?? '';
  expect(result.index?.indexOf('[[Plot]]')).toBeLessThan(result.index?.indexOf('[[Book]]') ?? -1);
  for (const note of result.descendants) {
    const link = `[[${note.name.replace(/\.md$/, '')}]]`;
    expect(index).toContain(link);
    expect.soft(index.indexOf('[[Book]]'), `destination direct note precedes moved ${note.name}`).toBeLessThan(index.indexOf(link));
  }
});
