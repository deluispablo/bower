import { createHash } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { POOL } from '../../src/data/spine/schedule';
import { modelled, traceWrites, type Call } from './modelled';
import { API, RUN_ID, TICKET, driveV3, fixedDrive, paging } from './drive-v3';
import { RunnerDrive } from '../src/drive';
import { RunnerToken } from '../src/token';
import { runnerReads } from '../src/spine/records';
import type { Outcome } from '../../src/data/contracts/run-checkpoint';
import { canonical, checkpointName, firstCheckpoint, manifestName, nextCheckpoint, RunRecords, type RunManifest } from '../../src/data/spine/records';
import { finishRun, REPORT_FILES } from '../../src/data/spine/barrier';
import { makeText, updateByStamp } from '../../src/data/spine/write-once';

const overlaps = (a: Call, b: Call): boolean => a.at < (b.end ?? 0) && b.at < (a.end ?? 0);
afterEach(() => { paging.size = 2; vi.restoreAllMocks(); });

describe('F10 modelled C04', () => {
  let run: Awaited<ReturnType<typeof modelled>>;
  beforeAll(async () => { run = await modelled(); });
  it('f10-writes-overlap: bounded independent operations overlap', () => {
    expect(run.code).toBe(0);
    const opening = run.calls.find((c) => c.kind === 'write' && c.name?.startsWith('checkpoint-1-'));
    const closing = run.calls.find((c) => c.kind === 'write' && c.name?.startsWith('checkpoint-2-'));
    const writes = run.calls.filter((c) => c.kind === 'write' && c.at >= (opening?.end ?? Infinity) && c.at < (closing?.at ?? 0));
    const widths = writes.map((a) => writes.filter((b) => b.at <= a.at && (b.end ?? 0) > a.at).length);
    expect(Math.max(...widths)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...widths)).toBeLessThanOrEqual(POOL);
    for (const [i, a] of writes.entries()) for (const b of writes.slice(i + 1).filter((b) => overlaps(a, b))) {
      expect(a.target).not.toBe(b.target);
      if (a.method === 'POST' && b.method === 'POST') expect(a.parent).not.toBe(b.parent);
    }
  });
  it('f10-modelled-time: takes at most 12000ms', () => {
    console.log(`F10 modelled C04: ${run.ms}ms`);
    expect(run.ms).toBeLessThanOrEqual(12_000);
  });
  it('f10-one-attempt: every checkpoint and report record asks once', () => {
    const writes = run.calls.filter((c) => c.kind === 'write');
    const records = writes.filter((c) => /^(checkpoint-|report-)/.test(c.name ?? ''));
    expect(records).toHaveLength(5);
    for (const c of records) {
      const previous = Math.max(0, ...writes.filter((w) => (w.end ?? Infinity) <= c.at).map((w) => w.end ?? 0));
      expect(run.calls.filter((a) => a.kind === 'attempt' && a.at >= previous && (a.end ?? Infinity) <= c.at), c.name).toHaveLength(1);
    }
  });
  it('f10-records-together: report files overlap and last-run waits', () => {
    const files = run.calls.filter((c) => c.kind === 'write' && ['questions.json', 'suggestions.json', 'requests.json', 'hashes.json'].includes(c.name ?? ''));
    const last = run.calls.find((c) => c.kind === 'write' && c.name === 'last-run.json');
    expect(files.some((a, i) => files.slice(i + 1).some((b) => overlaps(a, b)))).toBe(true);
    expect(last?.at).toBeGreaterThanOrEqual(Math.max(...files.map((c) => c.end ?? Infinity)));
  });
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

it.each(['pass', 'refuse', 'lose-reply', 'attempt'] as const)('f10-fence-per-write: POOL+1 writes isolate %s and release capacity', async (action) => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const trace = traceWrites();
  const drive = fixedDrive();
  const root = (await drive.createFolder('root', 'Bower')).id;
  const parents = await Promise.all(Array.from({ length: POOL + 1 }, (_, i) => drive.createFolder(root, `parent-${i}`)));
  const wire = driveV3(drive);
  const attemptGate = deferred();
  const gates = parents.map(() => deferred());
  const held: string[] = [];
  const ended: string[] = [];
  const evidence: Array<{ owner: number; name: string; kind: string; target?: string }> = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const own = trace.current();
    const name = own && 'name' in own.call ? own.call.name : '';
    if (own && url.pathname.endsWith('/attempt')) {
      evidence.push({ owner: own.id, name, kind: 'attempt' });
      if (name === 'note-1') {
        await attemptGate.promise;
        if (action === 'attempt') return Response.json({ attempt: 2 });
      }
    }
    if (own && url.origin !== API && !init?.method) evidence.push({ owner: own.id, name, kind: 'read', target: url.pathname.split('/').pop() });
    if (init?.method === 'POST' && url.pathname.includes('/upload/')) {
      if (!own) throw new Error('send without invocation');
      evidence.push({ owner: own.id, name, kind: 'write' });
      held.push(name);
      await gates[Number(name.slice(5))]?.promise;
      const answer = await wire.fetch(input, init);
      ended.push(name);
      return answer;
    }
    return wire.fetch(input, init);
  };
  const token = new RunnerToken({ api: API, runId: RUN_ID, ticket: TICKET, fetch, now: () => wire.now });
  const adapter = new RunnerDrive({ token, attempt: 1, fetch });
  await Promise.all(parents.map((p) => adapter.get(p.id)));
  const w = adapter.fencedWrites();
  await w.generateIds(POOL + 1);
  const hooks: string[] = [];
  const applied: string[] = [];
  adapter.fault = {
    before: (c) => {
      if (c.op !== 'create-text') throw new Error('unexpected write');
      hooks.push(c.name);
      return c.name === 'note-1' && action !== 'attempt' ? action : 'pass';
    },
    applied: (c) => { if ('name' in c) applied.push(c.name); },
  };
  const results = Promise.allSettled(parents.map((p, i) => makeText(w, adapter, { parent: p.id, name: `note-${i}` }, `words-${i}`)));
  try {
    await vi.waitFor(() => expect(held).toHaveLength(POOL - 1));
    expect(evidence.filter((e) => e.kind === 'attempt').map((e) => e.name)).toEqual(['note-0', 'note-1', 'note-2', 'note-3']);
    expect(hooks).not.toContain('note-4');
    expect(adapter.changesSince(0)).toBeNull();
    attemptGate.resolve();
    if (action === 'refuse' || action === 'attempt') {
      await vi.waitFor(() => expect(held).toContain('note-4'));
      expect(held).not.toContain('note-1');
      expect(ended).toEqual([]);
    } else {
      await vi.waitFor(() => expect(held).toHaveLength(POOL));
      expect(held).not.toContain('note-4');
      gates[0]?.resolve();
      await vi.waitFor(() => expect(held).toContain('note-4'));
      expect(ended).toEqual(['note-0']);
    }
    for (const [i, p] of parents.entries()) {
      const own = evidence.filter((e) => e.name === `note-${i}`);
      const attempts = own.filter((e) => e.kind === 'attempt');
      expect(attempts).toHaveLength(1);
      expect(own.every((e) => e.owner === attempts[0]?.owner)).toBe(true);
      expect(own.filter((e) => e.kind === 'read' && e.target === p.id)).toHaveLength(1);
      const send = own.findIndex((e) => e.kind === 'write');
      if (send >= 0) expect(send).toBeGreaterThan(own.findIndex((e) => e.kind === 'read'));
    }
    expect(new Set(evidence.filter((e) => e.kind === 'attempt').map((e) => e.owner)).size).toBe(POOL + 1);
  } finally { attemptGate.resolve(); gates.forEach((g) => g.resolve()); await results; }
  const failed = action === 'refuse' || action === 'attempt';
  expect((await results).map((r) => r.status)).toEqual(parents.map((_, i) => failed && i === 1 ? 'rejected' : 'fulfilled'));
  const wanted = parents.flatMap((_, i) => failed && i === 1 ? [] : [`note-${i}`]);
  expect((await drive.listAll(root)).filter((f) => !f.folder).map((f) => f.name).sort()).toEqual(wanted);
  expect(applied.sort()).toEqual(wanted);
  expect(hooks.sort()).toEqual(parents.flatMap((_, i) => action === 'attempt' && i === 1 ? [] : [`note-${i}`]));
  if (action === 'lose-reply') {
    const file = (await drive.listAll(root)).find((f) => f.name === 'note-1');
    expect(wire.requests.some((r) => r.method === 'GET' && r.url.pathname === `/drive/v3/files/${file?.id}`)).toBe(true);
  }
});

