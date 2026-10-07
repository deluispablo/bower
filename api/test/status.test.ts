import { env as testEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { encrypt, importEncryptionKey } from '../src/crypto.js';
import type { Env } from '../src/env.js';
import { createApp } from '../src/index.js';
import { SESSION_COOKIE, signSession } from '../src/session.js';
import { allowKey } from '../src/store.js';

const env = testEnv as unknown as Env;
const kv = env.BOWER_KV;
const API = 'https://app.example.com';
const EMAIL = 'you@example.com';
const REFRESH_TOKEN = 'test-refresh-token';

let counter = 0;

beforeEach(async () => {
  for (const { name } of (await kv.list()).keys) await kv.delete(name);
});

const person = (sub: string) => env.PERSON.get(env.PERSON.idFromName(sub));

/** A signed-in person (allowed, refresh token kept) and their session cookie. */
async function someone(options: { allowed?: boolean } = {}): Promise<{ sub: string; cookie: string }> {
  counter += 1;
  const sub = `status-sub-${counter}-${crypto.randomUUID()}`;
  if (options.allowed !== false) await kv.put(allowKey(EMAIL), '1');
  const enc = await encrypt(REFRESH_TOKEN, await importEncryptionKey(env.TOKEN_ENC_KEY));
  const { generation } = await person(sub).signIn({ email: EMAIL, name: 'Alex', encRefreshToken: enc });
  const token = await signSession({ sub, gen: generation }, env.SESSION_SECRET);
  return { sub, cookie: `${SESSION_COOKIE}=${token}` };
}

describe('GET /status', () => {
  it('status answers no run for a signed-in person', async () => {
    const { cookie } = await someone();
    const app = createApp();
    const response = await app.request(`${API}/status`, { headers: { cookie } }, env);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { run: null };
    expect(body.run).toBeNull();
  });

  it('status without a session answers signed-out', async () => {
    const app = createApp();
    const response = await app.request(`${API}/status`, {}, env);
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('signed-out');
  });
});
