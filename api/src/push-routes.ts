/**
 * The app's push routes:
 *
 * - `GET /push/public-key`: the VAPID public key the browser needs to
 *   subscribe (`applicationServerKey`). Public, no session.
 * - `POST /push/subscribe`: stores the browser's subscription for the
 *   signed-in user, under `push:<userId>:<subscriptionId(endpoint)>`.
 * - `DELETE /push/subscribe`: forgets it.
 *
 * Nothing here logs an endpoint or a key.
 */

import { Hono } from 'hono';

import { requireSession } from './auth.js';
import type { AppEnv } from './env.js';
import { HttpError } from './errors.js';
import {
  decodeAuthSecret,
  decodeP256dh,
  parseVapidPublicKey,
  subscriptionId,
} from './push.js';
import { requireSameOrigin } from './security.js';
import { deletePushSub, getUser, putPushSub } from './store.js';
import type { PushSubscription } from './types.js';

/** Longest endpoint accepted; real push service URLs are far shorter. */
export const MAX_ENDPOINT_LENGTH = 2048;

function badRequest(message: string): HttpError {
  return new HttpError(400, 'bad_request', message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** An `https:` URL of reasonable length, or a 400 `bad_request`. */
function parseEndpoint(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_ENDPOINT_LENGTH
  ) {
    throw badRequest('endpoint must be an https URL');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw badRequest('endpoint must be an https URL');
  }
  if (url.protocol !== 'https:') {
    throw badRequest('endpoint must be an https URL');
  }
  return value;
}

async function readJsonObject(req: {
  json: () => Promise<unknown>;
}): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch (err) {
    throw new HttpError(400, 'bad_request', 'Body must be JSON', {
      cause: err,
    });
  }
  if (!isRecord(body)) throw badRequest('Body must be a JSON object');
  return body;
}

/**
 * Validates `{ subscription: { endpoint, keys: { p256dh, auth } } }`, the
 * shape of the browser's `PushSubscription.toJSON()`. Other fields of the
 * subscription (such as `expirationTime`) are ignored.
 */
function parseSubscription(body: Record<string, unknown>): {
  endpoint: string;
  keys: PushSubscription['keys'];
} {
  const subscription = body.subscription;
  if (!isRecord(subscription)) {
    throw badRequest('subscription must be an object');
  }
  const endpoint = parseEndpoint(subscription.endpoint);
  const keys = subscription.keys;
  if (!isRecord(keys)) throw badRequest('subscription.keys must be an object');
  const { p256dh, auth } = keys;
  if (typeof p256dh !== 'string' || decodeP256dh(p256dh) === undefined) {
    throw badRequest('keys.p256dh must be a base64url P-256 public key');
  }
  if (typeof auth !== 'string' || decodeAuthSecret(auth) === undefined) {
    throw badRequest('keys.auth must be a base64url 16-byte secret');
  }
  return { endpoint, keys: { p256dh, auth } };
}

/** The push routes as a Hono sub-app, mounted at `/` by `index.ts`. */
export function createPushRoutes(): Hono<AppEnv> {
  const push = new Hono<AppEnv>();

  push.get('/push/public-key', (c) => {
    const env = c.get('env');
    parseVapidPublicKey(env.VAPID_PUBLIC_KEY);
    return c.json({ publicKey: env.VAPID_PUBLIC_KEY });
  });

  push.post('/push/subscribe', requireSameOrigin, requireSession, async (c) => {
    const env = c.get('env');
    const userId = c.get('userId');
    if ((await getUser(env.BOWER_KV, userId)) === undefined) {
      throw new HttpError(401, 'unauthenticated', 'Not signed in');
    }
    const { endpoint, keys } = parseSubscription(await readJsonObject(c.req));
    const sub: PushSubscription = {
      id: await subscriptionId(endpoint),
      endpoint,
      keys,
      createdAt: new Date().toISOString(),
    };
    await putPushSub(env.BOWER_KV, userId, sub);
    return c.body(null, 204);
  });

  push.delete(
    '/push/subscribe',
    requireSameOrigin,
    requireSession,
    async (c) => {
      const env = c.get('env');
      const body = await readJsonObject(c.req);
      const endpoint = body.endpoint;
      if (typeof endpoint !== 'string' || endpoint.length === 0) {
        throw badRequest('endpoint must be a non-empty string');
      }
      await deletePushSub(
        env.BOWER_KV,
        c.get('userId'),
        await subscriptionId(endpoint),
      );
      return c.body(null, 204);
    },
  );

  return push;
}