it.each(['update', 'write-text'] as const)('f10-mixed-faults: %s retries beside a content/PATCH lost reply with its own fence', async (retryKind) => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const trace = traceWrites();
  const drive = fixedDrive();
  const root = (await drive.createFolder('root', 'Bower')).id;
  const patch = await drive.createText(root, 'rename-me', 'old patch');
  const content = await drive.createText(root, 'edit-me', 'old content');
  const retryId = retryKind === 'update' ? patch.id : content.id;
  const lostId = retryKind === 'update' ? content.id : patch.id;
  const wire = driveV3(drive);
  const retryGate = deferred();
  const lostGate = deferred();
  const events: Array<{ owner?: number; kind: string; target: string }> = [];
  let tries = 0;
  let lostHeld = false;
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const own = trace.current();
    const target = url.pathname.split('/').pop() ?? '';
    if (own) events.push({ owner: own.id, kind: target === 'attempt' ? 'attempt' : init?.method === 'PATCH' ? 'write' : 'read', target });
    if (init?.method === 'PATCH' && target === retryId && ++tries === 1) return Response.json({ error: { code: 429 } }, { status: 429 });
    if (init?.method === 'PATCH' && target === lostId) { lostHeld = true; await lostGate.promise; }
    return wire.fetch(input, init);
  };
  const adapter = new RunnerDrive({ token: new RunnerToken({ api: API, runId: RUN_ID, ticket: TICKET, fetch, now: () => wire.now }), attempt: 1, fetch, pacing: { baseMs: 0, sleep: () => retryGate.promise } });
  await Promise.all([adapter.get(patch.id), adapter.get(content.id)]);
  const before: string[] = [];
  const applied: string[] = [];
  adapter.fault = {
    before: (c) => { if (!('id' in c)) throw new Error('unexpected create'); before.push(c.id); return c.id === lostId ? 'lose-reply' : 'pass'; },
    applied: (c) => { if ('id' in c) applied.push(c.id); },
  };
  const w = adapter.fencedWrites();
  const readBack: string[] = [];
  const writes = Promise.all([
    updateByStamp(adapter, patch, 'rename:renamed', (stamp) => w.update(patch.id, { name: 'renamed', appProperties: stamp }), (now) => { if (now) readBack.push(now.id); }),
    updateByStamp(adapter, content, { text: 'new content' }, (stamp) => w.writeText(content.id, 'new content', content.modifiedTime, stamp), (now) => { if (now) readBack.push(now.id); }),
  ]);
  try {
    await vi.waitFor(() => { expect(tries).toBe(1); expect(lostHeld).toBe(true); });
    expect(adapter.changesSince(0)).toBeNull();
    retryGate.resolve();
    await vi.waitFor(() => expect(applied).toEqual([retryId]));
    expect(tries).toBe(2);
    const owners = events.filter((e) => e.kind === 'write');
    expect(new Set(owners.map((e) => e.owner)).size).toBe(2);
    for (const target of [retryId, lostId]) {
      const owner = owners.find((e) => e.target === target)?.owner;
      const own = events.filter((e) => e.owner === owner);
      expect(own.filter((e) => e.kind === 'attempt')).toHaveLength(target === retryId ? 2 : 1);
      expect(own.filter((e) => e.kind === 'read').map((e) => e.target)).toEqual(Array(target === retryId ? 2 : 1).fill(target));
      expect(own.map((e) => e.kind)).toEqual(target === retryId ? ['attempt', 'read', 'write', 'attempt', 'read', 'write'] : ['attempt', 'read', 'write']);
    }
  } finally { retryGate.resolve(); lostGate.resolve(); await writes; }
  expect(before.sort()).toEqual([patch.id, content.id].sort());
  expect(applied.sort()).toEqual([patch.id, content.id].sort());
  expect(readBack).toEqual([lostId]);
  expect((await drive.get(patch.id)).name).toBe('renamed');
  expect(await drive.readText(content.id)).toBe('new content');
});

