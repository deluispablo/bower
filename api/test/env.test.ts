import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/index.js';
import { assertEnv } from '../src/env.js';
import type { AppEnv } from '../src/env.js';
import { HttpError } from '../src/errors.js';

/**
 * Every secret and every var-without-a-default, valid. Omits `BOWER_KV`
 * (unused by `/health`, and not part of this contract's string checks) and
 * the vars that fall back to a default when absent.
 */
function validRawEnv(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    GOOGLE_CLIENT_ID: 'test-google-client-id',
    GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
    SESSION_SECRET: 'test-session-secret',
    // base64 of 32 zero bytes — a fixture, not a real key.
    TOKEN_ENC_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    GITHUB_TOKEN: 'test-github-token',
    ADMIN_KEY: 'test-admin-key',
    VAPID_PUBLIC_KEY: 'test-vapid-public-key',
    VAPID_PRIVATE_KEY: 'test-vapid-private-key',
    APP_ORIGIN: 'https://app.example.com',
    API_ORIGIN: 'https://api.example.com',
    GITHUB_REPO: 'OWNER/bower-home',
    VAPID_SUBJECT: 'mailto:you@example.com',
    ...overrides,
  };
}

function withoutKey(
  env: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const clone = { ...env };
  delete clone[key];
  return clone;
}

function expectConfigError(fn: () => unknown, message: string): void {
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(HttpError);
  const httpError = caught as HttpError;
  expect(httpError.status).toBe(500);
  expect(httpError.code).toBe('config');
  expect(httpError.message).toBe(message);
}

describe('assertEnv', () => {
  it('applies defaults on the happy path', () => {
    const result = assertEnv(validRawEnv());

    expect(result.GOOGLE_CLIENT_ID).toBe('test-google-client-id');
    expect(result.DAILY_RUN_LIMIT).toBe('100');
    expect(result.DEFAULT_MAX_TURNS).toBe('30');
    expect(result.TEMPLATE_FOLDER_NAME).toBe('Bower');
  });

  it('names the first missing secret', () => {
    expectConfigError(
      () => assertEnv(withoutKey(validRawEnv(), 'GOOGLE_CLIENT_ID')),
      'missing GOOGLE_CLIENT_ID',
    );
  });

  it('rejects a TOKEN_ENC_KEY that does not decode to exactly 32 bytes', () => {
    expectConfigError(
      () => assertEnv(validRawEnv({ TOKEN_ENC_KEY: 'AAAA' })),
      'invalid TOKEN_ENC_KEY: must be base64 for exactly 32 bytes',
    );
  });

  it('rejects a non-numeric DAILY_RUN_LIMIT', () => {
    expectConfigError(
      () => assertEnv(validRawEnv({ DAILY_RUN_LIMIT: 'many' })),
      'invalid DAILY_RUN_LIMIT: must be a whole number',
    );
  });
});

/**
 * A throwaway app, separate from the real one, that wires up only
 * `assertEnv`'s middleware plus a route reading `c.get('env')` — enough to
 * prove the validated (defaults-applied) env reaches handlers through the
 * context, without adding a test-only route to the production app.
 */
function buildEnvProbeApp(): Hono<AppEnv> {
  const probeApp = new Hono<AppEnv>();

  probeApp.use('*', (c, next) => {
    c.set('env', assertEnv(c.env));
    return next();
  });
  probeApp.get('/probe', (c) => {
    return c.json({ dailyRunLimit: c.get('env').DAILY_RUN_LIMIT });
  });

  return probeApp;
}

describe('env in context', () => {
  it('exposes the DAILY_RUN_LIMIT default through c.get("env") when bindings omit it', async () => {
    const response = await buildEnvProbeApp().request(
      '/probe',
      undefined,
      validRawEnv(),
    );

    await expect(response.json()).resolves.toEqual({ dailyRunLimit: '100' });
  });
});

describe('GET /health with a missing secret', () => {
  it('returns the config-error shape', async () => {
    // `SELF.fetch` (used in health.test.ts) always runs against the
    // pool's shared Miniflare bindings from vitest.config.ts — there is no
    // per-test way to remove one binding from it. Hono's
    // `app.request(path, init, env)` runs the same app instance with
    // bindings passed explicitly, so we use that instead for this case.
    const response = await createApp().request(
      '/health',
      undefined,
      withoutKey(validRawEnv(), 'GOOGLE_CLIENT_ID'),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'config', message: 'missing GOOGLE_CLIENT_ID' },
    });
  });
});
