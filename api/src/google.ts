/**
 * Google sign-in: OAuth 2.0 Authorization Code flow with PKCE (RFC 7636)
 * and OpenID Connect ID-token validation (OIDC Core 3.1.3.7) with `jose`.
 * Adapted from the original app's `google.ts`; the userinfo call is
 * replaced by the ID token, which carries the person's `sub`.
 *
 * Every network call takes an injectable `fetch`, so tests stand in for
 * Google. Nothing here logs, and no error message carries a code, a token
 * or an address.
 */

import { createRemoteJWKSet, customFetch, errors, jwtVerify } from 'jose';
import type { JWTVerifyGetKey } from 'jose';

import { base64UrlEncode, timingSafeEqual } from './crypto.js';
import { HttpError } from './errors.js';

/** The subset of `fetch` these helpers use; tests pass a stub. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
/** Google's signing keys (its discovery document's `jwks_uri`). */
export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
/** Google's documented `iss` values: with and without the scheme. */
export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

/**
 * The contract's scopes: full `drive` (Bower's marks are `appProperties`,
 * and `drive.file` would hide what the person adds some other way) and
 * `openid email profile` for the ID token's address and name.
 */
export const GOOGLE_SCOPE = 'openid email profile https://www.googleapis.com/auth/drive';

/** An ID token is used right after the code exchange: older is refused. */
const ID_TOKEN_MAX_AGE = '10m';
/** Allowed clock skew between Google and the Worker. */
const CLOCK_TOLERANCE = '1m';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function randomBase64Url(byteLength: number): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/** A fresh OAuth `state`: 16 random bytes, base64url. */
export function createState(): string {
  return randomBase64Url(16);
}

/** A fresh OIDC `nonce`: 16 random bytes, base64url. */
export function createNonce(): string {
  return randomBase64Url(16);
}

/** A fresh PKCE code verifier: 32 random bytes, base64url (43 characters, RFC 7636 4.1). */
export function createCodeVerifier(): string {
  return randomBase64Url(32);
}

/** The PKCE S256 challenge for `verifier`: base64url(SHA-256(verifier)) (RFC 7636 4.2). */
export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Google's consent address. `access_type=offline` asks for a refresh
 * token; Google gives one only at consent, so `consent` adds
 * `prompt=consent`, which the callback asks for only when the person has
 * no refresh token kept (Google, "Refresh token expiration" and
 * "prompt").
 */
export function buildAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  consent: boolean;
}): string {
  const query = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPE,
    access_type: 'offline',
    state: params.state,
    nonce: params.nonce,
    code_challenge: params.codeChallenge,
    code_challenge_method: 'S256',
  });
  if (params.consent) {
    query.set('prompt', 'select_account consent');
  } else {
    query.set('prompt', 'select_account');
  }
  return `${GOOGLE_AUTH_URL}?${query.toString()}`;
}

/** A failure on Google's side or the way there: `internal`, the cause logged only. */
function googleFailed(cause: string, error?: unknown): HttpError {
  return new HttpError(500, 'internal', undefined, {
    cause: error === undefined ? new Error(cause) : new Error(cause, { cause: error }),
  });
}

/** Sign-in did not prove who this is: `signed-out`, the cause logged only. */
function notProven(cause: string, error?: unknown): HttpError {
  return new HttpError(401, 'signed-out', undefined, {
    cause: error === undefined ? new Error(cause) : new Error(cause, { cause: error }),
  });
}

export interface GoogleTokens {
  idToken: string;
  /** Absent when the person consented before: Google sends it only at consent. */
  refreshToken: string | null;
}

/**
 * Exchanges an authorization `code` and its PKCE verifier for tokens.
 * A network failure, a non-2xx answer or a body without an ID token is
 * `internal`, except `invalid_grant` (a used or stale code), which is
 * `signed-out`: signing in again fixes it.
 */
export async function exchangeCode(
  params: { code: string; codeVerifier: string; clientId: string; clientSecret: string; redirectUri: string },
  fetchImpl: FetchLike = fetch,
): Promise<GoogleTokens> {
  let response: Response;
  try {
    response = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: params.code,
        code_verifier: params.codeVerifier,
        client_id: params.clientId,
        client_secret: params.clientSecret,
        redirect_uri: params.redirectUri,
      }).toString(),
    });
  } catch (err) {
    throw googleFailed('token endpoint unreachable', err);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (err) {
    throw googleFailed(`token endpoint returned ${response.status} without JSON`, err);
  }
  if (!response.ok) {
    // Only the OAuth error code is read from the body, never anything else.
    if (isRecord(body) && body.error === 'invalid_grant') throw notProven('token endpoint: invalid_grant');
    throw googleFailed(`token endpoint returned ${response.status}`);
  }
  if (!isRecord(body) || typeof body.id_token !== 'string' || body.id_token.length === 0) {
    throw googleFailed('token endpoint returned no ID token');
  }
  const refresh = body.refresh_token;
  return {
    idToken: body.id_token,
    refreshToken: typeof refresh === 'string' && refresh.length > 0 ? refresh : null,
  };
}

let defaultKeys: JWTVerifyGetKey | undefined;

/**
 * Google's signing keys, fetched and cached by `jose` (`createRemoteJWKSet`
 * honours the answer's cache rules and refetches on an unknown `kid`).
 * With the default fetch, one key set is shared by the isolate.
 */
export function googleKeys(fetchImpl?: FetchLike): JWTVerifyGetKey {
  if (fetchImpl === undefined) {
    defaultKeys ??= createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
    return defaultKeys;
  }
  return createRemoteJWKSet(new URL(GOOGLE_JWKS_URL), {
    [customFetch]: (url: string, init: RequestInit) => fetchImpl(url, init),
  });
}

