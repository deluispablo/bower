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

    // Collect all routes from the app, excluding middleware-only routes
    const routeSet = new Set<string>();
    for (const route of app.routes) {
      // Get the path, replacing Hono parameter syntax (:id) with normalized form
      const path = route.path.replace(/:[\w]+/g, ':id');

      // Skip middleware-only routes (path is '*' or just middleware patterns)
      if (path === '*' || path === '/*') continue;

      routeSet.add(path);
    }

    // Check that each route is covered by a pattern in run_worker_first
    const uncovered = Array.from(routeSet).filter((route) => {
      return !runWorkerFirst.some((pattern: string) => {
        // Exact match
        if (pattern === route) return true;
        // Wildcard pattern match: /prefix/* covers /prefix and /prefix/...
        if (pattern.endsWith('/*')) {
          const prefix = pattern.slice(0, -2);
          // Get the route's prefix (everything before the first :param)
          const routePrefix = route.split(':')[0] ?? '';
          // Match if route starts with prefix followed by / or matches exactly
          return routePrefix === prefix || (routePrefix.startsWith(prefix + '/'));
        }
        return false;
      });
    });

    expect(uncovered, 'Routes not covered by run_worker_first in api/wrangler.jsonc').toEqual(['/export-probe']);
  });

  it('every Worker route runs the Worker first', () => {
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

    // Collect all routes from the app
    const app = createApp();
    const routeSet = new Set<string>();
    for (const route of app.routes) {
      // Get the path, replacing Hono parameter syntax (:id) with normalized form
      const path = route.path.replace(/:[\w]+/g, ':id');

      // Skip middleware-only routes
      if (path === '*' || path === '/*') continue;

      routeSet.add(path);
    }

    // Check that each route is covered by a pattern in run_worker_first
    const uncovered = Array.from(routeSet).filter((route) => {
      return !runWorkerFirst.some((pattern: string) => {
        // Exact match
        if (pattern === route) return true;
        // Wildcard pattern match: /prefix/* covers /prefix and /prefix/...
        if (pattern.endsWith('/*')) {
          const prefix = pattern.slice(0, -2);
          const routePrefix = route.split(':')[0] ?? '';
          return routePrefix === prefix || (routePrefix.startsWith(prefix + '/'));
        }
        return false;
      });
    });

    expect(uncovered, 'Routes not covered by run_worker_first in api/wrangler.jsonc').toEqual([]);
  });
});
