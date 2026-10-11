/**
 * The persistent upload queue on the real Drive client (`DriveHttp`), over a
 * fake `fetch` that answers as Google's resumable upload protocol does
 * (developers.google.com/workspace/drive/api/guides/manage-uploads#resumable):
 * a session opened with a reserved id, chunks answered 308 with `Range`, a
 * status query `Content-Range: bytes * /<total>`, 200/201 once the file is
 * made, 404 when the session expired, and 409 for a reserved id already used.
 * A "device" is a store and a queue over one fake IndexedDB, so making a
 * second one is a reload.
 */
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RESUMABLE_UNIT } from './drive/drive-api';
import { DriveHttp } from './drive/drive-http';
import { makeOnce } from './spine/write-once';
import type * as WriteOnce from './spine/write-once';
import { createUploadQueue, type AddUpload, type UploadQueue } from './upload-queue';
import { indexedDbUploadStore, type UploadStore } from './upload-store';
import { sha256 } from './vault/hashes';

// The write-once home as it is, watched: an upload's id must be reserved through it (TL-P4-17 addendum 1).
vi.mock('./spine/write-once', async (importOriginal) => {
  const actual = await importOriginal<typeof WriteOnce>();
  return { ...actual, makeOnce: vi.fn(actual.makeOnce) };
});

const ACCOUNT = 'account-a';
const FOLDER = 'FOLDER_ID';
const INBOX = 'INBOX_ID';
const UNIT = RESUMABLE_UNIT;
/** Four chunks: three whole units and a short last one. */
const SIZE = 3 * UNIT + 100;
const CHUNKS = Math.ceil(SIZE / UNIT);
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

function bytesOf(n: number, seed: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (i * 31 + seed) % 251;
  return out;
}

const hex = (b: ArrayBuffer): string => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

interface Session {
  id: string;
  meta: { id: string; name: string; parents: string[]; appProperties?: Record<string, string> };
  total: number;
  parts: Uint8Array[];
  committed: number;
  expired: boolean;
}

interface Made {
  id: string;
  name: string;
  parents: string[];
  appProperties?: Record<string, string>;
  bytes: Uint8Array;
  sha256: string;
}

/** What each request was, in Drive's own terms. */
type Op = { op: 'ids' } | { op: 'open'; id: string } | { op: 'status' } | { op: 'put'; start: number } | { op: 'get'; id: string };

/** Google Drive's resumable upload protocol, as a `fetch`. */
class ResumableDrive {
  readonly files = new Map<string, Made>();
  readonly sessions = new Map<string, Session>();
  readonly ops: Op[] = [];
  offline = false;
  /** Refuses every new session for good (403 `insufficientFilePermissions`), as a folder no longer shared would. */
  refuseOpen = false;
  /** Requests sent while `offline`. */
  attempts = 0;
  /** Called after a chunk is committed; a promise that never settles loses Drive's reply. */
  afterChunk: ((start: number, signal: AbortSignal | undefined) => Promise<void>) | null = null;
  private next = 0;

