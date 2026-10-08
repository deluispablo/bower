import { env as testEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { encrypt, importEncryptionKey } from '../src/crypto.js';
import type { Env } from '../src/env.js';
import { createApp } from '../src/index.js';
import { SESSION_COOKIE, signSession } from '../src/session.js';
import { allowKey } from '../src/store.js';

/**
 * A deploy reaches the Worker before its Durable Object (gradual deployment): the object lacks a method the new
 * Worker calls, and the RPC fails with a TypeError. Cloudflare: https://developers.cloudflare.com/durable-objects/
 * best-practices/rpc/ (RPC errors), https://developers.cloudflare.com/workers/configuration/versions-and-deployments/
 * gradual-deployments/ (version skew). A deploy in progress is a temporary unavailability: 503 with Retry-After, which
 * RFC 9110 15.6.4 defines for it.
 */
const env = testEnv as unknown as Env;
const kv = env.BOWER_KV;
const APP = 'https://app.example.com';
const EMAIL = 'you@example.com';

beforeEach(async () => {
  for (const { name } of (await kv.list()).keys) await kv.delete(name);
});

/** The person object, except that `method` answers as an older version without it would. */
function skewed(method: string, failure: Error = new TypeError(`The RPC receiver does not implement the method "${method}"`)): Env {
  const wrap = (stub: object): object =>
    new Proxy(stub, {
      get(target, prop) {
        if (prop === method) {
          return async () => {
            throw failure;
          };
        }
        const value = Reflect.get(target, prop) as unknown;
        return typeof value === 'function' && prop !== 'then' ? (...args: unknown[]) => (Reflect.get(target, prop) as (...a: unknown[]) => unknown)(...args) : value;
      },
    });
  const person = {
    idFromName: (name: string) => env.PERSON.idFromName(name),
    idFromString: (id: string) => env.PERSON.idFromString(id),
    get: (id: DurableObjectId) => wrap(env.PERSON.get(id)),
  };
  return { ...env, PERSON: person } as unknown as Env;
}

async function someone(): Promise<{ cookie: string; headers: Record<string, string>; runId: string }> {
  const sub = `skew-sub-${crypto.randomUUID()}`;
  await kv.put(allowKey(EMAIL), '1');
  const stub = env.PERSON.get(env.PERSON.idFromName(sub));
  const enc = await encrypt('test-refresh-token', await importEncryptionKey(env.TOKEN_ENC_KEY));
  const { generation } = await stub.signIn({ email: EMAIL, name: 'Alex', encRefreshToken: enc });
  const { epoch } = await stub.session('laptop', 'check', 0, Date.now());
  const token = await signSession({ sub, gen: generation }, env.SESSION_SECRET);
  const cookie = `${SESSION_COOKIE}=${token}`;
  const headers = { cookie, origin: APP, 'x-bower-place': 'laptop', 'x-bower-epoch': String(epoch) };
  return { cookie, headers, runId: `${env.PERSON.idFromName(sub).toString()}-run1` };
}

interface Row {
  route: string;
  method: string;
  path: string;
  /** The person-object method that fails. */
  skew: string;
  body?: unknown;
  runner?: boolean;
}

const JSON_TYPE = { 'content-type': 'application/json' };
const ROWS: Row[] = [
  // requireSession reads the account first, so every signed-in route is down when it is.
  ...(
    [
      ['GET', '/status', undefined],
      ['GET', '/me', undefined],
      ['GET', '/drive/token', undefined],
      ['POST', '/vault', undefined],
      ['DELETE', '/me', undefined],
      ['POST', '/session', { place: 'laptop', action: 'check', gen: 0 }],
      ['POST', '/process', { scope: 'all', allowWeb: false }],
    ] as const
  ).map(([method, path, body]) => ({ route: `${method} ${path}`, method, path, skew: 'account', body })),
  { route: 'GET /status', method: 'GET', path: '/status', skew: 'runStatus' },
  { route: 'GET /me', method: 'GET', path: '/me', skew: 'folderId' },
  { route: 'GET /drive/token', method: 'GET', path: '/drive/token', skew: 'folderId' },
  { route: 'POST /session', method: 'POST', path: '/session', skew: 'session', body: { place: 'laptop', action: 'check', gen: 0 } },
  { route: 'POST /vault (lease)', method: 'POST', path: '/vault', skew: 'holdsLease' },
  { route: 'POST /vault', method: 'POST', path: '/vault', skew: 'claimVault' },
  { route: 'DELETE /me (lease)', method: 'DELETE', path: '/me', skew: 'holdsLease' },
  { route: 'DELETE /me', method: 'DELETE', path: '/me', skew: 'encryptedRefreshToken' },
  { route: 'POST /process (lease)', method: 'POST', path: '/process', skew: 'holdsLease', body: { scope: 'all', allowWeb: false } },
  { route: 'POST /process', method: 'POST', path: '/process', skew: 'admit', body: { scope: 'all', allowWeb: false } },
  { route: 'POST /auth/logout', method: 'POST', path: '/auth/logout', skew: 'retireSessions' },
  { route: 'GET /runner/runs/:id/attempt', method: 'GET', path: '/runner/runs/RUN/attempt', skew: 'runnerAccess', runner: true },
  { route: 'GET /runner/runs/:id/token', method: 'GET', path: '/runner/runs/RUN/token', skew: 'runnerAccess', runner: true },
  { route: 'POST /runner/runs/:id/status', method: 'POST', path: '/runner/runs/RUN/status', skew: 'runnerReport', runner: true, body: { attempt: 1, seq: 1, phase: 'reading' } },
];

describe('person routes on a version skew', () => {
  it('a version skew answers 503 on every person route', async () => {
    const me = await someone();
    const failures: string[] = [];
    for (const row of ROWS) {
      const headers: Record<string, string> = row.runner ? { authorization: 'Bearer ticket' } : { ...me.headers };
      if (row.body !== undefined) Object.assign(headers, JSON_TYPE);
      const init: RequestInit = { method: row.method, headers };
      if (row.body !== undefined) init.body = JSON.stringify(row.body);
      const path = row.path.replace('RUN', me.runId);
      const response = await createApp().request(`${APP}${path}`, init, skewed(row.skew));
      const body = (await response.json().catch(() => null)) as { error?: { code: string } } | null;
      if (response.status !== 503 || body?.error?.code !== 'internal' || response.headers.get('retry-after') === null) {
        failures.push(`${row.route} (${row.skew}): ${response.status} ${JSON.stringify(body)} retry-after=${response.headers.get('retry-after')}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('a person object on the previous version answers 503 with Retry-After', async () => {
    const me = await someone();
    const response = await createApp().request(`${APP}/status`, { headers: me.headers }, skewed('runStatus'));
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('5');
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('internal');
  });

  it('another person object failure still answers 500', async () => {
    const me = await someone();
    const response = await createApp().request(`${APP}/status`, { headers: me.headers }, skewed('runStatus', new Error('storage failed')));
    expect(response.status).toBe(500);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('internal');
  });
});
