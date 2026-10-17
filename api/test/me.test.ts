import { env as testEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { encrypt, importEncryptionKey } from '../src/crypto.js';
import type { Env } from '../src/env.js';
import { GOOGLE_REVOKE_URL } from '../src/google.js';
import type { FetchLike } from '../src/google.js';
import { createApp } from '../src/index.js';
import { SCHEMA_VERSION } from '../src/person-schema.js';
import { SESSION_COOKIE, signSession } from '../src/session.js';
import { allowKey } from '../src/store.js';

const env = testEnv as unknown as Env;
const kv = env.BOWER_KV;
const APP = 'https://app.example.com';
const EMAIL = 'you@example.com';
const REFRESH_TOKEN = 'test-refresh-token';

beforeEach(async () => {
  for (const { name } of (await kv.list()).keys) await kv.delete(name);
});

const person = (sub: string) => env.PERSON.get(env.PERSON.idFromName(sub));

async function someone(): Promise<{ sub: string; cookie: string; epoch: number }> {
  const sub = `me-sub-${crypto.randomUUID()}`;
  await kv.put(allowKey(EMAIL), '1');
  const enc = await encrypt(REFRESH_TOKEN, await importEncryptionKey(env.TOKEN_ENC_KEY));
  const { generation } = await person(sub).signIn({ email: EMAIL, name: 'Alex', encRefreshToken: enc });
  await person(sub).pointFolder(generation, null, 'FOLDER_ID');
  const { epoch } = await person(sub).session('laptop', 'check', 0, Date.now());
  const token = await signSession({ sub, gen: generation }, env.SESSION_SECRET);
  return { sub, cookie: `${SESSION_COOKIE}=${token}`, epoch };
}

interface Google {
  fetchImpl: FetchLike;
  urls: string[];
  revokes: URLSearchParams[];
}

function google(status = 200): Google {
  const urls: string[] = [];
  const revokes: URLSearchParams[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    urls.push(input);
    if (input !== GOOGLE_REVOKE_URL) throw new Error(`unexpected fetch in test: ${input}`);
    revokes.push(new URLSearchParams(typeof init?.body === 'string' ? init.body : ''));
    return new Response(status === 200 ? '{}' : 'oops', { status });
  };
  return { fetchImpl, urls, revokes };
}

async function del(g: Google, cookie: string, fence: Record<string, string> = {}): Promise<Response> {
  return await createApp({ fetchImpl: g.fetchImpl }).request(
    `${APP}/me`,
    { method: 'DELETE', headers: { cookie, origin: APP, ...fence } },
    env,
  );
}

const fenceOf = (epoch: number) => ({ 'x-bower-place': 'laptop', 'x-bower-epoch': String(epoch) });
const getMe = async (cookie: string) => await createApp().request(`${APP}/me`, { headers: { cookie } }, env);

describe('DELETE /me', () => {
  it('delete me needs the session epoch', async () => {
    const { sub, cookie, epoch } = await someone();
    const g = google();
    for (const fence of [{}, fenceOf(epoch + 1), { 'x-bower-place': 'phone', 'x-bower-epoch': String(epoch) }]) {
      const r = await del(g, cookie, fence);
      expect(r.status).toBe(409);
      expect(((await r.json()) as { error: { code: string } }).error.code).toBe('stale-session');
    }
    expect(g.revokes).toHaveLength(0);
    expect(await person(sub).account()).not.toBeNull();
    expect(await person(sub).folderId()).toBe('FOLDER_ID');
    expect((await getMe(cookie)).status).toBe(200);
  });

  it('delete me revokes the Google grant even if Google fails', async () => {
    const { cookie, epoch } = await someone();
    const g = google(500);
    const r = await del(g, cookie, fenceOf(epoch));
    expect(r.status).toBe(204);
    expect(g.revokes).toHaveLength(1);
    expect(g.revokes[0]?.getAll('token')).toEqual([REFRESH_TOKEN]);
  });

  it('delete me forgets the person and clears the cookie', async () => {
    const { sub, cookie, epoch } = await someone();
    const g = google();
    const r = await del(g, cookie, fenceOf(epoch));
    expect(r.status).toBe(204);
    expect(r.headers.get('set-cookie') ?? '').toMatch(new RegExp(`${SESSION_COOKIE}=;.*Max-Age=0`, 'i'));
    const again = await getMe(cookie);
    expect(again.status).toBe(401);
    expect(((await again.json()) as { error: { code: string } }).error.code).toBe('signed-out');
    expect(await person(sub).account()).toBeNull();
    expect(await person(sub).folderId()).toBeNull();
    expect(await person(sub).holdsLease('laptop', epoch)).toBe(false);
  });

  it('signing in again after delete me starts at the folder step', async () => {
    const { sub, cookie, epoch } = await someone();
    const g = google();
    expect((await del(g, cookie, fenceOf(epoch))).status).toBe(204);
    const p = person(sub);
    const result = await p.signIn({ email: EMAIL, name: 'Alex', encRefreshToken: null });
    expect(result.hasRefreshToken).toBe(false);
    expect(await p.schemaVersion()).toBe(SCHEMA_VERSION);
    expect(await p.account()).not.toBeNull();
    expect(await p.folderId()).toBeNull();
    expect(g.urls.some((u) => u.includes('googleapis.com/drive'))).toBe(false);
  });

  it('a cookie from before delete me stays refused after signing in again', async () => {
    const { sub, cookie, epoch } = await someone();
    const other = `${SESSION_COOKIE}=${await signSession({ sub, gen: 0 }, env.SESSION_SECRET)}`;
    expect((await getMe(other)).status).toBe(200);
    expect((await del(google(), cookie, fenceOf(epoch))).status).toBe(204);
    const { generation } = await person(sub).signIn({ email: EMAIL, name: 'Alex', encRefreshToken: null });
    expect((await getMe(other)).status).toBe(401);
    const fresh = `${SESSION_COOKIE}=${await signSession({ sub, gen: generation }, env.SESSION_SECRET)}`;
    expect((await getMe(fresh)).status).toBe(200);
  });
});
