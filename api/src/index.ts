import { Hono } from 'hono';

import { assertEnv } from './env.js';
import type { AppEnv } from './env.js';
import { HttpError, createErrorHandler } from './errors.js';
import { appCors, requestId, securityHeaders } from './security.js';

/** The Worker's Hono app: the shared middleware, `/health`, and the JSON 404. */
export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Outermost, so every response (errors and preflights too) gets the headers.
  app.use('*', securityHeaders);
  app.use('*', requestId);
  app.onError(createErrorHandler<AppEnv>());

  // Validated on every request; handlers read `c.get('env')`, never `c.env`.
  app.use('*', (c, next) => {
    c.set('env', assertEnv(c.env));
    return next();
  });
  // After the env middleware: the allowed origin is `APP_ORIGIN`.
  app.use('*', appCors());

  app.get('/health', (c) => c.json({ ok: true, version: c.get('env').APP_VERSION }));

  app.notFound(() => {
    throw new HttpError(404, 'not_found', 'Not found');
  });

  return app;
}

export default createApp();

export { Person } from './person.js';
