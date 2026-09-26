import { Hono } from 'hono';

import { assertEnv } from './env.js';
import { createErrorHandler } from './errors.js';
import type { Variables } from './errors.js';
import type { Env } from './env.js';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use('*', async (c, next) => {
  const requestId = c.req.header('x-request-id') ?? crypto.randomUUID();
  c.set('requestId', requestId);
  c.header('x-request-id', requestId);
  await next();
});

app.onError(createErrorHandler<{ Bindings: Env; Variables: Variables }>());

// Validated on every request: cheap (string checks plus one base64 decode),
// and it means a bad or incomplete deploy fails loudly on the very first
// request instead of surfacing as a cryptic error deep in a handler.
app.use('*', (c, next) => {
  assertEnv(c.env);
  return next();
});

app.get('/health', (c) => {
  return c.json({ ok: true, version: c.env.APP_VERSION });
});

export default app;
