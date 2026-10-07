import { Hono } from 'hono';

import { createAuthRoutes } from './auth.js';
import type { AuthDeps } from './auth.js';
import { createDriveRoutes } from './drive-token.js';
import { assertEnv } from './env.js';
import type { AppEnv } from './env.js';
import { HttpError, createErrorHandler } from './errors.js';
import { createProcessRoutes } from './process.js';
import { createRunnerRoutes } from './runner.js';
import { appCors, requestId, securityHeaders } from './security.js';
import { createSessionRoutes } from './session-lease.js';
import { createMeRoutes } from './me.js';
import { createStatusRoutes } from './status.js';
import { createVaultRoutes } from './vault.js';

/**
 * The Worker's Hono app: the shared middleware, `/health`, sign-in and `/me`,
 * and the JSON 404. Tests pass `deps` (Google's fetch and keys); the deployed
 * Worker is `createApp()` with the defaults.
 */
export function createApp(deps: AuthDeps = {}): Hono<AppEnv> {
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
  app.route('/', createAuthRoutes(deps));
  app.route('/', createDriveRoutes(deps));
  app.route('/', createStatusRoutes());
  app.route('/', createSessionRoutes());
  app.route('/', createProcessRoutes(deps));
  app.route('/', createVaultRoutes(deps));
  app.route('/', createMeRoutes(deps));
  app.route('/', createRunnerRoutes(deps));

  app.notFound(() => {
    throw new HttpError(404, 'not-found');
  });

  return app;
}

export default createApp();

export { Person } from './person.js';
