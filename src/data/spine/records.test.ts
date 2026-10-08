import { describe, expect, it, vi } from 'vitest';
import type { Checkpoint, Outcome } from '../contracts/run-checkpoint';
import { DriveHttp } from '../drive/drive-http';
import type { DriveFile } from '../drive/drive-api';
import { FakeDrive, type FencedDrive } from '../drive/fake-drive';
import { planRun } from '../fake/fake-runner';
import { seedFakeDrive } from '../fake/seed';
import { PROP, recordStamp } from '../vault/layout';
import { RunRecords, canonical, checkpointName, firstCheckpoint, manifestName, nextCheckpoint, type CheckpointPatch, type RunManifest } from './records';

const AT = Date.UTC(2026, 9, 7, 9);
const MARK = { attemptId: 'attempt-1', epoch: 1 };

/** The same seeded folder every time: fixed clock, fixed ids. */
async function seeded(): Promise<{ drive: FakeDrive; root: string }> {
  const drive = new FakeDrive({ clock: () => 0 });
  const root = (await seedFakeDrive(drive, 'default', AT)) ?? '';
  return { drive, root };
}

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const wire = (f: DriveFile): Record<string, unknown> => ({
  id: f.id, name: f.name, mimeType: f.folder ? 'application/vnd.google-apps.folder' : 'application/json', parents: f.parents,
  modifiedTime: f.modifiedTime, createdTime: f.createdTime, ...(f.size !== undefined && !f.folder ? { size: String(f.size) } : {}),
});

/** A request body as text (the test DOM's Blob is not the runtime's, so `Response` cannot read it). */
const bodyText = async (body: RequestInit['body']): Promise<string> => (typeof body === 'string' ? body : body instanceof Blob ? body.text() : new Response(body).text());

/** A `fetch` answering as Drive v3 does for what the records ask (listings, reads, folder and file creates), over a pretend Drive. */
function driveV3(drive: FakeDrive): typeof fetch {
  const answer = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input));
    const method = (init.method ?? 'GET').toUpperCase();
    const one = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
    if (method === 'GET' && url.pathname === '/drive/v3/files') {
      const parents = [...(url.searchParams.get('q') ?? '').matchAll(/'([^']+)' in parents/g)].map((m) => m[1] ?? '');
      const files: DriveFile[] = [];
      for (const parent of parents) files.push(...(await drive.listAll(parent)).filter((f) => f.parents[0] === parent));
      return json(200, { files: files.map(wire) });
    }
    if (method === 'GET' && one && url.searchParams.get('alt') === 'media') return new Response(new TextDecoder().decode(await drive.readBytes(decodeURIComponent(one[1] ?? ''))));
    if (method === 'POST' && url.pathname === '/drive/v3/files') {
      const meta = JSON.parse(await bodyText(init.body)) as { name: string; parents: string[] };
      return json(200, wire(await drive.createFolder(meta.parents[0] ?? '', meta.name)));
    }
    if (method === 'POST' && url.pathname === '/upload/drive/v3/files') {
      const text = await bodyText(init.body);
      const boundary = /^--([^\r\n]+)\r\n/.exec(text)?.[1] ?? '';
      const [meta, content] = text.split(`--${boundary}`).slice(1, -1).map((p) => p.slice(p.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, ''));
      const m = JSON.parse(meta ?? '{}') as { name: string; parents: string[] };
      return json(200, wire(await drive.createText(m.parents[0] ?? '', m.name, content ?? '')));
    }
    return json(400, { error: { code: 400, message: 'badRequest', errors: [{ reason: 'badRequest' }] } });
  };
  return answer as typeof fetch;
}

