import { Hono } from 'hono';

import { createAdminRoutes } from './admin.js';
import { createAuthRoutes } from './auth.js';
import type { AuthDeps } from './auth.js';
import { createDriveRoutes } from './drive.js';
import { assertEnv } from './env.js';
import type { AppEnv } from './env.js';
import { createErrorHandler } from './errors.js';
import { createProcessRoutes } from './process.js';
import { createPushRoutes } from './push-routes.js';
import { createRunnerRoutes } from './runner.js';
import { createSettingsRoutes } from './settings.js';
import { createStatusRoutes } from './status.js';
import { createVaultRoutes } from './vault.js';

/**
 * Builds the Worker's Hono app. `deps` exist for tests only (a stubbed
 * Google `fetch`); the deployed Worker is `createApp()` with the defaults.
 */
export function createApp(deps: AuthDeps = {}): Hono<AppEnv> {
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

  app.route('/', createAuthRoutes(deps));
  app.route('/', createDriveRoutes(deps));
  app.route('/', createSettingsRoutes(deps));
  app.route('/', createVaultRoutes(deps));
  app.route('/', createAdminRoutes(deps));
  app.route('/', createProcessRoutes(deps));
  app.route('/', createRunnerRoutes(deps));
  app.route('/', createStatusRoutes());
  app.route('/', createPushRoutes());

  return app;
}

export default createApp();
