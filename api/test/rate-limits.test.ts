import { env as testEnv } from 'cloudflare:test';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { encrypt, importEncryptionKey } from '../src/crypto.js';
import type { Env } from '../src/env.js';
import { createApp } from '../src/index.js';
import { OAUTH_COOKIE } from '../src/auth.js';
import { SESSION_COOKIE, signSession, signToken } from '../src/session.js';
import { allowKey } from '../src/store.js';

const base = testEnv as unknown as Env;
const ORIGIN = 'https://app.example.com';

/** Deterministic binding double: Cloudflare owns the counter in production. */
function binding(max: number) {
  const counts = new Map<string, number>();
  const limit = vi.fn(async ({ key }: { key: string }) => {
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    return { success: count <= max };
  });
  return { limit, counts };
}

function setup() {
  const auth = binding(20);
  const drive = binding(30);
  const vault = binding(60);
  // Keep the vars read from wrangler.jsonc; no test-only production switch.
  const env = { ...base, AUTH_RATE_LIMIT: auth, DRIVE_RATE_LIMIT: drive, VAULT_RATE_LIMIT: vault };
  const fetchImpl = vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/token')) return Response.json({ access_token: 'access-test', expires_in: 3599 });
    if (url.pathname === '/drive/v3/files/FOLDER_ID') {
      return Response.json({ id: 'FOLDER_ID', name: 'Bower', mimeType: 'application/vnd.google-apps.folder', trashed: false });
    }
    if (url.pathname === '/drive/v3/files') return Response.json({ files: [] });
    throw new Error(`Unexpected test request: ${input}`);
  });
  return { auth, drive, vault, env, fetchImpl, app: createApp({ fetchImpl, pacing: { baseMs: 0 } }) };
}

async function someone() {
  const sub = `rate-sub-${crypto.randomUUID()}`;
  await base.BOWER_KV.put(allowKey('you@example.com'), '1');
  const person = base.PERSON.get(base.PERSON.idFromName(sub));
  const enc = await encrypt('test-refresh-token', await importEncryptionKey(base.TOKEN_ENC_KEY));
  const { generation } = await person.signIn({ email: 'you@example.com', name: 'Alex', encRefreshToken: enc });
  await person.setFolderId('FOLDER_ID');
  await person.markFolderComplete(generation, 'FOLDER_ID');
  const { epoch } = await person.session('laptop', 'take', 0, Date.now());
  const cookie = `${SESSION_COOKIE}=${await signSession({ sub, gen: generation }, base.SESSION_SECRET)}`;
  return { sub, person, headers: { cookie, origin: ORIGIN, 'CF-Connecting-IP': '192.0.2.1',
    'x-bower-place': 'laptop', 'x-bower-epoch': String(epoch) } };
}

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => { vi.restoreAllMocks(); });

it('a route over its rate limit is refused', async () => {
  const s = setup();
  const response = () => s.app.request(`${ORIGIN}/auth/login`, { headers: { 'CF-Connecting-IP': '192.0.2.1' } }, s.env);
  for (let n = 0; n < 20; n++) expect((await response()).status).toBe(302);
  const refused = await response();
  expect(refused.status).toBe(429);
  expect(await refused.json()).toMatchObject({ error: { code: 'rate-limited' } });
  expect(refused.headers.get('Retry-After')).toMatch(/^[1-9]\d*$/);
  expect(Number(refused.headers.get('Retry-After'))).toBeLessThanOrEqual(60);
  expect((await s.app.request(`${ORIGIN}/auth/login`, { headers: { 'CF-Connecting-IP': '192.0.2.2' } }, s.env)).status).toBe(302);
});

