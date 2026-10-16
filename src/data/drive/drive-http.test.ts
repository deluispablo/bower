import { afterEach, describe, expect, it, vi } from 'vitest';
import { DriveHttp } from './drive-http';
import { failureKind, isNoAnswer, isUnconfirmedWrite } from './transport';
import { CHANGED_ELSEWHERE, checkStillAsSeen, notAsSeenReason, type NotAsSeenReason } from '../contracts/still-as-seen';
import { BowerError } from '../types';
import { FakeDrive } from './fake-drive';
import { describeB1PortsContract, makeB1Drive } from './drive-contract';

describeB1PortsContract('http', (prefix) => makeB1Drive('http', {
  restore: (snapshot, options) => FakeDrive.restore(snapshot, options),
  http: (options) => new DriveHttp(options),
}, prefix));

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

  it('Drive never retries a client error other than 429', async () => {
    for (const status of [400, 403, 404, 409]) {
      const s = stub(() => json({ error: { code: status, errors: [{ reason: 'forbidden' }] } }, status));
      const t = tokens();
      const d = new DriveHttp({ token: t.token, fetch: s.fetch });
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await expect(d.get('f1')).rejects.toBeInstanceOf(Error);
      expect(s.calls, `status ${status}`).toHaveLength(1);
      expect(t.asked).toEqual([false]);
    }
    // 401: one fresh token, one more try.
    const u = stub(() => new Response('', { status: 401 }));
    const t = tokens();
    await expect(new DriveHttp({ token: t.token, fetch: u.fetch }).get('f1')).rejects.toMatchObject({ code: 'auth' });
    expect(u.calls).toHaveLength(2);
    expect(t.asked).toEqual([false, true]);
    // 5xx keeps its three growing waits.
    vi.useFakeTimers();
    const e = stub(() => new Response('', { status: 503 }));
    const p = new DriveHttp({ token: tokens().token, fetch: e.fetch }).get('f1');
    const seen = expect(p).rejects.toMatchObject({ code: 'unknown' });
    await vi.advanceTimersByTimeAsync(4000);
    await seen;
    expect(e.calls).toHaveLength(4);
  });

  it('a network TypeError rejects offline with no real wait', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const s = stub(() => {
      throw new TypeError('Failed to fetch');
    });
    const d = new DriveHttp({ token: tokens().token, fetch: s.fetch, pacing: { baseMs: 0 } });
    const t0 = Date.now();
    await expect(d.listAll('ROOT')).rejects.toMatchObject({ code: 'offline' });
    // The backoff is the client's option: a zero base waits nothing (measured, not the 1.3 s of the real one).
    expect(Date.now() - t0).toBeLessThan(250);
  });

  it('404 rejects not-found', async () => {
    const s = stub(() => json({ error: { code: 404 } }, 404));
    const d = new DriveHttp({ token: tokens().token, fetch: s.fetch });
    await expect(d.readText('gone')).rejects.toMatchObject({ code: 'not-found' });
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

  it('untrash puts the name in the patch body', async () => {
    const s = stub(() => json(file('f1', 'Passport renewal 2.md', 'ROOT')));
    const d = new DriveHttp({ token: tokens().token, fetch: s.fetch });
    await d.untrash('f1', { bowerOp: 'op' }, 'Passport renewal 2.md');
    expect(s.calls[0]?.method).toBe('PATCH');
    expect(JSON.parse(String(s.calls[0]?.body))).toEqual({ trashed: false, name: 'Passport renewal 2.md', appProperties: { bowerOp: 'op' } });
  });

  it('a 5xx on a create is not sent again, so it never makes two files', async () => {
    const s = stub(() => new Response('', { status: 503 }));
    const d = new DriveHttp({ token: tokens().token, fetch: s.fetch });
    await expect(d.createText('ROOT', 'a.md', 'x')).rejects.toMatchObject({ code: 'unknown' });
    expect(s.calls).toHaveLength(1);
  });

  describe('what the person is told when Drive does not answer well', () => {
    const READ = "Google Drive didn't answer. Try again.";
    const WRITE = "Bower couldn't confirm that change. Refresh to check.";
    const writes: [string, (d: DriveHttp) => Promise<unknown>][] = [
      ['writeText', (d) => d.writeText('f1', 'x', '2026-10-04T10:00:00.000Z')],
      ['update', (d) => d.update('f1', { name: 'b.md' })],
      ['trash', (d) => d.trash('f1')],
      ['untrash', (d) => d.untrash('f1')],
      ['createText', (d) => d.createText('ROOT', 'a.md', 'x')],
    ];
    const drive = (status: number): { d: DriveHttp; s: ReturnType<typeof stub> } => {
      // A GET (the write's own read of the file) answers; the write itself gets `status`.
      const s = stub((c) => (c.method === 'GET' ? json(file('f1', 'a.md', 'ROOT')) : new Response('', { status })));
      return { d: new DriveHttp({ token: tokens().token, fetch: s.fetch }), s };
    };

    it.each(writes)('a write whose outcome is unknown says Bower could not confirm it (%s answered 503)', async (_name, run) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { d, s } = drive(503);
      const e = await run(d).catch((x: unknown) => x);
      expect(e).toMatchObject({ code: 'unknown', message: WRITE });
      expect(isUnconfirmedWrite(e)).toBe(true);
      expect(s.calls.filter((c) => c.method !== 'GET')).toHaveLength(1);
    });

    it('a write refused with a client error, or by its fence, never says it could not confirm', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      for (const [, run] of writes) {
        const e = await run(drive(400).d).catch((x: unknown) => x);
        expect(e).toMatchObject({ code: 'unknown', message: READ });
        expect(isUnconfirmedWrite(e)).toBe(false);
      }
      const stale = await drive(503).d.writeText('f1', 'x', '2020-01-01T00:00:00.000Z').catch((x: unknown) => x);
      expect(stale).toMatchObject({ code: 'conflict' });
      expect(isUnconfirmedWrite(stale)).toBe(false);
    });

    it('a write that times out says Bower could not confirm it', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.useFakeTimers();
      const s = stub((c) => (c.method === 'GET' ? json(file('f1', 'a.md', 'ROOT')) : new Promise<Response>(() => undefined)));
      const p = new DriveHttp({ token: tokens().token, fetch: s.fetch }).update('f1', { name: 'b.md' }).catch((x: unknown) => x);
      await vi.advanceTimersByTimeAsync(120_000);
      const e = await p;
      expect(e).toMatchObject({ code: 'unknown', message: WRITE });
      expect(isUnconfirmedWrite(e)).toBe(true);
    });

    it.each([['browser'], ['headless']] as const)('a write with a network error says Bower could not confirm it (%s)', async (context) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const s = stub((c) => {
        if (c.method === 'GET') return json(file('f1', 'a.md', 'ROOT'));
        throw new TypeError('Failed to fetch');
      });
      const e = await new DriveHttp({ token: tokens().token, fetch: s.fetch, context }).update('f1', { name: 'b.md' }).catch((x: unknown) => x);
      expect(e).toMatchObject({ code: 'unknown', message: WRITE });
      expect(isUnconfirmedWrite(e)).toBe(true);
      expect(s.calls.filter((c) => c.method !== 'GET')).toHaveLength(1);
    });

    it('a write tried while known offline says you are offline', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      const s = stub((c) => {
        if (c.method === 'GET') return json(file('f1', 'a.md', 'ROOT'));
        throw new TypeError('Failed to fetch');
      });
      const e = await new DriveHttp({ token: tokens().token, fetch: s.fetch }).update('f1', { name: 'b.md' }).catch((x: unknown) => x);
      online.mockRestore();
      expect(e).toMatchObject({ code: 'offline', message: "You're offline. Try again when you're back." });
      expect(isUnconfirmedWrite(e)).toBe(false);
    });

    it('a read with no answer still says Google Drive did not answer', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.useFakeTimers();
      const s = stub(() => new Response('', { status: 503 }));
      const p = new DriveHttp({ token: tokens().token, fetch: s.fetch }).get('f1').catch((x: unknown) => x);
      await vi.advanceTimersByTimeAsync(4000);
      const e = await p;
      expect(e).toMatchObject({ code: 'unknown', message: READ });
      expect(isUnconfirmedWrite(e)).toBe(false);
    });
  });

  it('full-text search reads at most two pages', async () => {
    const s = stub((c) => (c.url.searchParams.get('q')?.startsWith('fullText') ? json({ files: [file('h', 'a.md', 'ROOT')], nextPageToken: 'more' }) : json({ files: [file('h', 'a.md', 'ROOT')] })));
    const d = new DriveHttp({ token: tokens().token, fetch: s.fetch });
    await d.fullText('ROOT', 'rent');
    expect(s.calls.filter((c) => c.url.searchParams.get('q')?.startsWith('fullText'))).toHaveLength(2);
  });
  it('full-text search scopes its pages to the selected folder', async () => {
    const wanted = file('wanted', 'rent.md', 'ROOT');
    const s = stub((c) => {
      const q = c.url.searchParams.get('q') ?? '';
      if (!q.startsWith('fullText')) return json({ files: [wanted] });
      if (q.includes("'ROOT' in parents")) return json({ files: [wanted] });
      // Two pages of unrelated matches precede Bower's match in a global query.
      return json({ files: [file('outside', 'rent.md', 'UNRELATED')], nextPageToken: 'more' });
    });
    const d = new DriveHttp({ token: tokens().token, fetch: s.fetch });
    expect((await d.fullText('ROOT', 'rent')).map((f) => f.id)).toEqual(['wanted']);
    const queries = s.calls.filter((c) => c.url.searchParams.get('q')?.startsWith('fullText'));
    expect(queries).toHaveLength(1);
    expect(queries[0]?.url.searchParams.get('q')).toContain("'ROOT' in parents");
  });

  it('full-text search scopes every descendant-parent batch', async () => {
    const folders = Array.from({ length: 45 }, (_, i) => file(`d${i}`, `Folder ${i}`, 'ROOT', true));
    const leaves = [file('root-hit', 'rent.md', 'ROOT'), file('deep-hit', 'rent.md', 'd44')];
    const s = stub((c) => {
      const q = c.url.searchParams.get('q') ?? '';
      const parents = [...q.matchAll(/'([^']+)' in parents/g)].map((m) => m[1]);
      if (q.startsWith('fullText')) return json({ files: leaves.filter((f) => parents.includes(f.parents[0])), nextPageToken: 'more' });
      return json({ files: [...folders, ...leaves].filter((f) => parents.includes(f.parents[0])) });
    });
    const d = new DriveHttp({ token: tokens().token, fetch: s.fetch });
    expect((await d.fullText('ROOT', 'rent')).map((f) => f.id)).toEqual(['root-hit', 'deep-hit']);
    const queries = s.calls.filter((c) => c.url.searchParams.get('q')?.startsWith('fullText'));
    expect(queries).toHaveLength(4); // Two batches, at most two pages apiece.
    const searched = new Set<string>();
    for (const q of queries) {
      const ids = [...(q.url.searchParams.get('q') ?? '').matchAll(/'([^']+)' in parents/g)].map((m) => m[1] ?? '');
      expect(ids.length).toBeLessThanOrEqual(40);
      ids.forEach((id) => searched.add(id));
    }
    expect([...searched].sort()).toEqual(['ROOT', ...folders.map((f) => f.id)].sort());
  });

  it('full-text search follows a move into a folder created after the listing', async () => {
    let note = file('existing', 'Note.md', 'ROOT');
    let folder: ReturnType<typeof file> | null = null;
    const s = stub((c) => {
      if (c.method === 'POST') {
        folder = file('new-folder', 'New place', 'ROOT', true);
        return json(folder);
      }
      if (c.method === 'PATCH') {
        note = { ...note, parents: [c.url.searchParams.get('addParents') ?? 'ROOT'] };
        return json(note);
      }
      const q = c.url.searchParams.get('q') ?? '';
      const parents = [...q.matchAll(/'([^']+)' in parents/g)].map((m) => m[1]);
      const all = folder ? [folder, note] : [note];
      return json({ files: all.filter((f) => (!q.startsWith('fullText') || f.id === note.id) && parents.includes(f.parents[0])) });
    });
    const d = new DriveHttp({ token: tokens().token, fetch: s.fetch });
    await d.listAll('ROOT');
    const made = await d.createFolder('ROOT', 'New place');
    await d.update('existing', { addParent: made.id, removeParent: 'ROOT' });
    expect((await d.fullText('ROOT', 'body-only-word')).map((f) => f.id)).toEqual(['existing']);
    const full = s.calls.find((c) => c.url.searchParams.get('q')?.startsWith('fullText'));
    expect(full?.url.searchParams.get('q')).toContain("'new-folder' in parents");
  });

  it('full-text search sees new uploads and relists after binning or restoring them', async () => {
    const sends: Array<(drive: DriveHttp) => Promise<unknown>> = [
      (d) => d.createText('ROOT', 'Created.md', 'matching words'),
      (d) => d.putChunk('https://www.googleapis.com/upload/session', 0, new Blob(['matching words']), 14),
    ];
    for (const send of sends) {
      const made = file('added', 'Thing.md', 'ROOT');
      let arrived = false;
      let binned = false;
      let lists = 0;
      const s = stub((c) => {
        if (c.method === 'POST' && c.url.searchParams.get('uploadType') === 'resumable') return new Response(null, { status: 200, headers: { location: 'https://upload.example/session' } });
        if (c.method === 'POST' || c.method === 'PUT') {
          arrived = true;
          return json(made);
        }
        if (c.method === 'PATCH') {
          binned = (JSON.parse(String(c.body)) as { trashed: boolean }).trashed;
          return json(made);
        }
        const q = c.url.searchParams.get('q') ?? '';
        if (!q.startsWith('fullText')) lists++;
        return json({ files: arrived && !binned ? [made] : [] });
      });
      const d = new DriveHttp({ token: tokens().token, fetch: s.fetch });
      await d.listAll('ROOT');
      await send(d);
      expect((await d.fullText('ROOT', 'matching')).map((f) => f.id)).toEqual(['added']);
      expect(lists).toBe(2);
      await d.trash('added');
      expect(await d.fullText('ROOT', 'matching')).toEqual([]);
      expect(lists).toBe(3);
      await d.untrash('added');
      expect((await d.fullText('ROOT', 'matching')).map((f) => f.id)).toEqual(['added']);
      expect(lists).toBe(4);
    }
  });

});