it.each(['file', 'folder'] as const)('f10-listing-patch: multiple entries already showing a %s are equal after its answer', async (kind) => {
  const drive = fixedDrive();
  const root = (await drive.createFolder('root', 'Bower')).id;
  const sys = await drive.createFolder(root, '.bower');
  await drive.createText(sys.id, 'before.json', '{}');
  const wire = driveV3(drive);
  const release = deferred();
  const landed = deferred();
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const response = await wire.fetch(input, init);
    if (init?.method === 'POST') { landed.resolve(); await release.promise; }
    return response;
  };
  const adapter = new RunnerDrive({ token: new RunnerToken({ api: API, runId: RUN_ID, ticket: TICKET, fetch, now: () => wire.now }), attempt: 1, fetch });
  await adapter.get(sys.id);
  const writing = kind === 'file' ? adapter.fencedWrites().createText(sys.id, 'requests.json', '{}') : adapter.fencedWrites().createFolder(sys.id, 'piles');
  await landed.promise;
  await drive.createText(sys.id, 'after.json', '{}');
  const reads = runnerReads(adapter, RUN_ID);
  const before = await reads.listAll(root);
  expect(before.map((f) => f.name)).toEqual(expect.arrayContaining(['before.json', 'after.json', kind === 'file' ? 'requests.json' : 'piles']));
  release.resolve();
  await writing;
  const count = wire.requests.length;
  const after = await reads.listAll(root);
  const metadata = (files: typeof before) => files.map(({ md5Checksum, sha256, ...file }) => {
    if (md5Checksum !== undefined) expect(md5Checksum).toBe(createHash('md5').update('{}').digest('hex'));
    if (sha256 !== undefined) expect(sha256).toBe(createHash('sha256').update('{}').digest('hex'));
    return file;
  }).sort((a, b) => a.name.localeCompare(b.name));
  expect(metadata(after)).toEqual(metadata(before));
  if (kind === 'file') {
    expect(after.map((f) => f.name)).not.toEqual(before.map((f) => f.name));
    expect(wire.requests).toHaveLength(count);
  } else expect(wire.requests.length).toBeGreaterThan(count);
});

