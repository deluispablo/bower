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
import { CryptoError, decrypt, importEncryptionKey } from './crypto.js';
import type { AppEnv, Env } from './env.js';
import { HttpError } from './errors.js';
import { enforceRateLimit, personKey } from './security.js';
import { personFor, signedInSub } from './route-helpers.js';
import { refreshAccessToken } from './google.js';
import { clearSessionCookie } from './session.js';
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
 * When Google refuses the refresh token (`invalid_grant`), or the kept
 * token cannot be decrypted (the encryption key was rotated), the person's
 * stored access is forgotten and their sessions retired, and this throws
 * 401 `signed-out`. Does not need a folder: the pointer check is the
 * route's, since making the folder itself needs a token.
 */
export async function accessTokenFor(env: Env, sub: string, options: DriveTokenOptions = {}): Promise<DriveToken> {
  return await accessTokenOf(env, personFor(env, sub), options);
}

/** What minting a Drive token asks of the person object: its stub, or the object itself (`Person.wake`). */
export interface DriveTokenKeeper {
  cachedDriveToken(usableUntil: number): DriveAccessToken | null | Promise<DriveAccessToken | null>;
  encryptedRefreshToken(): string | null | Promise<string | null>;
  forgetGoogleAccess(refused: string): boolean | Promise<boolean>;
  cacheDriveToken(token: DriveAccessToken): void | Promise<void>;
}

/** `accessTokenFor` for a person object already in hand (the runner reaches it by its id, not by `sub`). */
export async function accessTokenOf(
  env: Env,
  person: DriveTokenKeeper,
  options: DriveTokenOptions = {},
): Promise<DriveToken> {
  const fetchImpl: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));
  if (options.fresh !== true) {
    const cached = await person.cachedDriveToken(Date.now() + EXPIRY_MARGIN_MS);
    if (cached !== null) return cached;
  }
  const encrypted = await person.encryptedRefreshToken();
  if (encrypted === null) throw new HttpError(401, 'signed-out', undefined, { cause: new Error('no refresh token kept') });
  const key = await importEncryptionKey(env.TOKEN_ENC_KEY);
  let refreshToken: string;
  try {
    refreshToken = await decrypt(encrypted, key);
  } catch (err) {
    if (!(err instanceof CryptoError)) throw err;
    // Kept under a key the Worker no longer has (TOKEN_ENC_KEY rotated): as Google's `invalid_grant`,
    // the token is forgotten and the sessions retired, so the next sign-in asks for consent.
    await person.forgetGoogleAccess(encrypted);
    throw new HttpError(401, 'signed-out', undefined, { cause: new Error(`refresh token unreadable: ${err.code}`) });
  }
  // The lifetime counts from before Google was asked, so the token is never kept past its real end.
  const asked = Date.now();
  let minted;
  try {
    minted = await refreshAccessToken(
      { refreshToken, clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
      fetchImpl,
    );
  } catch (err) {
    if (err instanceof HttpError && err.code === 'signed-out') await person.forgetGoogleAccess(encrypted);
    throw err;
  }
  const token = { accessToken: minted.accessToken, expiresAt: asked + Math.min(minted.expiresIn * 1000, MAX_LIFETIME_MS) };
  await person.cacheDriveToken(token);
  return token;
}

/** `GET /drive/token`, mounted at `/` by `index.ts`. */
export function createDriveRoutes(deps: AuthDeps = {}): Hono<AppEnv> {
  const drive = new Hono<AppEnv>();

  drive.get('/drive/token', requireSession, async (c) => {
    const env = c.get('env');
    const sub = signedInSub(c.get('userId'));
    const person = personFor(env, sub);
    if ((await person.folderId()) === null) {
      throw new HttpError(409, 'no-folder', 'Choose a folder for Bower first.');
    }
    await enforceRateLimit(c, 'DRIVE_RATE_LIMIT', personKey(c));
    const options: DriveTokenOptions = { fresh: c.req.query('fresh') === '1' };
    if (deps.fetchImpl !== undefined) options.fetchImpl = deps.fetchImpl;
    let minted: DriveToken;
    try {
      minted = await accessTokenFor(env, sub, options);
    } catch (err) {
      // Google refused the refresh token: the sessions are retired, so the cookie goes too.
      if (err instanceof HttpError && err.code === 'signed-out') c.header('Set-Cookie', clearSessionCookie(), { append: true });
      throw err;
    }
    const { accessToken, expiresAt } = minted;
    return c.json({ accessToken, expiresAt });
  });

  return drive;
}
