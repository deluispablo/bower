import { env as testEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { decrypt, encrypt, importEncryptionKey } from '../src/crypto.js';
import type { Env } from '../src/env.js';
import { GOOGLE_REVOKE_URL } from '../src/google.js';
import type { FetchLike } from '../src/google.js';
import { createApp } from '../src/index.js';
import { SESSION_COOKIE, signSession } from '../src/session.js';
import {
  incrQuota,
  keys,
  listVaultIds,
  putPushSub,
  putUser,
  updateUser,
} from '../src/store.js';
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
const API_KEY = 'sk-ant-test-key';

interface ErrorBody {
  error: { code: string; message: string };
}

/** A hermetic stand-in for Google's revoke endpoint: records each call. */
function revokeStub(status = 200): { fetchImpl: FetchLike; tokens: string[] } {
  const tokens: string[] = [];
  const fetchImpl: FetchLike = (input, init) => {
    if (input !== GOOGLE_REVOKE_URL) {
      return Promise.reject(new Error(`unexpected fetch in test: ${input}`));
    }
    const body = init?.body;
    const form = new URLSearchParams(typeof body === 'string' ? body : '');
    tokens.push(form.get('token') ?? '');
    return Promise.resolve(new Response('', { status }));
  };
  return { fetchImpl, tokens };
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

function setCookies(response: Response): string[] {
  return response.headers.getSetCookie();
}

function cookieNamed(response: Response, name: string): string {
  const cookie = setCookies(response).find((c) => c.startsWith(`${name}=`));
  expect(cookie, `Set-Cookie ${name}`).toBeDefined();
  return cookie as string;
}

async function patchSettings(
  fetchImpl: FetchLike,
  body: unknown,
  cookie?: string,
): Promise<Response> {
  return createApp({ fetchImpl }).request(
    `${API}/settings`,
    {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        origin: env.APP_ORIGIN,
        ...(cookie === undefined ? {} : { cookie }),
      },
      body: JSON.stringify(body),
    },
    env,
  );
}

async function deleteMe(
  fetchImpl: FetchLike,
  cookie?: string,
): Promise<Response> {
  return createApp({ fetchImpl }).request(
    `${API}/me`,
    {
      method: 'DELETE',
      headers: {
        origin: env.APP_ORIGIN,
        ...(cookie === undefined ? {} : { cookie }),
      },
    },
    env,
  );
}

async function getMe(fetchImpl: FetchLike, cookie?: string): Promise<Response> {
  return createApp({ fetchImpl }).request(
    `${API}/me`,
    { headers: cookie === undefined ? {} : { cookie } },
    env,
  );
}

async function allKeys(): Promise<string[]> {
  const listed = await kv.list({});
  return listed.keys.map((entry) => entry.name);
}

beforeEach(async () => {
  for (const name of await allKeys()) await kv.delete(name);
});

describe('PATCH /settings', () => {
  it('stores an encrypted key and reports hasApiKey: true', async () => {
    await seedUser();
    const google = revokeStub();

    const response = await patchSettings(
      google.fetchImpl,
      { apiKey: API_KEY },
      await sessionCookie(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ hasApiKey: true, allowWeb: false });

    const stored = await kv.get<User>(keys.user(USER_ID), 'json');
    expect(stored?.encApiKey?.startsWith('v1.')).toBe(true);
    expect(stored?.encApiKey).not.toContain(API_KEY);
    const key = await importEncryptionKey(env.TOKEN_ENC_KEY);
    expect(await decrypt(stored?.encApiKey ?? '', key)).toBe(API_KEY);

    const me = await getMe(google.fetchImpl, await sessionCookie());
    const meBody = await me.json<{ hasApiKey: boolean }>();
    expect(meBody.hasApiKey).toBe(true);
  });

  it('stores the web lookup switch and GET /me reports it (#374)', async () => {
    await seedUser();
    const google = revokeStub();

    const on = await patchSettings(
      google.fetchImpl,
      { allowWeb: true },
      await sessionCookie(),
    );
    expect(on.status).toBe(200);
    expect(await on.json()).toEqual({ hasApiKey: false, allowWeb: true });
    expect((await kv.get<User>(keys.user(USER_ID), 'json'))?.allowWeb).toBe(
      true,
    );
    const me = await getMe(google.fetchImpl, await sessionCookie());
    expect((await me.json<{ allowWeb: boolean }>()).allowWeb).toBe(true);

    const off = await patchSettings(
      google.fetchImpl,
      { allowWeb: false },
      await sessionCookie(),
    );
    expect(await off.json()).toEqual({ hasApiKey: false, allowWeb: false });
    expect(
      (await kv.get<User>(keys.user(USER_ID), 'json'))?.allowWeb,
    ).toBeUndefined();
  });

  it('refuses an allowWeb that is not a boolean, storing nothing', async () => {
    await seedUser();
    const google = revokeStub();

    const response = await patchSettings(
      google.fetchImpl,
      { allowWeb: 'yes', apiKey: API_KEY },
      await sessionCookie(),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: 'bad_request', message: 'allowWeb must be a boolean' },
    });
    const stored = await kv.get<User>(keys.user(USER_ID), 'json');
    expect(stored?.allowWeb).toBeUndefined();
    expect(stored?.encApiKey).toBeUndefined();
  });

  it('clears the key on apiKey: null', async () => {
    const key = await importEncryptionKey(env.TOKEN_ENC_KEY);
    await seedUser({ encApiKey: await encrypt(API_KEY, key) });
    const google = revokeStub();

    const response = await patchSettings(
      google.fetchImpl,
      { apiKey: null },
      await sessionCookie(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      hasApiKey: false,
      allowWeb: false,
    });
    const stored = await kv.get<User>(keys.user(USER_ID), 'json');
    expect(stored?.encApiKey).toBeUndefined();
  });

  it('leaves the key untouched when apiKey is missing', async () => {
    const key = await importEncryptionKey(env.TOKEN_ENC_KEY);
    const existing = await encrypt(API_KEY, key);
    await seedUser({ encApiKey: existing });
    const google = revokeStub();

    const response = await patchSettings(
      google.fetchImpl,
      { unrelated: 'ignored' },
      await sessionCookie(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ hasApiKey: true, allowWeb: false });
    const stored = await kv.get<User>(keys.user(USER_ID), 'json');
    expect(stored?.encApiKey).toBe(existing);
  });

  it('answers 400 bad_request for a number, an empty string, or a malformed body', async () => {
    await seedUser();
    const google = revokeStub();
    const cookie = await sessionCookie();

    const bodies: unknown[] = [
      { apiKey: 42 },
      { apiKey: '' },
      { apiKey: true },
    ];
    for (const body of bodies) {
      const response = await patchSettings(google.fetchImpl, body, cookie);
      expect(response.status).toBe(400);
      const json = await response.json<ErrorBody>();
      expect(json.error.code).toBe('bad_request');
    }

    const notJson = await createApp({ fetchImpl: google.fetchImpl }).request(
      `${API}/settings`,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          origin: env.APP_ORIGIN,
          cookie,
        },
        body: 'not json',
      },
      env,
    );
    expect(notJson.status).toBe(400);
    expect((await notJson.json<ErrorBody>()).error.code).toBe('bad_request');
  });

  it('stores tourSeenAt, returns it from /me, and leaves the key alone', async () => {
    const key = await importEncryptionKey(env.TOKEN_ENC_KEY);
    const existing = await encrypt(API_KEY, key);
    await seedUser({ encApiKey: existing });
    const google = revokeStub();
    const cookie = await sessionCookie();
    const tourSeenAt = '2026-09-27T10:00:00.000Z';

    const response = await patchSettings(
      google.fetchImpl,
      { tourSeenAt },
      cookie,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ hasApiKey: true, allowWeb: false });
    const stored = await kv.get<User>(keys.user(USER_ID), 'json');
    expect(stored?.tourSeenAt).toBe(tourSeenAt);
    expect(stored?.encApiKey).toBe(existing);

    const me = await getMe(google.fetchImpl, cookie);
    const meBody = await me.json<{ tourSeenAt?: string }>();
    expect(meBody.tourSeenAt).toBe(tourSeenAt);
  });

  it('leaves tourSeenAt out of /me until the tour is seen', async () => {
    await seedUser();
    const google = revokeStub();

    const me = await getMe(google.fetchImpl, await sessionCookie());
    const meBody = await me.json<Record<string, unknown>>();
    expect('tourSeenAt' in meBody).toBe(false);
  });

  it('answers 400 invalid_tour_seen_at for a malformed tourSeenAt and stores nothing', async () => {
    await seedUser();
    const google = revokeStub();
    const cookie = await sessionCookie();

    const bodies: unknown[] = [
      { tourSeenAt: 'yesterday' },
      { tourSeenAt: '2026-09-27' },
      { tourSeenAt: '2026-02-30T10:00:00.000Z' },
      { tourSeenAt: '2026-09-27T10:00:00+02:00' },
      { tourSeenAt: '' },
      { tourSeenAt: 42 },
      { tourSeenAt: null },
    ];
    for (const body of bodies) {
      const response = await patchSettings(google.fetchImpl, body, cookie);
      expect(response.status, JSON.stringify(body)).toBe(400);
      const json = await response.json<ErrorBody>();
      expect(json.error.code).toBe('invalid_tour_seen_at');
      expect(json.error.message).not.toBe('');
    }

    const stored = await kv.get<User>(keys.user(USER_ID), 'json');
    expect(stored?.tourSeenAt).toBeUndefined();
  });

  it('keeps tourSeenAt out of the admin listing', async () => {
    await seedUser({ tourSeenAt: '2026-09-27T10:00:00.000Z' });

    const response = await createApp({
      fetchImpl: revokeStub().fetchImpl,
    }).request(
      `${API}/admin/users`,
      { headers: { authorization: `Bearer ${env.ADMIN_KEY}` } },
      env,
    );

    expect(response.status).toBe(200);
    const users = await response.json<Record<string, unknown>[]>();
    expect(users).toHaveLength(1);
    expect(users[0]).not.toHaveProperty('tourSeenAt');
  });

  it('answers 401 without a session', async () => {
    const response = await patchSettings(revokeStub().fetchImpl, {
      apiKey: API_KEY,
    });

    expect(response.status).toBe(401);
    expect((await response.json<ErrorBody>()).error.code).toBe(
      'unauthenticated',
    );
  });
});

