/**
 * One active session per person (worker contract, "One active session";
 * TL-P2-13/14/24/25, TL-P3-14).
 *
 * - `POST /session` `{ place, action, gen? }` → `{ active, epoch }`: the
 *   lease lives in the person's Durable Object (`Person.session`), keyed by
 *   the signed-in `sub`, read and written in one synchronous transaction
 *   (Cloudflare, "Rules of Durable Objects"; SQLite-backed storage).
 * - `requireLease`: the Worker's fence on its own endpoints. A call carries
 *   `x-bower-place` and `x-bower-epoch`; the epoch is a fencing token
 *   (Kleppmann, "How to do distributed locking"): once another place took
 *   the lease, the old epoch is refused with 409 `stale-session`.
 */
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';

import { requireSession } from './auth.js';
import type { AppEnv, Env } from './env.js';
import { HttpError } from './errors.js';
import { limitBody, requireJsonBody, requireSameOrigin } from './security.js';

/** A lease nobody renewed for this long is free (the app's `LEASE_TTL_MS`, src/data/session.ts). */
export const LEASE_TTL_MS = 3 * 60_000;

export type SessionAction = 'check' | 'take' | 'leave';

export interface LeaseReply {
  active: boolean;
  epoch: number;
}

/** The refusal of a call from a place that does not hold the lease (approved copy, TL-P2-13). */
export const STALE_SESSION_TEXT = 'Bower is open in another window.';

const PLACE = /^[A-Za-z0-9_-]{1,64}$/;
const EPOCH = /^(0|[1-9][0-9]{0,15})$/;
const ACTIONS: readonly string[] = ['check', 'take', 'leave'] satisfies SessionAction[];

interface SessionBody {
  place: string;
  action: SessionAction;
  gen: number;
}

/** A body that fails validation is refused as the JSON guard refuses one: 415, no other code. */
function unreadable(): HttpError {
  return new HttpError(415, 'unsupported-media-type');
}

function parseBody(value: unknown): SessionBody {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw unreadable();
  const { place, action, gen } = value as Record<string, unknown>;
  if (typeof place !== 'string' || !PLACE.test(place)) throw unreadable();
  if (typeof action !== 'string' || !ACTIONS.includes(action)) throw unreadable();
  // A missing gen counts as 0: a place with any recorded leave then has its check discarded (TL-P3-14).
  if (gen !== undefined && !(typeof gen === 'number' && Number.isSafeInteger(gen) && gen >= 0)) throw unreadable();
  return { place, action: action as SessionAction, gen: gen ?? 0 };
}

function personFor(env: Env, sub: string) {
  return env.PERSON.get(env.PERSON.idFromName(sub));
}

/** Calls the person object; any failure on the way is `internal` with no cause, logged here only (TL-P3-04). */
async function reach<T>(what: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    console.error(`person object: ${what} failed`, err);
    throw new HttpError(500, 'internal');
  }
}

function signedInSub(sub: string | undefined): string {
  if (sub === undefined) throw new HttpError(500, 'internal');
  return sub;
}

/**
 * Mount after `requireSession`: the call goes on only when its `x-bower-place` holds the person's lease at
 * its `x-bower-epoch`. An expired lease nobody took still counts (TL-P2-25). Missing, malformed or stale
 * headers are 409 `stale-session`.
 */
export const requireLease: MiddlewareHandler<AppEnv> = async (c, next) => {
  const sub = signedInSub(c.get('userId'));
  const place = c.req.header('x-bower-place');
  const epochText = c.req.header('x-bower-epoch');
  const epoch = epochText !== undefined && EPOCH.test(epochText) ? Number(epochText) : Number.NaN;
  const holds =
    place !== undefined &&
    PLACE.test(place) &&
    Number.isSafeInteger(epoch) &&
    (await reach('holdsLease', () => personFor(c.get('env'), sub).holdsLease(place, epoch)));
  if (!holds) throw new HttpError(409, 'stale-session', STALE_SESSION_TEXT);
  await next();
};

/** `POST /session`, mounted at `/` by `index.ts`. */
export function createSessionRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post('/session', requireSameOrigin, requireSession, limitBody, requireJsonBody, async (c) => {
    const sub = signedInSub(c.get('userId'));
    let value: unknown;
    try {
      value = await c.req.json();
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw unreadable();
    }
    const { place, action, gen } = parseBody(value);
    const reply = await reach('session', () => personFor(c.get('env'), sub).session(place, action, gen, Date.now()));
    return c.json({ active: reply.active, epoch: reply.epoch });
  });

  return routes;
}