it('missing CF-Connecting-IP shares one bucket despite rotating X-Forwarded-For', async () => {
  const s = setup();
  const response = (n: number) => s.app.request(`${ORIGIN}/auth/login`, {
    headers: { 'X-Forwarded-For': `198.51.100.${n}, 203.0.113.1` },
  }, s.env);
  for (let n = 1; n <= 20; n++) expect((await response(n)).status).toBe(302);
  const refused = await response(21);
  expect(refused.status).toBe(429);
  expect(await refused.json()).toMatchObject({ error: { code: 'rate-limited' } });
  expect(s.auth.counts.size).toBe(1);
  expect([...s.auth.counts.values()]).toEqual([21]);
  // Omitting the spoofed header still uses that same missing-address bucket.
  expect((await s.app.request(`${ORIGIN}/auth/login`, {}, s.env)).status).toBe(429);
  expect(s.auth.counts.size).toBe(1);
  // The trusted address gets a separate bucket even with a reused forwarding header.
  expect((await s.app.request(`${ORIGIN}/auth/login`, {
    headers: { 'CF-Connecting-IP': '192.0.2.1', 'X-Forwarded-For': '198.51.100.1, 203.0.113.1' },
  }, s.env)).status).toBe(302);
  for (let n = 2; n <= 20; n++) {
    expect((await s.app.request(`${ORIGIN}/auth/login`, {
      headers: { 'CF-Connecting-IP': '192.0.2.1', 'X-Forwarded-For': `203.0.113.${n}` },
    }, s.env)).status).toBe(302);
  }
  expect((await s.app.request(`${ORIGIN}/auth/login`, {
    headers: { 'CF-Connecting-IP': '192.0.2.1', 'X-Forwarded-For': '203.0.113.21' },
  }, s.env)).status).toBe(429);
  expect(s.auth.counts.size).toBe(2);
  expect([...s.auth.counts.values()]).toEqual([22, 21]);
});

it.each(['missing', 'invalid', 'retired', 'expired'] as const)(
  'logout without a current session (%s) clears the cookie without counting', async (session) => {
    const s = setup();
    const alex = await someone();
    if (session === 'retired') await alex.person.retireSessions();
    const { cookie, ...headers } = alex.headers;
    const staleCookie = session === 'expired'
      ? `${SESSION_COOKIE}=${await signToken({ sub: alex.sub }, base.SESSION_SECRET, -60)}`
      : session === 'invalid' ? `${SESSION_COOKIE}=not-a-session` : cookie;
    const logoutHeaders = session === 'missing' ? headers : { ...headers, cookie: staleCookie };
    for (let n = 0; n < 20; n++) {
      const out = await s.app.request(`${ORIGIN}/auth/logout`, {
        method: 'POST', headers: logoutHeaders,
      }, s.env);
      expect(out.status).toBe(204);
      expect(out.headers.getSetCookie().some((c) => c.startsWith(`${SESSION_COOKIE}=;`) && c.includes('Max-Age=0'))).toBe(true);
    }
    expect(s.auth.limit).not.toHaveBeenCalled();
    expect((await s.app.request(`${ORIGIN}/auth/login`, { headers }, s.env)).status).toBe(302);
    expect(s.auth.limit).toHaveBeenCalledTimes(1);
    // A valid logout at the same address retires the session and spends one request.
    const signedIn = await someone();
    const generation = (await signedIn.person.account())?.generation;
    expect(generation).toBeDefined();
    expect((await s.app.request(`${ORIGIN}/auth/logout`, {
      method: 'POST', headers: signedIn.headers,
    }, s.env)).status).toBe(204);
    expect(s.auth.limit).toHaveBeenCalledTimes(2);
    expect([...s.auth.counts.values()]).toEqual([2]);
    expect((await signedIn.person.account())?.generation).toBe((generation ?? -1) + 1);
  },
);

it.each([{ path: '/drive/token', max: 30, method: 'GET' }, { path: '/vault', max: 60, method: 'POST' }])(
  '$path uses its per-person limit after the session check', async ({ path, max, method }) => {
    const s = setup();
    const alex = await someone();
    const response = (headers = alex.headers) => s.app.request(`${ORIGIN}${path}`, { method, headers }, s.env);
    for (let n = 0; n < max; n++) expect((await response()).status).toBe(200);
    // A different address and a fresh session for the same subject still share the bucket.
    const cookie = `${SESSION_COOKIE}=${await signSession({ sub: alex.sub, gen: 0 }, base.SESSION_SECRET)}`;
    const refused = await response({ ...alex.headers, cookie, 'CF-Connecting-IP': '192.0.2.2' });
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ error: { code: 'rate-limited' } });
    expect(refused.headers.get('Retry-After')).toMatch(/^[1-9]\d*$/);
    expect(Number(refused.headers.get('Retry-After'))).toBeLessThanOrEqual(60);
    expect((await response((await someone()).headers)).status).toBe(200);
    const counter = path === '/vault' ? s.vault : s.drive;
    expect(counter.counts.size).toBe(2);
    expect((path === '/vault' ? s.drive : s.vault).limit).not.toHaveBeenCalled();
  },
);

