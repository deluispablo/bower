import { env as testEnv } from 'cloudflare:test';
import { SignJWT, createLocalJWKSet, createRemoteJWKSet, customFetch, exportJWK, generateKeyPair } from 'jose';
import type { JWK, JWTVerifyGetKey } from 'jose';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { OAUTH_COOKIE } from '../src/auth.js';
import { decrypt, encrypt, importEncryptionKey } from '../src/crypto.js';
import type { Env } from '../src/env.js';
import { GOOGLE_AUTH_URL, GOOGLE_JWKS_URL, GOOGLE_TOKEN_URL, codeChallenge } from '../src/google.js';
import type { FetchLike } from '../src/google.js';
import { createApp } from '../src/index.js';
import { SESSION_COOKIE, signSession } from '../src/session.js';
import { allowKey } from '../src/store.js';

/** `Cloudflare.Env` is empty here (no `wrangler types`), so the bindings are asserted once. */
const env = testEnv as unknown as Env;
const kv = env.BOWER_KV;
const API = 'https://app.example.com';
const EMAIL = 'you@example.com';
const REFRESH_TOKEN = 'test-refresh-token';
const ISSUER = 'https://accounts.google.com';

let signingKey: CryptoKey;
let keys: JWTVerifyGetKey;
let subCounter = 0;

beforeAll(async () => {
  // A local key set standing in for Google's JWKS: nothing reaches a network.
  const pair = await generateKeyPair('RS256', { extractable: true });
  signingKey = pair.privateKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
  keys = createLocalJWKSet({ keys: [jwk] });
});

beforeEach(async () => {
  for (const { name } of (await kv.list()).keys) await kv.delete(name);
});

/** A fresh `sub` per test: each person object lives for the whole file. */
function newSub(): string {
  subCounter += 1;
  return `test-sub-${subCounter}-${crypto.randomUUID()}`;
}

interface IdClaims {
  sub: string;
  nonce: string;
  aud?: string;
  iss?: string;
  email?: string;
  email_verified?: boolean;
  given_name?: string;
}

