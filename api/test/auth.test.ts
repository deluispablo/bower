import { env as testEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { NOT_INVITED_COOKIE, OAUTH_COOKIE } from '../src/auth.js';
import {
  base64UrlEncodeString,
  decrypt,
  encrypt,
  importEncryptionKey,
} from '../src/crypto.js';
import type { Env } from '../src/env.js';
import {
  GOOGLE_AUTH_URL,
  GOOGLE_TOKEN_URL,
  GOOGLE_USERINFO_URL,
  codeChallenge,
  exchangeCode,
} from '../src/google.js';
import type { FetchLike } from '../src/google.js';
import { createApp } from '../src/index.js';
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  signSession,
  signToken,
  verifySession,
  verifyToken,
} from '../src/session.js';
import {
  findUserByEmail,
  getUser,
  incrQuota,
  keys,
  putUser,
} from '../src/store.js';
import type { User } from '../src/types.js';

/**
 * `Cloudflare.Env` is empty in this repo (no `wrangler types`), so the
 * bindings from `wrangler.toml` and `vitest.config.ts` are asserted once.
 */
const env = testEnv as unknown as Env;
const kv = env.BOWER_KV;

const EMAIL = 'you@example.com';
const REFRESH_TOKEN = 'test-refresh-token';
const ACCESS_TOKEN = 'test-access-token';
const API = 'https://api.example.com';

interface GoogleStubOptions {
  tokenStatus?: number;
  refreshToken?: string | null;
  email?: string;
  emailVerified?: boolean;
}

interface GoogleStub {
  fetchImpl: FetchLike;
  /** The `code_verifier` the Worker sent to the token endpoint, if any. */
  sentVerifier: () => string | undefined;
}

/** A hermetic stand-in for Google's token and userinfo endpoints. */
function googleStub(options: GoogleStubOptions = {}): GoogleStub {
  let verifier: string | undefined;
  const fetchImpl: FetchLike = (input, init) => {
    if (input === GOOGLE_TOKEN_URL) {
      const body = init?.body;
      const form = new URLSearchParams(typeof body === 'string' ? body : '');
      verifier = form.get('code_verifier') ?? undefined;
      const status = options.tokenStatus ?? 200;
      if (status !== 200) {
        return Promise.resolve(
          Response.json({ error: 'invalid_grant' }, { status }),
        );
      }
      const refreshToken =
        options.refreshToken === undefined
          ? REFRESH_TOKEN
          : options.refreshToken;
      return Promise.resolve(
        Response.json({
          access_token: ACCESS_TOKEN,
          expires_in: 3599,
          token_type: 'Bearer',
          ...(refreshToken === null ? {} : { refresh_token: refreshToken }),
        }),
      );
    }
    if (input === GOOGLE_USERINFO_URL) {
      const headers = new Headers(init?.headers);
      if (headers.get('authorization') !== `Bearer ${ACCESS_TOKEN}`) {
        return Promise.resolve(new Response('unauthorized', { status: 401 }));
      }
      return Promise.resolve(
        Response.json({
          sub: 'test-subject',
          email: options.email ?? EMAIL,
          email_verified: options.emailVerified ?? true,
        }),
      );
    }
    return Promise.reject(new Error(`unexpected fetch in test: ${input}`));
  };
  return { fetchImpl, sentVerifier: () => verifier };
}

function setCookies(response: Response): string[] {
  return response.headers.getSetCookie();
}

function cookieNamed(response: Response, name: string): string {
  const cookie = setCookies(response).find((c) => c.startsWith(`${name}=`));
  expect(cookie, `Set-Cookie ${name}`).toBeDefined();
  return cookie as string;
}

function cookieValue(setCookie: string): string {
  const pair = setCookie.split(';')[0] ?? '';
  return pair.slice(pair.indexOf('=') + 1);
}

/** Runs `/auth/login` and returns what the callback needs. */
async function login(
  app: ReturnType<typeof createApp>,
): Promise<{ cookie: string; state: string; location: URL }> {
  const response = await app.request(`${API}/auth/login`, {}, env);
  expect(response.status).toBe(302);
  const location = new URL(response.headers.get('location') ?? '');
  const token = cookieValue(cookieNamed(response, OAUTH_COOKIE));
  return {
    cookie: `${OAUTH_COOKIE}=${token}`,
    state: location.searchParams.get('state') ?? '',
    location,
  };
}

async function callback(
  app: ReturnType<typeof createApp>,
  query: string,
  cookie?: string,
): Promise<Response> {
  return app.request(
    `${API}/auth/callback?${query}`,
    { headers: cookie === undefined ? {} : { cookie } },
    env,
  );
}

