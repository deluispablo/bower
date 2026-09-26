/**
 * User-owned settings and account deletion: `PATCH /settings` (BYOK Claude
 * API key) and `DELETE /me`.
 *
 * Nothing here logs or returns an API key or a refresh token.
 */

import { Hono } from 'hono';

import type { AuthDeps } from './auth.js';
import { requireSession } from './auth.js';
import {
  CryptoError,
  decrypt,
  encrypt,
  importEncryptionKey,
} from './crypto.js';
import type { AppEnv } from './env.js';
import { HttpError } from './errors.js';
import { revokeToken } from './google.js';
import type { FetchLike } from './google.js';
import { requireSameOrigin } from './security.js';
import { clearSessionCookie } from './session.js';
import { deleteUserData, getUser, putUser } from './store.js';

function unauthenticated(): HttpError {
  return new HttpError(401, 'unauthenticated', 'Not signed in');
}

/** The stable error code of `err`, safe to log; never its message or cause. */
function errorCode(err: unknown): string {
  if (err instanceof HttpError) return err.code;
  if (err instanceof CryptoError) return err.code;
  return 'unknown';
}

/** The settings and account routes as a Hono sub-app, mounted at `/` by `index.ts`. */
export function createSettingsRoutes(deps: AuthDeps = {}): Hono<AppEnv> {
  const fetchImpl: FetchLike =
    deps.fetchImpl ?? ((input, init) => fetch(input, init));
  const settings = new Hono<AppEnv>();

  settings.patch('/settings', requireSameOrigin, requireSession, async (c) => {
    const env = c.get('env');
    const user = await getUser(env.BOWER_KV, c.get('userId'));
    if (user === undefined) throw unauthenticated();

    let body: unknown;
    try {
      body = await c.req.json();
    } catch (err) {
      throw new HttpError(400, 'bad_request', 'Body must be JSON', {
        cause: err,
      });
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new HttpError(400, 'bad_request', 'Body must be a JSON object');
    }
    const { apiKey } = body as Record<string, unknown>;

    if (apiKey === null) {
      delete user.encApiKey;
      await putUser(env.BOWER_KV, user);
    } else if (typeof apiKey === 'string' && apiKey.length > 0) {
      const key = await importEncryptionKey(env.TOKEN_ENC_KEY);
      user.encApiKey = await encrypt(apiKey, key);
      await putUser(env.BOWER_KV, user);
    } else if (apiKey !== undefined) {
      throw new HttpError(
        400,
        'bad_request',
        'apiKey must be a non-empty string or null',
      );
    }
    // apiKey === undefined: missing, no change.

    return c.json({ hasApiKey: user.encApiKey !== undefined });
  });

  settings.delete('/me', requireSameOrigin, requireSession, async (c) => {
    const env = c.get('env');
    const userId = c.get('userId');
    const requestId = c.get('requestId');
    const user = await getUser(env.BOWER_KV, userId);
    if (user === undefined) throw unauthenticated();

    // Best effort: Google access is revoked when possible, but a user can
    // always leave even if Google (or a bad refresh token) does not
    // cooperate. Never the token itself reaches the log.
    try {
      const key = await importEncryptionKey(env.TOKEN_ENC_KEY);
      const refreshToken = await decrypt(user.encRefreshToken, key);
      await revokeToken(refreshToken, fetchImpl);
    } catch (err) {
      console.error(`[${requestId}] revoke failed: ${errorCode(err)}`);
    }

    await deleteUserData(env.BOWER_KV, userId);
    c.header('Set-Cookie', clearSessionCookie());
    return c.body(null, 204);
  });

  return settings;
}
