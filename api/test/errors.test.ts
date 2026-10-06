/// <reference types="vite/client" />
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { ERROR_CODES, HttpError, createErrorHandler } from '../src/errors.js';
import type { Variables } from '../src/errors.js';

/**
 * A small app, separate from the real one, that wires up only the error
 * middleware plus routes that throw on purpose — enough to exercise
 * `createErrorHandler` over real HTTP without adding test-only routes to
 * the production app.
 */
function buildTestApp(): Hono<{ Variables: Variables }> {
  const app = new Hono<{ Variables: Variables }>();

  app.use('*', async (c, next) => {
    c.set('requestId', 'test-request-id');
    await next();
  });
  app.onError(createErrorHandler<{ Variables: Variables }>());

  app.get('/http-error', () => {
    throw new HttpError(400, 'forbidden', 'Missing field');
  });
  app.get('/unknown-error', () => {
    throw new Error('unexpected failure, with a stack trace attached');
  });

  return app;
}

describe('errorHandler', () => {
  it('maps a thrown HttpError to its status and JSON body', async () => {
    const response = await buildTestApp().request('/http-error');

    expect(response.status).toBe(400);
    expect(response.headers.get('x-request-id')).toBe('test-request-id');
    await expect(response.json()).resolves.toEqual({
      error: { code: 'forbidden', message: 'Missing field' },
    });
  });

  it('maps an unknown error to 500 without leaking the stack', async () => {
    const response = await buildTestApp().request('/unknown-error');

    expect(response.status).toBe(500);
    const body: unknown = await response.json();
    expect(body).toEqual({
      error: { code: 'internal', message: 'Internal error' },
    });
    expect(JSON.stringify(body)).not.toContain('stack');
  });
});

/** Every source file of the Worker, as text (vite inlines them at build time). */
const sources = import.meta.glob('../src/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** The codes the Worker spec names in docs/specs/2026-10-04-worker-contract.md. */
const CONTRACT_CODES = ['no-folder', 'nothing', 'stale-session'];
/**
 * Generic codes the contract does not list yet (reported to the technical
 * lead). They are kebab-case now; this list shrinks as the contract grows.
 */
const PENDING_CONTRACT_CODES = [
  'config',
  'forbidden',
  'internal',
  'not-found',
  'payload-too-large',
  'rate-limited',
  'unsupported-media-type',
];

describe('error codes', () => {
  it('every error code the Worker emits is in the contract and kebab-case', () => {
    const emitted = new Set<string>();
    for (const [file, text] of Object.entries(sources)) {
      for (const m of text.matchAll(/new HttpError\(\s*\d+,\s*'([^']+)'/g)) emitted.add(m[1] as string);
      for (const m of text.matchAll(/error:\s*\{\s*code:\s*'([^']+)'/g)) emitted.add(m[1] as string);
      expect(file).toBeTruthy();
    }
    expect(emitted.size).toBeGreaterThan(0);
    const known = new Set([...CONTRACT_CODES, ...PENDING_CONTRACT_CODES]);
    for (const code of emitted) {
      expect(code, `${code} is kebab-case`).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(known.has(code), `${code} is in the contract`).toBe(true);
    }
    // The exported list is the one source of truth and matches the source scan.
    for (const code of ERROR_CODES) expect(code).toMatch(/^[a-z]+(-[a-z]+)*$/);
    for (const code of emitted) expect(ERROR_CODES as readonly string[]).toContain(code);
  });
});
