import { env as testEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Env } from '../src/env.js';
import {
  GOOGLE_REVOKE_URL,
  GOOGLE_TOKEN_URL,
  GOOGLE_USERINFO_URL,
} from '../src/google.js';
import type { FetchLike } from '../src/google.js';
import { createApp } from '../src/index.js';
import { isAllowed } from '../src/store.js';

/**
 * `Cloudflare.Env` is empty in this repo (no `wrangler types`), so the
 * bindings from `wrangler.toml` and `vitest.config.ts` are asserted once.
 */
const env = testEnv as unknown as Env;
const kv = env.BOWER_KV;

const API = 'https://api.example.com';
const EMAIL = 'you@example.com';
const REFRESH_TOKEN = 'test-refresh-token';
const ACCESS_TOKEN = 'test-access-token';

interface ErrorBody {
  error: { code: string; message: string };
}

interface GoogleStubOptions {
  revokeStatus?: number;
}

interface GoogleStub {
  fetchImpl: FetchLike;
  revokedTokens: () => string[];
}

/**
 * A hermetic stand-in for Google's token, userinfo and revoke endpoints:
 * enough for a `/auth/callback` happy path plus a following admin revoke.
 */
function googleStub(options: GoogleStubOptions = {}): GoogleStub {
  const revoked: string[] = [];
  const fetchImpl: FetchLike = (input, init) => {
    if (input === GOOGLE_TOKEN_URL) {
      return Promise.resolve(
        Response.json({
          access_token: ACCESS_TOKEN,
          expires_in: 3599,
          token_type: 'Bearer',
          refresh_token: REFRESH_TOKEN,
        }),
      );
    }
    if (input === GOOGLE_USERINFO_URL) {
      return Promise.resolve(
        Response.json({
          sub: 'test-subject',
          email: EMAIL,
          email_verified: true,
        }),
      );
    }
    if (input === GOOGLE_REVOKE_URL) {
      const body = init?.body;
      const form = new URLSearchParams(typeof body === 'string' ? body : '');
      revoked.push(form.get('token') ?? '');
      const status = options.revokeStatus ?? 200;
      return Promise.resolve(
        status === 200
          ? new Response(null, { status: 200 })
          : Response.json({ error: 'revoke_failed' }, { status }),
      );
    }
    return Promise.reject(new Error(`unexpected fetch in test: ${input}`));
  };
  return { fetchImpl, revokedTokens: () => revoked };
}

async function allKeys(): Promise<string[]> {
  const listed = await kv.list({});
  return listed.keys.map((entry) => entry.name);
}

function adminHeaders(key: string | undefined): Record<string, string> {
  return key === undefined ? {} : { authorization: `Bearer ${key}` };
}