export interface GoogleIdentity {
  /** Google's stable id for the person: Bower keys people by it, never by address. */
  sub: string;
  email: string;
  emailVerified: boolean;
  /** The first name for the greeting, else the full name, else empty. */
  name: string;
}

/**
 * jose errors that mean the token itself is bad. Anything else (a key
 * endpoint that is down, slow, answers a non-200 or garbage) is Google's
 * outage, not the person's mistake, and answers `internal`.
 */
function isTokenFault(err: unknown): boolean {
  if (!(err instanceof errors.JOSEError)) return false;
  return (
    err.code.startsWith('ERR_JWT_') ||
    err.code.startsWith('ERR_JWS_') ||
    err.code === 'ERR_JOSE_ALG_NOT_ALLOWED' ||
    err.code === 'ERR_JWKS_NO_MATCHING_KEY' ||
    err.code === 'ERR_JWKS_MULTIPLE_MATCHING_KEYS'
  );
}

/**
 * Validates an ID token as OIDC Core 3.1.3.7 asks: the signature against
 * Google's keys (RS256 only), `iss` one of Google's, `aud` our client id
 * (and `azp` it too when there are several audiences), `exp` not passed,
 * `iat` recent, and `nonce` the one this sign-in sent. Any failure is
 * `signed-out`; keys that cannot be read are `internal`.
 */
export async function verifyIdToken(
  idToken: string,
  params: { clientId: string; nonce: string; keys: JWTVerifyGetKey; now?: number },
): Promise<GoogleIdentity> {
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(idToken, params.keys, {
      issuer: GOOGLE_ISSUERS,
      audience: params.clientId,
      algorithms: ['RS256'],
      requiredClaims: ['sub', 'iat', 'exp', 'nonce'],
      maxTokenAge: ID_TOKEN_MAX_AGE,
      clockTolerance: CLOCK_TOLERANCE,
      ...(params.now === undefined ? {} : { currentDate: new Date(params.now) }),
    }));
  } catch (err) {
    // A refused token's error carries its claims (address, sub): only its code is kept (OWASP logging).
    if (isTokenFault(err)) throw notProven(`ID token refused: ${(err as errors.JOSEError).code}`);
    throw googleFailed('Google sign-in outage: signing keys unavailable', err);
  }
  const { aud, azp, nonce, sub, email } = payload;
  if (Array.isArray(aud) && aud.length > 1 && azp !== params.clientId) {
    throw notProven('ID token refused: azp is not this client');
  }
  if (typeof nonce !== 'string' || !timingSafeEqual(nonce, params.nonce)) {
    throw notProven('ID token refused: nonce does not match');
  }
  if (typeof sub !== 'string' || sub.length === 0) throw notProven('ID token refused: no sub');
  if (typeof email !== 'string' || email.length === 0) throw notProven('ID token refused: no email');
  const givenName = payload.given_name;
  const fullName = payload.name;
  return {
    sub,
    email,
    emailVerified: payload.email_verified === true,
    name:
      typeof givenName === 'string' && givenName.length > 0
        ? givenName
        : typeof fullName === 'string'
          ? fullName
          : '',
  };
}

/** A minted Drive access token and its lifetime in seconds (Google's `expires_in`). */
export interface GoogleAccessToken {
  accessToken: string;
  expiresIn: number;
}

/**
 * Mints an access token from a refresh token (`grant_type=refresh_token`,
 * Google OAuth 2.0 for web server apps, "Refreshing an access token").
 * `invalid_grant` (revoked or expired refresh token) is `signed-out`; any
 * other failure is `internal`. Nothing from the body but the OAuth error
 * code is read on failure, and nothing here logs a token.
 */
export async function refreshAccessToken(
  params: { refreshToken: string; clientId: string; clientSecret: string },
  fetchImpl: FetchLike = fetch,
): Promise<GoogleAccessToken> {
  let response: Response;
  try {
    response = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: params.refreshToken,
        client_id: params.clientId,
        client_secret: params.clientSecret,
      }).toString(),
    });
  } catch (err) {
    throw googleFailed('token endpoint unreachable', err);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (err) {
    throw googleFailed(`token endpoint returned ${response.status} without JSON`, err);
  }
  if (!response.ok) {
    if (isRecord(body) && body.error === 'invalid_grant') throw notProven('token endpoint: invalid_grant');
    throw googleFailed(`token endpoint returned ${response.status}`);
  }
  if (!isRecord(body) || typeof body.access_token !== 'string' || body.access_token.length === 0) {
    throw googleFailed('token endpoint returned no access token');
  }
  const expiresIn = body.expires_in;
  if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw googleFailed('token endpoint returned no token lifetime');
  }
  return { accessToken: body.access_token, expiresIn };
}

/** Google's token revocation endpoint (OAuth 2.0 for web server apps, "Revoking a token"). */
export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

/**
 * Revokes a refresh token (and the grant it belongs to) at Google: `POST` with `token=` in a form body
 * (OAuth 2.0 for web server apps, "Revoking a token"). Throws `internal` when Google is unreachable or
 * refuses; the cause carries the status only, never the token.
 */
export async function revokeToken(token: string, fetchImpl: FetchLike = fetch): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl(GOOGLE_REVOKE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
    });
  } catch (err) {
    throw googleFailed('revoke endpoint unreachable', err);
  }
  if (!response.ok) throw googleFailed(`revoke endpoint returned ${response.status}`);
}