it('requests refused by session, origin, lease or folder checks are not counted', async () => {
  const s = setup();
  const alex = await someone();
  expect((await s.app.request(`${ORIGIN}/drive/token`, {}, s.env)).status).toBe(401);
  expect((await s.app.request(`${ORIGIN}/vault`, { method: 'POST', headers: { ...alex.headers, origin: 'https://elsewhere.example' } }, s.env)).status).toBe(403);
  expect((await s.app.request(`${ORIGIN}/vault`, { method: 'POST', headers: { ...alex.headers, 'x-bower-epoch': '999' } }, s.env)).status).toBe(409);
  await alex.person.setFolderId(null);
  expect((await s.app.request(`${ORIGIN}/drive/token`, { headers: alex.headers }, s.env)).status).toBe(409);
  await base.BOWER_KV.delete(allowKey('you@example.com'));
  expect((await s.app.request(`${ORIGIN}/drive/token`, { headers: alex.headers }, s.env)).status).toBe(401);
  expect(s.drive.limit).not.toHaveBeenCalled();
  expect(s.vault.limit).not.toHaveBeenCalled();
});

it('OAuth checks precede counting and a callback refusal lands on the sign-in', async () => {
  const s = setup();
  expect((await s.app.request(`${ORIGIN}/auth/callback?code=test&state=test`, {}, s.env)).status).toBe(302);
  expect((await s.app.request(`${ORIGIN}/auth/callback?error=access_denied`, {}, s.env)).status).toBe(302);
  expect((await s.app.request(`${ORIGIN}/auth/logout`, { method: 'POST' }, s.env)).status).toBe(403);
  expect(s.auth.limit).not.toHaveBeenCalled();
  const headers = { 'CF-Connecting-IP': '192.0.2.1' };
  for (let n = 0; n < 20; n++) expect((await s.app.request(`${ORIGIN}/auth/login`, { headers }, s.env)).status).toBe(302);
  const oauth = await signToken({ state: 'test', nonce: 'test', verifier: 'test' }, base.SESSION_SECRET, 600);
  const refused = await s.app.request(`${ORIGIN}/auth/callback?code=test&state=test`, {
    headers: { ...headers, cookie: `${OAUTH_COOKIE}=${oauth}` },
  }, s.env);
  expect(refused.status).toBe(302);
  expect(refused.headers.get('location')).toBe(`${base.APP_ORIGIN}/sign-in?signin=failed`);
  expect(refused.headers.getSetCookie().some((c) => c.startsWith(`${OAUTH_COOKIE}=;`) && c.includes('Max-Age=0'))).toBe(true);
  expect(s.fetchImpl).not.toHaveBeenCalled();
  const alex = await someone();
  const generation = (await alex.person.account())?.generation;
  const logout = await s.app.request(`${ORIGIN}/auth/logout`, { method: 'POST', headers: alex.headers }, s.env);
  expect(logout.status).toBe(429);
  expect((await alex.person.account())?.generation).toBe(generation);
});

it.each(['missing', 'throwing'] as const)(
  'production configuration fails closed with a %s auth binding', async (failure) => {
    const s = setup();
    expect((await s.app.request(`${ORIGIN}/auth/login`, {}, s.env)).status).toBe(302);
    const limit = vi.fn(async () => { throw new Error('binding unavailable'); });
    const env = { ...s.env, AUTH_RATE_LIMIT: failure === 'missing' ? undefined : { limit } };
    const refused = await s.app.request(`${ORIGIN}/auth/login`, {}, env);
    expect(refused.status).toBe(500);
    expect(await refused.json()).toMatchObject({ error: { code: 'internal' } });
    expect(refused.headers.get('location')).toBeNull();
    expect(s.auth.limit).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledTimes(failure === 'missing' ? 0 : 1);
    expect(s.fetchImpl).not.toHaveBeenCalled();
  },
);

