import { env as testEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { encrypt, importEncryptionKey } from '../src/crypto.js';
import type { Env } from '../src/env.js';
import {
  GOOGLE_REVOKE_URL,
  GOOGLE_TOKEN_URL,
  refreshAccessToken,
  revokeToken,
} from '../src/google.js';
import type { FetchLike } from '../src/google.js';
import { createApp } from '../src/index.js';
import { SESSION_COOKIE, signSession } from '../src/session.js';
import { getDriveToken, getUser, keys, putUser } from '../src/store.js';
import type { User } from '../src/types.js';

/**
 * `Cloudflare.Env` is empty in this repo (no `wrangler types`), so the
 * bindings from `wrangler.toml` and `vitest.config.ts` are asserted once.
 */
const env = testEnv as unknown as Env;
const kv = env.BOWER_KV;

const API = 'https://api.example.com';
const USER_ID = 'user-1';
const EMAIL = 'you@example.com';
const REFRESH_TOKEN = 'test-refresh-token';
const ACCESS_TOKEN = 'test-access-token';
const CLIENT = { clientId: 'test-client', clientSecret: 'test-secret' };

interface Call {
  url: string;
  form: URLSearchParams;
  contentType: string | null;
}

interface Stub {
  fetchImpl: FetchLike;
  calls: Call[];
}

/**
 * A hermetic stand-in for one Google endpoint: records each call and
 * answers `respond()` (a fresh `Response` per call), or rejects when
 * `respond` is `'unreachable'`.
 */
function stub(respond: (() => Response) | 'unreachable'): Stub {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = (input, init) => {
    const body = init?.body;
    calls.push({
      url: input,
      form: new URLSearchParams(typeof body === 'string' ? body : ''),
      contentType: new Headers(init?.headers).get('content-type'),
    });
    if (respond === 'unreachable') {
      return Promise.reject(new Error('network down'));
    }
    return Promise.resolve(respond());
  };
  return { fetchImpl, calls };
}

function tokenOk(expiresIn = 3599): () => Response {
  return () =>
    Response.json({
      access_token: ACCESS_TOKEN,
      expires_in: expiresIn,
      token_type: 'Bearer',
    });
}

function oauthError(error: string, status = 400): () => Response {
  return () => Response.json({ error }, { status });
}

/** Stores a user whose refresh token is encrypted with the fixture key. */
async function seedUser(extra: Partial<User> = {}): Promise<User> {
  const key = await importEncryptionKey(env.TOKEN_ENC_KEY);
  const user: User = {
    id: USER_ID,
    email: EMAIL,
    createdAt: '2026-01-01T00:00:00.000Z',
    encRefreshToken: await encrypt(REFRESH_TOKEN, key),
    ...extra,
  };
  await putUser(kv, user);
  return user;
}

async function sessionCookie(userId = USER_ID): Promise<string> {
  const token = await signSession({ userId }, env.SESSION_SECRET);
  return `${SESSION_COOKIE}=${token}`;
}

async function get(
  fetchImpl: FetchLike,
  path: string,
  cookie?: string,
): Promise<Response> {
  return createApp({ fetchImpl }).request(
    `${API}${path}`,
    { headers: cookie === undefined ? {} : { cookie } },
    env,
  );
}

interface ErrorBody {
  error: { code: string; message: string };
}

beforeEach(async () => {
  const listed = await kv.list({});
  await Promise.all(listed.keys.map((entry) => kv.delete(entry.name)));
});

describe('GET /drive/token', () => {
  it('mints, caches and returns a token on a cache miss', async () => {
    await seedUser({
      vault: {
        folderId: 'FOLDER_ID',
        inboxFolderId: 'FOLDER_ID',
        name: 'Bower',
      },
    });
    const google = stub(tokenOk(3599));
    const before = Date.now();

    const response = await get(
      google.fetchImpl,
      '/drive/token',
      await sessionCookie(),
    );

    expect(response.status).toBe(200);
    const body = await response.json<{
      accessToken: string;
      expiresAt: string;
      folderId: string | null;
    }>();
    expect(body.accessToken).toBe(ACCESS_TOKEN);
    expect(body.folderId).toBe('FOLDER_ID');
    const expiresAt = Date.parse(body.expiresAt);
    expect(expiresAt).toBeGreaterThanOrEqual(before + 3599 * 1000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 3599 * 1000);

    expect(google.calls).toHaveLength(1);
    const [call] = google.calls;
    expect(call?.url).toBe(GOOGLE_TOKEN_URL);
    expect(call?.form.get('grant_type')).toBe('refresh_token');
    expect(call?.form.get('refresh_token')).toBe(REFRESH_TOKEN);
    expect(call?.form.get('client_id')).toBe(env.GOOGLE_CLIENT_ID);
    expect(call?.form.get('client_secret')).toBe(env.GOOGLE_CLIENT_SECRET);

    expect(await getDriveToken(kv, USER_ID)).toEqual({
      accessToken: ACCESS_TOKEN,
      expiresAt: body.expiresAt,
    });
    // Cached for expires_in - 60 seconds.
    const listed = await kv.list({ prefix: keys.driveToken(USER_ID) });
    const expiration = listed.keys[0]?.expiration ?? 0;
    const expected = Math.floor(before / 1000) + 3599 - 60;
    expect(expiration).toBeGreaterThanOrEqual(expected - 1);
    expect(expiration).toBeLessThanOrEqual(expected + 5);
  });

  it('answers from the cache without calling Google', async () => {
    await seedUser();
    const google = stub(tokenOk());
    const cookie = await sessionCookie();
    const first = await get(google.fetchImpl, '/drive/token', cookie);
    expect(first.status).toBe(200);
    const firstBody = await first.json();

    const again = stub(tokenOk());
    const second = await get(again.fetchImpl, '/drive/token', cookie);

    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(firstBody);
    expect(again.calls).toHaveLength(0);
  });

  it('returns folderId null before the vault is provisioned', async () => {
    await seedUser();

    const response = await get(
      stub(tokenOk()).fetchImpl,
      '/drive/token',
      await sessionCookie(),
    );

    expect(response.status).toBe(200);
    const body = await response.json<{ folderId: string | null }>();
    expect(body.folderId).toBeNull();
  });

  it('caches for at least 60 seconds when Google gives a short lifetime', async () => {
    await seedUser();
    const before = Math.floor(Date.now() / 1000);

    const response = await get(
      stub(tokenOk(30)).fetchImpl,
      '/drive/token',
      await sessionCookie(),
    );

    expect(response.status).toBe(200);
    const listed = await kv.list({ prefix: keys.driveToken(USER_ID) });
    const expiration = listed.keys[0]?.expiration ?? 0;
    expect(expiration).toBeGreaterThanOrEqual(before + 60 - 1);
    expect(expiration).toBeLessThanOrEqual(before + 60 + 5);
  });

  it('answers 401 reauth and flags the user when Google revoked access', async () => {
    await seedUser();
    const cookie = await sessionCookie();

    const response = await get(
      stub(oauthError('invalid_grant')).fetchImpl,
      '/drive/token',
      cookie,
    );

    expect(response.status).toBe(401);
    const body = await response.json<ErrorBody>();
    expect(body.error.code).toBe('reauth');
    expect(JSON.stringify(body)).not.toContain(REFRESH_TOKEN);
    expect((await getUser(kv, USER_ID))?.needsReauth).toBe(true);
    expect(await getDriveToken(kv, USER_ID)).toBeUndefined();

    const me = await get(stub(tokenOk()).fetchImpl, '/me', cookie);
    expect(me.status).toBe(200);
    const meBody = await me.json<{ needsReauth: boolean }>();
    expect(meBody.needsReauth).toBe(true);
  });

  it('answers 502 google_error and leaves the user alone on another failure', async () => {
    await seedUser();

    const response = await get(
      stub(oauthError('server_error', 500)).fetchImpl,
      '/drive/token',
      await sessionCookie(),
    );

    expect(response.status).toBe(502);
    const body = await response.json<ErrorBody>();
    expect(body.error.code).toBe('google_error');
    expect((await getUser(kv, USER_ID))?.needsReauth).toBeUndefined();
  });

  it('answers 401 without a session', async () => {
    const google = stub(tokenOk());

    const response = await get(google.fetchImpl, '/drive/token');

    expect(response.status).toBe(401);
    const body = await response.json<ErrorBody>();
    expect(body.error.code).toBe('unauthenticated');
    expect(google.calls).toHaveLength(0);
  });

  it('answers 401 when the session user no longer exists', async () => {
    const google = stub(tokenOk());

    const response = await get(
      google.fetchImpl,
      '/drive/token',
      await sessionCookie('user-gone'),
    );

    expect(response.status).toBe(401);
    const body = await response.json<ErrorBody>();
    expect(body.error.code).toBe('unauthenticated');
    expect(google.calls).toHaveLength(0);
  });
});

describe('refreshAccessToken', () => {
  const params = { refreshToken: REFRESH_TOKEN, ...CLIENT };

  it('posts a refresh_token grant and returns the new token', async () => {
    const google = stub(tokenOk(3599));

    const result = await refreshAccessToken(params, google.fetchImpl);

    expect(result).toEqual({ accessToken: ACCESS_TOKEN, expiresIn: 3599 });
    expect(google.calls).toHaveLength(1);
    const [call] = google.calls;
    expect(call?.url).toBe(GOOGLE_TOKEN_URL);
    expect(call?.contentType).toBe('application/x-www-form-urlencoded');
    expect(Object.fromEntries(call?.form ?? [])).toEqual({
      grant_type: 'refresh_token',
      refresh_token: REFRESH_TOKEN,
      client_id: CLIENT.clientId,
      client_secret: CLIENT.clientSecret,
    });
  });

  it('throws 401 reauth on invalid_grant', async () => {
    const promise = refreshAccessToken(
      params,
      stub(oauthError('invalid_grant')).fetchImpl,
    );

    await expect(promise).rejects.toMatchObject({
      status: 401,
      code: 'reauth',
      message: 'Google access was revoked, sign in again',
    });
  });

  it('throws 502 google_error on any other failure, without leaking the token', async () => {
    const failures: Stub[] = [
      stub(oauthError('invalid_client')),
      stub(oauthError('invalid_grant', 401)),
      stub(() => new Response('not json', { status: 400 })),
      stub(() => new Response('boom', { status: 500 })),
      stub(() => new Response('not json', { status: 200 })),
      stub(() => Response.json({ expires_in: 3599 })),
      stub(() => Response.json({ access_token: ACCESS_TOKEN })),
      stub('unreachable'),
    ];

    for (const google of failures) {
      const error: unknown = await refreshAccessToken(
        params,
        google.fetchImpl,
      ).catch((err: unknown) => err);
      expect(error).toMatchObject({ status: 502, code: 'google_error' });
      expect(String((error as Error).message)).not.toContain(REFRESH_TOKEN);
    }
  });
});

describe('revokeToken', () => {
  it('posts the token to the revoke endpoint', async () => {
    const google = stub(() => new Response('', { status: 200 }));

    await expect(
      revokeToken(REFRESH_TOKEN, google.fetchImpl),
    ).resolves.toBeUndefined();

    expect(google.calls).toHaveLength(1);
    const [call] = google.calls;
    expect(call?.url).toBe(GOOGLE_REVOKE_URL);
    expect(call?.contentType).toBe('application/x-www-form-urlencoded');
    expect(Object.fromEntries(call?.form ?? [])).toEqual({
      token: REFRESH_TOKEN,
    });
  });

  it('throws 502 google_error when Google refuses or is unreachable', async () => {
    for (const google of [
      stub(oauthError('invalid_token')),
      stub('unreachable'),
    ]) {
      await expect(
        revokeToken(REFRESH_TOKEN, google.fetchImpl),
      ).rejects.toMatchObject({ status: 502, code: 'google_error' });
    }
  });
});