/** Three declared piles with settled effects, before their first report and piles folder. */
async function reportRun(hold?: (name: string) => Promise<void>) {
  const drive = fixedDrive();
  const rootId = (await drive.createFolder('root', 'Bower')).id;
  const files = await Promise.all([0, 1, 2].map((i) => drive.createText(rootId, `file-${i}`, 'words')));
  const seen = files.map((f) => ({ fileId: f.id, name: f.name, parents: f.parents, folder: false, modifiedTime: f.modifiedTime }));
  const manifest: RunManifest = {
    v: 1, kind: 'run-manifest', scope: { rootId }, runId: RUN_ID, requestId: 'request-f10', runScope: 'all', allowWeb: false, requestedAt: 1000, captureId: '',
    capture: {
      piles: seen.map((f, i) => ({ pileId: `pile-${i}`, source: { kind: 'declared', ref: { declarationId: `declaration-${i}`, sha256: 'a'.repeat(64) } }, anchor: null, memberKeys: [`member-${i}`], childFileIds: [f.fileId], context: { kind: 'absent' } })),
      members: seen.map((file, i) => ({ pileId: `pile-${i}`, memberKey: `member-${i}`, file, content: { encoding: 'blob', size: 5, sha256: createHash('sha256').update('words').digest('hex'), provenance: 'adapter-read', observedModifiedTime: file.modifiedTime } })), journal: [], places: [],
    }, operations: [], reportPlan: [],
  };
  manifest.captureId = (await canonical({ scope: manifest.scope, runScope: manifest.runScope, capture: manifest.capture })).hash;
  for (const [ordinal, before] of seen.entries()) {
    const effect = { kind: 'bin' as const, before, capturedChildIds: [] };
    const operationId = (await canonical({ runId: RUN_ID, captureId: manifest.captureId, ordinal, effect })).hash;
    manifest.operations.push({ operationId, ordinal, dependsOn: [], effect });
    await drive.trash(before.fileId);
  }
  const wire = driveV3(drive);
  const active = new Set<string>();
  const events: Array<{ kind: 'attempt' | 'start' | 'end'; name: string }> = [];
  const starts: string[] = [];
  const ends: string[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    if (String(input).endsWith('/attempt')) events.push({ kind: 'attempt', name: '' });
    const writing = init?.method === 'POST' && String(input).includes('googleapis.com');
    const name = writing ? /"name":"([^"]+)"/.exec(await new Response(init?.body).text())?.[1] ?? '?' : '';
    if (writing) { active.add(name); starts.push(name); events.push({ kind: 'start', name }); }
    try {
      if (writing) await hold?.(name);
      return await wire.fetch(input, init);
    } finally { if (writing) { active.delete(name); ends.push(name); events.push({ kind: 'end', name }); } }
  };
  const adapter = new RunnerDrive({ token: new RunnerToken({ api: API, runId: RUN_ID, ticket: TICKET, fetch, now: () => wire.now }), attempt: 1, fetch });
  const reads = runnerReads(adapter, RUN_ID);
  const listAll = reads.listAll;
  const listing = vi.spyOn(reads, 'listAll');
  listing.mockImplementation(async (root) => { expect([...active], 'no listing during sibling writes').toEqual([]); return listAll(root); });
  const records = new RunRecords(reads, rootId);
  const m = await canonical(manifest);
  const w = adapter.fencedWrites();
  await records.put(w, { runId: RUN_ID }, manifestName(m.hash), m.text);
  const first = firstCheckpoint(manifest, m.hash, { attemptId: 'attempt-0', epoch: 1 }, 1000);
  const firstC = await canonical(first);
  await records.putNew(w, { runId: RUN_ID }, checkpointName(0, firstC.hash), firstC.text);
  const opening = nextCheckpoint(first, firstC.hash, { attemptId: 'attempt-1', epoch: 1 }, { phase: 'writing', outcomes: manifest.operations.map((op) => ({ operationId: op.operationId, state: 'possible-effect', dispatchId: `dispatch-${op.ordinal}` })) });
  const opened = await canonical(opening);
  await records.putNew(w, { runId: RUN_ID }, checkpointName(1, opened.hash), opened.text);
  const outcomes: Outcome[] = manifest.operations.map((op, i) => {
    const file = seen[i];
    if (!file) throw new Error('missing captured file');
    return { operationId: op.operationId, state: 'applied', evidence: { file, trashed: true, content: null, provenance: 'adapter-read' } };
  });
  const settled = nextCheckpoint(opening, opened.hash, { attemptId: 'attempt-1', epoch: 1 }, { phase: 'writing', outcomes });
  const c = await canonical(settled);
  await records.putNew(w, { runId: RUN_ID }, checkpointName(2, c.hash), c.text);
  let id = 1;
  const run = { rootId, runId: RUN_ID, attempt: 1, records, reads, batch: () => adapter.batch(), fenced: () => adapter.fencedWrites(), admission: null, clock: () => 2000, newId: () => `attempt-${++id}` };
  const restart = () => {
    wire.attempt = 2;
    const fresh = new RunnerDrive({ token: new RunnerToken({ api: API, runId: RUN_ID, ticket: TICKET, fetch, now: () => wire.now }), attempt: 2, fetch });
    const reads = runnerReads(fresh, RUN_ID);
    return { ...run, attempt: 2, records: new RunRecords(reads, rootId), reads, batch: () => fresh.batch(), fenced: () => fresh.fencedWrites() };
  };
  return { drive, wire, adapter, run, restart, manifest, manifestHash: m.hash, chain: [first, opening, settled], active, starts, ends, events, listing };
}

