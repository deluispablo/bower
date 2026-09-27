import { env as testEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../src/env.js';
import type { FetchLike } from '../src/google.js';
import { createApp } from '../src/index.js';
import { RATE_LIMIT_PER_MINUTE } from '../src/security.js';
import { SESSION_COOKIE, signSession } from '../src/session.js';
import { keys, putUser } from '../src/store.js';

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

async function seedUser(): Promise<void> {
  await putUser(kv, {
    id: USER_ID,
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

async function sessionCookie(): Promise<string> {
  const token = await signSession({ userId: USER_ID }, env.SESSION_SECRET);
  return `${SESSION_COOKIE}=${token}`;
}

async function postProcess(
  fetchImpl: FetchLike,
  headers: Record<string, string>,
): Promise<Response> {
  return createApp({ fetchImpl }).request(
    `${API}/process`,
    { method: 'POST', headers: { cookie: await sessionCookie(), ...headers } },
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
  it('answers 429 with Retry-After on the 31st POST /process from one IP in a minute', async () => {
    const github = githubStub();
    const headers = { origin: env.APP_ORIGIN, 'cf-connecting-ip': IP };

    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i += 1) {
      const response = await postProcess(github.fetchImpl, headers);
      expect(response.status).toBe(202);
    }
    const limited = await postProcess(github.fetchImpl, headers);

    expect(limited.status).toBe(429);
    expect((await limited.json<ErrorBody>()).error).toEqual({
      code: 'rate_limited',
      message: 'Too many requests, slow down',
    });
    // 12:00:10 → 50 seconds left in the minute.
    expect(limited.headers.get('retry-after')).toBe('50');
    expectSecurityHeaders(limited);

    const other = await postProcess(github.fetchImpl, {
      origin: env.APP_ORIGIN,
      'cf-connecting-ip': OTHER_IP,
    });
    expect(other.status).toBe(202);

    // A new minute is a new window.
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    const nextMinute = await postProcess(github.fetchImpl, headers);
    expect(nextMinute.status).toBe(202);
  });

  it('keys the window on the first X-Forwarded-For entry without cf-connecting-ip', async () => {
    await postProcess(githubStub().fetchImpl, {
      origin: env.APP_ORIGIN,
      'x-forwarded-for': '198.51.100.1, 10.0.0.1',
    });

    const minute = Math.floor(NOW.getTime() / 60_000);
    expect(
      await kv.get(keys.rate('process', '198.51.100.1', minute), 'text'),
    ).toBe('1');
  });

  it('limits GET /auth/callback per IP too', async () => {
    const callback = (): Promise<Response> =>
      Promise.resolve(
        createApp().request(
          `${API}/auth/callback`,
          { headers: { 'cf-connecting-ip': IP } },
          env,
        ),
      );

    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i += 1) {
      expect((await callback()).status).toBe(400);
    }
    const limited = await callback();

    expect(limited.status).toBe(429);
    expect((await limited.json<ErrorBody>()).error.code).toBe('rate_limited');
    expect(limited.headers.get('retry-after')).toBe('50');
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
