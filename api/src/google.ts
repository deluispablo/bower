/**
 * Google OAuth 2.0 (Authorization Code flow with PKCE) and OpenID Connect
 * userinfo. Pure helpers: every network call takes an injectable `fetch`
 * so tests mock Google without touching the network. Nothing here logs,
 * and no error message ever contains a code, a token or an email.
 */

import { base64UrlEncode } from './crypto.js';
import { HttpError } from './errors.js';

/** The subset of `fetch` these helpers use; tests pass a stub. */
export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_USERINFO_URL =
  'https://openidconnect.googleapis.com/v1/userinfo';

/**
 * Full Drive scope: `drive.file` only sees files the app created itself,
 * which would hide notes written by Obsidian or the Drive app.
 */
export const GOOGLE_SCOPE =
  'openid email https://www.googleapis.com/auth/drive';

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

/** A fresh PKCE code verifier: 32 random bytes, base64url (43 characters). */
export function createCodeVerifier(): string {
  return randomBase64Url(32);
}

/** The PKCE S256 challenge for `verifier`: base64url(SHA-256(verifier)). */
export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * The Google consent URL. `access_type=offline` plus `prompt=consent` make
 * Google issue a refresh token on every sign-in, not only the first.
 */
export function buildAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const query = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${GOOGLE_AUTH_URL}?${query.toString()}`;
}

async function callGoogle(
  what: string,
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch (err) {
    throw new HttpError(502, 'google_error', `${what} unreachable`, {
      cause: err,
    });
  }
  if (!response.ok) {
    throw new HttpError(
      502,
      'google_error',
      `${what} returned ${response.status}`,
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (err) {
    throw new HttpError(502, 'google_error', `${what} returned invalid JSON`, {
      cause: err,
    });
  }
  if (!isRecord(body)) {
    throw new HttpError(502, 'google_error', `${what} returned invalid JSON`);
  }
  return body;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
}

/**
 * Exchanges an authorization `code` (with its PKCE verifier) for tokens.
 * Throws `HttpError(502, 'google_error')` when Google answers non-2xx or
 * with an unexpected body, and with `'no refresh token'` when Google does
 * not return one (the flow always asks for offline access, so that means
 * something is misconfigured).
 */
export async function exchangeCode(
  params: {
    code: string;
    codeVerifier: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  },
  fetchImpl: FetchLike = fetch,
): Promise<GoogleTokens> {
  const body = await callGoogle('token endpoint', fetchImpl, GOOGLE_TOKEN_URL, {
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
  const accessToken = body.access_token;
  const refreshToken = body.refresh_token;
  const expiresIn = body.expires_in;
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new HttpError(502, 'google_error', 'no access token');
  }
  if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
    throw new HttpError(502, 'google_error', 'no refresh token');
  }
  if (typeof expiresIn !== 'number') {
    throw new HttpError(502, 'google_error', 'no token lifetime');
  }
  return { accessToken, refreshToken, expiresIn };
}

export interface GoogleUserInfo {
  email: string;
  emailVerified: boolean;
  sub: string;
}

/**
 * Reads the signed-in account from the OpenID Connect userinfo endpoint.
 * Throws `HttpError(502, 'google_error')` on a non-2xx answer or a body
 * without `email` and `sub`.
 */
export async function fetchUserInfo(
  accessToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<GoogleUserInfo> {
  const body = await callGoogle(
    'userinfo endpoint',
    fetchImpl,
    GOOGLE_USERINFO_URL,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  const { email, sub } = body;
  if (typeof email !== 'string' || email.length === 0) {
    throw new HttpError(502, 'google_error', 'userinfo has no email');
  }
  if (typeof sub !== 'string' || sub.length === 0) {
    throw new HttpError(502, 'google_error', 'userinfo has no subject');
  }
  return { email, emailVerified: body.email_verified === true, sub };
}