async function idToken(claims: IdClaims): Promise<string> {
  const { aud, iss, ...rest } = claims;
  return new SignJWT({ email: EMAIL, email_verified: true, given_name: 'Alex', ...rest })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(iss ?? ISSUER)
    .setAudience(aud ?? env.GOOGLE_CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(signingKey);
}

interface Stub {
  fetchImpl: FetchLike;
  sentVerifier: () => string | undefined;
}

/** Google's token endpoint: answers the ID token `token(nonce)` builds. */
function googleStub(token: () => Promise<string>, refreshToken: string | null = REFRESH_TOKEN): Stub {
  let verifier: string | undefined;
  const fetchImpl: FetchLike = async (input, init) => {
    if (input !== GOOGLE_TOKEN_URL) throw new Error(`unexpected fetch in test: ${input}`);
    const form = new URLSearchParams(typeof init?.body === 'string' ? init.body : '');
    verifier = form.get('code_verifier') ?? undefined;
    return Response.json({
      access_token: 'test-access-token',
      expires_in: 3599,
      token_type: 'Bearer',
      id_token: await token(),
      ...(refreshToken === null ? {} : { refresh_token: refreshToken }),
    });
  };
  return { fetchImpl, sentVerifier: () => verifier };
}

function cookieValue(response: Response, name: string): string | undefined {
  const line = response.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
  if (line === undefined) return undefined;
  const pair = line.split(';')[0] ?? '';
  return pair.slice(pair.indexOf('=') + 1);
}

interface Login { cookie: string; state: string; nonce: string; location: URL }

async function login(app: ReturnType<typeof createApp>, query = ''): Promise<Login> {
  const response = await app.request(`${API}/auth/login${query}`, {}, env);
  expect(response.status).toBe(302);
  const location = new URL(response.headers.get('location') ?? '');
  return {
    cookie: `${OAUTH_COOKIE}=${cookieValue(response, OAUTH_COOKIE) ?? ''}`,
    state: location.searchParams.get('state') ?? '',
    nonce: location.searchParams.get('nonce') ?? '',
    location,
  };
}

/** One whole sign-in: login, then the callback with the ID token `claims(nonce)` gives. */
async function signIn(
  claims: (nonce: string) => IdClaims,
  refreshToken: string | null = REFRESH_TOKEN,
): Promise<{ response: Response; stub: Stub; started: Login }> {
  let nonce = '';
  const stub = googleStub(() => idToken(claims(nonce)), refreshToken);
  const app = createApp({ fetchImpl: stub.fetchImpl, keys });
  const started = await login(app);
  nonce = started.nonce;
  const response = await app.request(
    `${API}/auth/callback?code=test-code&state=${started.state}`,
    { headers: { cookie: started.cookie } },
    env,
  );
  return { response, stub, started };
}

async function sessionOf(sub: string): Promise<string> {
  await kv.put(allowKey(EMAIL), '1');
  const { response } = await signIn((nonce) => ({ sub, nonce }));
  expect(response.status).toBe(302);
  const token = cookieValue(response, SESSION_COOKIE);
  expect(token).toBeDefined();
  return `${SESSION_COOKIE}=${token ?? ''}`;
}

async function me(cookie?: string, bindings: object = env): Promise<Response> {
  return createApp({ keys }).request(`${API}/me`, { headers: cookie === undefined ? {} : { cookie } }, bindings);
}

async function errorCode(response: Response): Promise<string> {
  return ((await response.json()) as { error: { code: string } }).error.code;
}

const FAILED = `${env.APP_ORIGIN}/sign-in?signin=failed`;
const NOT_INVITED = `${env.APP_ORIGIN}/sign-in?signin=not-invited`;
const CANCELLED = `${env.APP_ORIGIN}/sign-in?signin=cancelled`;

/** A callback answer is a redirect to the app's sign-in: never JSON, the OAuth cookie cleared. */
function expectSignInRedirect(response: Response, to: string): void {
  expect(response.status).toBe(302);
  expect(response.headers.get('location')).toBe(to);
  expect(response.headers.get('content-type') ?? '').not.toContain('json');
  expect(response.headers.getSetCookie().some((c) => c.startsWith(`${OAUTH_COOKIE}=;`) && c.includes('Max-Age=0'))).toBe(true);
  expect(cookieValue(response, SESSION_COOKIE)).toBeUndefined();
}

/** Everything `console.error` was given, walked through causes and own properties. */
function logged(spy: { mock: { calls: unknown[][] } }): string {
  const seen = new Set<unknown>();
  const walk = (value: unknown): string => {
    if (typeof value !== 'object' || value === null) return String(value);
    if (seen.has(value)) return '';
    seen.add(value);
    const parts: string[] = [];
    if (value instanceof Error) parts.push(value.name, value.message, value.stack ?? '');
    for (const key of Object.getOwnPropertyNames(value)) parts.push(key, walk((value as Record<string, unknown>)[key]));
    return parts.join(' ');
  };
  return spy.mock.calls.flat().map(walk).join(' ');
}

const person = (sub: string) => env.PERSON.get(env.PERSON.idFromName(sub));

describe('GET /auth/login', () => {
  it("sign-in always shows Google's account chooser", async () => {
    const response = await createApp({ keys }).request(`${API}/auth/login`, {}, env);
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location') ?? '');
    expect(`${location.origin}${location.pathname}`).toBe(GOOGLE_AUTH_URL);
    const p = location.searchParams;
    expect(p.get('client_id')).toBe(env.GOOGLE_CLIENT_ID);
    expect(p.get('redirect_uri')).toBe(`${env.API_ORIGIN}/auth/callback`);
    expect(p.get('response_type')).toBe('code');
    expect(p.get('scope')).toBe('openid email profile https://www.googleapis.com/auth/drive');
    expect(p.get('access_type')).toBe('offline');
    expect(p.get('code_challenge_method')).toBe('S256');
    expect(p.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(p.get('state')).toMatch(/^[A-Za-z0-9_-]{22,}$/);
    expect(p.get('nonce')).toMatch(/^[A-Za-z0-9_-]{22,}$/);
    // Always show account chooser with select_account.
    expect(p.get('prompt')).toBe('select_account');
    const line = response.headers.getSetCookie().find((c) => c.startsWith(`${OAUTH_COOKIE}=`)) ?? '';
    expect(line.split('; ').slice(1)).toEqual(
      expect.arrayContaining(['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=600']),
    );
  });

  it('the consent re-prompt also shows the account chooser', async () => {
    const { location } = await login(createApp({ keys }), '?consent=1');
    expect(location.searchParams.get('prompt')).toBe('select_account consent');
  });
});

describe('GET /auth/callback', () => {
  it('signs in: the person keyed by sub, the refresh token encrypted, a fresh session', async () => {
    const sub = newSub();
    await kv.put(allowKey(EMAIL), '1');
    const { response, stub, started } = await signIn((nonce) => ({ sub, nonce }));

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(env.APP_ORIGIN);
    // The verifier sent to Google matches the challenge sent at login.
    expect(await codeChallenge(stub.sentVerifier() ?? '')).toBe(started.location.searchParams.get('code_challenge'));
    const cookies = response.headers.getSetCookie();
    const session = cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`)) ?? '';
    expect(session.split('; ').slice(1)).toEqual(expect.arrayContaining(['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']));
    expect(cookies.some((c) => c.startsWith(`${OAUTH_COOKIE}=;`) && c.includes('Max-Age=0'))).toBe(true);

    const stored = await person(sub).encryptedRefreshToken();
    expect(stored).not.toBeNull();
    expect(stored).not.toContain(REFRESH_TOKEN);
    expect(await decrypt(stored ?? '', await importEncryptionKey(env.TOKEN_ENC_KEY))).toBe(REFRESH_TOKEN);
    expect(await person(sub).account()).toEqual({ email: EMAIL, name: 'Alex', generation: 0, accountEpoch: 0 });
  });

  it('the callback refuses an ID token with the wrong audience or nonce', async () => {
    await kv.put(allowKey(EMAIL), '1');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const wrongAudience = newSub();
      const a = await signIn((nonce) => ({ sub: wrongAudience, nonce, aud: 'another-client-id' }));
      expectSignInRedirect(a.response, FAILED);
      expect(await person(wrongAudience).account()).toBeNull();

      const wrongNonce = newSub();
      const n = await signIn(() => ({ sub: wrongNonce, nonce: 'another-nonce' }));
      expectSignInRedirect(n.response, FAILED);
      expect(await person(wrongNonce).account()).toBeNull();

      const wrongIssuer = newSub();
      const i = await signIn((nonce) => ({ sub: wrongIssuer, nonce, iss: 'https://issuer.example.com' }));
      expectSignInRedirect(i.response, FAILED);
    } finally {
      log.mockRestore();
    }
  });

  it('refuses a state that does not match the sign-in it started', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const app = createApp({ fetchImpl: googleStub(() => idToken({ sub: newSub(), nonce: 'x' })).fetchImpl, keys });
      const { cookie } = await login(app);
      const response = await app.request(`${API}/auth/callback?code=test-code&state=another-state`, { headers: { cookie } }, env);
      expectSignInRedirect(response, FAILED);
    } finally {
      log.mockRestore();
    }
  });

  it('a person not on the allowlist is refused at the callback', async () => {
    const sub = newSub();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { response } = await signIn((nonce) => ({ sub, nonce }));
      expectSignInRedirect(response, NOT_INVITED);
      // Nothing is kept for someone who was not invited.
      expect(await person(sub).account()).toBeNull();
      expect(await person(sub).encryptedRefreshToken()).toBeNull();

      // An unverified address is not trusted against the allowlist either.
      await kv.put(allowKey(EMAIL), '1');
      const unverified = await signIn((nonce) => ({ sub, nonce, email_verified: false }));
      expectSignInRedirect(unverified.response, NOT_INVITED);
      expect(await person(sub).account()).toBeNull();
      expect(await person(sub).encryptedRefreshToken()).toBeNull();
      expect(log.mock.calls).toHaveLength(2);
      for (const call of log.mock.calls) {
        expect(call).toEqual([expect.stringContaining('sign-in not-invited:'), expect.any(Error)]);
      }
      expect(logged(log)).not.toContain(EMAIL);
    } finally {
      log.mockRestore();
    }
  });

  it('a cancelled sign-in returns to the app saying so', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const app = createApp({ keys });
      const { cookie } = await login(app);
      const response = await app.request(
        `${API}/auth/callback?error=access_denied&state=anything`,
        { headers: { cookie } },
        env,
      );
      expectSignInRedirect(response, CANCELLED);
      // Details go to the log only.
      expect(logged(log)).toContain('access_denied');
      // Any other error Google reports is a failure, not a cancellation.
      const other = await app.request(`${API}/auth/callback?error=server_error`, { headers: { cookie } }, env);
      expectSignInRedirect(other, FAILED);
    } finally {
      log.mockRestore();
    }
  });

  it('a failed sign-in returns to the app saying so', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const app = createApp({ fetchImpl: googleStub(() => idToken({ sub: newSub(), nonce: 'x' })).fetchImpl, keys });
      const { cookie, state } = await login(app);
      // No code or state, no OAuth cookie, a state from another sign-in.
      expectSignInRedirect(await app.request(`${API}/auth/callback`, { headers: { cookie } }, env), FAILED);
      expectSignInRedirect(await app.request(`${API}/auth/callback?code=c&state=${state}`, {}, env), FAILED);
      expectSignInRedirect(await app.request(`${API}/auth/callback?code=c&state=other`, { headers: { cookie } }, env), FAILED);
      // Google's token endpoint refuses the code (PKCE or a used code).
      const refused = createApp({
        fetchImpl: async () => Response.json({ error: 'invalid_grant' }, { status: 400 }),
        keys,
      });
      expectSignInRedirect(await refused.request(`${API}/auth/callback?code=c&state=${state}`, { headers: { cookie } }, env), FAILED);
      // Google's token endpoint is down.
      const down = createApp({ fetchImpl: async () => { throw new Error('offline-detail'); }, keys });
      expectSignInRedirect(await down.request(`${API}/auth/callback?code=c&state=${state}`, { headers: { cookie } }, env), FAILED);
      expect(logged(log)).toContain('offline-detail');
    } finally {
      log.mockRestore();
    }
  });

  it('a failure reading Google signing keys sends the person back to sign in and logs an outage', async () => {
    await kv.put(allowKey(EMAIL), '1');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      let nonce = '';
      const stub = googleStub(() => idToken({ sub: newSub(), nonce }));
      const unreachable = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL), {
        [customFetch]: async () => { throw new Error('keys-unreachable'); },
      });
      const app = createApp({ fetchImpl: stub.fetchImpl, keys: unreachable });
      const started = await login(app);
      nonce = started.nonce;
      const response = await app.request(
        `${API}/auth/callback?code=test-code&state=${started.state}`,
        { headers: { cookie: started.cookie } },
        env,
      );
      expectSignInRedirect(response, FAILED);
      expect(logged(log)).toMatch(/outage/i);
    } finally {
      log.mockRestore();
    }
  });

  it('an address on the allowlist in another case signs in, and only ASCII letters fold', async () => {
    await kv.put(allowKey('kim@example.com'), '1');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const upper = await signIn((nonce) => ({ sub: newSub(), nonce, email: 'KIM@Example.COM' }));
      expect(upper.response.status).toBe(302);
      expect(upper.response.headers.get('location')).toBe(env.APP_ORIGIN);
      // The Kelvin sign (U+212A) lowercases to "k" under Unicode rules: it must not match.
      const kelvin = await signIn((nonce) => ({ sub: newSub(), nonce, email: '\u212Aim@example.com' }));
      expectSignInRedirect(kelvin.response, NOT_INVITED);
    } finally {
      log.mockRestore();
    }
  });

  it('a returning person without a stored refresh token is sent back for consent', async () => {
    const sub = newSub();
    await kv.put(allowKey(EMAIL), '1');
    const { response } = await signIn((nonce) => ({ sub, nonce }), null);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${env.API_ORIGIN}/auth/login?consent=1`);
    expect(cookieValue(response, SESSION_COOKIE)).toBeUndefined();

    // With a token kept, a later sign-in without one keeps it.
    await sessionOf(sub);
    const again = await signIn((nonce) => ({ sub, nonce }), null);
    expect(again.response.status).toBe(302);
    expect(again.response.headers.get('location')).toBe(env.APP_ORIGIN);
    expect(await person(sub).encryptedRefreshToken()).not.toBeNull();
  });

  it('an unreadable refresh token signs the person out and the next sign-in asks for consent', async () => {
    // A refresh token kept under a key the Worker no longer has (TOKEN_ENC_KEY rotated).
    const oldKey = await importEncryptionKey(btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))));
    const unreadable = await encrypt(REFRESH_TOKEN, oldKey);
    const sub = newSub();
    const cookie = await sessionOf(sub);
    await person(sub).pointFolder((await person(sub).account())?.generation ?? -1, null, 'FOLDER_ID');
    await person(sub).signIn({ email: EMAIL, name: 'Alex', encRefreshToken: unreadable });
    const before = (await person(sub).account())?.generation ?? -1;

    // Its Drive token call signs the person out, never 500.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const token = await createApp({ keys }).request(`${API}/drive/token`, { headers: { cookie } }, env);
      expect(token.status).toBe(401);
      expect(await errorCode(token)).toBe('signed-out');
      expect(token.headers.getSetCookie().some((c) => c.startsWith(`${SESSION_COOKIE}=;`))).toBe(true);
      expect((await person(sub).account())?.generation).toBe(before + 1);
      expect(await person(sub).encryptedRefreshToken()).toBeNull();
      expect((await me(cookie)).status).toBe(401);

      // Signing in before any token call: the unreadable token is not kept, and Google is asked for consent.
      await person(sub).signIn({ email: EMAIL, name: 'Alex', encRefreshToken: unreadable });
      const again = await signIn((nonce) => ({ sub, nonce }), null);
      expect(again.response.status).toBe(302);
      expect(again.response.headers.get('location')).toBe(`${env.API_ORIGIN}/auth/login?consent=1`);
      expect(cookieValue(again.response, SESSION_COOKIE)).toBeUndefined();
      expect(await person(sub).encryptedRefreshToken()).toBeNull();
      expect(logged(spy)).not.toContain(REFRESH_TOKEN);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('sessions', () => {
  it('GET /me answers signed-out without a session', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const none = await me();
      expect(none.status).toBe(401);
      expect(await errorCode(none)).toBe('signed-out');

      const forged = await me(`${SESSION_COOKIE}=not-a-session`);
      expect(forged.status).toBe(401);
      expect(await errorCode(forged)).toBe('signed-out');
      // The rejected cookie is cleared.
      expect(forged.headers.getSetCookie().some((c) => c.startsWith(`${SESSION_COOKIE}=;`))).toBe(true);

      // A well-signed session for someone who never signed in is refused too.
      const stranger = await signSession({ sub: newSub() }, env.SESSION_SECRET);
      expect((await me(`${SESSION_COOKIE}=${stranger}`)).status).toBe(401);

      const signedIn = await me(await sessionOf(newSub()));
      expect(signedIn.status).toBe(200);
      expect(await signedIn.json()).toEqual({ user: { name: 'Alex', email: EMAIL }, folderId: null });
    } finally {
      log.mockRestore();
    }
  });

  it('logout retires every other cookie for that person', async () => {
    const sub = newSub();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const phone = await sessionOf(sub);
      const laptop = await sessionOf(sub);
      const other = await sessionOf(newSub());
      expect((await me(phone)).status).toBe(200);
      expect((await me(laptop)).status).toBe(200);

      const out = await createApp({ keys }).request(
        `${API}/auth/logout`,
        { method: 'POST', headers: { cookie: laptop, origin: env.APP_ORIGIN } },
        env,
      );
      expect(out.status).toBe(204);
      expect(out.headers.getSetCookie().some((c) => c.startsWith(`${SESSION_COOKIE}=;`) && c.includes('Max-Age=0'))).toBe(true);

      for (const cookie of [phone, laptop]) {
        const after = await me(cookie);
        expect(after.status).toBe(401);
        expect(await errorCode(after)).toBe('signed-out');
      }
      // Someone else's session is untouched, and signing in again works.
      expect((await me(other)).status).toBe(200);
      expect((await me(await sessionOf(sub))).status).toBe(200);
    } finally {
      log.mockRestore();
    }
  });

  it.each(['missing', 'retired', 'expired'] as const)('logout with a stale session (%s) clears the cookie', async (session) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const sub = newSub();
      const cookie = await sessionOf(sub);
      if (session === 'retired') await env.PERSON.get(env.PERSON.idFromName(sub)).retireSessions();
      const staleCookie = session === 'expired'
        ? `${SESSION_COOKIE}=${await signSession({ sub }, env.SESSION_SECRET, Date.now() - 31 * 24 * 60 * 60 * 1000)}`
        : cookie;
      const headers: Record<string, string> = session === 'missing'
        ? { origin: env.APP_ORIGIN } : { origin: env.APP_ORIGIN, cookie: staleCookie };
      const out = await createApp({ keys }).request(`${API}/auth/logout`, { method: 'POST', headers }, env);
      expect(out.status).toBe(204);
      expect(out.headers.getSetCookie().some((c) => c.startsWith(`${SESSION_COOKIE}=;`) && c.includes('Max-Age=0'))).toBe(true);
    } finally {
      log.mockRestore();
    }
  });

  it('logout from another origin is refused', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const cookie = await sessionOf(newSub());
      const out = await createApp({ keys }).request(
        `${API}/auth/logout`,
        { method: 'POST', headers: { cookie, origin: 'https://elsewhere.example.com' } },
        env,
      );
      expect(out.status).toBe(403);
      expect((await me(cookie)).status).toBe(200);
    } finally {
      log.mockRestore();
    }
  });

  it('a session signed with the previous secret still works during a rotation', async () => {
    const sub = newSub();
    await sessionOf(sub);
    const previous = 'test-previous-secret-at-least-32-bytes';
    const old = await signSession({ sub }, previous);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect((await me(`${SESSION_COOKIE}=${old}`)).status).toBe(401);
    } finally {
      log.mockRestore();
    }
    const rotated = { ...env, SESSION_SECRET_PREVIOUS: previous };
    expect((await me(`${SESSION_COOKIE}=${old}`, rotated)).status).toBe(200);
  });

  it('an error reaching the person object answers internal with no cause', async () => {
    const cookie = await sessionOf(newSub());
    const broken = {
      ...env,
      PERSON: {
        idFromName: (name: string) => env.PERSON.idFromName(name),
        get: () => ({ account: () => Promise.reject(new Error('person-object-detail')) }),
      },
    };
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const response = await me(cookie, broken);
      expect(response.status).toBe(500);
      const text = await response.text();
      expect(JSON.parse(text)).toEqual({
        error: { code: 'internal', message: "Something went wrong on Bower's side. Try again later." },
      });
      expect(text).not.toContain('person-object-detail');
      expect(log.mock.calls.flat().map(String).join(' ')).toContain('person-object-detail');
    } finally {
      log.mockRestore();
    }
  });
});

