/**
 * Short-lived Drive access tokens: `getAccessToken` (cached in KV, minted
 * from the user's encrypted refresh token on a miss) and the
 * `GET /drive/token` route the browser calls. The refresh token never
 * leaves the Worker; only access tokens (1 h) do.
 *
 * Nothing here logs a token.
 */

import { Hono } from 'hono';

import { requireSession } from './auth.js';
import type { AuthDeps } from './auth.js';
import { decrypt, importEncryptionKey } from './crypto.js';
import type { AppEnv, Env } from './env.js';
import { HttpError } from './errors.js';
import { refreshAccessToken } from './google.js';
import type { FetchLike, GoogleAccessToken } from './google.js';
import {
  deleteDriveToken,
  getDriveToken,
  getUser,
  putDriveToken,
  updateUser,
} from './store.js';
import type { DriveToken, User } from './types.js';

/**
 * A cached token is dropped a minute before Google expires it, so whoever
 * receives one has at least that long to use it. Also the shortest cache
 * TTL, and KV's own minimum `expirationTtl`.
 */
const EXPIRY_MARGIN_SECONDS = 60;

/**
 * Returns a Drive access token for `user`: the cached one when KV still
 * has it, otherwise a fresh one minted from the user's refresh token and
 * cached for `expiresIn - 60` seconds (at least 60).
 *
 * When Google reports the refresh token as revoked (`invalid_grant`), sets
 * `user.needsReauth = true`, stores that one field, and rethrows the
 * `HttpError(401, 'reauth')`. Any other Google failure is a 502
 * `google_error`.
 */
export async function getAccessToken(
  env: Env,
  user: User,
  fetchImpl: FetchLike,
): Promise<DriveToken> {
  const kv = env.BOWER_KV;
  const cached = await getDriveToken(kv, user.id);
  if (cached !== undefined) return cached;

  const { token, expiresIn } = await mintAccessToken(env, user, fetchImpl);
  const ttlSeconds = Math.max(
    EXPIRY_MARGIN_SECONDS,
    expiresIn - EXPIRY_MARGIN_SECONDS,
  );
  await putDriveToken(kv, user.id, token, ttlSeconds);
  return token;
}

/**
 * A brand-new Drive access token for `user`, minted from the refresh token
 * and cached nowhere: what a run gets (#315), so nothing the app does with
 * the session's own cached token (`?fresh=1` drops it) touches the token a
 * run is using. Same failures as `getAccessToken`: `invalid_grant` flags
 * `needsReauth` and rethrows the 401 `reauth`.
 */
export async function mintAccessToken(
  env: Env,
  user: User,
  fetchImpl: FetchLike,
): Promise<{ token: DriveToken; expiresIn: number }> {
  const kv = env.BOWER_KV;
  const key = await importEncryptionKey(env.TOKEN_ENC_KEY);
  const refreshToken = await decrypt(user.encRefreshToken, key);
  let minted: GoogleAccessToken;
  try {
    minted = await refreshAccessToken(
      {
        refreshToken,
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
      fetchImpl,
    );
  } catch (err) {
    if (err instanceof HttpError && err.code === 'reauth') {
      user.needsReauth = true;
      await updateUser(kv, user.id, { needsReauth: true });
    }
    throw err;
  }

  const token: DriveToken = {
    accessToken: minted.accessToken,
    expiresAt: new Date(Date.now() + minted.expiresIn * 1000).toISOString(),
  };
  return { token, expiresIn: minted.expiresIn };
}

/** `GET /drive/token` as a Hono sub-app, mounted at `/` by `index.ts`. */
export function createDriveRoutes(deps: AuthDeps = {}): Hono<AppEnv> {
  const fetchImpl: FetchLike =
    deps.fetchImpl ?? ((input, init) => fetch(input, init));
  const drive = new Hono<AppEnv>();

  drive.get('/drive/token', requireSession, async (c) => {
    const env = c.get('env');
    const user = await getUser(env.BOWER_KV, c.get('userId'));
    if (user === undefined) {
      throw new HttpError(401, 'unauthenticated', 'Not signed in');
    }
    // `?fresh=1`: the caller already knows the cached token doesn't work
    // (Drive answered 401 with it), so drop it before minting.
    if (c.req.query('fresh') === '1') {
      await deleteDriveToken(env.BOWER_KV, user.id);
    }
    const { accessToken, expiresAt } = await getAccessToken(
      env,
      user,
      fetchImpl,
    );
    return c.json({
      accessToken,
      expiresAt,
      folderId: user.vault?.folderId ?? null,
    });
  });

  return drive;
}
