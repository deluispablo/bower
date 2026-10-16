/**
 * Sign-in with Google and the session it creates: `GET /auth/login`,
 * `GET /auth/callback`, `POST /auth/logout`, `GET /me`, and the
 * `requireSession` check later routes reuse. Adapted from the original
 * app's `auth.ts`: people are keyed by their OIDC `sub` in their own person
 * object, and the session generation lives there too.
 *
 * Nothing here logs addresses, codes or tokens; every error is a contract
 * code, its cause for the log only.
 */

import type { Pacing } from '../../src/data/drive/drive-http.js';
import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';
import type { JWTVerifyGetKey } from 'jose';

import { CryptoError, decrypt, encrypt, importEncryptionKey, timingSafeEqual } from './crypto.js';
import type { AppEnv, Env } from './env.js';
import { HttpError } from './errors.js';
import { personFor } from './route-helpers.js';
import {
  buildAuthUrl,
  codeChallenge,
  createCodeVerifier,
  createNonce,
  createState,
  exchangeCode,
  googleKeys,
  verifyIdToken,
} from './google.js';
import type { FetchLike } from './google.js';
import type { PersonAccount } from './person.js';
import { RateLimitUnavailable, clientIp, enforceRateLimit, rateLimit, requireSameOrigin } from './security.js';
import {
  SESSION_TTL_SECONDS,
  SessionError,
  assertCurrentGeneration,
  clearSessionCookie,
  LEGACY_SESSION_COOKIE,
  readCookie,
  readSessionCookie,
  sessionCookie,
  signSession,
  signToken,
  verifySession,
  verifyToken,
} from './session.js';
import type { SessionClaims } from './session.js';
import { isAllowed } from './store.js';

/** Cookie holding the OAuth `state`, `nonce` and PKCE verifier between login and callback. */
export const OAUTH_COOKIE = '__Host-bower_oauth';

/** The old OAuth cookie name and its old `Path` (before the `__Host-` prefix, F4). */
const LEGACY_OAUTH_COOKIE = 'bower_oauth';

/** The OAuth cookie lives 10 minutes: long enough to click through consent. */
const OAUTH_TTL_SECONDS = 10 * 60;

