import { env as testEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../src/env.js';
import type { FetchLike } from '../src/google.js';
import { createApp } from '../src/index.js';
import {
  createSlidingWindow,
  GENERIC_RATE_LIMIT_PER_MINUTE,
  genericWindow,
  MAX_BODY_BYTES,
  RATE_LIMIT_PER_MINUTE,
  strictWindow,
} from '../src/security.js';
import { SESSION_COOKIE, signSession } from '../src/session.js';
import { putUser } from '../src/store.js';

/**
 * `Cloudflare.Env` is empty in this repo (no `wrangler types`), so the
 * bindings from `wrangler.toml` and `vitest.config.ts` are asserted once.
 */
const env = testEnv as unknown as Env;
const kv = env.BOWER_KV;

const API = 'https://api.example.com';
const EVIL = 'https://evil.example';
const USER_ID = 'user-1';
const IP = '203.0.113.7';
const OTHER_IP = '203.0.113.8';

/** 12:00:10 UTC: far enough from a minute boundary for 31 requests. */
const NOW = new Date('2026-06-01T12:00:10.000Z');

interface ErrorBody {
  error: { code: string; message: string };
}

/** A stub GitHub answering every dispatch with 204 and counting calls. */
function githubStub(): { calls: string[]; fetchImpl: FetchLike } {
  const calls: string[] = [];
  const fetchImpl: FetchLike = (input) => {
    calls.push(input);
    return Promise.resolve(new Response(null, { status: 204 }));
  };
  return { calls, fetchImpl };
}

async function seedUser(id = USER_ID): Promise<void> {
  await putUser(kv, {
    id,
    email: 'you@example.com',
    createdAt: '2026-01-01T00:00:00.000Z',
    encRefreshToken: 'v1.test-envelope',
    vault: {
      folderId: 'FOLDER_ID',
      inboxFolderId: 'INBOX_FOLDER_ID',
      name: 'Bower',
    },
  });
}

async function sessionCookie(userId = USER_ID): Promise<string> {
  const token = await signSession({ userId }, env.SESSION_SECRET);
  return `${SESSION_COOKIE}=${token}`;
}

async function postProcess(
  fetchImpl: FetchLike,
  headers: Record<string, string>,
  userId = USER_ID,
): Promise<Response> {
  return createApp({ fetchImpl }).request(
    `${API}/process`,
    {
      method: 'POST',
      headers: { cookie: await sessionCookie(userId), ...headers },
    },
    env,
  );
}

function expectSecurityHeaders(response: Response): void {
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  expect(response.headers.get('strict-transport-security')).toBe(
    'max-age=31536000; includeSubDomains; preload',
  );
  expect(response.headers.get('content-security-policy')).toBe(
    "frame-ancestors 'none'",
  );
}

beforeEach(async () => {
  const listed = await kv.list({});
  await Promise.all(listed.keys.map((entry) => kv.delete(entry.name)));
  genericWindow.clear();
  strictWindow.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  await seedUser();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CORS', () => {
  function preflight(origin: string): Promise<Response> {
    return Promise.resolve(
      createApp().request(
        `${API}/process`,
        {
          method: 'OPTIONS',
          headers: {
            origin,
            'access-control-request-method': 'POST',
            'access-control-request-headers': 'content-type',
          },
        },
        env,
      ),
    );
  }

  it('allows a preflight from APP_ORIGIN, with credentials', async () => {
    const response = await preflight(env.APP_ORIGIN);

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(
      env.APP_ORIGIN,
    );
    expect(response.headers.get('access-control-allow-credentials')).toBe(
      'true',
    );
    expect(response.headers.get('access-control-allow-methods')).toBe(
      'GET,POST,PATCH,DELETE,OPTIONS',
    );
    expect(response.headers.get('access-control-allow-headers')).toBe(
      'Content-Type,Authorization,X-Request-Id',
    );
    expectSecurityHeaders(response);
  });

  it('refuses a preflight from another origin', async () => {
    const response = await preflight(EVIL);

    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('exposes X-Request-Id to APP_ORIGIN on a normal response', async () => {
    const response = await createApp().request(
      `${API}/health`,
      { headers: { origin: env.APP_ORIGIN } },
      env,
    );

    expect(response.headers.get('access-control-allow-origin')).toBe(
      env.APP_ORIGIN,
    );
    expect(response.headers.get('access-control-expose-headers')).toBe(
      'X-Request-Id',
    );
  });
});

describe('same-origin check', () => {
  it('rejects POST /process with the cookie from another origin', async () => {
    const github = githubStub();

    const response = await postProcess(github.fetchImpl, { origin: EVIL });

    expect(response.status).toBe(403);
    expect(await response.json<ErrorBody>()).toEqual({
      error: { code: 'forbidden', message: 'Cross-site request rejected' },
    });
    expect(github.calls).toEqual([]);
  });

  it('passes POST /process from APP_ORIGIN to the handler', async () => {
    const github = githubStub();

    const response = await postProcess(github.fetchImpl, {
      origin: env.APP_ORIGIN,
    });

    expect(response.status).toBe(202);
    expect(github.calls).toHaveLength(1);
  });

  it('falls back to the Referer origin when Origin is absent', async () => {
    const allowed = await postProcess(githubStub().fetchImpl, {
      referer: `${env.APP_ORIGIN}/settings`,
    });
    expect(allowed.status).toBe(202);

    const refused = await postProcess(githubStub().fetchImpl, {
      referer: `${EVIL}/page`,
    });
    expect(refused.status).toBe(403);
  });

  it('rejects a request with neither Origin nor Referer', async () => {
    const github = githubStub();

    const response = await postProcess(github.fetchImpl, {});

    expect(response.status).toBe(403);
    expect((await response.json<ErrorBody>()).error.code).toBe('forbidden');
    expect(github.calls).toEqual([]);
  });

  it('rejects POST /auth/logout from another origin', async () => {
    const response = await createApp().request(
      `${API}/auth/logout`,
      { method: 'POST', headers: { origin: EVIL } },
      env,
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('leaves runner and admin routes (bearer keys) alone', async () => {
    const runner = await createApp().request(
      `${API}/runner/vaults/${USER_ID}/status`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.BOWER_API_KEY}`,
          'content-type': 'application/json',
          origin: EVIL,
        },
        body: JSON.stringify({ state: 'running' }),
      },
      env,
    );
    expect(runner.status).toBe(200);

    const admin = await createApp().request(
      `${API}/admin/allow`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.ADMIN_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ email: 'you@example.com' }),
      },
      env,
    );
    expect(admin.status).toBe(204);
  });
});

describe('rate limit', () => {
  it('answers 429 with Retry-After on the 31st POST /process from one user in 60 s', async () => {
    const github = githubStub();
    const headers = { origin: env.APP_ORIGIN, 'cf-connecting-ip': IP };

    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i += 1) {
      const response = await postProcess(github.fetchImpl, headers);
      expect(response.status).toBe(202);
    }
    // 20 s later: the window slides, it does not reset on the minute.
    vi.setSystemTime(new Date(NOW.getTime() + 20_000));
    const limited = await postProcess(github.fetchImpl, headers);

    expect(limited.status).toBe(429);
    expect((await limited.json<ErrorBody>()).error).toEqual({
      code: 'rate_limited',
      message: 'Too many requests, slow down',
    });
    // The first request (at NOW) leaves the window in 40 s.
    expect(limited.headers.get('retry-after')).toBe('40');
    expectSecurityHeaders(limited);

    // Keyed by user, not IP: another IP does not help the same user...
    const sameUser = await postProcess(github.fetchImpl, {
      origin: env.APP_ORIGIN,
      'cf-connecting-ip': OTHER_IP,
    });
    expect(sameUser.status).toBe(429);
    // ...and another user on the same IP is not limited.
    await seedUser('user-2');
    const otherUser = await postProcess(github.fetchImpl, headers, 'user-2');
    expect(otherUser.status).toBe(202);

    // Once the first requests are 60 s old, the user fits again.
    vi.setSystemTime(new Date(NOW.getTime() + 60_001));
    const later = await postProcess(github.fetchImpl, headers);
    expect(later.status).toBe(202);
  });

  it('costs no KV write', async () => {
    const github = githubStub();
    const headers = { origin: env.APP_ORIGIN, 'cf-connecting-ip': IP };
    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i += 1) {
      await postProcess(github.fetchImpl, headers);
    }
    const put = vi.spyOn(kv, 'put');

    expect((await postProcess(github.fetchImpl, headers)).status).toBe(429);

    expect(put).not.toHaveBeenCalled();
    put.mockRestore();
    const listed = await kv.list({ prefix: 'rate:' });
    expect(listed.keys).toEqual([]);
  });

  it('keys GET /auth/callback on the first X-Forwarded-For entry without cf-connecting-ip', async () => {
    const app = createApp({
      fetchImpl: () => Promise.resolve(new Response(null, { status: 400 })),
    });
    const login = await app.request(`${API}/auth/login`, {}, env);
    const setCookie = login.headers.getSetCookie()[0] ?? '';
    const cookie = setCookie.split(';')[0] ?? '';
    const state =
      new URL(login.headers.get('location') ?? '').searchParams.get('state') ??
      '';
    const callback = (forwardedFor: string): Promise<Response> =>
      Promise.resolve(
        app.request(
          `${API}/auth/callback?code=test-code&state=${state}`,
          { headers: { cookie, 'x-forwarded-for': forwardedFor } },
          env,
        ),
      );

    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i += 1) {
      expect((await callback('198.51.100.1, 10.0.0.1')).status).toBe(502);
    }

    const limited = await callback('198.51.100.1, 10.0.0.2');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
    expect((await callback('198.51.100.2, 10.0.0.1')).status).toBe(502);
  });
});

describe('input limits', () => {
  function postVault(
    headers: Record<string, string>,
    body: BodyInit,
  ): Promise<Response> {
    return Promise.resolve(
      createApp().request(
        `${API}/vault`,
        {
          method: 'POST',
          headers: { origin: env.APP_ORIGIN, ...headers },
          body,
        },
        env,
      ),
    );
  }

  /** A JSON body of exactly `bytes` bytes. */
  function jsonOfSize(bytes: number): string {
    const frame = JSON.stringify({ mode: '' });
    return JSON.stringify({ mode: 'x'.repeat(bytes - frame.length) });
  }

  it('answers 413 when Content-Length is over 64 KB, before the handler', async () => {
    const body = jsonOfSize(MAX_BODY_BYTES + 1);

    const response = await postVault(
      {
        'content-type': 'application/json',
        'content-length': String(body.length),
      },
      body,
    );

    expect(response.status).toBe(413);
    expect(await response.json<ErrorBody>()).toEqual({
      error: { code: 'payload_too_large', message: 'Request body too large' },
    });
    expectSecurityHeaders(response);
  });

  it('answers 413 on a streamed body over 64 KB (no Content-Length)', async () => {
    const bytes = new TextEncoder().encode(jsonOfSize(MAX_BODY_BYTES + 1));
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 4096) {
          controller.enqueue(bytes.slice(i, i + 4096));
        }
        controller.close();
      },
    });

    const response = await postVault(
      { 'content-type': 'application/json' },
      stream,
    );

    expect(response.status).toBe(413);
    expect((await response.json<ErrorBody>()).error.code).toBe(
      'payload_too_large',
    );
  });

  it('lets a 64 KB body through to the handler', async () => {
    // No session cookie: the handler's 401 proves the limits let it pass.
    const response = await postVault(
      { 'content-type': 'application/json' },
      jsonOfSize(MAX_BODY_BYTES),
    );

    expect(response.status).toBe(401);
  });

  it('answers 415 on a write whose body is not JSON', async () => {
    const response = await postVault(
      { 'content-type': 'text/plain' },
      JSON.stringify({ mode: 'create' }),
    );

    expect(response.status).toBe(415);
    expect(await response.json<ErrorBody>()).toEqual({
      error: {
        code: 'unsupported_media_type',
        message: 'Send the request body as application/json',
      },
    });

    const untyped = await createApp().request(
      `${API}/runner/vaults/${USER_ID}/status`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${env.BOWER_API_KEY}` },
        body: new Blob([JSON.stringify({ state: 'running' })]),
      },
      env,
    );
    expect(untyped.status).toBe(415);
  });

  it('accepts application/json with a charset parameter', async () => {
    const response = await createApp().request(
      `${API}/admin/allow`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.ADMIN_KEY}`,
          'content-type': 'Application/JSON; charset=utf-8',
        },
        body: JSON.stringify({ email: 'you@example.com' }),
      },
      env,
    );

    expect(response.status).toBe(204);
  });

  it('does not require a content type on a write without a body', async () => {
    const response = await createApp().request(
      `${API}/auth/logout`,
      { method: 'POST', headers: { origin: env.APP_ORIGIN } },
      env,
    );

    expect(response.status).toBe(204);
  });
});

describe('generic rate limit', () => {
  async function getRoute(path: string, ip: string): Promise<Response> {
    return createApp().request(
      `${API}${path}`,
      { headers: { cookie: await sessionCookie(), 'cf-connecting-ip': ip } },
      env,
    );
  }

  it('answers 429 with Retry-After past 120 cookie requests from one IP in 60 s, across routes', async () => {
    expect((await getRoute('/me', IP)).status).toBe(200);
    // 20 s later: the window slides, it does not reset on the minute.
    vi.setSystemTime(new Date(NOW.getTime() + 20_000));
    for (let i = 1; i < GENERIC_RATE_LIMIT_PER_MINUTE; i += 1) {
      expect((await getRoute('/status', IP)).status).toBe(200);
    }

    const limited = await getRoute('/status', IP);

    expect(limited.status).toBe(429);
    expect((await limited.json<ErrorBody>()).error).toEqual({
      code: 'rate_limited',
      message: 'Too many requests, slow down',
    });
    // The first request (at NOW) leaves the window in 40 s.
    expect(limited.headers.get('retry-after')).toBe('40');
    expectSecurityHeaders(limited);

    expect((await getRoute('/status', OTHER_IP)).status).toBe(200);
    // Public routes are not counted.
    expect((await getRoute('/health', IP)).status).toBe(200);

    // Once the first request is 60 s old, one more fits.
    vi.setSystemTime(new Date(NOW.getTime() + 60_001));
    expect((await getRoute('/status', IP)).status).toBe(200);
    expect((await getRoute('/status', IP)).status).toBe(429);
  });

  it('costs no KV write and counts apart from the strict limits', async () => {
    const github = githubStub();
    const headers = { origin: env.APP_ORIGIN, 'cf-connecting-ip': IP };
    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i += 1) {
      expect((await postProcess(github.fetchImpl, headers)).status).toBe(202);
    }
    expect((await postProcess(github.fetchImpl, headers)).status).toBe(429);
    // 31 generic hits so far: far from 120.
    expect((await getRoute('/status', IP)).status).toBe(200);

    const listed = await kv.list({ prefix: 'rate:' });
    expect(listed.keys).toEqual([]);
  });
});

describe('createSlidingWindow', () => {
  it('does not count a refused request', () => {
    const window = createSlidingWindow(2, 60_000, 10);

    expect(window.hit('a', 0)).toBe(0);
    expect(window.hit('a', 10_000)).toBe(0);
    expect(window.hit('a', 20_000)).toBe(40);
    expect(window.hit('a', 59_000)).toBe(1);
    // The request at 0 has left; the refused ones never counted.
    expect(window.hit('a', 60_000)).toBe(0);
  });

  it('drops idle keys and caps the number of keys', () => {
    const window = createSlidingWindow(5, 60_000, 3);

    window.hit('a', 0);
    window.hit('b', 1_000);
    window.hit('c', 2_000);
    window.hit('d', 3_000);
    // Over the cap: the least recently seen key (a) is evicted.
    expect(window.size()).toBe(3);

    window.hit('e', 62_000);
    // b and c are idle (last seen over 60 s ago) and pruned.
    expect(window.size()).toBe(2);
  });
});

describe('security headers', () => {
  it('are set on /health', async () => {
    const response = await createApp().request(`${API}/health`, {}, env);

    expect(response.status).toBe(200);
    expectSecurityHeaders(response);
  });

  it('are set on an error response', async () => {
    const response = await createApp().request(`${API}/me`, {}, env);

    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toContain('application/json');
    expectSecurityHeaders(response);
  });
});