describe('cookie names', () => {
  it('the session and sign-in cookies carry the __Host- prefix', async () => {
    expect(SESSION_COOKIE).toBe('__Host-bower_session');
    expect(OAUTH_COOKIE).toBe('__Host-bower_oauth');

    const start = await createApp({ keys }).request(`${API}/auth/login`, {}, env);
    const line = start.headers.getSetCookie().find((c) => c.startsWith('__Host-bower_oauth=')) ?? '';
    const attributes = line.split('; ').slice(1);
    expect(attributes).toEqual(expect.arrayContaining(['Secure', 'Path=/']));
    expect(attributes.some((a) => /^Domain=/i.test(a))).toBe(false);
    expect(attributes).not.toContain('Path=/auth');

    // The old names are expired on the next response, so everyone is signed out once.
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const old = await me('bower_session=old-token');
      expect(old.status).toBe(401);
      const cleared = old.headers.getSetCookie();
      expect(cleared.some((c) => c.startsWith('bower_session=;') && c.includes('Max-Age=0') && c.includes('Path=/'))).toBe(true);
    } finally {
      log.mockRestore();
    }
    const again = await createApp({ keys }).request(`${API}/auth/login`, { headers: { cookie: 'bower_oauth=old' } }, env);
    expect(
      again.headers.getSetCookie().some((c) => c.startsWith('bower_oauth=;') && c.includes('Max-Age=0') && c.includes('Path=/auth')),
    ).toBe(true);
  });
});
