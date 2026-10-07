/**
 * `GET /drive/token` and `accessTokenFor`: short-lived Drive access tokens
 * minted from the person's encrypted refresh token (Google OAuth 2.0,
 * "Refreshing an access token"; `expires_in` is the lifetime in seconds,
 * about an hour). The refresh token never leaves the Worker. The access
 * token is cached in the person object until shortly before it expires.
 * Adapted from the original app's `drive.ts`, with the cache in the person
 * object instead of KV.
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
import type { FetchLike } from './google.js';
import type { DriveAccessToken } from './person.js';

export type DriveToken = DriveAccessToken;

/** A cached token is dropped a minute before it expires, so whoever gets one has a minute to use it. */
const EXPIRY_MARGIN_MS = 60_000;
/** No token is handed out for longer than the contract's hour. */
const MAX_LIFETIME_MS = 3600_000;

export interface DriveTokenOptions {
  /** Refresh even when a cached token is still valid (Drive answered 401 with it). */
  fresh?: boolean;
  /** Google's token endpoint; tests pass a stub. Defaults to `fetch`. */
  fetchImpl?: FetchLike;
}

/**
 * A Drive access token for the person `sub`: the cached one while it has
 * more than a minute left, otherwise one minted from the refresh token.
 * When Google refuses the refresh token (`invalid_grant`), the person's
 * stored access is forgotten and their sessions retired, and this throws
 * 401 `signed-out`. Does not need a folder: the pointer check is the
 * route's, since making the folder itself needs a token.
 */
export async function accessTokenFor(env: Env, sub: string, options: DriveTokenOptions = {}): Promise<DriveToken> {
  const fetchImpl: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const person = env.PERSON.get(env.PERSON.idFromName(sub));
  if (options.fresh !== true) {
    const cached = await person.cachedDriveToken(Date.now() + EXPIRY_MARGIN_MS);
    if (cached !== null) return cached;
  }
  const encrypted = await person.encryptedRefreshToken();
  if (encrypted === null) throw new HttpError(401, 'signed-out', undefined, { cause: new Error('no refresh token kept') });
  const refreshToken = await decrypt(encrypted, await importEncryptionKey(env.TOKEN_ENC_KEY));
  let minted;
  try {
    minted = await refreshAccessToken(
      { refreshToken, clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
      fetchImpl,
    );
  } catch (err) {
    if (err instanceof HttpError && err.code === 'signed-out') await person.forgetGoogleAccess();
    throw err;
  }
  const now = Date.now();
  const token = { accessToken: minted.accessToken, expiresAt: now + Math.min(minted.expiresIn * 1000, MAX_LIFETIME_MS) };
  await person.cacheDriveToken(token);
  return token;
}

/** `GET /drive/token`, mounted at `/` by `index.ts`. */
export function createDriveRoutes(deps: AuthDeps = {}): Hono<AppEnv> {
  const drive = new Hono<AppEnv>();

  drive.get('/drive/token', requireSession, async (c) => {
    const env = c.get('env');
    const sub = c.get('userId');
    if (sub === undefined) throw new HttpError(500, 'internal');
    const person = env.PERSON.get(env.PERSON.idFromName(sub));
    if ((await person.folderId()) === null) {
      throw new HttpError(409, 'no-folder', 'Choose a folder for Bower first.');
    }
    const options: DriveTokenOptions = { fresh: c.req.query('fresh') === '1' };
    if (deps.fetchImpl !== undefined) options.fetchImpl = deps.fetchImpl;
    const { accessToken, expiresAt } = await accessTokenFor(env, sub, options);
    return c.json({ accessToken, expiresAt });
  });

  return drive;
}
