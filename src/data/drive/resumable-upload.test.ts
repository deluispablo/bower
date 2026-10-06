import { afterEach, describe, expect, it, vi } from 'vitest';
import { BowerError } from '../types';
import { sha256 } from '../vault/hashes';
import { DriveHttp } from './drive-http';
import { FakeDrive } from './fake-drive';
import { confirmedFrom, sendResumable, type UploadHooks } from './resumable-upload';

const BYTES = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
const HASH = await sha256(new Blob([BYTES]));

function hooks(): UploadHooks & { sessions: string[]; confirmed: number[] } {
  const sessions: string[] = [];
  const confirmed: number[] = [];
  return {
    sessions,
    confirmed,
    onSession: async (s) => { sessions.push(s); },
    onConfirmed: async (n) => { confirmed.push(n); },
    onProgress: () => undefined,
  };
}

async function fake(): Promise<{ drive: FakeDrive; inbox: string; id: string }> {
  const drive = new FakeDrive({ chunkMultiple: 4 });
  const inbox = (await drive.createFolder('root', 'Inbox')).id;
  const [id] = await drive.generateIds(1);
  if (!id) throw new Error('no id');
  return { drive, inbox, id };
}

afterEach(() => vi.restoreAllMocks());

describe('the resumable protocol', () => {
  it('reads the bytes Drive holds from a Range header', () => {
    expect(confirmedFrom(null)).toBe(0);
    expect(confirmedFrom('bytes=0-3')).toBe(4);
    expect(confirmedFrom('nonsense')).toBe(0);
  });

  it('sends chunk by chunk and creates the file under its reserved id', async () => {
    const { drive, inbox, id } = await fake();
    const h = hooks();
    const file = await sendResumable(drive, { id, parentId: inbox, name: 'a.pdf', type: 'application/pdf', size: 10, sha256: HASH, body: new Blob([BYTES]), session: null, appProperties: { item: 'k' } }, h, 4);
    expect(file).toMatchObject({ id, name: 'a.pdf', parents: [inbox], size: 10, appProperties: { item: 'k' } });
    expect(h.sessions).toHaveLength(1);
    expect(h.confirmed).toEqual([0, 4, 8]);
    expect([...(await drive.readBytes(id))]).toEqual([...BYTES]);
  });

  it('a saved session resumes from the bytes Drive holds', async () => {
    const { drive, inbox, id } = await fake();
    const target = { id, parentId: inbox, name: 'a.pdf', type: '', size: 10, sha256: HASH };
    const session = await drive.openResumable(target);
    // The pretend Drive takes 4-byte units here, as the real one takes 256 KiB.
    await drive.putChunk(session, 0, new Blob([BYTES.slice(0, 4)]), 10);
    const from = drive.resumableCalls.length;
    const h = hooks();
    await sendResumable(drive, { ...target, body: new Blob([BYTES]), session }, h, 4);
    expect(drive.resumableCalls.slice(from).map((c) => `${c.op}${c.start ?? ''}`)).toEqual(['status', 'put4', 'put8']);
    expect(h.sessions).toEqual([]);
    expect([...(await drive.readBytes(id))]).toEqual([...BYTES]);
  });

  it('a file already made under the reserved id is read back, not made again', async () => {
    const { drive, inbox, id } = await fake();
    const target = { id, parentId: inbox, name: 'a.pdf', type: '', size: 10, sha256: HASH };
    await sendResumable(drive, { ...target, body: new Blob([BYTES]), session: null }, hooks(), 4);
    const again = await sendResumable(drive, { ...target, body: new Blob([BYTES]), session: null }, hooks(), 4);
    expect(again.id).toBe(id);
    expect(await drive.listAll(inbox)).toHaveLength(1);
  });

  it('a reserved id that holds something else is refused, saying what to do', async () => {
    const { drive, inbox, id } = await fake();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const target = { id, parentId: inbox, name: 'a.pdf', type: '', size: 10, sha256: HASH };
    await sendResumable(drive, { ...target, body: new Blob([BYTES]), session: null }, hooks(), 4);
    const wrong = sendResumable(drive, { ...target, size: 3, sha256: await sha256(new Blob([BYTES.slice(0, 3)])), body: new Blob([BYTES.slice(0, 3)]), session: null }, hooks(), 4);
    await expect(wrong).rejects.toBeInstanceOf(BowerError);
    await expect(wrong).rejects.toThrow('Google Drive has a different file where this one should go. Remove this one and add it again.');
  });

  it('a file already made under the reserved id and moved since counts as arrived', async () => {
    const { drive, inbox, id } = await fake();
    const target = { id, parentId: inbox, name: 'a.pdf', type: '', size: 10, sha256: HASH };
    await sendResumable(drive, { ...target, body: new Blob([BYTES]), session: null }, hooks(), 4);
    const elsewhere = (await drive.createFolder('root', 'Projects')).id;
    await drive.update(id, { addParent: elsewhere, removeParent: inbox });
    await expect(sendResumable(drive, { ...target, body: new Blob([BYTES]), session: null }, hooks(), 4)).resolves.toMatchObject({ id, parents: [elsewhere] });
  });

  it('a file read back under the reserved id must have the same content, not only the same size', async () => {
    const { drive, inbox, id } = await fake();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const target = { id, parentId: inbox, name: 'a.pdf', type: '', size: 10, sha256: HASH };
    await sendResumable(drive, { ...target, body: new Blob([BYTES]), session: null }, hooks(), 4);
    const other = new Blob([BYTES.map((b) => b + 1)]);
    await expect(sendResumable(drive, { ...target, sha256: await sha256(other), body: other, session: null }, hooks(), 4)).rejects.toBeInstanceOf(BowerError);
  });

  it('the pretend Drive refuses a chunk that is not a multiple of its unit, unless it is the last, and a size that changed', async () => {
    const drive = new FakeDrive();
    const inbox = (await drive.createFolder('root', 'Inbox')).id;
    const [id] = await drive.generateIds(1);
    const big = 256 * 1024 + 10;
    const session = await drive.openResumable({ id: id ?? '', parentId: inbox, name: 'a.pdf', type: '', size: big });
    await expect(drive.putChunk(session, 0, new Blob([new Uint8Array(1000)]), big)).rejects.toBeInstanceOf(BowerError);
    await expect(drive.putChunk(session, 0, new Blob([new Uint8Array(256 * 1024)]), big + 1)).rejects.toBeInstanceOf(BowerError);
    expect(await drive.putChunk(session, 0, new Blob([new Uint8Array(256 * 1024)]), big)).toEqual({ kind: 'partial', confirmed: 256 * 1024 });
    expect(await drive.putChunk(session, 256 * 1024, new Blob([new Uint8Array(10)]), big)).toMatchObject({ kind: 'done' });
  });

  it('the pretend Drive keeps reserved ids and open sessions across a reload', async () => {
    const { drive, inbox, id } = await fake();
    const target = { id, parentId: inbox, name: 'a.pdf', type: '', size: 10, sha256: HASH };
    const session = await drive.openResumable(target);
    await drive.putChunk(session, 0, new Blob([BYTES.slice(0, 4)]), 10);
    const [spare] = await drive.generateIds(1);
    const back = FakeDrive.restore(await drive.snapshot(), { chunkMultiple: 4 });
    expect(await back.sessionStatus(session, 10)).toEqual({ kind: 'partial', confirmed: 4 });
    await sendResumable(back, { ...target, body: new Blob([BYTES]), session }, hooks(), 4);
    expect([...(await back.readBytes(id))]).toEqual([...BYTES]);
    await expect(back.openResumable({ ...target, id: spare ?? '' })).resolves.toEqual(expect.any(String));
    const [next] = await back.generateIds(1);
    expect([id, spare]).not.toContain(next);
  });

  it('stops at once when asked to', async () => {
    const { drive, inbox, id } = await fake();
    const stop = new AbortController();
    stop.abort();
    const h = { ...hooks(), signal: stop.signal };
    await expect(sendResumable(drive, { id, parentId: inbox, name: 'a.pdf', type: '', size: 10, sha256: HASH, body: new Blob([BYTES]), session: null }, h, 4)).rejects.toMatchObject({ name: 'AbortError' });
    expect(drive.resumableCalls).toHaveLength(1);
  });
});