// `key` has no default: a test that means "no Authorization header" must be
// able to pass `undefined` explicitly, which a default parameter would
// silently replace with the admin key.
async function postAllow(
  fetchImpl: FetchLike,
  email: unknown,
  key: string | undefined,
): Promise<Response> {
  return createApp({ fetchImpl }).request(
    `${API}/admin/allow`,
    {
      method: 'POST',
      headers: { ...adminHeaders(key), 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    },
    env,
  );
}

async function deleteAllow(
  fetchImpl: FetchLike,
  email: string,
  key: string | undefined,
): Promise<Response> {
  return createApp({ fetchImpl }).request(
    `${API}/admin/allow/${encodeURIComponent(email)}`,
    { method: 'DELETE', headers: adminHeaders(key) },
    env,
  );
}

async function getUsers(
  fetchImpl: FetchLike,
  key: string | undefined,
): Promise<Response> {
  return createApp({ fetchImpl }).request(
    `${API}/admin/users`,
    { headers: adminHeaders(key) },
    env,
  );
}

async function callback(fetchImpl: FetchLike): Promise<Response> {
  const app = createApp({ fetchImpl });
  const login = await app.request(`${API}/auth/login`, {}, env);
  const location = new URL(login.headers.get('location') ?? '');
  const state = location.searchParams.get('state') ?? '';
  const setCookie = login.headers
    .getSetCookie()
    .find((c) => c.startsWith('bower_oauth='));
  const cookie = (setCookie?.split(';')[0] ?? '').trim();
  return app.request(
    `${API}/auth/callback?code=test-code&state=${state}`,
    { headers: { cookie } },
    env,
  );
}

beforeEach(async () => {
  for (const name of await allKeys()) await kv.delete(name);
});

describe('admin authentication', () => {
  it('answers 401 without a key on all three routes', async () => {
    const noop: FetchLike = () => Promise.reject(new Error('not called'));

    const responses = [
      ['POST /admin/allow', await postAllow(noop, EMAIL, undefined)],
      ['DELETE /admin/allow/:email', await deleteAllow(noop, EMAIL, undefined)],
      ['GET /admin/users', await getUsers(noop, undefined)],
    ] as const;

    for (const [label, response] of responses) {
      expect(response.status, label).toBe(401);
      const body = await response.json<ErrorBody>();
      expect(body.error.code, label).toBe('unauthorized');
    }
  });

  it('answers 401 with the wrong key on all three routes', async () => {
    const noop: FetchLike = () => Promise.reject(new Error('not called'));

    const responses = [
      await postAllow(noop, EMAIL, 'wrong-key'),
      await deleteAllow(noop, EMAIL, 'wrong-key'),
      await getUsers(noop, 'wrong-key'),
    ];

    for (const response of responses) {
      expect(response.status).toBe(401);
      const body = await response.json<ErrorBody>();
      expect(body.error.code).toBe('unauthorized');
    }
  });
});

describe('POST /admin/allow', () => {
  it('allows the email without creating a user', async () => {
    const noop: FetchLike = () => Promise.reject(new Error('not called'));

    const response = await postAllow(noop, EMAIL, env.ADMIN_KEY);

    expect(response.status).toBe(204);
    expect(await isAllowed(kv, EMAIL)).toBe(true);
    const usersResponse = await getUsers(noop, env.ADMIN_KEY);
    expect(await usersResponse.json()).toEqual([]);
  });

  it('rejects a body without a valid email', async () => {
    const noop: FetchLike = () => Promise.reject(new Error('not called'));

    const response = await postAllow(noop, 'not-an-email', env.ADMIN_KEY);

    expect(response.status).toBe(400);
    const body = await response.json<ErrorBody>();
    expect(body.error.code).toBe('invalid_email');
    expect(await isAllowed(kv, 'not-an-email')).toBe(false);
  });
});

describe('GET /admin/users', () => {
  it('lists only id, email, hasVault and createdAt for a signed-in user', async () => {
    const noop: FetchLike = () => Promise.reject(new Error('not called'));
    await postAllow(noop, EMAIL, env.ADMIN_KEY);
    const google = googleStub();

    const cb = await callback(google.fetchImpl);
    expect(cb.status).toBe(302);

    const response = await getUsers(noop, env.ADMIN_KEY);
    expect(response.status).toBe(200);
    const users = await response.json<
      Array<{
        id: string;
        email: string;
        hasVault: boolean;
        createdAt: string;
      }>
    >();
    expect(users).toHaveLength(1);
    expect(Object.keys(users[0] as object).sort()).toEqual([
      'createdAt',
      'email',
      'hasVault',
      'id',
    ]);
    expect(users[0]).toMatchObject({ email: EMAIL, hasVault: false });
  });
});

describe('DELETE /admin/allow/:email', () => {
  it('revokes the decrypted refresh token and deletes all of the user data', async () => {
    const noop: FetchLike = () => Promise.reject(new Error('not called'));
    await postAllow(noop, EMAIL, env.ADMIN_KEY);
    const google = googleStub();
    await callback(google.fetchImpl);
    expect(await allKeys()).not.toEqual([]);

    const response = await deleteAllow(google.fetchImpl, EMAIL, env.ADMIN_KEY);

    expect(response.status).toBe(204);
    expect(google.revokedTokens()).toEqual([REFRESH_TOKEN]);
    const remaining = await allKeys();
    expect(remaining.some((k) => k.startsWith('user:'))).toBe(false);
    expect(remaining.some((k) => k.startsWith('email:'))).toBe(false);
    expect(remaining.some((k) => k.startsWith('allow:'))).toBe(false);

    const cb = await callback(googleStub().fetchImpl);
    expect(cb.status).toBe(403);
  });

  it('still deletes and answers 204 when the revoke call fails', async () => {
    const noop: FetchLike = () => Promise.reject(new Error('not called'));
    await postAllow(noop, EMAIL, env.ADMIN_KEY);
    const google = googleStub({ revokeStatus: 500 });
    await callback(google.fetchImpl);

    const response = await deleteAllow(google.fetchImpl, EMAIL, env.ADMIN_KEY);

    expect(response.status).toBe(204);
    expect(google.revokedTokens()).toEqual([REFRESH_TOKEN]);
    const remaining = await allKeys();
    expect(remaining.some((k) => k.startsWith('user:'))).toBe(false);
  });

  it('removes only the allowlist entry when no user ever signed in', async () => {
    const noop: FetchLike = () => Promise.reject(new Error('not called'));
    await postAllow(noop, EMAIL, env.ADMIN_KEY);

    const response = await deleteAllow(noop, EMAIL, env.ADMIN_KEY);

    expect(response.status).toBe(204);
    expect(await isAllowed(kv, EMAIL)).toBe(false);
    expect(await allKeys()).toEqual([]);
  });
});
