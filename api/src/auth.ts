/**
 * Sign-in with Google and the session it creates: `/auth/login`,
 * `/auth/callback`, `/auth/logout`, `/auth/logout-all`, `/me`, and the
 * `requireSession` middleware later routes reuse.
 *
 * Nothing here logs emails, codes or tokens; error messages are generic.
 */

import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';

import {
  decrypt,
  encrypt,
  importEncryptionKey,
  timingSafeEqual,
} from './crypto.js';
import type { AppEnv, Env } from './env.js';
import { HttpError } from './errors.js';
import {
  buildAuthUrl,
  codeChallenge,
  createCodeVerifier,
  createState,
  exchangeCode,
  fetchUserInfo,
} from './google.js';
import type { FetchLike } from './google.js';
import { rateLimit, requireSameOrigin } from './security.js';
import {
  SESSION_TTL_SECONDS,
  SessionError,
  clearSessionCookie,
  readCookie,
  readSessionCookie,
  sessionCookie,
  signSession,
  signToken,
  verifySession,
  verifyToken,
} from './session.js';
import {
  deleteUserData,
  findUserByEmail,
  getQuota,
  getSessionGeneration,
  getUser,
  isAllowed,
  isDeleted,
  putSessionGeneration,
  putUser,
  updateUser,
} from './store.js';
import type { SessionClaims } from './session.js';
import type { User } from './types.js';

/** Cookie holding the OAuth `state` and PKCE verifier between login and callback. */
export const OAUTH_COOKIE = 'bower_oauth';

/** The OAuth cookie lives 10 minutes: long enough to click through consent. */
const OAUTH_TTL_SECONDS = 10 * 60;

function oauthCookie(token: string, maxAgeSeconds: number): string {
  return `${OAUTH_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/auth; Max-Age=${maxAgeSeconds}`;
}

function redirectUri(apiOrigin: string): string {
  return `${apiOrigin}/auth/callback`;
}

/**
 * Cookie telling the app which address was turned away, for its Not invited
 * screen. The value is a signed token (`purpose: 'not_invited'`) whose only
 * other claim is the address, AES-GCM encrypted: never readable as is.
 */
export const NOT_INVITED_COOKIE = 'bower_not_invited';

/** Five minutes: enough to land on the app's Not invited screen once. */
const NOT_INVITED_TTL_SECONDS = 5 * 60;

const NOT_INVITED_PURPOSE = 'not_invited';

