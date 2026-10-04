import { afterEach, describe, expect, it, vi } from 'vitest';
import { DriveHttp } from './drive-http';

interface Call {
  method: string;
  url: URL;
  headers: Headers;
  body: unknown;
}

type Handler = (c: Call) => Response | Promise<Response>;

function stub(handler: Handler): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const f = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const c: Call = { method: init?.method ?? 'GET', url: new URL(String(input)), headers: new Headers(init?.headers), body: init?.body };
    calls.push(c);
    return handler(c);
  };
  return { fetch: f as typeof fetch, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const file = (id: string, name: string, parent: string, folder = false) => ({
  id,
  name,
  mimeType: folder ? 'application/vnd.google-apps.folder' : 'text/markdown',
  parents: [parent],
  modifiedTime: '2026-10-04T10:00:00.000Z',
  createdTime: '2026-10-04T09:00:00.000Z',
  size: '5',
});

const tokens = () => {
  const asked: boolean[] = [];
  return { asked, token: async (fresh: boolean) => (asked.push(fresh), fresh ? 'fresh-token' : 'old-token') };
};

afterEach(() => vi.useRealTimers());

describe('DriveHttp', () => {
  it('listAll follows pages and batches parents', async () => {
    const folders = Array.from({ length: 45 }, (_, i) => file(`d${i}`, `Folder ${i}`, 'ROOT', true));
    const leaves = [file('x1', 'a.md', 'd3'), file('x2', 'b.md', 'd44')];
    const s = stub((c) => {
      const q = c.url.searchParams.get('q') ?? '';
      const ids = [...q.matchAll(/'([^']+)' in parents/g)].map((m) => m[1]);
      const all = [...folders, ...leaves].filter((f) => ids.includes(f.parents[0]));
      const page = c.url.searchParams.get('pageToken') === 'p2' ? 1 : 0;
      const slice = all.slice(page * 30, page * 30 + 30);
      return json({ files: slice, ...(page === 0 && all.length > 30 ? { nextPageToken: 'p2' } : {}) });
    });
    const d = new DriveHttp({ token: tokens().token, fetch: s.fetch });
    const out = await d.listAll('ROOT');
    expect(out).toHaveLength(47);
    expect(out.filter((f) => f.folder)).toHaveLength(45);
    expect(out.find((f) => f.id === 'x1')).toMatchObject({ name: 'a.md', folder: false, parents: ['d3'], size: 5 });
    const qs = s.calls.map((c) => c.url.searchParams.get('q') ?? '');
    expect(qs.every((q) => q.includes('trashed = false'))).toBe(true);
    // Root: two pages. Then the 45 folders in batches of 40 and 5.
    expect(s.calls).toHaveLength(4);
    expect([...(qs[2] ?? '').matchAll(/ in parents/g)]).toHaveLength(40);
    expect([...(qs[3] ?? '').matchAll(/ in parents/g)]).toHaveLength(5);
    expect(s.calls[0]?.headers.get('authorization')).toBe('Bearer old-token');
  });

  it('401 refreshes once then fails with auth', async () => {
    const t = tokens();
    const s = stub(() => new Response('', { status: 401 }));
    const d = new DriveHttp({ token: t.token, fetch: s.fetch });
    await expect(d.get('f1')).rejects.toMatchObject({ code: 'auth', message: 'Sign in again to keep going.' });
    expect(t.asked).toEqual([false, true]);
    expect(s.calls[1]?.headers.get('authorization')).toBe('Bearer fresh-token');
  });

  it('a 401 then a fresh token goes through', async () => {
    let n = 0;
    const s = stub(() => (n++ === 0 ? new Response('', { status: 401 }) : json(file('f1', 'a.md', 'ROOT'))));
    const d = new DriveHttp({ token: tokens().token, fetch: s.fetch });
    await expect(d.get('f1')).resolves.toMatchObject({ id: 'f1' });
  });

  it('429 retries then succeeds', async () => {
    vi.useFakeTimers();
    let n = 0;
    const s = stub(() => (n++ < 2 ? new Response('', { status: 429 }) : json(file('f1', 'a.md', 'ROOT'))));
    const d = new DriveHttp({ token: tokens().token, fetch: s.fetch });
    const p = d.get('f1');
    await vi.advanceTimersByTimeAsync(1600);
    await expect(p).resolves.toMatchObject({ id: 'f1' });
    expect(s.calls).toHaveLength(3);
  });

  it('a rate-limit 403 is retried, then gives up with unknown', async () => {
    vi.useFakeTimers();
    const s = stub(() => json({ error: { errors: [{ reason: 'userRateLimitExceeded' }] } }, 403));
    const d = new DriveHttp({ token: tokens().token, fetch: s.fetch });
    const p = d.get('f1');
    const seen = expect(p).rejects.toMatchObject({ code: 'unknown' });
    await vi.advanceTimersByTimeAsync(4000);
    await seen;
    expect(s.calls).toHaveLength(4);
  });

  it('a network TypeError rejects offline', async () => {
    const s = stub(() => {
      throw new TypeError('Failed to fetch');
    });
    const d = new DriveHttp({ token: tokens().token, fetch: s.fetch });
    await expect(d.listAll('ROOT')).rejects.toMatchObject({ code: 'offline' });
  });

  it('404 rejects not-found', async () => {
    const s = stub(() => json({ error: { code: 404 } }, 404));
    const d = new DriveHttp({ token: tokens().token, fetch: s.fetch });
    await expect(d.readText('gone')).rejects.toMatchObject({ code: 'not-found' });
  });

  it('upload over 5 MB is resumable in chunks and reports progress', async () => {
    const size = 10 * 1024 * 1024;
    const s = stub((c) => {
      if (c.method === 'POST') return new Response('', { status: 200, headers: { location: 'https://upload.example/session/1' } });
      const range = c.headers.get('content-range') ?? '';
      if (range.startsWith('bytes 0-')) return new Response('', { status: 308 });
      return json(file('up1', 'video.mp4', 'ROOT'));
    });
    const d = new DriveHttp({ token: tokens().token, fetch: s.fetch });
    const seen: number[] = [];
    const out = await d.upload('ROOT', 'video.mp4', new Blob([new Uint8Array(size)]), (p) => seen.push(p));
    expect(out.id).toBe('up1');
    expect(s.calls[0]?.url.searchParams.get('uploadType')).toBe('resumable');
    expect(s.calls.slice(1).map((c) => c.headers.get('content-range'))).toEqual([
      `bytes 0-${8 * 1024 * 1024 - 1}/${size}`,
      `bytes ${8 * 1024 * 1024}-${size - 1}/${size}`,
    ]);
    expect(seen).toEqual([0.8, 1]);
  });

  it('a small upload is one multipart request', async () => {
    const s = stub(() => json(file('up2', 'photo.jpg', 'ROOT')));
    const d = new DriveHttp({ token: tokens().token, fetch: s.fetch });
    await d.upload('ROOT', 'photo.jpg', new Blob(['jpeg']));
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]?.url.searchParams.get('uploadType')).toBe('multipart');
    expect(s.calls[0]?.headers.get('content-type')).toMatch(/^multipart\/related; boundary=/);
  });

  it('writeText checks modifiedTime and rejects conflict', async () => {
    const s = stub(() => json({ ...file('f1', 'a.md', 'ROOT'), modifiedTime: '2026-10-04T11:00:00.000Z' }));
    const d = new DriveHttp({ token: tokens().token, fetch: s.fetch });
    await expect(d.writeText('f1', 'new', '2026-10-04T10:00:00.000Z')).rejects.toMatchObject({ code: 'conflict' });
    expect(s.calls.every((c) => c.method === 'GET')).toBe(true);
  });

  it('writeText with the same modifiedTime sends the text', async () => {
    const s = stub((c) => json({ ...file('f1', 'a.md', 'ROOT'), ...(c.method === 'PATCH' ? { modifiedTime: '2026-10-04T12:00:00.000Z' } : {}) }));
    const d = new DriveHttp({ token: tokens().token, fetch: s.fetch });
    const out = await d.writeText('f1', 'new text', '2026-10-04T10:00:00.000Z');
    expect(out.modifiedTime).toBe('2026-10-04T12:00:00.000Z');
    const patch = s.calls.find((c) => c.method === 'PATCH');
    expect(patch?.url.searchParams.get('uploadType')).toBe('media');
    expect(patch?.body).toBe('new text');
  });

  it('update sends addParents and removeParents', async () => {
    const s = stub(() => json(file('f1', 'b.md', 'B')));
    const d = new DriveHttp({ token: tokens().token, fetch: s.fetch });
    await d.update('f1', { name: 'b.md', addParent: 'B', removeParent: 'A' });
    const c = s.calls[0];
    expect(c?.method).toBe('PATCH');
    expect(c?.url.searchParams.get('addParents')).toBe('B');
    expect(c?.url.searchParams.get('removeParents')).toBe('A');
    expect(JSON.parse(String(c?.body))).toEqual({ name: 'b.md' });
  });

  it('trash sends trashed true, never a delete', async () => {
    const s = stub(() => json(file('f1', 'a.md', 'ROOT')));
    const d = new DriveHttp({ token: tokens().token, fetch: s.fetch });
    await d.trash('f1');
    expect(s.calls[0]?.method).toBe('PATCH');
    expect(JSON.parse(String(s.calls[0]?.body))).toEqual({ trashed: true });
  });

  it('a 5xx on a create is not sent again, so it never makes two files', async () => {
    const s = stub(() => new Response('', { status: 503 }));
    const d = new DriveHttp({ token: tokens().token, fetch: s.fetch });
    await expect(d.createText('ROOT', 'a.md', 'x')).rejects.toMatchObject({ code: 'unknown' });
    expect(s.calls).toHaveLength(1);
  });

  it('full-text search reads at most two pages', async () => {
    const s = stub((c) => (c.url.searchParams.get('q')?.startsWith('fullText') ? json({ files: [file('h', 'a.md', 'ROOT')], nextPageToken: 'more' }) : json({ files: [file('h', 'a.md', 'ROOT')] })));
    const d = new DriveHttp({ token: tokens().token, fetch: s.fetch });
    await d.fullText('ROOT', 'rent');
    expect(s.calls.filter((c) => c.url.searchParams.get('q')?.startsWith('fullText'))).toHaveLength(2);
  });
});
