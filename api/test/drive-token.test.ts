import { env as testEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { decrypt, encrypt, importEncryptionKey } from '../src/crypto.js';
import type { Env } from '../src/env.js';
import { GOOGLE_TOKEN_URL } from '../src/google.js';
import type { FetchLike } from '../src/google.js';
import { createApp } from '../src/index.js';
import { SESSION_COOKIE, signSession } from '../src/session.js';
import { allowKey } from '../src/store.js';

const env = testEnv as unknown as Env;
const kv = env.BOWER_KV;
const API = 'https://app.example.com';
const EMAIL = 'you@example.com';
const REFRESH_TOKEN = 'test-refresh-token';
const HOUR = 3600_000;

let counter = 0;

beforeEach(async () => {
  for (const { name } of (await kv.list()).keys) await kv.delete(name);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const person = (sub: string) => env.PERSON.get(env.PERSON.idFromName(sub));

/** A signed-in person (allowed, refresh token kept) and their session cookie. */
async function someone(options: { folder?: boolean; allowed?: boolean } = {}): Promise<{ sub: string; cookie: string }> {
  counter += 1;
  const sub = `drive-sub-${counter}-${crypto.randomUUID()}`;
  if (options.allowed !== false) await kv.put(allowKey(EMAIL), '1');
  const enc = await encrypt(REFRESH_TOKEN, await importEncryptionKey(env.TOKEN_ENC_KEY));
  const { generation } = await person(sub).signIn({ email: EMAIL, name: 'Alex', encRefreshToken: enc });
  if (options.folder !== false) await person(sub).pointFolder(generation, null, 'FOLDER_ID');
  const token = await signSession({ sub, gen: generation }, env.SESSION_SECRET);
  return { sub, cookie: `${SESSION_COOKIE}=${token}` };
}

interface Google {
  fetchImpl: FetchLike;
  calls: URLSearchParams[];
}

/** Google's token endpoint: each refresh answers a new access token. */
function google(answer: (n: number) => Response = (n) => Response.json({ access_token: `access-${n}`, expires_in: 3599, token_type: 'Bearer' })): Google {
  const calls: URLSearchParams[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    if (input !== GOOGLE_TOKEN_URL) throw new Error(`unexpected fetch in test: ${input}`);
    calls.push(new URLSearchParams(typeof init?.body === 'string' ? init.body : ''));
    return answer(calls.length);
  };
  return { fetchImpl, calls };
}

async function token(g: Google, cookie: string, query = ''): Promise<Response> {
  return await createApp({ fetchImpl: g.fetchImpl }).request(`${API}/drive/token${query}`, { headers: { cookie } }, env);
}

async function errorCode(response: Response): Promise<string> {
  return ((await response.json()) as { error: { code: string } }).error.code;
}

describe('GET /drive/token', () => {
  it('drive token answers no-folder before a folder exists', async () => {
    const { cookie } = await someone({ folder: false });
    const g = google();
    const response = await token(g, cookie);
    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe('no-folder');
    expect(g.calls).toHaveLength(0);
    // And a request with no session is signed out.
    const anonymous = await createApp().request(`${API}/drive/token`, {}, env);
    expect(anonymous.status).toBe(401);
  });

  it('drive token is minted from the stored refresh token and lasts at most an hour', async () => {
    const { sub, cookie } = await someone();
    const g = google();
    const before = Date.now();
    const response = await token(g, cookie);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { accessToken: string; expiresAt: number };
    expect(body.accessToken).toBe('access-1');
    expect(body.expiresAt).toBeGreaterThan(before);
    expect(body.expiresAt).toBeLessThanOrEqual(Date.now() + HOUR);
    // Google was asked with the decrypted refresh token and this client.
    expect(g.calls).toHaveLength(1);
    expect(g.calls[0]?.get('grant_type')).toBe('refresh_token');
    expect(g.calls[0]?.get('refresh_token')).toBe(REFRESH_TOKEN);
    expect(g.calls[0]?.get('client_id')).toBe(env.GOOGLE_CLIENT_ID);
    // The stored token is encrypted, never the plain one.
    const stored = await person(sub).encryptedRefreshToken();
    expect(stored).not.toBe(REFRESH_TOKEN);
    expect(await decrypt(stored ?? '', await importEncryptionKey(env.TOKEN_ENC_KEY))).toBe(REFRESH_TOKEN);
    // A second call is served from the person's cache.
    const again = (await (await token(g, cookie)).json()) as { accessToken: string; expiresAt: number };
    expect(again).toEqual(body);
    expect(g.calls).toHaveLength(1);
  });

  it('the expiry counts from before Google was asked', async () => {
    const { cookie } = await someone();
    let asked = 0;
    const g = google(() => Response.json({ access_token: 'slow', expires_in: 3599 }));
    const slow: FetchLike = async (input, init) => {
      asked = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 30));
      return g.fetchImpl(input, init);
    };
    const response = await createApp({ fetchImpl: slow }).request(`${API}/drive/token`, { headers: { cookie } }, env);
    const body = (await response.json()) as { expiresAt: number };
    expect(body.expiresAt).toBeLessThanOrEqual(asked + 3599_000);
  });

  it('forgetting Google access keeps a refresh token that a newer sign-in left', async () => {
    const { sub } = await someone();
    const key = await importEncryptionKey(env.TOKEN_ENC_KEY);
    const read = await person(sub).encryptedRefreshToken();
    // Meanwhile the person signs in again and Google sends a new refresh token.
    const newer = await encrypt('newer-refresh-token', key);
    await person(sub).signIn({ email: EMAIL, name: 'Alex', encRefreshToken: newer });
    expect(await person(sub).forgetGoogleAccess(read ?? '')).toBe(false);
    expect(await person(sub).encryptedRefreshToken()).toBe(newer);
    expect((await person(sub).account())?.generation).toBe(0);
    // With the token it read, it forgets.
    expect(await person(sub).forgetGoogleAccess(newer)).toBe(true);
    expect(await person(sub).encryptedRefreshToken()).toBeNull();
    expect((await person(sub).account())?.generation).toBe(1);
  });

  it('a lifetime longer than an hour is cut to an hour', async () => {
    const { cookie } = await someone();
    const g = google(() => Response.json({ access_token: 'long', expires_in: 86400 }));
    const body = (await (await token(g, cookie)).json()) as { expiresAt: number };
    expect(body.expiresAt).toBeLessThanOrEqual(Date.now() + HOUR);
  });

  it('a fresh drive token skips the cache', async () => {
    const { cookie } = await someone();
    const g = google();
    expect(((await (await token(g, cookie)).json()) as { accessToken: string }).accessToken).toBe('access-1');
    const fresh = (await (await token(g, cookie, '?fresh=1')).json()) as { accessToken: string };
    expect(fresh.accessToken).toBe('access-2');
    expect(g.calls).toHaveLength(2);
    // The new token is the cached one now.
    expect(((await (await token(g, cookie)).json()) as { accessToken: string }).accessToken).toBe('access-2');
    expect(g.calls).toHaveLength(2);
  });

  it('a revoked refresh token signs the person out and retires their sessions', async () => {
    const { sub, cookie } = await someone();
    const g = google(() => Response.json({ error: 'invalid_grant' }, { status: 400 }));
    const response = await token(g, cookie);
    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie().some((c) => c.startsWith(`${SESSION_COOKIE}=;`))).toBe(true);
    expect(await errorCode(response)).toBe('signed-out');
    expect((await person(sub).account())?.generation).toBe(1);
    expect(await person(sub).encryptedRefreshToken()).toBeNull();
    // The old cookie is retired.
    const next = await createApp().request(`${API}/me`, { headers: { cookie } }, env);
    expect(next.status).toBe(401);
  });

  it('another Google failure is internal and no token reaches the log', async () => {
    const { cookie } = await someone();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const g = google(() => Response.json({ error: 'server_error', refresh_token: REFRESH_TOKEN }, { status: 503 }));
    const failed = await token(g, cookie);
    expect(failed.status).toBe(500);
    expect(await errorCode(failed)).toBe('internal');
    const ok = google();
    await token(ok, cookie);
    const text = JSON.stringify(spy.mock.calls.map((call) => call.map((x) => (x instanceof Error ? `${x.message} ${x.stack ?? ''} ${String(x.cause)}` : String(x)))));
    expect(text).not.toContain(REFRESH_TOKEN);
    expect(text).not.toContain('access-1');
  });
});

describe('the allowlist on every session', () => {
  it('removing someone from the allowlist ends their sessions', async () => {
    const { cookie } = await someone();
    const app = createApp();
    expect((await app.request(`${API}/me`, { headers: { cookie } }, env)).status).toBe(200);
    await kv.delete(allowKey(EMAIL));
    const response = await app.request(`${API}/me`, { headers: { cookie } }, env);
    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe('signed-out');
    expect(response.headers.getSetCookie().some((c) => c.startsWith(`${SESSION_COOKIE}=;`))).toBe(true);
    // The drive token is refused too.
    expect((await token(google(), cookie)).status).toBe(401);
  });
});