async function allow(email: string): Promise<void> {
  await kv.put(keys.allow(email), '1');
}

async function allKeys(): Promise<string[]> {
  const listed = await kv.list({});
  return listed.keys.map((entry) => entry.name);
}

/**
 * Every key but the per-IP rate-limit counters (`rate:`), which every
 * callback writes: what a callback stored about the person signing in.
 */
async function stateKeys(): Promise<string[]> {
  return (await allKeys()).filter((name) => !name.startsWith('rate:'));
}

beforeEach(async () => {
  for (const name of await allKeys()) await kv.delete(name);
});

describe('GET /auth/login', () => {
  it('sets the OAuth cookie and redirects to Google with PKCE', async () => {
    const response = await createApp().request(`${API}/auth/login`, {}, env);

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location') ?? '');
    expect(`${location.origin}${location.pathname}`).toBe(GOOGLE_AUTH_URL);
    const params = location.searchParams;
    expect(params.get('client_id')).toBe(env.GOOGLE_CLIENT_ID);
    expect(params.get('redirect_uri')).toBe(`${env.API_ORIGIN}/auth/callback`);
    expect(params.get('response_type')).toBe('code');
    expect(params.get('scope')).toBe(
      'openid email https://www.googleapis.com/auth/drive',
    );
    expect(params.get('access_type')).toBe('offline');
    expect(params.get('prompt')).toBe('consent');
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(params.get('state')).toMatch(/^[A-Za-z0-9_-]{22}$/);

    const cookie = cookieNamed(response, OAUTH_COOKIE);
    const attributes = cookie.split('; ').slice(1);
    expect(attributes).toEqual(
      expect.arrayContaining([
        'HttpOnly',
        'Secure',
        'SameSite=Lax',
        'Path=/auth',
        'Max-Age=600',
      ]),
    );
  });
  it('asks Google to pick an account only for prompt=select_account', async () => {
    const app = createApp();
    const promptFor = async (query: string): Promise<string | null> => {
      const response = await app.request(`${API}/auth/login${query}`, {}, env);
      expect(response.status).toBe(302);
      return new URL(response.headers.get('location') ?? '').searchParams.get(
        'prompt',
      );
    };

    expect(await promptFor('?prompt=select_account')).toBe(
      'consent select_account',
    );
    expect(await promptFor('?prompt=none')).toBe('consent');
    expect(await promptFor('?prompt=select_account%20none')).toBe('consent');
  });
});

