/// <reference types="vite/client" />
import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { ERROR_CODES, GENERAL_ERRORS, HttpError, createErrorHandler } from '../src/errors.js';
import { createApp } from '../src/index.js';
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
    throw new HttpError(409, 'no-folder', 'Missing field');
  });
  app.get('/unknown-error', () => {
    throw new Error('unexpected failure, with a stack trace attached');
  });

  return app;
}

describe('errorHandler', () => {
  it('maps a thrown HttpError to its status and JSON body', async () => {
    const response = await buildTestApp().request('/http-error');

    expect(response.status).toBe(409);
    expect(response.headers.get('x-request-id')).toBe('test-request-id');
    await expect(response.json()).resolves.toEqual({
      error: { code: 'no-folder', message: 'Missing field' },
    });
  });

  it('maps an unknown error to 500 without leaking the stack', async () => {
    const response = await buildTestApp().request('/unknown-error');

    expect(response.status).toBe(500);
    const body: unknown = await response.json();
    expect(body).toEqual({
      error: { code: 'internal', message: "Something went wrong on Bower's side. Try again later." },
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

/** The contract, as text: the general-codes table is the one list the Worker may use. */
const contracts = import.meta.glob('../../docs/specs/2026-10-04-worker-contract.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const contract = Object.values(contracts)[0] ?? '';

interface Row {
  status: number;
  code: string;
  message: string;
}

/** The rows of the general-codes table: `| 401 | `signed-out` | when | "message" |`. */
function generalRows(): Row[] {
  const rows: Row[] = [];
  for (const m of contract.matchAll(/^\|\s*(\d{3})\s*\|\s*`([a-z-]+)`\s*\|[^|]*\|\s*"([^"]+)"\s*\|\s*$/gm)) {
    rows.push({ status: Number(m[1]), code: m[2] as string, message: m[3] as string });
  }
  return rows;
}

/** Codes the contract names for single calls (`409 \`no-folder\``, `409 \`nothing\``). */
function routeCodes(): string[] {
  const codes = new Set<string>();
  for (const m of contract.matchAll(/\d{3}\s+`([a-z]+(?:-[a-z]+)*)`/g)) codes.add(m[1] as string);
  return [...codes];
}

describe('error codes', () => {
  it('every error code the Worker emits is in the contract and kebab-case', () => {
    const rows = generalRows();
    expect(rows.length).toBe(7);
    const emitted = new Set<string>();
    for (const [file, text] of Object.entries(sources)) {
      for (const m of text.matchAll(/new HttpError\(\s*\d+,\s*'([^']+)'/g)) emitted.add(m[1] as string);
      for (const m of text.matchAll(/error:\s*\{\s*code:\s*'([^']+)'/g)) emitted.add(m[1] as string);
      expect(file).toBeTruthy();
    }
    expect(emitted.size).toBeGreaterThan(0);
    const known = new Set([...rows.map((r) => r.code), ...routeCodes()]);
    expect(known.has('config'), 'config is not a code').toBe(false);
    for (const code of emitted) {
      expect(code, `${code} is kebab-case`).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(known.has(code), `${code} is in the contract`).toBe(true);
    }
    // The exported list is a subset of the contract's, and covers every emitted code.
    for (const code of ERROR_CODES) expect(known.has(code), `${code} is in the contract`).toBe(true);
    for (const code of emitted) expect(ERROR_CODES as readonly string[]).toContain(code);
    // Each general code carries the table's status and message, word for word.
    expect(Object.entries(GENERAL_ERRORS).map(([code, v]) => ({ code, ...v })).sort((a, b) => a.status - b.status)).toEqual(
      [...rows].sort((a, b) => a.status - b.status),
    );
    // No emitted general code passes its own message: the table's is used.
    for (const text of Object.values(sources)) {
      for (const m of text.matchAll(/new HttpError\(\s*\d+,\s*'([^']+)',\s*(['`"])/g)) {
        expect(GENERAL_ERRORS, `${m[1]} takes the table's message`).not.toHaveProperty(m[1] as string);
      }
    }
  });

  it('a missing secret answers internal and names no cause', async () => {
    const without: Record<string, unknown> = { ...env, SESSION_SECRET: undefined };
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const res = await createApp().request('/health', {}, without);
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({
        error: { code: 'internal', message: "Something went wrong on Bower's side. Try again later." },
      });
      expect(text).not.toMatch(/SESSION_SECRET|missing|config/i);
      // The cause is for the log only.
      expect(log.mock.calls.flat().map(String).join(' ')).toContain('missing SESSION_SECRET');
    } finally {
      log.mockRestore();
    }
  });

  it('a SESSION_SECRET shorter than 32 bytes is refused at startup', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const short = { ...(env as unknown as Record<string, unknown>), SESSION_SECRET: 'x'.repeat(31) };
      const res = await createApp().request('/health', {}, short);
      expect(res.status).toBe(500);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe('internal');
      const ok = { ...short, SESSION_SECRET: 'x'.repeat(32) };
      expect((await createApp().request('/health', {}, ok)).status).toBe(200);
    } finally {
      log.mockRestore();
    }
  });

  it('a missing person binding is refused at startup', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const without: Record<string, unknown> = { ...env, PERSON: undefined };
      const res = await createApp().request('/health', {}, without);
      expect(res.status).toBe(500);
    } finally {
      log.mockRestore();
    }
  });
});