/** The shared steps: the manifest record, the first checkpoint, then an intent and an outcome per operation. */
async function writeChain(records: RunRecords, w: FencedDrive, manifest: RunManifest): Promise<void> {
  const where = { runId: manifest.runId };
  const m = await canonical(manifest);
  await records.put(w, where, manifestName(m.hash), m.text);
  let head: Checkpoint = firstCheckpoint(manifest, m.hash, MARK, AT);
  let c = await canonical(head);
  await records.put(w, where, checkpointName(0, c.hash), c.text);
  const step = async (patch: CheckpointPatch): Promise<void> => {
    head = nextCheckpoint(head, c.hash, MARK, patch);
    c = await canonical(head);
    await records.putNew(w, where, checkpointName(head.revision, c.hash), c.text);
  };
  const outcome = (id: string, next: Outcome): Outcome[] => head.outcomes.map((o) => (o.operationId === id ? next : o));
  await step({ phase: 'saving', phaseAt: AT + 1 });
  for (const op of manifest.operations) {
    const operationId = op.operationId;
    await step({ outcomes: outcome(operationId, { operationId, state: 'possible-effect', dispatchId: `dispatch-${op.ordinal}` }) });
    const file = { fileId: `file-${op.ordinal}`, name: `Thing ${op.ordinal}`, parents: ['FOLDER_ID'], folder: false, modifiedTime: '2026-10-07T09:00:00.000Z' };
    await step({ outcomes: outcome(operationId, { operationId, state: 'applied', evidence: { file, trashed: false, content: null, provenance: 'adapter-read' } }) });
  }
}

describe('shared run records', () => {
  it('the shared operations give the same chain on the fake and on Drive', async () => {
    const fake = await seeded();
    const plan = await planRun(fake.drive, fake.root, { scope: 'all', allowWeb: false, runId: 'run-shared', requestId: 'request-shared', requestedAt: AT });
    const manifest: RunManifest = plan.manifest;
    expect(manifest.operations.length).toBeGreaterThan(1);

    // The fake: the pretend Drive itself.
    const onFake = new RunRecords(fake.drive, fake.root);
    await writeChain(onFake, fake.drive.fenced(() => {}), manifest);

    // Drive: the Drive v3 client over a fetch that answers as Drive does, on a folder seeded the same way.
    const other = await seeded();
    expect(other.root).toBe(fake.root);
    const http = new DriveHttp({ token: async () => 'drive-token', fetch: driveV3(other.drive) });
    const onDrive = new RunRecords(http, other.root);
    await writeChain(onDrive, http, manifest);

    const a = await onFake.found(manifest.runId);
    const b = await onDrive.found(manifest.runId);
    expect([a.kind, b.kind]).toEqual(['run', 'run']);
    if (a.kind !== 'run' || b.kind !== 'run') throw new Error(`not a run: ${a.kind}, ${b.kind}`);
    expect(a.chain).toHaveLength(2 + 2 * manifest.operations.length);
    expect(b.chain).toEqual(a.chain);
    expect(b.head).toBe(a.head);
    expect(b.manifestHash).toBe(a.manifestHash);
    const names = async (r: RunRecords): Promise<string[]> => (await r.list({ runId: manifest.runId })).map((f) => f.name).sort();
    expect(await names(onDrive)).toEqual(await names(onFake));
  });
});

describe('a record write that stamps its pile (TL-P4-16 b)', () => {
  it('stamps a new disposition with its pile id', async () => {
    const { drive, root } = await seeded();
    const records = new RunRecords(drive, root);
    await records.put(drive.fenced(() => {}), 'piles', `disposition-${'a'.repeat(64)}.json`, '{}', recordStamp('pile-1'));
    const made = (await drive.listAll(root)).find((f) => f.name.startsWith('disposition-'));
    expect(made?.appProperties).toEqual({ [PROP.recordPile]: 'pile-1' });
  });

  it('never rewrites a record that is there: one changed between the read and the write is a conflict, and an identical one keeps its version', async () => {
    const { drive, root } = await seeded();
    const records = new RunRecords(drive, root);
    const w = drive.fenced(() => {});
    const name = `disposition-${'b'.repeat(64)}.json`;
    await records.put(w, 'piles', name, '{}');
    const old = (await drive.listAll(root)).find((f) => f.name === name);
    // The same bytes: nothing is written, so a record without the stamp stays as it was (never restamped).
    await records.put(w, 'piles', name, '{}', recordStamp('pile-1'));
    const same = (await drive.listAll(root)).find((f) => f.name === name);
    expect([same?.modifiedTime, same?.appProperties]).toEqual([old?.modifiedTime, old?.appProperties]);
    // Other bytes appear at the name after a first look: the write refuses and leaves them.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await drive.writeText(old?.id ?? '', '{"other":1}', old?.modifiedTime ?? '');
    await expect(records.put(w, 'piles', name, '{}', recordStamp('pile-1'))).rejects.toMatchObject({ code: 'conflict' });
    expect(await drive.readText(old?.id ?? '')).toBe('{"other":1}');
  });
});