describe('DELETE /me', () => {
  it('revokes the token, deletes the user, clears the cookie, and signs the session out', async () => {
    await seedUser();
    await incrQuota(kv, USER_ID, '2026-01-01');
    await putPushSub(kv, USER_ID, {
      id: 'sub-1',
      endpoint: 'https://push.example.com/sub-1',
      keys: { p256dh: 'p256dh', auth: 'auth' },
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await kv.put(keys.allow(EMAIL), '1');
    const google = revokeStub();
    const cookie = await sessionCookie();

    const response = await deleteMe(google.fetchImpl, cookie);

    expect(response.status).toBe(204);
    const cleared = cookieNamed(response, SESSION_COOKIE);
    expect(cleared).toContain('Max-Age=0');

    expect(google.tokens).toEqual([REFRESH_TOKEN]);

    const remaining = await allKeys();
    expect(remaining.some((k) => k.startsWith('user:'))).toBe(false);
    expect(remaining.some((k) => k.startsWith('email:'))).toBe(false);
    expect(remaining.some((k) => k.startsWith('quota:'))).toBe(false);
    expect(remaining.some((k) => k.startsWith('push:'))).toBe(false);
    expect(remaining.some((k) => k.startsWith('drivetoken:'))).toBe(false);
    expect(remaining).toContain(keys.allow(EMAIL));

    const me = await getMe(google.fetchImpl, cookie);
    expect(me.status).toBe(401);
  });

  it('keeps the account deleted when a stale write re-creates its record', async () => {
    const key = await importEncryptionKey(env.TOKEN_ENC_KEY);
    const user = await seedUser({
      vault: {
        folderId: 'FOLDER_ID',
        inboxFolderId: 'FOLDER_ID',
        name: 'Bower',
      },
      encApiKey: await encrypt(API_KEY, key),
    });
    const google = revokeStub();
    const cookie = await sessionCookie();

    expect((await deleteMe(google.fetchImpl, cookie)).status).toBe(204);

    // A request that read the whole record before the deletion (another
    // location's cached copy) writes it back afterwards, index included.
    await kv.put(keys.user(USER_ID), JSON.stringify(user));
    await kv.put(keys.email(EMAIL), USER_ID);
    // A request racing the deletion through the merge helper writes nothing.
    expect(
      await updateUser(kv, USER_ID, { tourSeenAt: '2026-01-02T00:00:00.000Z' }),
    ).toBeUndefined();

    const me = await getMe(google.fetchImpl, cookie);
    expect(me.status).toBe(401);
    expect((await me.json<ErrorBody>()).error.code).toBe('unauthenticated');
    expect(await listVaultIds(kv)).not.toContain(USER_ID);
  });

  it('still deletes and answers 204 when the revoke call fails', async () => {
    await seedUser();
    const google = revokeStub(500);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await deleteMe(google.fetchImpl, await sessionCookie());

    expect(response.status).toBe(204);
    expect(await allKeys()).toEqual([keys.deleted(USER_ID)]);
    // Only the error code is logged, never the token.
    const logged = errors.mock.calls.flat().map(String).join(' ');
    expect(logged).toContain('revoke failed: google_error');
    expect(logged).not.toContain(REFRESH_TOKEN);
    errors.mockRestore();
  });

  it('answers 401 without a session', async () => {
    const response = await deleteMe(revokeStub().fetchImpl);

    expect(response.status).toBe(401);
    expect((await response.json<ErrorBody>()).error.code).toBe(
      'unauthenticated',
    );
  });
});
