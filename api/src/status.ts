/**
 * `GET /status`: the run going now or the last one, and the person's status revision (worker
 * contract, `GET /status`; TL-P3-15). The person object writes a stale run's expiry first, as
 * `POST /process` does, so both agree on when a run stops.
 */

import { Hono } from 'hono';

import { requireSession } from './auth.js';
import type { AppEnv } from './env.js';
import { personFor, reach, signedInSub } from './process.js';
import type { RunReply } from './process.js';

/** `GET /status`, mounted at `/` by `index.ts`. */
export function createStatusRoutes(): Hono<AppEnv> {
  const status = new Hono<AppEnv>();

  status.get('/status', requireSession, async (c) => {
    const sub = signedInSub(c.get('userId'));
    const reply: RunReply = await reach('runStatus', () => personFor(c.get('env'), sub).runStatus(Date.now()));
    return c.json({ run: reply.run, revision: reply.revision });
  });

  return status;
}
