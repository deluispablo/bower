/**
 * `GET /status`: the signed-in user's current run, with staleness. A
 * `queued` or `running` run past its window (`runStaleness` in
 * `process.ts`) is marked `failed` with `error: 'stale'` before being
 * returned, so the app never shows a run the runner will never report on.
 *
 * Nothing here logs file names, vault content or tokens.
 */

import { Hono } from 'hono';

import { requireSession } from './auth.js';
import type { AppEnv } from './env.js';
import { markStale, runStaleness } from './process.js';
import { getRun, putRun } from './store.js';
import type { Run } from './types.js';

/** What `GET /status` answers. */
export interface StatusBody {
  run: Run | null;
  stale: boolean;
}

/** `GET /status` as a Hono sub-app, mounted at `/` by `index.ts`. */
export function createStatusRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get('/status', requireSession, async (c) => {
    const env = c.get('env');
    const kv = env.BOWER_KV;
    const userId = c.get('userId');
    const now = new Date();

    const current = await getRun(kv, userId);
    const { stale } = runStaleness(current, now);
    if (stale && current !== undefined) {
      const failed = markStale(current, now);
      await putRun(kv, userId, failed);
      return c.json({ run: failed, stale: true } satisfies StatusBody);
    }
    return c.json({ run: current ?? null, stale: false } satisfies StatusBody);
  });

  return routes;
}
