/**
 * Signed session tokens (HS256 JWS) and the cookie that carries them.
 *
 * Web Crypto only (`crypto.subtle`); no Node `crypto`.
 */

import {
  base64UrlDecode,
  base64UrlEncode,
  base64UrlEncodeString,
} from './crypto.js';

export type SessionErrorCode =
  'malformed' | 'unsupported_alg' | 'bad_signature' | 'expired';

/**
 * Thrown by `verifySession` and `verifyToken`. `code` is stable and safe to
 * branch on; every code means "treat the request as signed out".
 */
export class SessionError extends Error {
  readonly code: SessionErrorCode;

  constructor(code: SessionErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SessionError';
    this.code = code;
  }
}

/** Session lifetime: 30 days, in seconds. Also the cookie's `Max-Age`. */
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Name of the cookie carrying the session token. */
export const SESSION_COOKIE = 'bower_session';

const HEADER = { alg: 'HS256', typ: 'JWT' } as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function importHmacKey(
  secret: string,
  usage: 'sign' | 'verify',
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );
}

/**
 * Signs arbitrary `claims` with `secret` (HMAC SHA-256), adding `iat` (now)
 * and `exp` (`iat + ttlSeconds`), both seconds since epoch. The token is a
 * compact JWS, three unpadded base64url parts joined by dots:
 * `header.payload.signature`, where header is `{"alg":"HS256","typ":"JWT"}`
 * and signature is the HMAC of `header.payload`. Shared by the session
 * cookie and the short-lived OAuth cookie.
 */
export async function signToken(
  claims: Record<string, unknown>,
  secret: string,
  ttlSeconds: number,
  now: number = Date.now(),
): Promise<string> {
  const iat = Math.floor(now / 1000);
  const payload = { ...claims, iat, exp: iat + ttlSeconds };
  const signingInput = `${base64UrlEncodeString(JSON.stringify(HEADER))}.${base64UrlEncodeString(JSON.stringify(payload))}`;
  const key = await importHmacKey(secret, 'sign');
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/**
 * Signs a session for `payload.userId` with `SESSION_SECRET`: a `signToken`
 * whose payload is `{"userId","iat","exp"}`, with `exp = iat + 30 days`.
 */
export async function signSession(
  payload: { userId: string },
  secret: string,
  now: number = Date.now(),
): Promise<string> {
  return signToken(
    { userId: payload.userId },
    secret,
    SESSION_TTL_SECONDS,
    now,
  );
}

function decodeJsonPart(part: string): unknown {
  try {
    const text = new TextDecoder('utf-8', {
      fatal: true,
      ignoreBOM: false,
    }).decode(base64UrlDecode(part));
    return JSON.parse(text) as unknown;
  } catch (err) {
    throw new SessionError(
      'malformed',
      'Session token part is not valid JSON',
      {
        cause: err,
      },
    );
  }
}

/**
 * Checks a token's shape, algorithm and signature and returns its payload
 * object, without looking at any claim: three non-empty base64url parts and
 * a JSON header (`malformed`), `alg` exactly HS256 (`unsupported_alg`, so
 * `none` never passes), the HMAC signature (`bad_signature`), and a JSON
 * object payload (`malformed`).
 */
async function verifySignedPayload(
  token: string,
  secret: string,
): Promise<Record<string, unknown>> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw new SessionError('malformed', 'Session token must have three parts');
  }
  const [headerPart, payloadPart, signaturePart] = parts as [
    string,
    string,
    string,
  ];

  const header = decodeJsonPart(headerPart);
  if (!isRecord(header)) {
    throw new SessionError(
      'malformed',
      'Session token header is not an object',
    );
  }
  if (header.alg !== 'HS256') {
    throw new SessionError(
      'unsupported_alg',
      'Session token algorithm must be HS256',
    );
  }

  let signature: Uint8Array;
  try {
    signature = base64UrlDecode(signaturePart);
  } catch (err) {
    throw new SessionError(
      'malformed',
      'Session token signature is not valid base64url',
      {
        cause: err,
      },
    );
  }
  const key = await importHmacKey(secret, 'verify');
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    signature,
    new TextEncoder().encode(`${headerPart}.${payloadPart}`),
  );
  if (!valid) {
    throw new SessionError(
      'bad_signature',
      'Session token signature does not match',
    );
  }

  const claims = decodeJsonPart(payloadPart);
  if (!isRecord(claims)) {
    throw new SessionError(
      'malformed',
      'Session token payload is not an object',
    );
  }
  return claims;
}

/** Returns `exp` if it is an integer (`malformed`) still in the future (`expired`). */
function checkExpiry(claims: Record<string, unknown>, now: number): number {
  const { exp } = claims;
  if (typeof exp !== 'number' || !Number.isInteger(exp)) {
    throw new SessionError('malformed', 'Session token has no valid exp');
  }
  if (exp <= now / 1000) {
    throw new SessionError('expired', 'Session token has expired');
  }
  return exp;
}

/**
 * Verifies a token from `signToken` and returns its payload (including
 * `iat` and `exp`). Checks shape, algorithm and signature exactly as
 * `verifySession` does, then that `exp` is an integer still in the future;
 * the caller validates its own claims. Throws `SessionError` on any failure.
 */
export async function verifyToken(
  token: string,
  secret: string,
  now: number = Date.now(),
): Promise<Record<string, unknown>> {
  const claims = await verifySignedPayload(token, secret);
  checkExpiry(claims, now);
  return claims;
}

/**
 * Verifies a token from `signSession` and returns its claims. Checks, in
 * order: three non-empty base64url parts and a JSON header (`malformed`),
 * `alg` is exactly HS256 (`unsupported_alg`, so `none` never passes), the
 * HMAC signature (`bad_signature`), a JSON payload with a non-empty string
 * `userId` and integer `exp` (`malformed`), and `exp` still in the future
 * (`expired`). Throws `SessionError` on any failure.
 */
export async function verifySession(
  token: string,
  secret: string,
  now: number = Date.now(),
): Promise<{ userId: string; exp: number }> {
  const claims = await verifySignedPayload(token, secret);
  const { userId } = claims;
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new SessionError('malformed', 'Session token has no valid userId');
  }
  const exp = checkExpiry(claims, now);
  return { userId, exp };
}

/**
 * `Set-Cookie` value carrying `token`: `HttpOnly` (no script access),
 * `Secure`, `SameSite=Lax`, `Path=/`, expiring after `maxAgeSeconds`.
 */
export function sessionCookie(token: string, maxAgeSeconds: number): string {
  if (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds < 0) {
    throw new RangeError('maxAgeSeconds must be a non-negative integer');
  }
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

/** `Set-Cookie` value that removes the session cookie (sign out). */
export function clearSessionCookie(): string {
  return sessionCookie('', 0);
}

/**
 * Finds the cookie called `name` in a request's `Cookie` header, among any
 * other cookies. Returns `undefined` when the header is missing or has no
 * non-empty cookie of that name. The value is not verified here.
 */
export function readCookie(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  if (cookieHeader === undefined) return undefined;
  for (const pair of cookieHeader.split(';')) {
    const separator = pair.indexOf('=');
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() !== name) continue;
    const value = pair.slice(separator + 1).trim();
    return value.length > 0 ? value : undefined;
  }
  return undefined;
}

/**
 * Finds the session token in a request's `Cookie` header, among any other
 * cookies. Returns `undefined` when the header is missing or has no
 * non-empty session cookie. The value is not verified here.
 */
export function readSessionCookie(
  cookieHeader: string | undefined,
): string | undefined {
  return readCookie(cookieHeader, SESSION_COOKIE);
}