it.each(['missing', 'throwing'] as const)(
  'a valid OAuth callback fails closed with a %s binding', async (failure) => {
    const s = setup();
    // Reuse the auth suite's local Google signing fixture for a full successful control.
    const pair = await generateKeyPair('RS256', { extractable: true });
    const keys = createLocalJWKSet({ keys: [{
      ...(await exportJWK(pair.publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig',
    }] });
    const sub = `rate-sub-${crypto.randomUUID()}`;
    const idToken = await new SignJWT({
      sub, nonce: 'test', email: 'you@example.com', email_verified: true, given_name: 'Alex',
    }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer('https://accounts.google.com').setAudience(base.GOOGLE_CLIENT_ID)
      .setIssuedAt().setExpirationTime('1h').sign(pair.privateKey);
    await base.BOWER_KV.put(allowKey('you@example.com'), '1');
    s.fetchImpl.mockResolvedValueOnce(Response.json({
      access_token: 'access-test', expires_in: 3599, id_token: idToken, refresh_token: 'test-refresh-token',
    }));
    const app = createApp({ fetchImpl: s.fetchImpl, keys });
    const oauth = await signToken({ state: 'test', nonce: 'test', verifier: 'test' }, base.SESSION_SECRET, 600);
    const headers = { 'CF-Connecting-IP': '192.0.2.1', cookie: `${OAUTH_COOKIE}=${oauth}` };
    const url = `${ORIGIN}/auth/callback?code=test&state=test`;
    const allowed = await app.request(url, { headers }, s.env);
    expect(allowed.status).toBe(302);
    expect(allowed.headers.get('location')).toBe(ORIGIN);
    expect(allowed.headers.getSetCookie().some((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`))).toBe(true);
    expect(s.auth.limit).toHaveBeenCalledTimes(1);
    expect(s.fetchImpl).toHaveBeenCalledTimes(1);
    const person = base.PERSON.get(base.PERSON.idFromName(sub));
    const generation = (await person.account())?.generation;
    expect(generation).toBeDefined();
    s.fetchImpl.mockClear();
    const limit = vi.fn(async () => { throw new Error('binding unavailable'); });
    const env = { ...s.env, AUTH_RATE_LIMIT: failure === 'missing' ? undefined : { limit } };
    const refused = await app.request(url, { headers }, env);
    expect(refused.status).toBe(500);
    expect(await refused.json()).toMatchObject({ error: { code: 'internal' } });
    expect(refused.headers.get('location')).toBeNull();
    expect(s.fetchImpl).not.toHaveBeenCalled();
    expect(s.auth.limit).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledTimes(failure === 'missing' ? 0 : 1);
    expect((await person.account())?.generation).toBe(generation);
    expect(refused.headers.getSetCookie().some((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`))).toBe(false);
  },
);

it('/process retains admission daily quota without the new minute limits', async () => {
  const s = setup();
  const alex = await someone();
  for (const limiter of [s.auth, s.drive, s.vault]) limiter.limit.mockResolvedValue({ success: false });
  const response = await s.app.request(`${ORIGIN}/process`, {
    method: 'POST',
    headers: { ...alex.headers, 'content-type': 'application/json' },
    body: JSON.stringify({ scope: 'all', allowWeb: false, requestId: 'press-1' }),
  }, { ...s.env, DAILY_RUN_LIMIT: '0' });
  expect(response.status).toBe(429);
  expect(await response.json()).toMatchObject({ error: { code: 'rate-limited' } });
  expect(s.fetchImpl).not.toHaveBeenCalled();
  for (const limiter of [s.auth, s.drive, s.vault]) expect(limiter.limit).not.toHaveBeenCalled();
});
