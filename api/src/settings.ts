/**
 * User-owned settings and account deletion: `PATCH /settings` (BYOK Claude
 * API key, when the first-run tour was seen, the web lookup switch) and
 * `DELETE /me`.
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
import { deleteUserData, getUser, updateUser } from './store.js';
import type { UserPatch } from './store.js';

function unauthenticated(): HttpError {
  return new HttpError(401, 'unauthenticated', 'Not signed in');
}

/** The stable error code of `err`, safe to log; never its message or cause. */
function errorCode(err: unknown): string {
  if (err instanceof HttpError) return err.code;
  if (err instanceof CryptoError) return err.code;
  return 'unknown';
}

/**
 * Whether `value` is an ISO 8601 date-time exactly as
 * `Date.prototype.toISOString()` writes it (UTC, milliseconds, `Z`): it must
 * parse and survive the round trip unchanged, so `2026-02-30…`, a bare date
 * or an offset other than `Z` are all refused.
 */
function isIsoDateTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return false;
  return new Date(time).toISOString() === value;
}

/** The settings and account routes as a Hono sub-app, mounted at `/` by `index.ts`. */
export function createSettingsRoutes(deps: AuthDeps = {}): Hono<AppEnv> {
  const fetchImpl: FetchLike =
    deps.fetchImpl ?? ((input, init) => fetch(input, init));
  const settings = new Hono<AppEnv>();

  settings.patch('/settings', requireSameOrigin, requireSession, async (c) => {
    const env = c.get('env');
    const userId = c.get('userId');

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
    const { apiKey, tourSeenAt, allowWeb } = body as Record<string, unknown>;

    // Validate every field before anything is written.
    if (
      apiKey !== undefined &&
      apiKey !== null &&
      !(typeof apiKey === 'string' && apiKey.length > 0)
    ) {
      throw new HttpError(
        400,
        'bad_request',
        'apiKey must be a non-empty string or null',
      );
    }
    if (tourSeenAt !== undefined && !isIsoDateTime(tourSeenAt)) {
      throw new HttpError(
        400,
        'invalid_tour_seen_at',
        'tourSeenAt must be an ISO 8601 date-time in UTC',
      );
    }
    if (allowWeb !== undefined && typeof allowWeb !== 'boolean') {
      throw new HttpError(400, 'bad_request', 'allowWeb must be a boolean');
    }

    // Missing fields (undefined) leave the stored value untouched, and only
    // the fields sent are written (merged into a fresh read of the record).
    const patch: UserPatch = {};
    if (apiKey === null) {
      patch.encApiKey = null;
    } else if (typeof apiKey === 'string') {
      const key = await importEncryptionKey(env.TOKEN_ENC_KEY);
      patch.encApiKey = await encrypt(apiKey, key);
    }
    if (typeof tourSeenAt === 'string') patch.tourSeenAt = tourSeenAt;
    // Off is stored as no field at all, like a user who never chose.
    if (typeof allowWeb === 'boolean') patch.allowWeb = allowWeb ? true : null;
    const user =
      Object.keys(patch).length === 0
        ? await getUser(env.BOWER_KV, userId)
        : await updateUser(env.BOWER_KV, userId, patch);
    if (user === undefined) throw unauthenticated();

    return c.json({
      hasApiKey: user.encApiKey !== undefined,
      allowWeb: user.allowWeb === true,
    });
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
