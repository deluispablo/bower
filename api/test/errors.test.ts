import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { HttpError, createErrorHandler } from '../src/errors.js';
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
    throw new HttpError(400, 'bad_request', 'Missing field');
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
      error: { code: 'bad_request', message: 'Missing field' },
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