interface Call {
  method: string;
  url: URL;
  headers: Headers;
  body: unknown;
}

function http(handler: (c: Call) => Response): { drive: DriveHttp; calls: Call[] } {
  const calls: Call[] = [];
  const f = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const c: Call = { method: init?.method ?? 'GET', url: new URL(String(input)), headers: new Headers(init?.headers), body: init?.body };
    calls.push(c);
    return handler(c);
  };
  return { drive: new DriveHttp({ token: async () => 'token', fetch: f as typeof fetch }), calls };
}

const wire = { id: 'RESERVED_ID', name: 'a.pdf', mimeType: 'application/pdf', parents: ['INBOX_ID'], modifiedTime: '2026-10-06T10:00:00.000Z', createdTime: '2026-10-06T10:00:00.000Z', size: '10' };
const SESSION = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=SESSION_ID';

describe('DriveHttp resumable calls', () => {
  it('reserves ids with files.generateIds', async () => {
    const { drive, calls } = http(() => Response.json({ ids: ['ID_1', 'ID_2'], space: 'drive', kind: 'drive#generatedIds' }));
    expect(await drive.generateIds(2)).toEqual(['ID_1', 'ID_2']);
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.url.pathname).toBe('/drive/v3/files/generateIds');
    expect(Object.fromEntries(calls[0]?.url.searchParams ?? [])).toMatchObject({ count: '2', space: 'drive', type: 'files' });
  });

  it('opens a session that creates the reserved id', async () => {
    const { drive, calls } = http(() => new Response(null, { status: 200, headers: { location: SESSION } }));
    const session = await drive.openResumable({ id: 'RESERVED_ID', parentId: 'INBOX_ID', name: 'a.pdf', type: 'application/pdf', size: 10, appProperties: { item: 'k' } });
    expect(session).toBe(SESSION);
    const c = calls[0];
    expect(c?.method).toBe('POST');
    expect(c?.url.searchParams.get('uploadType')).toBe('resumable');
    expect(c?.headers.get('x-upload-content-length')).toBe('10');
    expect(c?.headers.get('x-upload-content-type')).toBe('application/pdf');
    expect(JSON.parse(String(c?.body))).toEqual({ id: 'RESERVED_ID', name: 'a.pdf', parents: ['INBOX_ID'], appProperties: { item: 'k' } });
  });

  it('a reserved id already used answers conflict', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { drive } = http(() => Response.json({ error: { code: 409 } }, { status: 409 }));
    await expect(drive.openResumable({ id: 'RESERVED_ID', parentId: 'INBOX_ID', name: 'a.pdf', type: '', size: 10 })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('reads where a session stands from each chunk', async () => {
    const unit = 256 * 1024;
    const size = unit + 10;
    const answers = [new Response(null, { status: 308, headers: { range: `bytes=0-${unit - 1}` } }), Response.json({ ...wire, size: String(size) }, { status: 200 }), new Response(null, { status: 404 }), new Response(null, { status: 410 })];
    const { drive, calls } = http(() => answers.shift() ?? new Response(null, { status: 500 }));
    expect(await drive.putChunk(SESSION, 0, new Blob([new Uint8Array(unit)]), size)).toEqual({ kind: 'partial', confirmed: unit });
    expect(calls[0]?.headers.get('content-range')).toBe(`bytes 0-${unit - 1}/${size}`);
    expect(await drive.putChunk(SESSION, unit, new Blob([BYTES]), size)).toMatchObject({ kind: 'done', file: { id: 'RESERVED_ID', size } });
    expect(await drive.sessionStatus(SESSION, size)).toEqual({ kind: 'expired' });
    expect(await drive.putChunk(SESSION, 0, new Blob([new Uint8Array(size)]), size)).toEqual({ kind: 'expired' });
    expect(calls[2]?.headers.get('content-range')).toBe(`bytes */${size}`);
  });

  it("never sends the token to a session address outside Google's upload service", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { drive, calls } = http(() => new Response(null, { status: 308 }));
    await expect(drive.sessionStatus('https://example.com/upload/drive/v3/files?upload_id=SESSION_ID', 10)).rejects.toBeInstanceOf(BowerError);
    await expect(drive.putChunk('https://www.googleapis.com.example.com/upload/x', 0, new Blob([BYTES]), 10)).rejects.toBeInstanceOf(BowerError);
    expect(calls).toEqual([]);
  });

  it('refuses a chunk that is not a multiple of 256 KiB unless it is the last', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { drive, calls } = http(() => new Response(null, { status: 308 }));
    await expect(drive.putChunk(SESSION, 0, new Blob([BYTES.slice(0, 4)]), 10)).rejects.toBeInstanceOf(BowerError);
    expect(calls).toEqual([]);
  });

  it('a busy or failing Drive is asked again with a growing wait, not given up at once', async () => {
    vi.useFakeTimers();
    try {
      const answers = [new Response(null, { status: 503 }), Response.json({ error: { errors: [{ reason: 'rateLimitExceeded' }] } }, { status: 403 }), new Response(null, { status: 429 }), new Response(null, { status: 308, headers: { range: 'bytes=0-3' } })];
      const { drive, calls } = http(() => answers.shift() ?? new Response(null, { status: 500 }));
      const asked = drive.sessionStatus(SESSION, 10).catch((e: unknown) => e);
      await vi.runAllTimersAsync();
      expect(await asked).toEqual({ kind: 'partial', confirmed: 4 });
      expect(calls).toHaveLength(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a session that answers 308 with no Range holds nothing yet', async () => {
    const { drive } = http(() => new Response(null, { status: 308 }));
    expect(await drive.sessionStatus(SESSION, 10)).toEqual({ kind: 'partial', confirmed: 0 });
  });
});