it('f10-records-together: first disposition makes piles alone, then siblings overlap without listings', async () => {
  const release = deferred();
  let dispositions = 0;
  const held: string[] = [];
  const fixture = await reportRun(async (name) => {
    if (name.startsWith('disposition-') && ++dispositions > 1) { held.push(name); await release.promise; }
  });
  const { run, manifest, manifestHash, chain, drive, starts, ends } = fixture;
  expect((await drive.listAll(run.rootId)).filter((f) => f.name === 'piles')).toHaveLength(0);
  const saving = finishRun(run, manifest, manifestHash, chain);
  try {
    await vi.waitFor(() => expect(held).toHaveLength(2), { timeout: 700 });
    expect(ends.filter((n) => n.startsWith('disposition-'))).toHaveLength(1);
    expect(starts.filter((n) => n === 'piles')).toHaveLength(1);
  } finally { release.resolve(); await saving; }
  expect((await saving).written).toEqual([...REPORT_FILES, '.bower/last-run.json']);
  expect((await drive.listAll(run.rootId)).filter((f) => f.name === 'piles')).toHaveLength(1);
});

it('f10-overlap-failure: drains siblings, leaves saving, and redispatch finishes', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const release = deferred();
  const held = deferred();
  const fixture = await reportRun(async (name) => { if (name === 'requests.json') { held.resolve(); await release.promise; } });
  const { run, adapter, drive, manifest, manifestHash, chain, starts, ends } = fixture;
  const sys = (await drive.listAll(run.rootId)).find((f) => f.name === '.bower');
  if (!sys) throw new Error('missing .bower');
  await makeText(adapter.fencedWrites(), adapter, { parent: sys.id, name: 'questions.json' }, '{"v":1,"questions":[]}');
  await makeText(adapter.fencedWrites(), adapter, { parent: sys.id, name: 'hashes.json' }, '{"v":1,"hashes":{}}');
  adapter.fault = { before: (c) => c.op === 'create-text' && c.name === 'suggestions.json' ? 'refuse' : 'pass' };
  let rejected = false;
  const saving = finishRun(run, manifest, manifestHash, chain);
  const failed = saving.then(() => { throw new Error('expected refusal'); }, () => { rejected = true; });
  try {
    await vi.waitFor(() => expect(starts).toContain('requests.json'), { timeout: 700 });
    await held.promise;
    expect(rejected).toBe(false);
    expect(starts).not.toContain('last-run.json');
  } finally { release.resolve(); await failed; }
  expect(ends).toContain('requests.json');
  expect((await drive.listAll(run.rootId)).some((f) => f.name === 'requests.json')).toBe(true);
  expect(starts).not.toContain('last-run.json');
  const found = await new RunRecords(drive, run.rootId).found(RUN_ID);
  expect(found.kind, JSON.stringify(found)).toBe('run');
  if (found.kind !== 'run') throw new Error('missing chain');
  expect(found.chain.at(-1)).toMatchObject({ phase: 'saving', report: { state: 'pending' } });
  adapter.fault = null;
  const done = await finishRun(run, found.manifest, found.manifestHash, found.chain);
  expect(done.chain.at(-1)?.phase).toBe('done');
  expect(starts.filter((n) => n === 'requests.json')).toHaveLength(1);
});


