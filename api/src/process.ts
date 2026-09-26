/**
 * `POST /process`: starts one agent run for the signed-in user's vault by
 * dispatching `ingest` to the instance repo, with at most one active run
 * per user and a daily quota (`DAILY_RUN_LIMIT`).
 *
 * Nothing here logs file names, vault content or tokens.
 */

import { Hono } from 'hono';

import { requireSession } from './auth.js';
import type { AuthDeps } from './auth.js';
import type { AppEnv } from './env.js';
import { HttpError } from './errors.js';
import { dispatchIngest } from './github.js';
import type { FetchLike } from './google.js';
import { getQuota, getRun, getUser, incrQuota, putRun } from './store.js';
import type { Run } from './types.js';

/**
 * A `queued` or `running` run with no news for this long is stale: the
 * runner died or never started, and the Process button unblocks.
 */
export const STALE_RUN_MS = 25 * 60 * 1000;

/**
 * Whether `run` still blocks a new one: it is `queued` or `running` and its
 * latest timestamp (`startedAt` when present, else `requestedAt`) is less
 * than `STALE_RUN_MS` old at `now`. A missing run, a finished one or an
 * unreadable timestamp is not active.
 */
export function isActiveRun(run: Run | undefined, now: Date): boolean {
  if (run === undefined) return false;
  if (run.state !== 'queued' && run.state !== 'running') return false;
  const since = Date.parse(run.startedAt ?? run.requestedAt);
  return now.getTime() - since < STALE_RUN_MS;
}

/** Seconds from `now` to the next midnight UTC, at least 1. */
function secondsUntilUtcMidnight(now: Date): number {
  const midnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  return Math.max(1, Math.ceil((midnight - now.getTime()) / 1000));
}

/** `POST /process` as a Hono sub-app, mounted at `/` by `index.ts`. */
export function createProcessRoutes(deps: AuthDeps = {}): Hono<AppEnv> {
  const fetchImpl: FetchLike =
    deps.fetchImpl ?? ((input, init) => fetch(input, init));
  const routes = new Hono<AppEnv>();

  routes.post('/process', requireSession, async (c) => {
    const env = c.get('env');
    const kv = env.BOWER_KV;
    const userId = c.get('userId');
    const user = await getUser(kv, userId);
    if (user === undefined) {
      throw new HttpError(401, 'unauthenticated', 'Not signed in');
    }
    if (user.vault === undefined) {
      throw new HttpError(409, 'no_vault', 'Set up your Bower folder first');
    }

    // KV has no transactions: two requests arriving together can both see
    // no active run and both dispatch. Accepted; the app sends one request
    // per press, and a second workflow run on the same vault is harmless.
    const now = new Date();
    const current = await getRun(kv, userId);
    if (isActiveRun(current, now)) {
      return c.json({ run: current }, 202);
    }

    const today = now.toISOString().slice(0, 10);
    if ((await getQuota(kv, userId, today)) >= Number(env.DAILY_RUN_LIMIT)) {
      const retryAfter = secondsUntilUtcMidnight(now);
      c.header('Retry-After', String(retryAfter));
      return c.json(
        {
          error: {
            code: 'quota',
            message: 'Daily limit reached, try again tomorrow',
          },
          retryAfter,
        },
        429,
      );
    }

    // A failed dispatch throws a 502 here, before anything is stored or
    // counted, so it does not use up the user's quota.
    await dispatchIngest(
      { repo: env.GITHUB_REPO, token: env.GITHUB_TOKEN, vaultId: userId },
      fetchImpl,
    );

    const run: Run = {
      state: 'queued',
      requestedAt: now.toISOString(),
      runId: crypto.randomUUID(),
    };
    await putRun(kv, userId, run);
    // Counted only after a successful dispatch. The quota check above and
    // this increment are not atomic, so racing requests can each pass the
    // check at the limit; the quota is a soft daily limit, not billing.
    await incrQuota(kv, userId, today);
    return c.json({ run }, 202);
  });

  return routes;
}
