/**
 * `DELETE /me` (worker contract): the Worker forgets the person. In this order: revoke the Google grant
 * (a failure is logged by status and does not stop the deletion), empty the person object, answer 204 with
 * the cookie cleared. No Drive call: the folder is never touched, and `POST /vault` finds it again.
 */

import { Hono } from 'hono';

import { requireSession } from './auth.js';
import type { AuthDeps } from './auth.js';
import { decrypt, importEncryptionKey } from './crypto.js';
import type { AppEnv } from './env.js';
import { HttpError } from './errors.js';
import { revokeToken } from './google.js';
import type { FetchLike } from './google.js';
import { requireSameOrigin } from './security.js';
import { clearSessionCookie } from './session.js';
import { requireLease } from './session-lease.js';

export function createMeRoutes(deps: AuthDeps = {}): Hono<AppEnv> {
  const fetchImpl: FetchLike = deps.fetchImpl ?? ((input, init) => fetch(input, init));
  const routes = new Hono<AppEnv>();

  routes.delete('/me', requireSameOrigin, requireSession, requireLease, async (c) => {
    const env = c.get('env');
    const sub = c.get('userId');
    if (sub === undefined) throw new HttpError(500, 'internal');
    const person = env.PERSON.get(env.PERSON.idFromName(sub));
    try {
      const encrypted = await person.encryptedRefreshToken();
      if (encrypted !== null) {
        try {
          const token = await decrypt(encrypted, await importEncryptionKey(env.TOKEN_ENC_KEY));
          await revokeToken(token, fetchImpl);
        } catch (err) {
          // Status or step only: never the token, and the deletion goes on.
          console.error(`[${c.get('requestId')}] revoking the Google grant failed:`, err instanceof HttpError ? err.cause : 'unreadable token');
        }
      }
      await person.forget();
    } catch (err) {
      console.error(`[${c.get('requestId')}] delete me failed`, err);
      throw new HttpError(500, 'internal');
    }
    c.header('Set-Cookie', clearSessionCookie());
    return c.body(null, 204);
  });

  return routes;
}
