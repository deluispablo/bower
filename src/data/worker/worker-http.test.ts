import { describe, expect, it, vi } from 'vitest';
import { WorkerHttp } from './worker-http';
import { isOpenElsewhere } from '../session';

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function stub(handler: (url: URL, init: RequestInit) => Response | Promise<Response>): { fetch: typeof fetch; calls: Array<{ url: URL; init: RequestInit }> } {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const f = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input));
    calls.push({ url, init });
    return handler(url, init);
  };
  return { fetch: f as typeof fetch, calls };
}

const BASE = 'https://api.example';

describe('WorkerHttp', () => {
  it('delete sends DELETE /me with the cookie, and a refusal rejects', async () => {
    const s = stub(() => new Response(null, { status: 204 }));
    await new WorkerHttp(BASE, s.fetch).deleteAccount();
    expect(s.calls[0]?.init.method).toBe('DELETE');
    expect(s.calls[0]?.url.pathname).toBe('/me');
    expect(s.calls[0]?.init.credentials).toBe('include');
    const bad = stub(() => json({ error: { code: 'server', message: 'Try again later.' } }, 500));
    await expect(new WorkerHttp(BASE, bad.fetch).deleteAccount()).rejects.toThrow('Try again later.');
  });

  it('session posts the place, action and leave generation, and process, createFolder and deleteAccount carry the epoch', async () => {
    const s = stub((url) => (url.pathname === '/session' ? json({ active: true, epoch: 7 }) : url.pathname === '/process' ? json({ run: { id: 'run-1', scope: 'all', phase: 'queued', requestedAt: 1, phaseAt: 1 }, revision: 1 }) : url.pathname === '/vault' ? json({ folderId: 'FOLDER_ID', found: false }) : new Response(null, { status: 204 })));
    const w = new WorkerHttp(BASE, s.fetch);
    expect(await w.session('place-1', 'check', 2)).toEqual({ active: true, epoch: 7 });
    expect(s.calls[0]?.init.method).toBe('POST');
    expect(s.calls[0]?.init.credentials).toBe('include');
    expect(JSON.parse(String(s.calls[0]?.init.body))).toEqual({ place: 'place-1', action: 'check', gen: 2 });
    await w.process('all');
    await w.createFolder();
    await w.deleteAccount();
    for (const call of s.calls.slice(1)) {
      const headers = new Headers(call.init.headers);
      expect(headers.get('x-bower-place')).toBe('place-1');
      expect(headers.get('x-bower-epoch')).toBe('7');
    }
    const bad = stub(() => json({ active: 'yes' }));
    await expect(new WorkerHttp(BASE, bad.fetch).session('place-1', 'take')).rejects.toMatchObject({ code: 'unknown' });
    const stale = stub(() => json({ error: { code: 'session', message: 'Bower is open in another window.' } }, 409));
    await expect(new WorkerHttp(BASE, stale.fetch).process('all')).rejects.toMatchObject({ code: 'conflict', message: 'Bower is open in another window.' });
  });

  it('a stale session refusal is told apart from other conflicts, and leaving survives the page closing', async () => {
    const stale = stub(() => json({ error: { code: 'stale-session', message: 'Bower is open in another window.' } }, 409));
    const refusal = await new WorkerHttp(BASE, stale.fetch).process('all').then(() => null, (e: unknown) => e);
    expect(isOpenElsewhere(refusal)).toBe(true);
    expect(refusal).toMatchObject({ code: 'conflict', message: 'Bower is open in another window.' });
    const other = stub(() => json({ error: { code: 'nothing', message: 'Nothing is waiting in the inbox.' } }, 409));
    expect(isOpenElsewhere(await new WorkerHttp(BASE, other.fetch).process('all').then(() => null, (e: unknown) => e))).toBe(false);
    const s = stub(() => json({ active: false, epoch: 2 }));
    await new WorkerHttp(BASE, s.fetch).session('place-1', 'leave');
    expect(s.calls[0]?.init.keepalive).toBe(true);
    expect(JSON.parse(String(s.calls[0]?.init.body))).toEqual({ place: 'place-1', action: 'leave', gen: 0 });
  });

  it('401 on /me gives null', async () => {
    const s = stub(() => json({ error: { code: 'auth', message: 'Sign in.' } }, 401));
    expect(await new WorkerHttp(BASE, s.fetch).me()).toBeNull();
    expect(s.calls[0]?.init.credentials).toBe('include');
  });

  it('/me gives the person and their folder', async () => {
    const s = stub(() => json({ user: { name: 'Alex', email: 'you@example.com' }, folderId: 'FOLDER_ID' }));
    expect(await new WorkerHttp(BASE, s.fetch).me()).toEqual({ user: { name: 'Alex', email: 'you@example.com' }, folderId: 'FOLDER_ID' });
  });

  it('409 on /process rejects conflict with the Worker sentence', async () => {
    const s = stub(() => json({ error: { code: 'nothing', message: 'Nothing is waiting in the inbox.' } }, 409));
    await expect(new WorkerHttp(BASE, s.fetch).process('all')).rejects.toMatchObject({ code: 'conflict', message: 'Nothing is waiting in the inbox.' });
    expect(s.calls[0]?.init.method).toBe('POST');
    expect(JSON.parse(String(s.calls[0]?.init.body))).toEqual({ scope: 'all', allowWeb: false });
  });

  it('an error without JSON still says one sentence', async () => {
    const s = stub(() => new Response('bad gateway', { status: 502 }));
    await expect(new WorkerHttp(BASE, s.fetch).status()).rejects.toMatchObject({ code: 'unknown', message: "Bower's server didn't answer. Try again." });
  });

  it('a network failure is offline', async () => {
    const f = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    await expect(new WorkerHttp(BASE, f).status()).rejects.toMatchObject({ code: 'offline' });
  });

  it('driveToken asks for a fresh one when told', async () => {
    const s = stub(() => json({ accessToken: 'tok', expiresAt: 1 }));
    const w = new WorkerHttp(BASE, s.fetch);
    expect(await w.driveToken(false)).toBe('tok');
    await w.driveToken(true);
    expect(s.calls.map((c) => c.url.search)).toEqual(['', '?fresh=1']);
  });

  it('a token still valid is reused', async () => {
    const s = stub(() => json({ accessToken: 'tok', expiresAt: Date.now() + 3_600_000 }));
    const w = new WorkerHttp(BASE, s.fetch);
    await w.driveToken(false);
    await w.driveToken(false);
    expect(s.calls).toHaveLength(1);
  });

  function tokenAsks() {
    const replies: Array<(response: Response) => void> = [];
    const s = stub((url) => url.pathname === '/drive/token'
      ? new Promise<Response>((resolve) => replies.push(resolve))
      : new Response(null, { status: 204 }));
    const w = new WorkerHttp(BASE, s.fetch);
    const answer = (index: number, token = 'tok') => replies[index]?.(json({ accessToken: token, expiresAt: Date.now() + 3_600_000 }));
    return { w, s, replies, answer };
  }

  it('driveToken: two asks at once send one /drive/token', async () => {
    const { w, s, replies, answer } = tokenAsks();
    const first = w.driveToken(false);
    const second = w.driveToken(false);
    for (let i = 0; i < replies.length; i++) answer(i);
    expect(await Promise.all([first, second])).toEqual(['tok', 'tok']);
    expect(s.calls.map((c) => c.url.pathname)).toEqual(['/drive/token']);
  });

  it('driveToken: a fresh ask is sent while a plain one is on its way', async () => {
    const { w, s, answer } = tokenAsks();
    const plain = w.driveToken(false);
    const fresh = w.driveToken(true);
    expect(s.calls.map((c) => c.url.search)).toEqual(['', '?fresh=1']);
    answer(1, 'fresh');
    expect(await fresh).toBe('fresh');
    answer(0, 'plain');
    expect(await plain).toBe('plain');
  });

  it.each(['signOut', 'deleteAccount'] as const)('driveToken: after %s a new ask does not share the one sent before', async (end) => {
    const { w, s, answer } = tokenAsks();
    const before = w.driveToken(false);
    await w[end]();
    const after = w.driveToken(false);
    expect(s.calls.filter((c) => c.url.pathname === '/drive/token')).toHaveLength(2);
    answer(0, 'before');
    expect(await before).toBe('before');
    const shared = w.driveToken(false);
    answer(1, 'after');
    expect(await Promise.all([after, shared])).toEqual(['after', 'after']);
    expect(await w.driveToken(false)).toBe('after');
    expect(s.calls.filter((c) => c.url.pathname === '/drive/token')).toHaveLength(2);
  });

  it('status gives the run or null', async () => {
    const run = { id: 'r1', scope: 'all', phase: 'reading', requestedAt: 1, phaseAt: 2, total: 3 };
    expect(await new WorkerHttp(BASE, stub(() => json({ run, revision: 2 })).fetch).status()).toEqual({ run, revision: 2 });
    expect(await new WorkerHttp(BASE, stub(() => json({ run: null, revision: 0 })).fetch).status()).toEqual({ run: null, revision: 0 });
  });

  it('process sends whether Bower may look things up on the web (allow web)', async () => {
    const s = stub(() => json({ run: { id: 'r', scope: 'all', phase: 'queued', requestedAt: 1, phaseAt: 1 }, revision: 1 }));
    await new WorkerHttp(BASE, s.fetch).process('all', { allowWeb: true, requestId: 'press-1' });
    expect(JSON.parse(String(s.calls[0]?.init.body))).toEqual({ scope: 'all', allowWeb: true, requestId: 'press-1' });
    await new WorkerHttp(BASE, s.fetch).process('instructions');
    expect(JSON.parse(String(s.calls[1]?.init.body))).toEqual({ scope: 'instructions', allowWeb: false });
  });

  it('process and status give the revision the Worker answers with', async () => {
    const run = { id: 'r', scope: 'all', phase: 'queued', requestedAt: 1, phaseAt: 1 };
    expect(await new WorkerHttp(BASE, stub(() => json({ run, revision: 3 })).fetch).process('all', { requestId: 'press-1' })).toEqual({ run, revision: 3 });
    expect(await new WorkerHttp(BASE, stub(() => json({ run, revision: 3 })).fetch).status()).toEqual({ run, revision: 3 });
    expect(await new WorkerHttp(BASE, stub(() => json({ run: null, revision: 0 })).fetch).status()).toEqual({ run: null, revision: 0 });
    // A reply without a revision, or with one that is not a whole number, is unreadable.
    await expect(new WorkerHttp(BASE, stub(() => json({ run })).fetch).status()).rejects.toThrow('unreadable');
    await expect(new WorkerHttp(BASE, stub(() => json({ run, revision: -1 })).fetch).status()).rejects.toThrow('unreadable');
    await expect(new WorkerHttp(BASE, stub(() => json({ run, revision: '3' })).fetch).process('all')).rejects.toThrow('unreadable');
  });
  it('malformed successful Worker responses give a readable error', async () => {
    const run = { id: 'r1', scope: 'all', phase: 'reading', requestedAt: 1, phaseAt: 2 };
    const methods: Array<(worker: WorkerHttp) => Promise<unknown>> = [
      (w) => w.me(), (w) => w.driveToken(false), (w) => w.createFolder(), (w) => w.process('all'), (w) => w.status(),
    ];
    const invalid: unknown[][] = [
      [{ user: { name: 'Alex', email: 'you@example.com' } }, { user: null, folderId: null }, { user: { name: 1, email: 'you@example.com' }, folderId: null }],
      [{ accessToken: 123, expiresAt: 1 }, { accessToken: 'PRIVATE_REPLY_CONTENT', expiresAt: 'later' }, { accessToken: '', expiresAt: 1 }, { accessToken: 'tok', expiresAt: -1 }],
      [{ folderId: null, found: false }, { folderId: 'FOLDER_ID', found: 'yes' }, { folderId: 'FOLDER_ID' }],
      [{ run: null }, { run: { ...run, phase: 'other' } }, { run: { ...run, total: -1 } }, { run: { ...run, phaseAt: null } }],
      [{}, { run: { ...run, id: '' } }, { run: { ...run, finishedAt: 'yesterday' } }, { run: { ...run, failure: {} } }],
    ];
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      for (const [i, method] of methods.entries()) {
        for (const body of [...(invalid[i] ?? []), null, []]) {
          await expect(method(new WorkerHttp(BASE, stub(() => json(body)).fetch))).rejects.toMatchObject({ code: 'unknown', message: "Bower's server sent an unreadable reply. Try again." });
        }
        await expect(method(new WorkerHttp(BASE, stub(() => new Response('not JSON', { status: 200 })).fetch))).rejects.toMatchObject({ code: 'unknown' });
        await expect(method(new WorkerHttp(BASE, stub(() => new Response(null, { status: 204 })).fetch))).rejects.toMatchObject({ code: 'unknown' });
      }
      const empty = new WorkerHttp(BASE, stub(() => new Response(null, { status: 204 })).fetch);
      await expect(empty.signOut()).resolves.toBeUndefined();
      await expect(empty.deleteAccount()).resolves.toBeUndefined();
      await expect(new WorkerHttp(BASE, stub(() => json({})).fetch).signOut()).rejects.toMatchObject({ code: 'unknown' });
      expect(await new WorkerHttp(BASE, stub(() => json({ user: { name: 'Alex', email: 'you@example.com' }, folderId: null })).fetch).me()).toMatchObject({ folderId: null });
      expect(logged).toHaveBeenCalled();
      expect(JSON.stringify(logged.mock.calls)).not.toContain('PRIVATE_REPLY_CONTENT');
    } finally {
      logged.mockRestore();
    }
  });

});