/**
 * c4-retry-fence (TL-P4-24 finding 1, defect transport-retry-skips-fence): a write to an existing file is resent after an
 * answer that says it did not land only after its caller's fence passes again, right before the resend.
 */
describe('a resend of a write to an existing file', () => {
  const T1 = '2026-10-04T10:00:00.000Z';
  const T2 = '2026-10-04T11:00:00.000Z';
  const pacing = { baseMs: 0, sleep: async (): Promise<void> => undefined };
  const rateLimit = (reason: string | null): Response =>
    json({ error: { code: reason ? 403 : 429, message: 'Slow down.', errors: reason ? [{ domain: 'usageLimits', reason }] : [] } }, reason ? 403 : 429);
  /** The first answer to the write: each one that says it did not land, and a 401 the transport refreshes the token for. */
  const refusals: [string, () => Response][] = [
    ['429', () => rateLimit(null)],
    ['403 rateLimitExceeded', () => rateLimit('rateLimitExceeded')],
    ['403 userRateLimitExceeded', () => rateLimit('userRateLimitExceeded')],
    ['401 then a refresh', () => new Response('', { status: 401 })],
  ];
  type Fence = () => Promise<void>;
  const existing: [string, (d: DriveHttp, opts: { fence?: Fence }) => Promise<unknown>][] = [
    ['writeText', (d, o) => d.writeText('f1', 'bower body', T1, undefined, o)],
    ['writeText with properties (multipart PATCH)', (d, o) => d.writeText('f1', 'bower body', T1, { bowerOp: 'op' }, o)],
    ['update', (d, o) => d.update('f1', { name: 'b.md' }, o)],
    ['trash', (d, o) => d.trash('f1', undefined, o)],
    ['untrash', (d, o) => d.untrash('f1', undefined, undefined, o)],
  ];
  /** What changes elsewhere while the refusal is answered: its modifiedTime, its name or its folder. */
  const changes: [string, NotAsSeenReason, (f: ReturnType<typeof file>) => void][] = [
    ['modifiedTime', 'modified', (f) => void (f.modifiedTime = T2)],
    ['name', 'name', (f) => void (f.name = 'Renamed elsewhere.md')],
    ['parents', 'parents', (f) => void (f.parents = ['OTHER'])],
  ];

  /** A Drive holding one file: reads answer it as stored; the first write gets `first`, later writes land. */
  function drive(first: () => Response, change?: (f: ReturnType<typeof file>) => void) {
    const stored = { ...file('f1', 'a.md', 'ROOT'), modifiedTime: T1 };
    const seen = { landed: 0, fences: 0, fencesAtFirstSend: -1 };
    let writes = 0;
    const s = stub((c) => {
      if (c.method === 'GET') return json(stored);
      if (++writes === 1) {
        seen.fencesAtFirstSend = seen.fences;
        change?.(stored);
        return first();
      }
      seen.landed++;
      return json(stored);
    });
    const d = new DriveHttp({ token: tokens().token, fetch: s.fetch, context: 'headless', pacing });
    const fence: Fence = async () => {
      seen.fences++;
      await checkStillAsSeen({ id: 'f1', name: 'a.md', parents: ['ROOT'], modifiedTime: T1 }, () => d.get('f1', { binned: true }), CHANGED_ELSEWHERE, { unanswered: isNoAnswer });
    };
    const sent = (): number => s.calls.filter((c) => c.method !== 'GET').length;
    return { d, fence, seen, sent, stored };
  }

  const rows = existing.flatMap(([write, run]) => refusals.flatMap(([refusal, first]) => changes.map(([what, reason, change]) => ({ write, run, refusal, first, what, reason, change }))));
  it.each(rows)('a resent write to an existing file runs its fence first ($write, $refusal, $what changed)', async ({ run, first, reason, change }) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { d, fence, seen, sent } = drive(first, change);
    const e = await run(d, { fence }).catch((x: unknown) => x);
    expect(notAsSeenReason(e)).toBe(reason);
    expect(e).toMatchObject({ message: CHANGED_ELSEWHERE });
    expect(sent()).toBe(1);
    expect(seen.landed).toBe(0);
    expect(seen.fences).toBe(1);
    expect(seen.fencesAtFirstSend).toBe(0);
  });

  const passing = existing.flatMap(([write, run]) => refusals.map(([refusal, first]) => ({ write, run, refusal, first })));
  it.each(passing)('a passing fence still lands the resend ($write, $refusal)', async ({ run, first }) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { d, fence, seen, sent } = drive(first);
    await expect(run(d, { fence })).resolves.toMatchObject({ id: 'f1' });
    expect(sent()).toBe(2);
    expect(seen.landed).toBe(1);
    expect(seen.fences).toBe(1);
    expect(seen.fencesAtFirstSend).toBe(0);
  });

  it.each(passing)('an unfenced write is sent once and fails as retry-kind ($write, $refusal)', async ({ run, first }) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { d, sent, seen } = drive(first);
    const e = await run(d, {}).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(BowerError);
    expect(failureKind(e)).toBe('retry');
    expect(isUnconfirmedWrite(e)).toBe(false);
    expect(sent()).toBe(1);
    expect(seen.landed).toBe(0);
  });

  const creates: [string, (d: DriveHttp) => Promise<unknown>][] = [
    ['createText', (d) => d.createText('ROOT', 'a.md', 'x', undefined, 'RESERVED_ID')],
    ['createFolder', (d) => d.createFolder('ROOT', 'A', undefined, 'RESERVED_ID')],
  ];
  const rated = creates.flatMap(([write, run]) => refusals.slice(0, 3).map(([refusal, first]) => ({ write, run, refusal, first })));
  it.each(rated)('creates by reserved id are still resent after a rate limit ($write, $refusal)', async ({ run, first }) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { d, sent, seen } = drive(first);
    await expect(run(d)).resolves.toMatchObject({ id: 'f1' });
    expect(sent()).toBe(2);
    expect(seen.landed).toBe(1);
  });
});

