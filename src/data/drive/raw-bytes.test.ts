import { afterEach, describe, expect, it, vi } from 'vitest';
import { BowerError } from '../types';
import { DriveHttp } from './drive-http';
import { FakeDrive } from './fake-drive';
import { RETRIES } from './transport';

// Expected bytes are literal source fixtures, not decoded/re-encoded implementation output.
const fixtures = [
  { name: 'binary', bytes: [0, 1, 2, 127, 128, 254, 255] },
  { name: 'invalid UTF-8', bytes: [255, 192, 175, 128] },
  { name: 'BOM CRLF Unicode', bytes: [239, 187, 191, 65, 13, 10, 195, 169, 240, 159, 170, 182] },
  { name: 'empty', bytes: [] },
] as const;
const text = '\ufeffA\r\né🪶';
const textBytes = [239, 187, 191, 65, 13, 10, 195, 169, 240, 159, 170, 182];
const unavailable = { code: 'unknown', message: "This device no longer has this file's contents." };
interface Call { url: URL; method: string; headers: Headers }

function http(response: () => Response | Promise<Response>) {
  const calls: Call[] = []; const asked: boolean[] = [];
  const transport: typeof fetch = async (input, init) => {
    calls.push({ url: new URL(String(input)), method: init?.method ?? 'GET', headers: new Headers(init?.headers) });
    return response();
  };
  const drive = new DriveHttp({ fetch: transport, token: async (fresh) => { asked.push(fresh); return fresh ? 'FRESH_SYNTHETIC_TOKEN' : 'SYNTHETIC_TOKEN'; } });
  return { drive, calls, asked };
}
async function attempt<T>(call: () => Promise<T>) {
  try { return { kind: 'resolved' as const, value: await call() }; }
  catch (error) { return { kind: 'rejected' as const, error }; }
}
interface Snapshot { v: number; files: Array<{ meta: { id: string }; content: unknown }> }
function storedContent(snapshot: string, id: string): unknown {
  return (JSON.parse(snapshot) as Snapshot).files.find((f) => f.meta.id === id)?.content;
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('drive raw bytes preserve source authority', () => {
  it.each(fixtures)('HTTP reads literal $name bytes through only the authenticated media route', async (fixture) => {
    const response = new Response(new Uint8Array(fixture.bytes));
    const decode = vi.spyOn(response, 'text');
    const array = vi.spyOn(response, 'arrayBuffer');
    const { drive, calls, asked } = http(() => response);
    const result = await attempt(() => drive.readBytes('FILE_A'));
    expect(result.kind).toBe('resolved'); if (result.kind !== 'resolved') return;
    expect(Array.from(result.value)).toEqual(fixture.bytes); expect(result.value).toBeInstanceOf(Uint8Array);
    expect(decode).not.toHaveBeenCalled(); expect(array).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(1); expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.url.origin).toBe('https://www.googleapis.com');
    expect(calls[0]?.url.pathname).toBe('/drive/v3/files/FILE_A');
    expect(calls[0]?.url.search).toBe('?alt=media'); expect(calls[0]?.headers.get('authorization')).toBe('Bearer SYNTHETIC_TOKEN');
    expect(asked).toEqual([false]);
  });

  it.each(fixtures)('FakeDrive upload retains literal $name bytes and independent repeated reads', async (fixture) => {
    const padded = new Uint8Array([99, ...fixture.bytes, 88]);
    const source = padded.subarray(1, padded.length - 1);
    const blob = new Blob([source]); const drive = new FakeDrive();
    const file = await drive.upload('root', 'Synthetic.bin', blob);
    padded.fill(42); // Blob construction captured only the original subarray bytes.
    const first = await attempt(() => drive.readBytes(file.id));
    expect(first.kind).toBe('resolved'); if (first.kind !== 'resolved') return;
    expect(Array.from(first.value)).toEqual(fixture.bytes);
    first.value.fill(33);
    expect(Array.from(await drive.readBytes(file.id))).toEqual(fixture.bytes);
    const back = FakeDrive.restore(await drive.snapshot());
    expect(Array.from(await back.readBytes(file.id))).toEqual(fixture.bytes);
    const second = await back.readBytes(file.id); second.fill(11);
    expect(Array.from(await drive.readBytes(file.id))).toEqual(fixture.bytes);
    expect(Array.from(await back.readBytes(file.id))).toEqual(fixture.bytes);
  });

  it('HTTP copies the body buffer across repeated reads and independent clients', async () => {
    const original = new Uint8Array([0, 255, 239, 187, 191, 13, 10]);
    const shared = original.buffer;
    const respond = () => { const res = new Response(null); vi.spyOn(res, 'arrayBuffer').mockResolvedValue(shared); return res; };
    const a = http(respond).drive; const b = http(respond).drive;
    const first = await attempt(() => a.readBytes('FILE_A'));
    expect(first.kind).toBe('resolved'); if (first.kind !== 'resolved') return;
    first.value.fill(32);
    expect(Array.from(original)).toEqual([0, 255, 239, 187, 191, 13, 10]);
    expect(Array.from(await a.readBytes('FILE_A'))).toEqual([0, 255, 239, 187, 191, 13, 10]);
    const other = await b.readBytes('FILE_A'); other[0] = 77;
    expect(Array.from(await a.readBytes('FILE_A'))).toEqual([0, 255, 239, 187, 191, 13, 10]);
  });

  it('keeps createText/readText semantics while raw text bytes retain BOM and CRLF', async () => {
    const drive = new FakeDrive(); const file = await drive.createText('root', 'Synthetic.md', text);
    const result = await attempt(() => drive.readBytes(file.id));
    expect(result.kind).toBe('resolved'); if (result.kind !== 'resolved') return;
    expect(Array.from(result.value)).toEqual(textBytes); expect(await drive.readText(file.id)).toBe(text);
    const restored = FakeDrive.restore(await drive.snapshot());
    expect(Array.from(await restored.readBytes(file.id))).toEqual(textBytes);
    expect(await restored.readText(file.id)).toBe(text);
    const folder = await drive.createFolder('root', 'Synthetic folder');
    expect(Array.from(await drive.readBytes(folder.id))).toEqual([]); expect(await drive.readText(folder.id)).toBe('');
    const empty = await drive.createText('root', 'Empty.md', '');
    expect(Array.from(await drive.readBytes(empty.id))).toEqual([]);
  });

  it('preserves existing decoded readText replacement/BOM behavior alongside exact media bytes', async () => {
    const data = new Uint8Array([239, 187, 191, 65, 13, 10, 255]);
    const client = http(() => new Response(data)).drive;
    const result = await attempt(() => client.readBytes('FILE_A'));
    expect(result.kind).toBe('resolved'); if (result.kind !== 'resolved') return;
    expect(Array.from(result.value)).toEqual([239, 187, 191, 65, 13, 10, 255]);
    expect(await client.readText('FILE_A')).toBe('A\r\n�');
    const fake = new FakeDrive(); const file = await fake.upload('root', 'Synthetic.bin', new Blob([data]));
    expect(Array.from(await fake.readBytes(file.id))).toEqual([239, 187, 191, 65, 13, 10, 255]);
    expect(await fake.readText(file.id)).toBe('A\r\n�');
  });

  it('refuses restored big placeholders through repeated v1 snapshots while metadata and Bin remain usable', async () => {
    const live = new FakeDrive(); const root = await live.createFolder('root', 'Synthetic folder');
    const parent = await live.createFolder('root', 'Other synthetic folder');
    const file = await live.upload(root.id, 'Large.bin', new Blob([new Uint8Array(256 * 1024 + 1).fill(165)], { type: 'application/octet-stream' }));
    const before = await attempt(() => live.readBytes(file.id));
    expect(before.kind).toBe('resolved'); if (before.kind !== 'resolved') return;
    expect(before.value.length).toBe(256 * 1024 + 1); expect(before.value.every((n) => n === 165)).toBe(true);
    let snapshot = await live.snapshot();
    for (let cycle = 0; cycle < 3; cycle++) {
      expect((JSON.parse(snapshot) as Snapshot).v).toBe(1);
      expect(storedContent(snapshot, file.id)).toEqual({ big: true, type: 'application/octet-stream' });
      const back = FakeDrive.restore(snapshot);
      await expect(back.readBytes(file.id)).rejects.toMatchObject(unavailable);
      expect(await back.readText(file.id)).toBe('A big file, kept by name only on the pretend Drive.');
      expect(await back.get(file.id)).toEqual(await live.get(file.id));
      snapshot = await back.snapshot();
    }
    const back = FakeDrive.restore(snapshot);
    const moved = await back.update(file.id, { name: 'Renamed.bin', removeParent: root.id, addParent: parent.id });
    expect(moved).toMatchObject({ name: 'Renamed.bin', parents: [parent.id], size: 256 * 1024 + 1 });
    await expect(back.readBytes(file.id)).rejects.toMatchObject(unavailable);
    await back.trash(file.id); await expect(back.readBytes(file.id)).rejects.toMatchObject({ code: 'not-found' });
    await expect(back.get(file.id)).rejects.toMatchObject({ code: 'not-found' });
    await back.untrash(file.id); await expect(back.readBytes(file.id)).rejects.toMatchObject(unavailable);
    expect((await back.get(file.id)).name).toBe('Renamed.bin');
  });

  it('clears unavailable bytes only after a successful actual fresh content write, not failed writes or metadata', async () => {
    const live = new FakeDrive(); const file = await live.upload('root', 'Large.bin', new Blob([new Uint8Array(256 * 1024 + 1)]));
    const back = FakeDrive.restore(await live.snapshot()); const seen = await back.get(file.id);
    back.failNext('offline'); await expect(back.writeText(file.id, text, seen.modifiedTime)).rejects.toMatchObject({ code: 'offline' });
    await expect(back.readBytes(file.id)).rejects.toMatchObject(unavailable);
    await expect(back.writeText(file.id, text, '2000-01-01T00:00:00.000Z')).rejects.toMatchObject({ code: 'conflict' });
    const updated = await back.update(file.id, { appProperties: { synthetic: 'kept' } });
    await expect(back.readBytes(file.id)).rejects.toMatchObject(unavailable);
    expect(storedContent(await back.snapshot(), file.id)).toEqual({ big: true, type: '' });
    await back.writeText(file.id, text, updated.modifiedTime);
    expect(Array.from(await back.readBytes(file.id))).toEqual(textBytes); expect(await back.readText(file.id)).toBe(text);
    expect(storedContent(await back.snapshot(), file.id)).toEqual({ text });
    expect(Array.from(await FakeDrive.restore(await back.snapshot()).readBytes(file.id))).toEqual(textBytes);
  });

  it('treats an explicitly written identical placeholder string as newly available source', async () => {
    const live = new FakeDrive(); const file = await live.upload('root', 'Large.bin', new Blob([new Uint8Array(256 * 1024 + 1)]));
    const back = FakeDrive.restore(await live.snapshot());
    await expect(back.readBytes(file.id)).rejects.toMatchObject(unavailable);
    const placeholder = await back.readText(file.id);
    await back.writeText(file.id, placeholder, (await back.get(file.id)).modifiedTime);
    expect(Array.from(await back.readBytes(file.id))).toEqual([65,32,98,105,103,32,102,105,108,101,44,32,107,101,112,116,32,98,121,32,110,97,109,101,32,111,110,108,121,32,111,110,32,116,104,101,32,112,114,101,116,101,110,100,32,68,114,105,118,101,46]);
  });

  it('refuses an old v1 repeated-snapshot placeholder even after its big marker was lost', async () => {
    // The old restore→snapshot producer stored its small placeholder as b64,
    // while retaining the original large metadata size. This is literal old wire.
    const record = { v: 1, seq: 1, last: 1791194400001, files: [{
      meta: { id: 'root', name: 'My Drive', folder: true, parents: [], createdTime: '2026-10-05T10:00:00.000Z', modifiedTime: '2026-10-05T10:00:00.000Z' },
      trashed: false, content: null,
    }, {
      meta: { id: 'f1', name: 'Large.bin', folder: false, parents: ['root'], createdTime: '2026-10-05T10:00:00.001Z', modifiedTime: '2026-10-05T10:00:00.001Z', size: 262145 },
      trashed: false, content: { b64: 'QSBiaWcgZmlsZSwga2VwdCBieSBuYW1lIG9ubHkgb24gdGhlIHByZXRlbmQgRHJpdmUu', type: 'application/octet-stream' },
    }] };
    const drive = FakeDrive.restore(JSON.stringify(record));
    await expect(drive.readBytes('f1')).rejects.toMatchObject(unavailable);
    expect(await drive.readText('f1')).toBe('A big file, kept by name only on the pretend Drive.');
    expect((await drive.get('f1')).size).toBe(262145);
    expect(storedContent(await drive.snapshot(), 'f1')).toEqual({ big: true, type: 'application/octet-stream' });
  });

  it.each(['offline', 'auth', 'not-found'] as const)('FakeDrive preserves its existing %s gate and not-found Bin behavior', async (code) => {
    const drive = new FakeDrive(); const file = await drive.createText('root', 'Synthetic.md', 'A');
    drive.failNext(code); await expect(drive.readBytes(file.id)).rejects.toMatchObject({ code });
    expect(Array.from(await drive.readBytes(file.id))).toEqual([65]);
    await drive.trash(file.id); await expect(drive.readBytes(file.id)).rejects.toMatchObject({ code: 'not-found' });
    await drive.untrash(file.id); expect(Array.from(await drive.readBytes(file.id))).toEqual([65]);
  });

  it('HTTP refreshes once for 401 then returns unchanged bytes using the fresh token', async () => {
    let count = 0; const { drive, calls, asked } = http(() => count++ === 0 ? new Response(null, { status: 401 }) : new Response(new Uint8Array([255, 0])));
    const result = await attempt(() => drive.readBytes('FILE_A'));
    expect(result.kind).toBe('resolved'); if (result.kind !== 'resolved') return;
    expect(Array.from(result.value)).toEqual([255, 0]); expect(asked).toEqual([false, true]); expect(calls).toHaveLength(2);
    expect(calls[1]?.headers.get('authorization')).toBe('Bearer FRESH_SYNTHETIC_TOKEN');
  });

  it('HTTP keeps auth, missing-file and offline transport refusals', async () => {
    const auth = http(() => new Response(null, { status: 401 }));
    await expect(auth.drive.readBytes('FILE_A')).rejects.toMatchObject({ code: 'auth' });
    expect(auth.asked).toEqual([false, true]); expect(auth.calls).toHaveLength(2);
    const missing = http(() => new Response(null, { status: 404 }));
    await expect(missing.drive.readBytes('FILE_A')).rejects.toMatchObject({ code: 'not-found' }); expect(missing.calls).toHaveLength(1);
    const offline = http(() => { throw new TypeError('Synthetic transport offline'); });
    // A read is sent again on the network, as every idempotent request is (`transport.ts`), then told offline.
    await expect(offline.drive.readBytes('FILE_A')).rejects.toMatchObject({ code: 'offline' }); expect(offline.calls).toHaveLength(1 + RETRIES);
  });

  it.each([
    { error: new Error('Synthetic unreadable body'), code: 'unknown' },
    { error: new TypeError('Synthetic interrupted body'), code: 'offline' },
    { error: new BowerError('auth', 'Synthetic authorization refused.'), code: 'auth' },
  ])('logs and types HTTP body failure $code without additional dispatch or false bytes', async ({ error, code }) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = new Response(null); vi.spyOn(response, 'arrayBuffer').mockRejectedValue(error);
    const { drive, calls } = http(() => response);
    await expect(drive.readBytes('FILE_A')).rejects.toMatchObject({ code });
    expect(log).toHaveBeenCalledWith(error); expect(calls).toHaveLength(1);
  });

  it('logs and types actual fake Blob read failure while retaining the stored source and metadata', async () => {
    const drive = new FakeDrive(); const body = new Blob([new Uint8Array([255, 0])]);
    const file = await drive.upload('root', 'Synthetic.bin', body); const error = new Error('Synthetic unreadable blob');
    vi.spyOn(body, 'arrayBuffer').mockRejectedValueOnce(error);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(drive.readBytes(file.id)).rejects.toMatchObject({ code: 'unknown' }); expect(log).toHaveBeenCalledWith(error);
    expect(await drive.get(file.id)).toEqual(file); expect(Array.from(await drive.readBytes(file.id))).toEqual([255, 0]);
  });
});
