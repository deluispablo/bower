import { env as testEnv } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import type { Env } from '../src/env.js';
import { createApp } from '../src/index.js';
import {
  SESSION_COOKIE,
  SessionError,
  signSession,
  verifySession,
} from '../src/session.js';
import type { SessionErrorCode } from '../src/session.js';
import { putUser } from '../src/store.js';

/** See auth.test.ts: the bindings from wrangler.toml and vitest.config.ts. */
const env = testEnv as unknown as Env;

const SECRET = 'test-session-secret-not-a-real-one';
const OTHER_SECRET = 'another-test-session-secret';
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

/** Resolves to the `SessionError` code the promise rejects with. */
async function sessionErrorCode(
  promise: Promise<unknown>,
): Promise<SessionErrorCode> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof SessionError) return err.code;
    throw err;
  }
  throw new Error('Expected a SessionError, but the promise resolved');
}

describe('verifySession with SESSION_SECRET_PREVIOUS (grace window)', () => {
  it('accepts a token signed with the current secret when a previous one is also set', async () => {
    const token = await signSession({ userId: 'user-123' }, SECRET, NOW);
    const session = await verifySession(token, SECRET, NOW, OTHER_SECRET);
    expect(session.userId).toBe('user-123');
  });

  it('falls back to the previous secret when the current one does not verify', async () => {
    const token = await signSession({ userId: 'user-123' }, OTHER_SECRET, NOW);
    const session = await verifySession(token, SECRET, NOW, OTHER_SECRET);
    expect(session.userId).toBe('user-123');
  });

  it('rejects a token signed with neither the current nor the previous secret', async () => {
    const token = await signSession(
      { userId: 'user-123' },
      'a-third-secret-entirely',
      NOW,
    );
    expect(
      await sessionErrorCode(verifySession(token, SECRET, NOW, OTHER_SECRET)),
    ).toBe('bad_signature');
  });

  it('without a previous secret, a token signed with another secret is rejected as before', async () => {
    const token = await signSession({ userId: 'user-123' }, OTHER_SECRET, NOW);
    expect(await sessionErrorCode(verifySession(token, SECRET, NOW))).toBe(
      'bad_signature',
    );
  });

  it('does not retry an expired token against the previous secret', async () => {
    // Signed with the current secret, so the first attempt fails on expiry,
    // not on signature — the retry only ever fires for `bad_signature`. If
    // it retried here anyway, OTHER_SECRET would fail differently
    // (`bad_signature`, since it never signed this token), which is what
    // would make this test catch that regression.
    const token = await signSession({ userId: 'user-123' }, SECRET, NOW);
    const expiry = NOW + 31 * 24 * 60 * 60 * 1000; // past the 30-day TTL
    expect(
      await sessionErrorCode(
        verifySession(token, SECRET, expiry, OTHER_SECRET),
      ),
    ).toBe('expired');
  });

  it('does not retry a malformed token against the previous secret', async () => {
    expect(
      await sessionErrorCode(
        verifySession('not-a-token', SECRET, NOW, OTHER_SECRET),
      ),
    ).toBe('malformed');
  });
});

describe('GET /me honours SESSION_SECRET_PREVIOUS end to end', () => {
  const EMAIL = 'you@example.com';

  async function me(env: Env, cookie?: string): Promise<Response> {
    return createApp().request(
      'https://api.example.com/me',
      { headers: cookie === undefined ? {} : { cookie } },
      env,
    );
  }

  it('keeps an old cookie signed in during the rotation window, then rejects it once the window closes', async () => {
    await putUser(env.BOWER_KV, {
      id: 'user-rotation',
      email: EMAIL,
      createdAt: '2026-01-01T00:00:00.000Z',
      encRefreshToken: 'v1.test-iv.test-ciphertext',
    });
    const oldToken = await signSession(
      { userId: 'user-rotation' },
      env.SESSION_SECRET,
    );
    const cookie = `${SESSION_COOKIE}=${oldToken}`;

    // The operator rotates SESSION_SECRET, carrying the old value forward
    // as SESSION_SECRET_PREVIOUS (docs/runbook.md, "Hardening your
    // instance"). The old cookie still works.
    const duringWindow: Env = {
      ...env,
      SESSION_SECRET: 'freshly-rotated-session-secret',
      SESSION_SECRET_PREVIOUS: env.SESSION_SECRET,
    };
    const stillSignedIn = await me(duringWindow, cookie);
    expect(stillSignedIn.status).toBe(200);
    expect(await stillSignedIn.json()).toMatchObject({ email: EMAIL });

    // 24 hours later the operator deletes SESSION_SECRET_PREVIOUS. The same
    // old cookie is now just a token signed with an unknown secret.
    const afterWindow: Env = {
      ...env,
      SESSION_SECRET: 'freshly-rotated-session-secret',
    };
    const signedOut = await me(afterWindow, cookie);
    expect(signedOut.status).toBe(401);
  });

  it('a session signed with the new secret works with or without SESSION_SECRET_PREVIOUS set', async () => {
    await putUser(env.BOWER_KV, {
      id: 'user-rotation-2',
      email: EMAIL,
      createdAt: '2026-01-01T00:00:00.000Z',
      encRefreshToken: 'v1.test-iv.test-ciphertext',
    });
    const rotatedSecret = 'freshly-rotated-session-secret';
    const withPrevious: Env = {
      ...env,
      SESSION_SECRET: rotatedSecret,
      SESSION_SECRET_PREVIOUS: env.SESSION_SECRET,
    };
    const withoutPrevious: Env = { ...env, SESSION_SECRET: rotatedSecret };
    const newToken = await signSession(
      { userId: 'user-rotation-2' },
      rotatedSecret,
    );
    const cookie = `${SESSION_COOKIE}=${newToken}`;

    expect((await me(withPrevious, cookie)).status).toBe(200);
    expect((await me(withoutPrevious, cookie)).status).toBe(200);
  });
});