it('f10-one-attempt: a separate report-pending checkpoint asks exactly once', async () => {
  const { run, manifest, manifestHash, chain, events } = await reportRun();
  expect(chain.at(-1)?.report.state).toBe('not-ready');
  events.length = 0;
  const finished = await finishRun(run, manifest, manifestHash, chain);
  expect(finished.chain[3]).toMatchObject({ phase: 'saving', report: { state: 'pending' } });
  const records = events.filter((e) => e.kind === 'start' && /^(checkpoint-|report-)/.test(e.name));
  expect(records).toHaveLength(3);
  for (const record of records) {
    const before = events.slice(0, events.indexOf(record));
    const previous = before.findLastIndex((e) => e.kind === 'end');
    expect(before.slice(previous + 1).filter((e) => e.kind === 'attempt'), record.name).toHaveLength(1);
  }
});

it('f10-disposition-failure: drains the held sibling, then a fresh instance resumes without duplicate records', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const release = deferred();
  const held: string[] = [];
  let dispositions = 0;
  const fixture = await reportRun(async (name) => {
    if (name.startsWith('disposition-') && ++dispositions > 1) { held.push(name); await release.promise; }
  });
  const { run, adapter, drive, manifest, manifestHash, chain, starts, active, restart } = fixture;
  let called = 0;
  let refused = '';
  adapter.fault = { before: (c) => {
    if (c.op === 'create-text' && c.name.startsWith('disposition-') && ++called === 2) { refused = c.name; return 'refuse'; }
    return 'pass';
  } };
  let rejected = false;
  const saving = finishRun(run, manifest, manifestHash, chain);
  const checked = expect(saving).rejects.toBeDefined();
  void saving.catch(() => { rejected = true; });
  try {
    await vi.waitFor(() => expect(held).toHaveLength(1));
    expect(refused).not.toBe('');
    expect(rejected).toBe(false);
    expect(starts).not.toContain('dispositions.json');
    expect(starts).not.toContain('last-run.json');
    expect(starts.filter((name) => REPORT_FILES.some((path) => path.endsWith(`/${name}`)))).toEqual([]);
  } finally { release.resolve(); await checked; }
  expect(active.size).toBe(0);
  expect(starts).not.toContain('dispositions.json');
  expect(starts).not.toContain('last-run.json');
  expect(starts.filter((name) => REPORT_FILES.some((path) => path.endsWith(`/${name}`)))).toEqual([]);
  const next = restart();
  const found = await next.records.found(RUN_ID);
  if (found.kind !== 'run') throw new Error('missing chain');
  expect(found.chain.at(-1)).toMatchObject({ phase: 'saving', report: { state: 'pending' } });
  const done = await finishRun(next, found.manifest, found.manifestHash, found.chain);
  expect(done.chain.at(-1)?.phase).toBe('done');
  const files = await drive.listAll(run.rootId);
  expect(files.filter((f) => f.name === 'piles')).toHaveLength(1);
  const records = files.filter((f) => f.name.startsWith('disposition-'));
  expect(records).toHaveLength(3);
  expect(new Set(records.map((f) => f.name)).size).toBe(3);
  expect(starts.filter((name) => name === refused)).toHaveLength(1);
  expect(starts.filter((name) => name === held[0])).toHaveLength(1);
  expect(starts.filter((name) => name.startsWith('report-'))).toHaveLength(1);
});
