/**
 * sec-hardening L5 (ruling 5): the cached Drive access token is kept encrypted with TOKEN_ENC_KEY, as the refresh token
 * is; a cached value from before (plaintext) or under another key reads as a miss and is refetched, never forgetting access.
 */
import { env as testEnv, runInDurableObject } from 'cloudflare:test';
import { beforeEach, expect, it } from 'vitest';

import { encrypt, importEncryptionKey } from '../src/crypto.js';
import type { Env } from '../src/env.js';
import { GOOGLE_TOKEN_URL } from '../src/google.js';
import type { FetchLike } from '../src/google.js';
import { createApp } from '../src/index.js';
import { SESSION_COOKIE, signSession } from '../src/session.js';
import { allowKey } from '../src/store.js';

const env = testEnv as unknown as Env;
const EMAIL = 'you@example.com';
const HOUR = 3600_000;

beforeEach(async () => {
  for (const { name } of (await env.BOWER_KV.list()).keys) await env.BOWER_KV.delete(name);
});

const person = (sub: string) => env.PERSON.get(env.PERSON.idFromName(sub));

async function someone(): Promise<{ sub: string; cookie: string }> {
  const sub = `sec-sub-${crypto.randomUUID()}`;
  await env.BOWER_KV.put(allowKey(EMAIL), '1');
  const enc = await encrypt('test-refresh-token', await importEncryptionKey(env.TOKEN_ENC_KEY));
  const { generation } = await person(sub).signIn({ email: EMAIL, name: 'Alex', encRefreshToken: enc });
  await person(sub).pointFolder(generation, null, 'FOLDER_ID');
  return { sub, cookie: `${SESSION_COOKIE}=${await signSession({ sub, gen: generation }, env.SESSION_SECRET)}` };
}

/** Google's token endpoint, each refresh a new access token, and the number of refreshes. */
function google(): { fetchImpl: FetchLike; refreshes: () => number } {
  let n = 0;
  return {
    fetchImpl: async (input) => {
      if (input !== GOOGLE_TOKEN_URL) throw new Error(`unexpected fetch in test: ${input}`);
      n += 1;
      return Response.json({ access_token: `access-${n}`, expires_in: 3599, token_type: 'Bearer' });
    },
    refreshes: () => n,
  };
}

const token = async (g: ReturnType<typeof google>, cookie: string): Promise<string> => {
  const response = await createApp({ fetchImpl: g.fetchImpl }).request('https://app.example.com/drive/token', { headers: { cookie } }, env);
  expect(response.status).toBe(200);
  return ((await response.json()) as { accessToken: string }).accessToken;
};

const stored = (sub: string) => runInDurableObject(person(sub), (_instance, state) =>
  state.storage.sql.exec<{ access_token: string | null }>('SELECT access_token FROM account WHERE id = 1').one().access_token);
const seed = (sub: string, value: string) => runInDurableObject(person(sub), (_instance, state) => {
  state.storage.sql.exec('UPDATE account SET access_token = ?, access_expires_at = ? WHERE id = 1', value, Date.now() + HOUR);
});

it('L5 sec-hardening-token-at-rest: the cached access token is stored encrypted and read back transparently', async () => {
  const { sub, cookie } = await someone();
  const g = google();
  expect(await token(g, cookie)).toBe('access-1');
  const column = await stored(sub);
  expect(column, 'a token is kept').not.toBeNull();
  expect(column, 'never the plaintext').not.toContain('access-1');
  expect(column).toMatch(/^v1\./);
  expect(await token(g, cookie), 'read back from the cache').toBe('access-1');
  expect(g.refreshes(), 'the cache answered the second time').toBe(1);
});

it.each([
  ['a plaintext token cached before', async () => 'access-plain'],
  ['a token encrypted under another key', async () => encrypt('access-other', await importEncryptionKey(btoa('made-up-key-for-tests-only-32by!')))],
])('L5 sec-hardening-token-unreadable: %s reads as a miss and is refetched; access is never forgotten', async (_name, value) => {
  const { sub, cookie } = await someone();
  await seed(sub, await value());
  const refresh = await person(sub).encryptedRefreshToken();
  const generation = (await person(sub).account())?.generation;
  const g = google();
  expect(await token(g, cookie)).toBe('access-1');
  expect(g.refreshes(), 'refetched from Google').toBe(1);
  expect(await person(sub).encryptedRefreshToken(), 'the refresh token is kept').toBe(refresh);
  expect((await person(sub).account())?.generation, 'no session is retired').toBe(generation);
  expect(await stored(sub), 'the fresh token is kept encrypted').toMatch(/^v1\./);
});