  readonly fetch = (async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    if (this.offline) {
      this.attempts++;
      throw new TypeError('Failed to fetch');
    }
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    const headers = new Headers(init.headers);
    if (method === 'GET' && url.pathname === '/drive/v3/files/generateIds') {
      this.ops.push({ op: 'ids' });
      const count = Number(url.searchParams.get('count'));
      return Response.json({ kind: 'drive#generatedIds', space: 'drive', ids: Array.from({ length: count }, () => `RESERVED_${++this.next}`) });
    }
    if (method === 'GET' && url.pathname.startsWith('/drive/v3/files/')) {
      const id = url.pathname.slice('/drive/v3/files/'.length);
      this.ops.push({ op: 'get', id });
      const file = this.files.get(id);
      return file ? Response.json(this.wire(file)) : Response.json({ error: { code: 404 } }, { status: 404 });
    }
    if (method === 'POST' && `${url.origin}${url.pathname}` === UPLOAD && url.searchParams.get('uploadType') === 'resumable') {
      const meta = JSON.parse(String(init.body)) as Session['meta'];
      this.ops.push({ op: 'open', id: meta.id });
      if (this.refuseOpen) return Response.json({ error: { code: 403, errors: [{ reason: 'insufficientFilePermissions' }] } }, { status: 403 });
      // A reserved id a file already has is refused: Drive never makes a second one.
      if (this.files.has(meta.id)) return Response.json({ error: { code: 409, message: 'A file already exists with the provided ID.' } }, { status: 409 });
      const id = `SESSION_${++this.next}`;
      this.sessions.set(id, { id, meta, total: Number(headers.get('x-upload-content-length')), parts: [], committed: 0, expired: false });
      return new Response(null, { status: 200, headers: { location: `${UPLOAD}?uploadType=resumable&upload_id=${id}` } });
    }
    if (method === 'PUT' && url.searchParams.has('upload_id')) {
      const session = this.sessions.get(url.searchParams.get('upload_id') ?? '');
      const range = headers.get('content-range') ?? '';
      const status = /^bytes \*\/(\d+)$/.exec(range);
      this.ops.push(status ? { op: 'status' } : { op: 'put', start: Number(/^bytes (\d+)-/.exec(range)?.[1]) });
      if (!session || session.expired) return Response.json({ error: { code: 404 } }, { status: 404 });
      if (status) return this.answer(session);
      const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range);
      if (!m) return new Response(null, { status: 400 });
      const start = Number(m[1]);
      if (start !== session.committed || Number(m[3]) !== session.total) return new Response(null, { status: 400 });
      const body = new Uint8Array(await (init.body as Blob).arrayBuffer());
      if (body.length !== Number(m[2]) - start + 1) return new Response(null, { status: 400 });
      session.parts.push(body);
      session.committed += body.length;
      if (session.committed === session.total) {
        if (this.files.has(session.meta.id)) return Response.json({ error: { code: 409 } }, { status: 409 });
        const all = new Uint8Array(session.total);
        let at = 0;
        for (const p of session.parts) {
          all.set(p, at);
          at += p.length;
        }
        this.files.set(session.meta.id, { id: session.meta.id, name: session.meta.name, parents: session.meta.parents, ...(session.meta.appProperties ? { appProperties: session.meta.appProperties } : {}), bytes: all, sha256: hex(await crypto.subtle.digest('SHA-256', all)) });
      }
      const signal = init.signal ?? undefined;
      await this.afterChunk?.(start, signal);
      return this.answer(session);
    }
    return new Response(null, { status: 400 });
  }) as typeof fetch;

  private answer(session: Session): Response {
    const file = this.files.get(session.meta.id);
    if (file && session.committed === session.total) return Response.json(this.wire(file), { status: 200 });
    return new Response(null, { status: 308, ...(session.committed > 0 ? { headers: { range: `bytes=0-${session.committed - 1}` } } : {}) });
  }

  private wire(f: Made): Record<string, unknown> {
    return { id: f.id, name: f.name, parents: f.parents, mimeType: 'application/pdf', modifiedTime: '2026-10-07T10:00:00.000Z', createdTime: '2026-10-07T10:00:00.000Z', size: String(f.bytes.length), sha256Checksum: f.sha256, ...(f.appProperties ? { appProperties: f.appProperties } : {}) };
  }

  /** Loses Drive's reply to the chunk at `start`, after Drive kept it, until the page goes away. */
  loseReplyAt(start: number): Promise<void> {
    return new Promise<void>((reached) => {
      this.afterChunk = (at, signal) => {
        if (at !== start) return Promise.resolve();
        reached();
        return new Promise<void>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new DOMException('The page went away.', 'AbortError')));
        });
      };
    });
  }

  opsFrom(from: number): string[] {
    return this.ops.slice(from).map((o) => (o.op === 'put' ? `put@${o.start}` : o.op === 'open' ? `open:${o.id}` : o.op === 'get' ? `get:${o.id}` : o.op));
  }
}

interface Env {
  drive: ResumableDrive;
  idb: IDBFactory;
}

function setup(): Env {
  return { drive: new ResumableDrive(), idb: new IDBFactory() };
}

/** One page load: the real Drive client, a fresh store and queue over the device's IndexedDB. */
function device(env: Env, store: UploadStore = indexedDbUploadStore(env.idb), pacing: { baseMs: number } = { baseMs: 0 }): { queue: UploadQueue; store: UploadStore } {
  // The backoff is this client's option: no wait here unless a test asks for one.
  const http = new DriveHttp({ token: async () => 'TOKEN', fetch: env.drive.fetch, pacing });
  return { queue: createUploadQueue({ drive: http, store, chunkSize: UNIT }), store };
}

