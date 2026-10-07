/**
 * `GET /status` and the run in progress.
 */

import { Hono } from 'hono';

import { requireSession } from './auth.js';
import type { AuthDeps } from './auth.js';
import type { AppEnv, Env } from './env.js';
import { HttpError } from './errors.js';

/** `GET /status`, mounted at `/` by `index.ts`. */
export function createStatusRoutes(deps: AuthDeps = {}): Hono<AppEnv> {
  const status = new Hono<AppEnv>();

  status.get('/status', requireSession, async (c) => {
    const env = c.get('env');
    const sub = c.get('userId');
    if (sub === undefined) throw new HttpError(500, 'internal');
    const person = env.PERSON.get(env.PERSON.idFromName(sub));
    const run = await person.currentRun();
    return c.json({ run });
  });

  return status;
}
