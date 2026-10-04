import { describe, expect, it } from 'vitest';
import { WorkerHttp } from './worker-http';

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function stub(handler: (url: URL, init: RequestInit) => Response): { fetch: typeof fetch; calls: Array<{ url: URL; init: RequestInit }> } {
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

  it('status gives the run or null', async () => {
    const run = { id: 'r1', scope: 'all', phase: 'reading', requestedAt: 1, phaseAt: 2, total: 3 };
    expect(await new WorkerHttp(BASE, stub(() => json({ run })).fetch).status()).toEqual(run);
    expect(await new WorkerHttp(BASE, stub(() => json({ run: null })).fetch).status()).toBeNull();
  });

  it('process sends whether Bower may look things up on the web (allow web)', async () => {
    const s = stub(() => json({ run: { id: 'r', scope: 'all', phase: 'queued', requestedAt: 1, phaseAt: 1 } }));
    await new WorkerHttp(BASE, s.fetch).process('all', { allowWeb: true });
    expect(JSON.parse(String(s.calls[0]?.init.body))).toEqual({ scope: 'all', allowWeb: true });
    await new WorkerHttp(BASE, s.fetch).process('instructions');
    expect(JSON.parse(String(s.calls[1]?.init.body))).toEqual({ scope: 'instructions', allowWeb: false });
  });
});