async function member(n: number, size = SIZE): Promise<AddUpload & { bytes: Uint8Array<ArrayBuffer> }> {
  const bytes = bytesOf(size, n);
  const body = new Blob([bytes], { type: 'application/pdf' });
  return { declarationId: 'decl-1', memberKey: `member-${n}`, sha256: await sha256(body), pileId: 'pile-1', parentId: INBOX, name: `scan-${n}.pdf`, body, appProperties: { item: `member-${n}` }, bytes };
}

afterEach(() => vi.restoreAllMocks());

describe('the upload queue on the real Drive client', () => {
  it.each(Array.from({ length: CHUNKS }, (_, k) => k))('a reload resumes from Drive\'s offset and makes one file: interrupted after chunk %i', async (k) => {
    const env = setup();
    const added = await member(1);
    const lost = env.drive.loseReplyAt(k * UNIT);
    const first = device(env);
    await first.queue.start(ACCOUNT, FOLDER);
    await first.queue.add(added);
    await lost;
    // The page goes away with Drive's reply to chunk k lost: it never reported "sent".
    expect(first.queue.items()[0]?.state).toBe('uploading');
    first.queue.stop();
    await first.queue.idle();
    env.drive.afterChunk = null;
    const reserved = env.drive.ops.find((o) => o.op === 'open');
    if (reserved?.op !== 'open') throw new Error('no session');

    const from = env.drive.ops.length;
    const second = device(env);
    await second.queue.start(ACCOUNT, FOLDER);
    await second.queue.idle();

    // It asks Drive how much arrived, then sends only the rest; after the last chunk, nothing more.
    const rest = Array.from({ length: CHUNKS - k - 1 }, (_, i) => `put@${(k + 1 + i) * UNIT}`);
    expect(env.drive.opsFrom(from)).toEqual(['status', ...rest]);
    expect([...env.drive.files.keys()]).toEqual([reserved.id]);
    expect(env.drive.files.get(reserved.id)?.bytes).toEqual(added.bytes);
    expect(env.drive.ops.filter((o) => o.op === 'open')).toHaveLength(1);
    expect(second.queue.items()[0]).toMatchObject({ state: 'done', sent: SIZE, file: { id: reserved.id } });
    // Drive has it: nothing of it stays on the device.
    expect(await second.store.list(ACCOUNT, FOLDER)).toEqual([]);
  });

  it.each([
    ['mid-transfer', 1],
    ['after Drive made the file', CHUNKS - 1],
  ] as const)('an expired session restarts with the same reserved id (%s)', async (_label, k) => {
    const env = setup();
    const added = await member(1);
    const lost = env.drive.loseReplyAt(k * UNIT);
    const first = device(env);
    await first.queue.start(ACCOUNT, FOLDER);
    await first.queue.add(added);
    await lost;
    first.queue.stop();
    await first.queue.idle();
    env.drive.afterChunk = null;
    const reserved = env.drive.ops.find((o) => o.op === 'open');
    if (reserved?.op !== 'open') throw new Error('no session');
    for (const s of env.drive.sessions.values()) s.expired = true;
    const made = env.drive.files.size;

    const from = env.drive.ops.length;
    const second = device(env);
    await second.queue.start(ACCOUNT, FOLDER);
    await second.queue.idle();

    const ops = env.drive.opsFrom(from);
    expect(ops.slice(0, 2)).toEqual(['status', `open:${reserved.id}`]);
    if (made === 0) {
      // A new session for the same reserved id, from the first byte.
      expect(ops.slice(2)).toEqual(Array.from({ length: CHUNKS }, (_, i) => `put@${i * UNIT}`));
    } else {
      // Drive refuses a second file under that id (409): the one there is read back and checked.
      expect(ops.slice(2)).toEqual([`get:${reserved.id}`]);
    }
    expect([...env.drive.files.keys()]).toEqual([reserved.id]);
    expect(env.drive.files.get(reserved.id)?.bytes).toEqual(added.bytes);
    expect(second.queue.items()[0]).toMatchObject({ state: 'done', file: { id: reserved.id } });
  });

  it('an upload reserves its file id through the write-once home and keeps it on the device', async () => {
    vi.mocked(makeOnce).mockClear();
    const env = setup();
    const added = await member(1);
    const real = indexedDbUploadStore(env.idb);
    // Where Drive stood when the device first kept a reserved id.
    let keptAt: { fileId: string; ops: string[] } | null = null;
    const watched: UploadStore = {
      ...real,
      save: async (...args) => {
        const [r] = args;
        if (keptAt === null && r.fileId !== null) keptAt = { fileId: r.fileId, ops: env.drive.opsFrom(0) };
        return real.save(...args);
      },
    };
    const lost = env.drive.loseReplyAt(UNIT);
    const first = device(env, watched);
    await first.queue.start(ACCOUNT, FOLDER);
    await first.queue.add(added);
    await lost;
    first.queue.stop();
    await first.queue.idle();

    // One create, through the home: its holder carries the id Drive reserved, and nothing else asked Drive for one.
    expect(vi.mocked(makeOnce)).toHaveBeenCalledTimes(1);
    expect(env.drive.ops.filter((o) => o.op === 'ids')).toHaveLength(1);
    const open = env.drive.ops.find((o) => o.op === 'open');
    if (open?.op !== 'open') throw new Error('no session');
    expect(vi.mocked(makeOnce).mock.calls[0]?.[0]).toMatchObject({ reserved: open.id });
    // The device kept that id before the first byte went: only the reservation had been asked for.
    expect(keptAt).toEqual({ fileId: open.id, ops: ['ids'] });
    expect((await real.list(ACCOUNT, FOLDER)).map((r) => r.fileId)).toEqual([open.id]);
  });

  it('an upload refused for good releases its id from the device record', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const env = setup();
    const added = await member(1);
    env.drive.refuseOpen = true;
    const tab = device(env);
    await tab.queue.start(ACCOUNT, FOLDER);
    await tab.queue.add(added);
    await tab.queue.idle();
    const refused = env.drive.ops.find((o) => o.op === 'open');
    if (refused?.op !== 'open') throw new Error('no session asked for');
    expect(tab.queue.items()[0]).toMatchObject({ state: 'failed', fileId: null });

    // Drive refused the create for good: nothing was made, and the device keeps no id for it.
    expect(env.drive.files.size).toBe(0);
    expect((await indexedDbUploadStore(env.idb).list(ACCOUNT, FOLDER)).map((r) => r.fileId)).toEqual([null]);

    // A reload, then a try again: a new id is reserved, and one file is made under it.
    env.drive.refuseOpen = false;
    const from = env.drive.ops.length;
    const second = device(env);
    await second.queue.start(ACCOUNT, FOLDER);
    await second.queue.idle();
    const open = env.drive.ops.slice(from).find((o) => o.op === 'open');
    if (open?.op !== 'open') throw new Error('no session asked for');
    expect(env.drive.opsFrom(from).slice(0, 2)).toEqual(['ids', `open:${open.id}`]);
    expect(open.id).not.toBe(refused.id);
    expect([...env.drive.files.keys()]).toEqual([open.id]);
    expect(second.queue.items()[0]).toMatchObject({ state: 'done', file: { id: open.id } });
  });

  it('an upload whose reply was lost is found again by its kept id after a reload', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const env = setup();
    const added = await member(1);
    // Drive made the file with the last chunk; its reply never came, and the page went away.
    const lost = env.drive.loseReplyAt((CHUNKS - 1) * UNIT);
    const first = device(env);
    await first.queue.start(ACCOUNT, FOLDER);
    await first.queue.add(added);
    await lost;
    first.queue.stop();
    await first.queue.idle();
    env.drive.afterChunk = null;
    const kept = (await indexedDbUploadStore(env.idb).list(ACCOUNT, FOLDER)).find((record) => record.memberKey === added.memberKey);
    const id = kept?.fileId;
    if (!id) throw new Error('no id kept on the device');
    expect([...env.drive.files.keys()]).toEqual([id]);
    for (const s of env.drive.sessions.values()) s.expired = true;

    const from = env.drive.ops.length;
    const second = device(env);
    await second.queue.start(ACCOUNT, FOLDER);
    await second.queue.idle();

    // Sent again under the id the device kept: Drive refuses a second file with it, and the one there is read by it.
    expect(env.drive.opsFrom(from)).toEqual(['status', `open:${id}`, `get:${id}`]);
    expect(env.drive.ops.filter((o) => o.op === 'ids')).toHaveLength(1);
    expect([...env.drive.files.keys()]).toEqual([id]);
    expect(second.queue.items()[0]).toMatchObject({ state: 'done', file: { id } });
    expect(await second.store.list(ACCOUNT, FOLDER)).toEqual([]);
  });

  it('lost bytes ask to choose the file again', async () => {
    const t0 = Date.now();
    const env = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const lostOne = await member(1);
    const keptOne = await member(2);
    // Added with no connection: both are kept on the device, nothing in Drive yet.
    env.drive.offline = true;
    const first = device(env);
    await first.queue.start(ACCOUNT, FOLDER);
    await first.queue.add(lostOne);
    await first.queue.add(keptOne);
    await first.queue.idle();
    first.queue.stop();
    env.drive.offline = false;

    // The browser evicted the bytes of one of them.
    const real = indexedDbUploadStore(env.idb);
    const evicted: UploadStore = { ...real, body: async (r) => (r.memberKey === 'member-1' ? null : real.body(r)) };
    const second = device(env, evicted);
    await second.queue.start(ACCOUNT, FOLDER);
    await second.queue.idle();

    const [one, two] = second.queue.items();
    expect(one).toMatchObject({ memberKey: 'member-1', state: 'failed', gone: true });
    expect(one?.error?.message).toContain('Choose the file again.');
    // Nothing is sent for it; the other one in the pile goes as before.
    expect(two).toMatchObject({ memberKey: 'member-2', state: 'done' });
    expect([...env.drive.files.values()].map((f) => f.name)).toEqual(['scan-2.pdf']);
    expect(env.drive.ops.filter((o) => o.op === 'open')).toHaveLength(1);
    // No real backoff anywhere in it (3.5 s with the client's real one): measured, with no global set up.
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it('an upload added while known offline shows offline at once', { timeout: 20_000 }, async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const env = setup();
    env.drive.offline = true;
    const { queue } = device(env);
    await queue.start(ACCOUNT, FOLDER);
    await queue.add(await member(1));
    await queue.add(await member(2));
    await queue.idle();
    // The browser said it had no network before anything was sent: one try each, no resend, "waiting for a connection".
    expect(queue.items().map((i) => [i.state, i.error?.code])).toEqual([['waiting', 'offline'], ['waiting', 'offline']]);
    expect(env.drive.attempts).toBe(2);
    queue.stop();
  });

  it('stop settles at once during an offline generateIds', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const env = setup();
    env.drive.offline = true;
    // A backoff of a minute: only the caller's signal can end it.
    const { queue } = device(env, undefined, { baseMs: 60_000 });
    await queue.start(ACCOUNT, FOLDER);
    await queue.add(await member(1));
    await new Promise((r) => setTimeout(r, 50));
    queue.stop();
    const settled = await Promise.race([queue.idle().then(() => 'settled'), new Promise((r) => setTimeout(() => r('still waiting'), 500))]);
    expect(settled).toBe('settled');
  });

  it('stop settles at once during an offline getUploaded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const env = setup();
    const lost = env.drive.loseReplyAt(0);
    const first = device(env);
    await first.queue.start(ACCOUNT, FOLDER);
    await first.queue.add(await member(1));
    await lost;
    first.queue.stop();
    await first.queue.idle();
    env.drive.afterChunk = null;
    // A reload that lost the bytes asks Drive for the file, with no network and a backoff of a minute.
    env.drive.offline = true;
    const real = indexedDbUploadStore(env.idb);
    const second = device(env, { ...real, body: async () => null }, { baseMs: 60_000 });
    await second.queue.start(ACCOUNT, FOLDER);
    await new Promise((r) => setTimeout(r, 50));
    second.queue.stop();
    const settled = await Promise.race([second.queue.idle().then(() => 'settled'), new Promise((r) => setTimeout(() => r('still waiting'), 500))]);
    expect(settled).toBe('settled');
  });

  it('lost bytes of a file Drive already made count as sent, never as one to choose again', async () => {
    const env = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const added = await member(1);
    const lost = env.drive.loseReplyAt((CHUNKS - 1) * UNIT);
    const first = device(env);
    await first.queue.start(ACCOUNT, FOLDER);
    await first.queue.add(added);
    await lost;
    first.queue.stop();
    await first.queue.idle();
    env.drive.afterChunk = null;
    const reserved = env.drive.ops.find((o) => o.op === 'open');
    if (reserved?.op !== 'open') throw new Error('no session');

    const real = indexedDbUploadStore(env.idb);
    const second = device(env, { ...real, body: async () => null });
    await second.queue.start(ACCOUNT, FOLDER);
    await second.queue.idle();

    expect(second.queue.items()[0]).toMatchObject({ state: 'done', file: { id: reserved.id } });
    expect(second.queue.items()[0]?.gone).toBeUndefined();
    expect([...env.drive.files.keys()]).toEqual([reserved.id]);
    expect(await real.list(ACCOUNT, FOLDER)).toEqual([]);
  });
});
