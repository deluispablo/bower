import { Hono } from 'hono';

import { createErrorHandler } from './errors.js';
import type { Variables } from './errors.js';

interface Bindings {
  BOWER_KV: KVNamespace;
  APP_URL: string;
  APP_VERSION: string;
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use('*', async (c, next) => {
  const requestId = c.req.header('x-request-id') ?? crypto.randomUUID();
  c.set('requestId', requestId);
  c.header('x-request-id', requestId);
  await next();
});

app.onError(createErrorHandler<{ Bindings: Bindings; Variables: Variables }>());

app.get('/health', (c) => {
  return c.json({ ok: true, version: c.env.APP_VERSION });
});

export default app;
