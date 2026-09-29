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
import { createRunnerRoutes, runScheduledLint } from './runner.js';
import {
  appCors,
  COOKIE_ROUTES,
  genericRateLimit,
  limitBody,
  requestId,
  requireJsonBody,
  securityHeaders,
} from './security.js';
import { createSettingsRoutes } from './settings.js';
import { createStatusRoutes } from './status.js';
import { createVaultRoutes } from './vault.js';

/**
 * Builds the Worker's Hono app. `deps` exist for tests only (a stubbed
 * Google `fetch`); the deployed Worker is `createApp()` with the defaults.
 */
export function createApp(deps: AuthDeps = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Outermost, so every response gets the headers: errors, redirects and
  // CORS preflights included.
  app.use('*', securityHeaders);

  // Bounded: a client id outside `[A-Za-z0-9._-]{1,64}` is replaced.
  app.use('*', requestId);

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

  // After the env middleware: the allowed origin is `APP_ORIGIN`.
  app.use('*', appCors());

  // Input limits before any handler reads a body: 64 KB at most (413), and a
  // write with a body must be JSON (415). No KV involved, so they run first.
  app.use('*', limitBody);
  app.use('*', requireJsonBody);

  // The generic per-IP limit on every cookie route, ahead of the strict
  // per-route limits the routes mount themselves (`/auth/callback`,
  // `/process`).
  for (const path of COOKIE_ROUTES) {
    app.use(path, genericRateLimit);
  }

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
  app.route('/', createStatusRoutes(deps));
  app.route('/', createPushRoutes());

  return app;
}

const app = createApp();

/**
 * The Worker: `fetch` is the Hono app; `scheduled` is the weekly lint's
 * cron trigger (`wrangler.toml`), which runs the same dispatch as
 * `POST /runner/lint/dispatch`.
 */
export default {
  fetch: app.fetch.bind(app),
  scheduled(
    _controller: ScheduledController,
    env: unknown,
    ctx: ExecutionContext,
  ): void {
    ctx.waitUntil(runScheduledLint(env));
  },
};
