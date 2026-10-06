import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/index.js';

const APP = 'https://app.example.com';

describe('worker skeleton', () => {
  it('GET /health answers ok', async () => {
    const res = await SELF.fetch('https://api.example.com/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it('an unknown path answers the JSON error format', async () => {
    const res = await SELF.fetch('https://api.example.com/nope');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('not-found');
    expect(typeof body.error.message).toBe('string');
  });

  it('a thrown error answers 500 in the same format with no internals', async () => {
    const app = createApp();
    app.get('/__boom', () => {
      throw new Error('secret-detail');
    });
    const res = await app.request('/__boom', {}, env);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: { code: 'internal', message: 'Internal error' } });
    expect(text).not.toContain('secret-detail');
  });

  it('CORS allows only the app origin', async () => {
    const ok = await SELF.fetch('https://api.example.com/health', { headers: { origin: APP } });
    expect(ok.headers.get('access-control-allow-origin')).toBe(APP);
    expect(ok.headers.get('access-control-allow-credentials')).toBe('true');
    const other = await SELF.fetch('https://api.example.com/health', {
      headers: { origin: 'https://evil.example.org' },
    });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('a preflight from the app origin allows x-bower-place and x-bower-epoch', async () => {
    const res = await SELF.fetch('https://api.example.com/health', {
      method: 'OPTIONS',
      headers: {
        origin: APP,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'x-bower-place,x-bower-epoch,content-type',
      },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe(APP);
    const allowed = (res.headers.get('access-control-allow-headers') ?? '').toLowerCase();
    expect(allowed).toContain('x-bower-place');
    expect(allowed).toContain('x-bower-epoch');
  });
});
