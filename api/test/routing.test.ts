import { describe, expect, it } from 'vitest';

import wrangler from '../wrangler.jsonc?raw';
import { createApp } from '../src/index.js';

describe('routing', () => {
  it('a route added to the app is checked too', () => {
    // Strip comments from wrangler.jsonc and parse
    const configStr = wrangler
      .split('\n')
      .map((line) => {
        let inString = false;
        let escaped = false;
        for (let i = 0; i < line.length; i++) {
          if (escaped) {
            escaped = false;
            continue;
          }
          if (line[i] === '\\') {
            escaped = true;
            continue;
          }
          if (line[i] === '"') {
            inString = !inString;
          }
          if (!inString && line[i] === '/' && line[i + 1] === '/') {
            return line.substring(0, i);
          }
        }
        return line;
      })
      .join('\n')
      .replace(/,(\s*[}\]])/g, '$1');
    const config = JSON.parse(configStr);
    const runWorkerFirst = config.assets?.run_worker_first ?? [];

    // Build app and add an extra route
    const app = createApp();
    app.get('/export-probe', (c) => c.json({ ok: true }));

    // Collect all routes from the app
    const routes = app.routes
      .map((route) => {
        // Get the path, replacing Hono parameter syntax (:id) with a wildcard
        const path = route.path.replace(/:[\w]+/g, ':id');
        return path;
      })
      .filter((path) => path !== '*'); // Ignore middleware-only routes

    // Check that each route is covered by a pattern in run_worker_first
    const uncovered = routes.filter((route) => {
      return !runWorkerFirst.some((pattern: string) => {
        // Exact match
        if (pattern === route) return true;
        // Wildcard pattern match
        if (pattern.endsWith('/*')) {
          const prefix = pattern.slice(0, -2);
          const routePrefix = route.split(':')[0] ?? '';
          return routePrefix === prefix || (routePrefix.startsWith(prefix) && routePrefix.endsWith('/'));
        }
        return false;
      });
    });

    expect(uncovered, 'Routes not covered by run_worker_first in api/wrangler.jsonc').toEqual(['/export-probe']);
  });

  it('every Worker route runs the Worker first', () => {
    // Strip comments from wrangler.jsonc and parse
    // Remove line comments (//...) but preserve // in strings
    const configStr = wrangler
      .split('\n')
      .map((line) => {
        let inString = false;
        let escaped = false;
        for (let i = 0; i < line.length; i++) {
          if (escaped) {
            escaped = false;
            continue;
          }
          if (line[i] === '\\') {
            escaped = true;
            continue;
          }
          if (line[i] === '"') {
            inString = !inString;
          }
          if (!inString && line[i] === '/' && line[i + 1] === '/') {
            // Found comment outside of string
            return line.substring(0, i);
          }
        }
        return line;
      })
      .join('\n')
      .replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas
    const config = JSON.parse(configStr);
    const runWorkerFirst = config.assets?.run_worker_first ?? [];

    // Collect all routes from the route modules
    // These are manually extracted from the route modules:
    // - auth.ts: /auth/login, /auth/callback, /auth/logout, /me
    // - drive-token.ts: /drive/token
    // - vault.ts: /vault
    // - process.ts: /process
    // - me.ts: /me (DELETE)
    // - runner.ts: /runner/runs/:id/token, /runner/runs/:id/status
    // - session-lease.ts: /session
    // - status.ts: /status
    // - index.ts: /health
    const routes = [
      '/health',
      '/auth/login',
      '/auth/callback',
      '/auth/logout',
      '/me',
      '/drive/token',
      '/vault',
      '/process',
      '/session',
      '/status',
      '/runner/runs/:id/token',
      '/runner/runs/:id/status',
    ];

    // Check that each route is covered by a pattern in run_worker_first
    const uncovered = routes.filter((route) => {
      return !runWorkerFirst.some((pattern: string) => {
        // Exact match
        if (pattern === route) return true;
        // Wildcard pattern match
        if (pattern.endsWith('/*')) {
          const prefix = pattern.slice(0, -2);
          // For parameterized paths, treat :param as matching anything
          const routePrefix = route.split(':')[0] ?? '';
          return routePrefix.startsWith(prefix);
        }
        return false;
      });
    });

    expect(uncovered, 'Routes not covered by run_worker_first in api/wrangler.jsonc').toEqual([]);
  });
});