describe('audit-write-speed', () => {
  it('AC1 audit-write-speed-no-relist-after-write: a create, a move, a Bin and a restore keep full-text search inside the folder without listing it again', async () => {
    type Wire = ReturnType<typeof file> & { trashed?: boolean };
    const store = new Map<string, Wire>([['d1', file('d1', 'Place', 'ROOT', true)], ['n1', file('n1', 'Note.md', 'd1')]]);
    let lists = 0;
    const s = stub((c) => {
      if (c.method === 'POST') {
        // A folder is created by a JSON body naming its parent; a note by a multipart upload (into d1 here).
        const made = c.url.pathname.includes('/upload/') ? file('n2', 'New.md', 'd1') : file('d2', 'Later', (JSON.parse(String(c.body)) as { parents: string[] }).parents[0] ?? 'ROOT', true);
        store.set(made.id, made);
        return json(made);
      }
      if (c.method === 'PATCH') {
        const id = c.url.pathname.split('/').at(-1) ?? '';
        const was = store.get(id);
        if (!was) return json({ error: { code: 404 } }, 404);
        const body = JSON.parse(String(c.body)) as { trashed?: boolean };
        const to = c.url.searchParams.get('addParents');
        const next: Wire = { ...was, ...(to ? { parents: [to] } : {}), ...(body.trashed !== undefined ? { trashed: body.trashed } : {}) };
        store.set(id, next);
        return json(next);
      }
      const q = c.url.searchParams.get('q') ?? '';
      const parents = [...q.matchAll(/'([^']+)' in parents/g)].map((m) => m[1]);
      const full = q.startsWith('fullText');
      if (!full) lists++;
      return json({ files: [...store.values()].filter((f) => !f.trashed && parents.includes(f.parents[0]) && (!full || !f.mimeType.endsWith('folder'))) });
    });
    const d = new DriveHttp({ token: tokens().token, fetch: s.fetch });
    await d.listAll('ROOT');
    const listed = lists;
    const found = async (): Promise<string[]> => (await d.fullText('ROOT', 'word')).map((f) => f.id).sort();
    await d.createText('d1', 'New.md', 'word');
    expect(await found()).toEqual(['n1', 'n2']);
    await d.createFolder('ROOT', 'Later');
    await d.update('n1', { addParent: 'd2', removeParent: 'd1' });
    expect(await found()).toEqual(['n1', 'n2']);
    expect(s.calls.filter((c) => c.url.searchParams.get('q')?.startsWith('fullText')).at(-1)?.url.searchParams.get('q')).toContain("'d2' in parents");
    await d.trash('n2');
    expect(await found()).toEqual(['n1']);
    await d.untrash('n2');
    expect(await found()).toEqual(['n1', 'n2']);
    expect(lists, 'the folder is listed once, and each write updates what was listed').toBe(listed);
  });
});