function oauthCookie(token: string, maxAgeSeconds: number): string {
  return `${OAUTH_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

/** Expires the pre-prefix cookies a request still carries; they are never read again. */
function expireLegacyCookies<E extends AppEnv>(c: Context<E>): void {
  const header = c.req.header('cookie');
  if (readCookie(header, LEGACY_SESSION_COOKIE) !== undefined) {
    c.header('Set-Cookie', `${LEGACY_SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`, { append: true });
  }
  if (readCookie(header, LEGACY_OAUTH_COOKIE) !== undefined) {
    c.header('Set-Cookie', `${LEGACY_OAUTH_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/auth; Max-Age=0`, { append: true });
  }
}

function redirectUri(env: Env): string {
  return `${env.API_ORIGIN}/auth/callback`;
}

function signedOut(cause: string, error?: unknown): HttpError {
  return new HttpError(401, 'signed-out', undefined, {
    cause: error === undefined ? new Error(cause) : new Error(cause, { cause: error }),
  });
}

/** Whether `envelope` decrypts with `key`; a `CryptoError` means it does not, anything else is thrown. */
async function readable(envelope: string, key: CryptoKey): Promise<boolean> {
  try {
    await decrypt(envelope, key);
    return true;
  } catch (err) {
    if (err instanceof CryptoError) return false;
    throw err;
  }
}

/** A request's verified session and the account it belongs to. */
interface Authenticated {
  claims: SessionClaims;
  account: PersonAccount;
}

/**
 * The session a request's cookie carries, checked against the person's
 * stored generation: no cookie, a bad one (signature with `SESSION_SECRET`
 * or, during a rotation, `SESSION_SECRET_PREVIOUS`), an expired one, a
 * person with no account, or a retired generation are all `signed-out`.
 */
async function authenticate(cookieHeader: string | undefined, env: Env): Promise<Authenticated> {
  const token = readSessionCookie(cookieHeader);
  if (token === undefined) throw signedOut('no session cookie');
  let claims: SessionClaims;
  try {
    claims = await verifySession(token, env.SESSION_SECRET, undefined, env.SESSION_SECRET_PREVIOUS);
  } catch (err) {
    throw signedOut('session refused', err);
  }
  const account = await personFor(env, claims.sub).account();
  if (account === null) throw signedOut('no account for this session');
  try {
    assertCurrentGeneration(claims, account.generation);
  } catch (err) {
    if (err instanceof SessionError) throw signedOut('session retired', err);
    throw err;
  }
  return { claims, account };
}

/** Clears a session cookie the request carried but that was refused, then rethrows. */
function rejectSession<E extends AppEnv>(c: Context<E>, err: unknown): never {
  if (err instanceof HttpError && err.code === 'signed-out' && readSessionCookie(c.req.header('cookie')) !== undefined) {
    c.header('Set-Cookie', clearSessionCookie(), { append: true });
  }
  throw err;
}

/**
 * Requires a valid, current session and sets `userId` (the person's `sub`)
 * and `account`. A refused session is 401 `signed-out` and clears the cookie.
 */
export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  expireLegacyCookies(c);
  let session: Authenticated;
  try {
    session = await authenticate(c.req.header('cookie'), c.get('env'));
  } catch (err) {
    rejectSession(c, err);
  }
  // The operator's allowlist is checked on every session (TL-P3-09): taking an address off ends its sessions.
  if (!(await isAllowed(c.get('env').BOWER_KV, session.account.email))) {
    rejectSession(c, signedOut('address is no longer on the allowlist'));
  }
  c.set('userId', session.claims.sub);
  c.set('account', session.account);
  await next();
};

/** Reads and checks the OAuth cookie against Google's `state`; `signed-out` on any failure. */
async function readOAuthCookie(
  cookieHeader: string | undefined,
  secret: string,
  state: string,
): Promise<{ verifier: string; nonce: string }> {
  const token = readCookie(cookieHeader, OAUTH_COOKIE);
  if (token === undefined) throw signedOut('no OAuth cookie');
  let claims: Record<string, unknown>;
  try {
    claims = await verifyToken(token, secret);
  } catch (err) {
    throw signedOut('OAuth cookie refused', err);
  }
  const { state: expected, verifier, nonce } = claims;
  if (
    typeof expected !== 'string' ||
    typeof verifier !== 'string' ||
    typeof nonce !== 'string' ||
    !timingSafeEqual(state, expected)
  ) {
    throw signedOut('OAuth state does not match');
  }
  return { verifier, nonce };
}

export interface AuthDeps {
  /** Used for every call to Google; tests pass a stub. Defaults to `fetch`. */
  fetchImpl?: FetchLike;
  /** Google's signing keys; tests pass a local key set. Defaults to Google's JWKS. */
  keys?: JWTVerifyGetKey;
  /** The Drive transport's waits between tries (`src/data/drive/transport.ts`); tests pass `{ baseMs: 0 }`. */
  pacing?: Partial<Pacing>;
}

/** The sign-in routes and `GET /me`, mounted at `/` by `index.ts`. */
export function createAuthRoutes(deps: AuthDeps = {}): Hono<AppEnv> {
  const fetchImpl: FetchLike = deps.fetchImpl ?? ((input, init) => fetch(input, init));
  const keys = deps.keys ?? googleKeys(deps.fetchImpl);
  const auth = new Hono<AppEnv>();

  auth.get('/auth/login', rateLimit('AUTH_RATE_LIMIT'), async (c) => {
    const env = c.get('env');
    const state = createState();
    const nonce = createNonce();
    const verifier = createCodeVerifier();
    const token = await signToken({ state, nonce, verifier }, env.SESSION_SECRET, OAUTH_TTL_SECONDS);
    c.header('Set-Cookie', oauthCookie(token, OAUTH_TTL_SECONDS));
    expireLegacyCookies(c);
    return c.redirect(
      buildAuthUrl({
        clientId: env.GOOGLE_CLIENT_ID,
        redirectUri: redirectUri(env),
        state,
        nonce,
        codeChallenge: await codeChallenge(verifier),
        // Only this exact value asks again: the callback sends it when no refresh token is kept.
        consent: c.req.query('consent') === '1',
      }),
      302,
    );
  });

  // The callback is a browser navigation: whatever goes wrong, the person lands on the app's
  // sign-in with one word of why (TL-P3-07), never a JSON page. Details go to the log only.
  auth.get('/auth/callback', async (c) => {
    const env = c.get('env');
    const backToSignIn = (why: 'cancelled' | 'failed', detail: unknown) => {
      console.error(`[${c.get('requestId')}] sign-in ${why}:`, detail);
      c.header('Set-Cookie', oauthCookie('', 0));
      return c.redirect(`${env.APP_ORIGIN}/sign-in?signin=${why}`, 302);
    };
    const reported = c.req.query('error');
    if (reported !== undefined) return backToSignIn(reported === 'access_denied' ? 'cancelled' : 'failed', `Google returned ${reported}`);
    try {
      return await finishSignIn(c);
    } catch (err) {
      // A missing limiter fails closed (500); a refused request lands on the sign-in like any failure.
      if (err instanceof HttpError && err.cause instanceof RateLimitUnavailable) throw err;
      return backToSignIn('failed', err);
    }
  });

  async function finishSignIn(c: Context<AppEnv>): Promise<Response> {
    const env = c.get('env');
    const code = c.req.query('code');
    const state = c.req.query('state');
    if (code === undefined || code === '' || state === undefined) throw signedOut('callback without code or state');
    const { verifier, nonce } = await readOAuthCookie(c.req.header('cookie'), env.SESSION_SECRET, state);
    // Counted only once the cookie proves a sign-in was begun here, and before Google is asked.
    await enforceRateLimit(c, 'AUTH_RATE_LIMIT', clientIp(c));

    const tokens = await exchangeCode(
      {
        code,
        codeVerifier: verifier,
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        redirectUri: redirectUri(env),
      },
      fetchImpl,
    );
    const identity = await verifyIdToken(tokens.idToken, { clientId: env.GOOGLE_CLIENT_ID, nonce, keys });
    // An unproven address is never matched against the allowlist (Google: use email only when email_verified).
    if (!identity.emailVerified || !(await isAllowed(env.BOWER_KV, identity.email))) {
      // Nothing is kept for someone who was not invited.
      throw new HttpError(403, 'forbidden');
    }

    const key = await importEncryptionKey(env.TOKEN_ENC_KEY);
    const encRefreshToken = tokens.refreshToken === null ? null : await encrypt(tokens.refreshToken, key);
    const person = personFor(env, identity.sub);
    if (encRefreshToken === null) {
      // Google sent no new token: a kept one this Worker cannot read (TOKEN_ENC_KEY rotated) is forgotten,
      // as Google's `invalid_grant` would be, so the sign-in below finds none and asks for consent.
      const kept = await person.encryptedRefreshToken();
      if (kept !== null && !(await readable(kept, key))) {
        await person.forgetGoogleAccess(kept);
      }
    }
    const signedIn = await person.signIn({ email: identity.email, name: identity.name, encRefreshToken });
    c.header('Set-Cookie', oauthCookie('', 0));
    if (!signedIn.hasRefreshToken) {
      // Google sends a refresh token only at consent: ask once more, with consent.
      return c.redirect(`${env.API_ORIGIN}/auth/login?consent=1`, 302);
    }

    // Always a brand-new session (fresh `sid` and `iat`, OWASP: renew the session at sign-in),
    // carrying the person's current generation.
    const session = await signSession({ sub: identity.sub, gen: signedIn.generation }, env.SESSION_SECRET);
    c.header('Set-Cookie', sessionCookie(session, SESSION_TTL_SECONDS), { append: true });
    return c.redirect(env.APP_ORIGIN, 302);
  }

  // Signing out retires every session of the person (the stored generation moves on),
  // so a copied or forgotten cookie on another device stops working too.
  auth.post('/auth/logout', requireSameOrigin, async (c) => {
    const env = c.get('env');
    let session: Authenticated | undefined;
    try {
      session = await authenticate(c.req.header('cookie'), env);
    } catch (err) {
      // Already signed out: there is nothing to retire, only the cookie to clear.
      if (!(err instanceof HttpError && err.code === 'signed-out')) throw err;
    }
    if (session !== undefined) {
      await enforceRateLimit(c, 'AUTH_RATE_LIMIT', clientIp(c));
      await personFor(env, session.claims.sub).retireSessions();
    }
    c.header('Set-Cookie', clearSessionCookie());
    return c.body(null, 204);
  });

  auth.get('/me', requireSession, async (c) => {
    const account = c.get('account');
    const sub = c.get('userId');
    if (account === undefined || sub === undefined) throw new HttpError(500, 'internal');
    const env = c.get('env');
    // The pointer POST /vault stored, or null before the first one.
    const folderId = await personFor(env, sub).folderId();
    return c.json({ user: { name: account.name, email: account.email }, folderId });
  });

  return auth;
}
