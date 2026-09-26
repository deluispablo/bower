import { Hono } from 'hono';

import { assertEnv } from './env.js';
import type { AppEnv } from './env.js';
import { createErrorHandler } from './errors.js';

const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
  const requestId = c.req.header('x-request-id') ?? crypto.randomUUID();
  c.set('requestId', requestId);
  c.header('x-request-id', requestId);
  await next();
});

app.onError(createErrorHandler<AppEnv>());

// Validated on every request: cheap (string checks plus one base64 decode),
// and it means a bad or incomplete deploy fails loudly on the very first
// request instead of surfacing as a cryptic error deep in a handler. The
// validated result (defaults applied) is stashed in the context so handlers
// read `c.get('env')`, never the raw `c.env`.
app.use('*', (c, next) => {
  c.set('env', assertEnv(c.env));
  return next();
});

app.get('/health', (c) => {
  return c.json({ ok: true, version: c.get('env').APP_VERSION });
});

export default app;