describe('GET /auth/callback', () => {
  it('creates a new user with an encrypted refresh token and signs in', async () => {
    await allow(EMAIL);
    const google = googleStub();
    const app = createApp({ fetchImpl: google.fetchImpl });
    const { cookie, state, location } = await login(app);

    const response = await callback(
      app,
      `code=test-code&state=${state}`,
      cookie,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(env.APP_ORIGIN);

    // The verifier sent to Google matches the challenge sent at login.
    const verifier = google.sentVerifier();
    expect(verifier).toBeDefined();
    expect(await codeChallenge(verifier as string)).toBe(
      location.searchParams.get('code_challenge'),
    );

    const user = await findUserByEmail(kv, EMAIL);
    expect(user).toBeDefined();
    const stored = user as User;
    expect(stored.email).toBe(EMAIL);
    expect(stored.encRefreshToken.startsWith('v1.')).toBe(true);
    expect(stored.encRefreshToken).not.toContain(REFRESH_TOKEN);
    const key = await importEncryptionKey(env.TOKEN_ENC_KEY);
    expect(await decrypt(stored.encRefreshToken, key)).toBe(REFRESH_TOKEN);

    const session = cookieNamed(response, SESSION_COOKIE);
    expect(session.split('; ').slice(1)).toEqual(
      expect.arrayContaining([
        'HttpOnly',
        'Secure',
        'SameSite=Lax',
        `Max-Age=${SESSION_TTL_SECONDS}`,
      ]),
    );
    const claims = await verifySession(
      cookieValue(session),
      env.SESSION_SECRET,
    );
    expect(claims.userId).toBe(stored.id);

    const cleared = cookieNamed(response, OAUTH_COOKIE);
    expect(cookieValue(cleared)).toBe('');
    expect(cleared).toContain('Max-Age=0');
  });

  it('updates the token of an existing user and keeps its id', async () => {
    await allow(EMAIL);
    const key = await importEncryptionKey(env.TOKEN_ENC_KEY);
    const existing: User = {
      id: 'user-existing',
      email: EMAIL,
      createdAt: '2026-01-01T00:00:00.000Z',
      vault: {
        folderId: 'FOLDER_ID',
        inboxFolderId: 'FOLDER_ID',
        name: 'Bower',
      },
      encRefreshToken: 'v1.old-iv.old-ciphertext',
      needsReauth: true,
    };
    await putUser(kv, existing);
    const app = createApp({ fetchImpl: googleStub().fetchImpl });
    const { cookie, state } = await login(app);

    const response = await callback(
      app,
      `code=test-code&state=${state}`,
      cookie,
    );

    expect(response.status).toBe(302);
    const user = (await getUser(kv, 'user-existing')) as User;
    expect(user.id).toBe('user-existing');
    expect(user.createdAt).toBe(existing.createdAt);
    expect(user.vault).toEqual(existing.vault);
    expect(user.needsReauth).toBeUndefined();
    expect(await decrypt(user.encRefreshToken, key)).toBe(REFRESH_TOKEN);
    const userKeys = (await allKeys()).filter((k) => k.startsWith('user:'));
    expect(userKeys).toEqual(['user:user-existing']);
  });

  it('rejects a state that does not match the cookie', async () => {
    await allow(EMAIL);
    const app = createApp({ fetchImpl: googleStub().fetchImpl });
    const { cookie } = await login(app);

    const response = await callback(
      app,
      'code=test-code&state=not-the-state',
      cookie,
    );

    expect(response.status).toBe(400);
    const body = await response.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('oauth_state');
    expect(await stateKeys()).toEqual([keys.allow(EMAIL)]);
  });

  it('rejects a missing cookie, a missing state, an expired cookie and an error param', async () => {
    const app = createApp({ fetchImpl: googleStub().fetchImpl });
    const { cookie, state } = await login(app);
    const expired = await signToken(
      { state, verifier: 'test-verifier' },
      env.SESSION_SECRET,
      600,
      Date.now() - 60 * 60 * 1000,
    );

    const responses = [
      await callback(app, `code=test-code&state=${state}`),
      await callback(app, 'code=test-code', cookie),
      await callback(
        app,
        `code=test-code&state=${state}`,
        `${OAUTH_COOKIE}=${expired}`,
      ),
      await callback(app, `error=access_denied&state=${state}`, cookie),
    ];

    for (const response of responses) {
      expect(response.status).toBe(400);
      const body = await response.json<{ error: { code: string } }>();
      expect(body.error.code).toBe('oauth_state');
    }
  });

  it('redirects an account not invited to the app, with only an encrypted cookie', async () => {
    const app = createApp({ fetchImpl: googleStub().fetchImpl });
    const { cookie, state } = await login(app);

    const response = await callback(
      app,
      `code=test-code&state=${state}`,
      cookie,
    );

    expect(response.status).toBe(302);
    const location = response.headers.get('location') ?? '';
    expect(location).toBe(`${env.APP_ORIGIN}/not-invited`);
    expect(location).not.toContain(EMAIL);
    expect(await response.text()).not.toContain(EMAIL);

    const notInvited = cookieNamed(response, NOT_INVITED_COOKIE);
    expect(notInvited.split('; ').slice(1)).toEqual(
      expect.arrayContaining([
        'HttpOnly',
        'Secure',
        'SameSite=Lax',
        'Path=/',
        'Max-Age=300',
      ]),
    );
    // Signed, and the address inside is encrypted: never readable as is.
    const value = cookieValue(notInvited);
    expect(value).not.toContain(EMAIL);
    const claims = await verifyToken(value, env.SESSION_SECRET);
    expect(claims.purpose).toBe('not_invited');
    expect(JSON.stringify(claims)).not.toContain(EMAIL);

    expect(setCookies(response).some((c) => c.startsWith(SESSION_COOKIE))).toBe(
      false,
    );
    const cleared = cookieNamed(response, OAUTH_COOKIE);
    expect(cleared).toContain('Max-Age=0');
    expect(await stateKeys()).toEqual([]);
  });

  it('answers 502 google_error when the token endpoint fails', async () => {
    await allow(EMAIL);
    const app = createApp({
      fetchImpl: googleStub({ tokenStatus: 400 }).fetchImpl,
    });
    const { cookie, state } = await login(app);

    const response = await callback(
      app,
      `code=test-code&state=${state}`,
      cookie,
    );

    expect(response.status).toBe(502);
    const body = await response.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('google_error');
    expect(await stateKeys()).toEqual([keys.allow(EMAIL)]);
  });
});

describe('exchangeCode', () => {
  it('fails with google_error when Google returns no refresh token', async () => {
    const promise = exchangeCode(
      {
        code: 'test-code',
        codeVerifier: 'test-verifier',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        redirectUri: `${API}/auth/callback`,
      },
      googleStub({ refreshToken: null }).fetchImpl,
    );

    await expect(promise).rejects.toMatchObject({
      status: 502,
      code: 'google_error',
      message: 'no refresh token',
    });
  });
});

describe('POST /auth/logout', () => {
  it('clears the session cookie', async () => {
    const response = await createApp().request(
      `${API}/auth/logout`,
      { method: 'POST', headers: { origin: env.APP_ORIGIN } },
      env,
    );

    expect(response.status).toBe(204);
    const cookie = cookieNamed(response, SESSION_COOKIE);
    expect(cookieValue(cookie)).toBe('');
    expect(cookie).toContain('Max-Age=0');
  });
});

describe('GET /me', () => {
  async function me(cookie?: string): Promise<Response> {
    return createApp().request(
      `${API}/me`,
      { headers: cookie === undefined ? {} : { cookie } },
      env,
    );
  }

  it('answers 401 without a session', async () => {
    const response = await me();

    expect(response.status).toBe(401);
    const body = await response.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('unauthenticated');
  });

  it('returns the signed-in user', async () => {
    await putUser(kv, {
      id: 'user-1',
      email: EMAIL,
      createdAt: '2026-01-01T00:00:00.000Z',
      encRefreshToken: 'v1.test-iv.test-ciphertext',
    });
    const today = new Date().toISOString().slice(0, 10);
    await incrQuota(kv, 'user-1', today);
    await incrQuota(kv, 'user-1', today);
    const token = await signSession({ userId: 'user-1' }, env.SESSION_SECRET);

    const response = await me(`${SESSION_COOKIE}=${token}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      email: EMAIL,
      vault: null,
      quota: { used: 2, limit: Number(env.DAILY_RUN_LIMIT) },
      needsReauth: false,
      hasApiKey: false,
    });
  });

  it('answers once with the address of an account not invited, then clears it', async () => {
    const app = createApp({ fetchImpl: googleStub().fetchImpl });
    const { cookie, state } = await login(app);
    const rejected = await callback(
      app,
      `code=test-code&state=${state}`,
      cookie,
    );
    const token = cookieValue(cookieNamed(rejected, NOT_INVITED_COOKIE));

    const response = await me(`${NOT_INVITED_COOKIE}=${token}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ notInvited: true, email: EMAIL });
    const cleared = cookieNamed(response, NOT_INVITED_COOKIE);
    expect(cookieValue(cleared)).toBe('');
    expect(cleared.split('; ').slice(1)).toEqual(
      expect.arrayContaining(['HttpOnly', 'Secure', 'Path=/', 'Max-Age=0']),
    );
  });

  it('ignores a tampered, expired or foreign not-invited cookie', async () => {
    const key = await importEncryptionKey(env.TOKEN_ENC_KEY);
    const email = await encrypt(EMAIL, key);
    const valid = await signToken(
      { purpose: 'not_invited', email },
      env.SESSION_SECRET,
      300,
    );
    const [header, , signature] = valid.split('.');
    const forged = `${header}.${base64UrlEncodeString(
      JSON.stringify({ purpose: 'not_invited', email, exp: 9999999999 }),
    )}.${signature}`;
    const expired = await signToken(
      { purpose: 'not_invited', email },
      env.SESSION_SECRET,
      300,
      Date.now() - 60 * 60 * 1000,
    );
    const otherPurpose = await signToken(
      { purpose: 'oauth', email },
      env.SESSION_SECRET,
      300,
    );
    const plaintext = await signToken(
      { purpose: 'not_invited', email: EMAIL },
      env.SESSION_SECRET,
      300,
    );

    for (const token of [forged, expired, otherPurpose, plaintext]) {
      const response = await me(`${NOT_INVITED_COOKIE}=${token}`);
      expect(response.status).toBe(401);
      const body = await response.json<{ error: { code: string } }>();
      expect(body.error.code).toBe('unauthenticated');
    }
  });

  it('answers 401 for a tampered session cookie', async () => {
    await putUser(kv, {
      id: 'user-1',
      email: EMAIL,
      createdAt: '2026-01-01T00:00:00.000Z',
      encRefreshToken: 'v1.test-iv.test-ciphertext',
    });
    const token = await signSession({ userId: 'user-1' }, env.SESSION_SECRET);
    const [header, , signature] = token.split('.');
    const payload = base64UrlEncodeString(
      JSON.stringify({ userId: 'user-2', exp: 9999999999 }),
    );
    const forged = `${header}.${payload}.${signature}`;

    const response = await me(`${SESSION_COOKIE}=${forged}`);

    expect(response.status).toBe(401);
  });
});
