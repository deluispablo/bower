import { env as testEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import wrangler from '../wrangler.jsonc?raw';
import github from '../src/github.ts?raw';
import personSource from '../src/person.ts?raw';
import { OAUTH_COOKIE } from '../src/auth.js';
import { assertEnv } from '../src/env.js';
import type { Env } from '../src/env.js';
import { createApp } from '../src/index.js';
import { QUEUED_STALE_MS } from '../src/process.js';
import { TICKET_TTL_MS } from '../src/run-ticket.js';
import { signToken } from '../src/session.js';

const base = testEnv as unknown as Env;
const ORIGIN = 'https://app.example.com';
const UNUSED = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'ADMIN_KEY', 'DEFAULT_MAX_TURNS'];

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => { vi.restoreAllMocks(); });

describe('audit-worker-tidy', () => {
  it('AC1 audit-worker-tidy-ticket-ttl: a ticket outlives the longest queue wait plus the job timeout', () => {
    // Queued up to two stale windows (the alarm's one grace for a live job), then the workflow's 30-minute timeout.
    expect(TICKET_TTL_MS).toBeGreaterThanOrEqual(2 * QUEUED_STALE_MS + 30 * 60_000);
  });

  it('AC2 audit-worker-tidy-unused-settings: no push, admin or turn settings are read or configured', () => {
    const source = Object.fromEntries(Object.entries(base).filter(([key]) => !UNUSED.includes(key)));
    const env = assertEnv(source) as unknown as Record<string, unknown>;
    for (const key of UNUSED) {
      expect(key in env, key).toBe(false);
      expect(key in (base as unknown as Record<string, unknown>), key).toBe(false);
      expect(wrangler, key).not.toContain(`"${key}"`);
    }
  });

  it('AC3 audit-worker-tidy-one-key-check: the configuration refuses a key the encryption would refuse', () => {
    // Forgiving base64 reads 43 unpadded characters as 32 bytes; importEncryptionKey refuses them.
    expect(() => assertEnv({ ...base, TOKEN_ENC_KEY: 'A'.repeat(43) })).toThrow();
  });

  it('AC4 audit-worker-tidy-callback-limited: a rate-limited sign-in callback lands on the sign-in page', async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const env = { ...base, AUTH_RATE_LIMIT: { limit } };
    const oauth = await signToken({ state: 'test', nonce: 'test', verifier: 'test' }, base.SESSION_SECRET, 600);
    const r = await createApp().request(`${ORIGIN}/auth/callback?code=test&state=test`, {
      headers: { 'CF-Connecting-IP': '192.0.2.1', cookie: `${OAUTH_COOKIE}=${oauth}` },
    }, env);
    expect(limit).toHaveBeenCalledTimes(1);
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe(`${base.APP_ORIGIN}/sign-in?signin=failed`);
  });

  it('AC5 audit-worker-tidy-no-dead-fallbacks: a Referer is no Origin, and the dead copies are gone', async () => {
    const r = await createApp().request(`${ORIGIN}/auth/logout`, { method: 'POST', headers: { referer: `${base.APP_ORIGIN}/settings` } }, base);
    expect(r.status).toBe(403);
    expect(github).not.toMatch(/export async function dispatchTidy\b/);
    expect(personSource).not.toMatch(/timingSafeEqual\(row\.hash, hash\)/);
  });
});