function notInvitedCookie(token: string, maxAgeSeconds: number): string {
  return `${NOT_INVITED_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

async function signNotInvited(email: string, env: Env): Promise<string> {
  const key = await importEncryptionKey(env.TOKEN_ENC_KEY);
  return signToken(
    { purpose: NOT_INVITED_PURPOSE, email: await encrypt(email, key) },
    env.SESSION_SECRET,
    NOT_INVITED_TTL_SECONDS,
  );
}

/**
 * The address in a `bower_not_invited` cookie, or `undefined` when there is
 * none or it does not verify (bad signature, expired, another purpose, not
 * decryptable): any of those is treated as no cookie at all.
 */
async function readNotInvited(
  cookieHeader: string | undefined,
  env: Env,
): Promise<string | undefined> {
  const token = readCookie(cookieHeader, NOT_INVITED_COOKIE);
  if (token === undefined) return undefined;
  try {
    const claims = await verifyToken(token, env.SESSION_SECRET);
    if (
      claims.purpose !== NOT_INVITED_PURPOSE ||
      typeof claims.email !== 'string'
    ) {
      return undefined;
    }
    const key = await importEncryptionKey(env.TOKEN_ENC_KEY);
    return await decrypt(claims.email, key);
  } catch {
    // A bad or stale cookie only means there is no address to show.
    return undefined;
  }
}

function unauthenticated(): HttpError {
  return new HttpError(401, 'unauthenticated', 'Not signed in');
}

function sessionExpired(cause?: unknown): HttpError {
  return new HttpError(
    401,
    'session_expired',
    'Your session has ended, sign in again',
    cause === undefined ? undefined : { cause },
  );
}

/**
 * The user's current session generation: the `sessiongen:<id>` key, or the
 * legacy `sessionGeneration` field of the record if that is higher (a
 * "Sign out everywhere" made before the key existed).
 */
async function currentGeneration(kv: KVNamespace, user: User): Promise<number> {
  const stored = await getSessionGeneration(kv, user.id);
  return Math.max(stored, user.sessionGeneration ?? 0);
}

/** An authenticated request: its user and the generation its cookie carries. */
interface Authenticated {
  user: User;
  /** The higher of the cookie's `gen` and the user's current generation. */
  generation: number;
}

/**
 * The user a request's session cookie belongs to. Throws a 401: `unauthenticated`
 * for no cookie, a bad or malformed one, or a user that no longer exists
 * (a `deleted:<id>` tombstone, checked first, or no record); `session_expired`
 * for a session past its absolute lifetime (30 days from sign-in) or signed
 * before the user's latest "Sign out everywhere" (`gen` below the
 * `sessiongen:<id>` generation).
 *
 * Revocation state lives in keys only deletion and logout-all write, never
 * in the user record other routes rewrite. KV is eventually consistent, so
 * another location may still accept a revoked cookie for up to about 60 s.
 */
async function authenticate(
  cookieHeader: string | undefined,
  env: Env,
): Promise<Authenticated> {
  const token = readSessionCookie(cookieHeader);
  if (token === undefined) throw unauthenticated();
  let claims: SessionClaims;
  try {
    claims = await verifySession(
      token,
      env.SESSION_SECRET,
      undefined,
      env.SESSION_SECRET_PREVIOUS,
    );
  } catch (err) {
    if (err instanceof SessionError && err.code === 'expired') {
      throw sessionExpired(err);
    }
    throw new HttpError(401, 'unauthenticated', 'Not signed in', {
      cause: err,
    });
  }
  const kv = env.BOWER_KV;
  const [deleted, user, stored] = await Promise.all([
    isDeleted(kv, claims.userId),
    getUser(kv, claims.userId),
    getSessionGeneration(kv, claims.userId),
  ]);
  if (deleted || user === undefined) throw unauthenticated();
  const generation = Math.max(stored, user.sessionGeneration ?? 0);
  if (claims.gen < generation) throw sessionExpired();
  return { user, generation: Math.max(generation, claims.gen) };
}

/**
 * Clears a session cookie the request carried but that was rejected, so the
 * browser stops sending it, then rethrows `err`.
 */
function rejectSession<E extends AppEnv>(c: Context<E>, err: unknown): never {
  if (readSessionCookie(c.req.header('cookie')) !== undefined) {
    c.header('Set-Cookie', clearSessionCookie(), { append: true });
  }
  throw err;
}

/**
 * Requires a valid, current session (see `authenticate`) and sets
 * `c.get('userId')`. Any failure is a 401 that also clears the cookie.
 */
export const requireSession: MiddlewareHandler<
  AppEnv & { Variables: { userId: string } }
> = async (c, next) => {
  let user: User;
  try {
    ({ user } = await authenticate(c.req.header('cookie'), c.get('env')));
  } catch (err) {
    rejectSession(c, err);
  }
  c.set('userId', user.id);
  await next();
};

/** Reads and checks the `bower_oauth` cookie; 400 `oauth_state` on any failure. */
async function readOAuthCookie(
  cookieHeader: string | undefined,
  secret: string,
  state: string,
): Promise<{ verifier: string }> {
  const token = readCookie(cookieHeader, OAUTH_COOKIE);
  if (token === undefined) {
    throw new HttpError(400, 'oauth_state', 'Sign-in expired, try again');
  }
  let claims: Record<string, unknown>;
  try {
    claims = await verifyToken(token, secret);
  } catch (err) {
    throw new HttpError(400, 'oauth_state', 'Sign-in expired, try again', {
      cause: err,
    });
  }
  const { state: expected, verifier } = claims;
  if (
    typeof expected !== 'string' ||
    typeof verifier !== 'string' ||
    !timingSafeEqual(state, expected)
  ) {
    throw new HttpError(400, 'oauth_state', 'Sign-in could not be verified');
  }
  return { verifier };
}

/** What `checkOAuthCallback` leaves for the callback handler. */
type CallbackEnv = AppEnv & {
  Variables: { oauthCode: string; oauthVerifier: string };
};

/** The strict limit on `GET /auth/callback`, per client IP. */
const limitCallback = rateLimit<CallbackEnv>('callback');

/**
 * The callback's checks that touch no KV, then its strict limit: Google's
 * answer carries a code and a state, and the `bower_oauth` cookie verifies
 * (HMAC) and matches that state. A request without a valid cookie is
 * refused with a 400 before it is counted or anything is written.
 */
const checkOAuthCallback: MiddlewareHandler<CallbackEnv> = async (c, next) => {
  if (c.req.query('error') !== undefined) {
    throw new HttpError(400, 'oauth_state', 'Sign-in was cancelled');
  }
  const code = c.req.query('code');
  const state = c.req.query('state');
  if (code === undefined || code === '' || state === undefined) {
    throw new HttpError(400, 'oauth_state', 'Sign-in could not be verified');
  }
  const { verifier } = await readOAuthCookie(
    c.req.header('cookie'),
    c.get('env').SESSION_SECRET,
    state,
  );
  c.set('oauthCode', code);
  c.set('oauthVerifier', verifier);
  await limitCallback(c, next);
};

export interface AuthDeps {
  /** Used for every call to Google; tests pass a stub. Defaults to `fetch`. */
  fetchImpl?: FetchLike;
}

/** The auth routes as a Hono sub-app, mounted at `/` by `index.ts`. */
export function createAuthRoutes(deps: AuthDeps = {}): Hono<AppEnv> {
  const fetchImpl: FetchLike =
    deps.fetchImpl ?? ((input, init) => fetch(input, init));
  const auth = new Hono<AppEnv>();

  auth.get('/auth/login', async (c) => {
    const env = c.get('env');
    const state = createState();
    const verifier = createCodeVerifier();
    const token = await signToken(
      { state, verifier },
      env.SESSION_SECRET,
      OAUTH_TTL_SECONDS,
    );
    c.header('Set-Cookie', oauthCookie(token, OAUTH_TTL_SECONDS));
    return c.redirect(
      buildAuthUrl({
        clientId: env.GOOGLE_CLIENT_ID,
        redirectUri: redirectUri(env.API_ORIGIN),
        state,
        codeChallenge: await codeChallenge(verifier),
        // Only this exact value is forwarded: "Try another account".
        selectAccount: c.req.query('prompt') === 'select_account',
      }),
      302,
    );
  });

  auth.get('/auth/callback', checkOAuthCallback, async (c) => {
    const env = c.get('env');
    const code = c.get('oauthCode');
    const verifier = c.get('oauthVerifier');

    const tokens = await exchangeCode(
      {
        code,
        codeVerifier: verifier,
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        redirectUri: redirectUri(env.API_ORIGIN),
      },
      fetchImpl,
    );
    const info = await fetchUserInfo(tokens.accessToken, fetchImpl);
    if (!info.emailVerified) {
      throw new HttpError(
        403,
        'email_unverified',
        'Google account email is not verified',
      );
    }

    const kv = env.BOWER_KV;
    if (!(await isAllowed(kv, info.email))) {
      // Nothing is written to KV for someone who was not invited, and the
      // address travels only inside the encrypted cookie, never the URL.
      c.header(
        'Set-Cookie',
        notInvitedCookie(
          await signNotInvited(info.email, env),
          NOT_INVITED_TTL_SECONDS,
        ),
      );
      c.header('Set-Cookie', oauthCookie('', 0), { append: true });
      return c.redirect(`${env.APP_ORIGIN}/not-invited`, 302);
    }

    const key = await importEncryptionKey(env.TOKEN_ENC_KEY);
    const encRefreshToken = await encrypt(tokens.refreshToken, key);
    // An existing user gets its token (and reauth flag) changed, and its
    // given name refreshed from Google every time (#323) — so a returning
    // user who signed up before this existed gets one on their next
    // sign-in, and a name change on the Google side follows. A deleted one
    // (tombstone) is never revived, even when a stale write re-created its
    // record: that record is removed and a fresh account with a new id is
    // created, so no cookie of the old one works again.
    const existing = await findUserByEmail(kv, info.email);
    let user =
      existing === undefined || (await isDeleted(kv, existing.id))
        ? undefined
        : await updateUser(kv, existing.id, {
            encRefreshToken,
            needsReauth: null,
            givenName: info.givenName ?? null,
          });
    if (user === undefined) {
      if (existing !== undefined) await deleteUserData(kv, existing.id);
      user = {
        id: crypto.randomUUID(),
        email: info.email,
        createdAt: new Date().toISOString(),
        encRefreshToken,
        givenName: info.givenName,
      };
      await putUser(kv, user);
    }

    // Always a brand-new session (fresh `sid` and `iat`), never the one the
    // browser may already hold, carrying the user's current generation.
    const session = await signSession(
      { userId: user.id, gen: await currentGeneration(kv, user) },
      env.SESSION_SECRET,
    );
    c.header('Set-Cookie', sessionCookie(session, SESSION_TTL_SECONDS), {
      append: true,
    });
    c.header('Set-Cookie', oauthCookie('', 0), { append: true });
    return c.redirect(env.APP_ORIGIN, 302);
  });

  auth.post('/auth/logout', requireSameOrigin, (c) => {
    c.header('Set-Cookie', clearSessionCookie());
    return c.body(null, 204);
  });

  // "Sign out everywhere": every session signed so far, on any device,
  // stops working, this one included.
  // The generation lives in `sessiongen:<id>`, which nothing else writes,
  // so a request holding an older copy of the user record cannot undo it.
  auth.post('/auth/logout-all', requireSameOrigin, async (c) => {
    let session: Authenticated;
    try {
      session = await authenticate(c.req.header('cookie'), c.get('env'));
    } catch (err) {
      rejectSession(c, err);
    }
    await putSessionGeneration(
      c.get('env').BOWER_KV,
      session.user.id,
      session.generation + 1,
    );
    c.header('Set-Cookie', clearSessionCookie());
    return c.body(null, 204);
  });

  // Without a valid session, a `bower_not_invited` cookie answers once with
  // the address that was turned away, then is cleared; otherwise 401.
  auth.get('/me', async (c) => {
    const env = c.get('env');
    let user: User;
    try {
      ({ user } = await authenticate(c.req.header('cookie'), c.get('env')));
    } catch (err) {
      const email = await readNotInvited(c.req.header('cookie'), env);
      if (email === undefined) rejectSession(c, err);
      c.header('Set-Cookie', notInvitedCookie('', 0));
      return c.json({ notInvited: true, email });
    }
    const userId = user.id;
    const today = new Date().toISOString().slice(0, 10);
    return c.json({
      email: user.email,
      vault: user.vault ?? null,
      quota: {
        used: await getQuota(env.BOWER_KV, userId, today),
        limit: Number(env.DAILY_RUN_LIMIT),
      },
      needsReauth: user.needsReauth === true,
      hasApiKey: user.encApiKey !== undefined,
      ...(user.tourSeenAt === undefined ? {} : { tourSeenAt: user.tourSeenAt }),
      ...(user.givenName === undefined ? {} : { name: user.givenName }),
    });
  });

  return auth;
}
