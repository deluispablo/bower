/**
 * Sign-in with Google and the session it creates: `/auth/login`,
 * `/auth/callback`, `/auth/logout`, `/me`, and the `requireSession`
 * middleware later routes reuse.
 *
 * Nothing here logs emails, codes or tokens; error messages are generic.
 */

import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';

import { encrypt, importEncryptionKey, timingSafeEqual } from './crypto.js';
import type { AppEnv } from './env.js';
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
import {
  SESSION_TTL_SECONDS,
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
  findUserByEmail,
  getQuota,
  getUser,
  isAllowed,
  putUser,
} from './store.js';
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

const NOT_INVITED_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Not invited</title>
<style>
body { font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.5; }
</style>
</head>
<body>
<h1>Not invited</h1>
<p>You have not been invited to this Bower.</p>
<p>Ask the person who runs it to add your Google account, then sign in again.</p>
</body>
</html>
`;

function unauthenticated(): HttpError {
  return new HttpError(401, 'unauthenticated', 'Not signed in');
}

/**
 * Requires a valid session cookie and sets `c.get('userId')`. Any failure
 * (no cookie, bad signature, expired) is a 401 `unauthenticated`.
 */
export const requireSession: MiddlewareHandler<
  AppEnv & { Variables: { userId: string } }
> = async (c, next) => {
  const token = readSessionCookie(c.req.header('cookie'));
  if (token === undefined) throw unauthenticated();
  let userId: string;
  try {
    ({ userId } = await verifySession(token, c.get('env').SESSION_SECRET));
  } catch (err) {
    throw new HttpError(401, 'unauthenticated', 'Not signed in', {
      cause: err,
    });
  }
  c.set('userId', userId);
  await next();
};

/** Reads and checks the `bower_oauth` cookie; 400 `oauth_state` on any failure. */
async function readOAuthCookie(
  c: Context<AppEnv>,
  state: string,
): Promise<{ verifier: string }> {
  const token = readCookie(c.req.header('cookie'), OAUTH_COOKIE);
  if (token === undefined) {
    throw new HttpError(400, 'oauth_state', 'Sign-in expired, try again');
  }
  let claims: Record<string, unknown>;
  try {
    claims = await verifyToken(token, c.get('env').SESSION_SECRET);
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
      }),
      302,
    );
  });

  auth.get('/auth/callback', async (c) => {
    const env = c.get('env');
    if (c.req.query('error') !== undefined) {
      throw new HttpError(400, 'oauth_state', 'Sign-in was cancelled');
    }
    const code = c.req.query('code');
    const state = c.req.query('state');
    if (code === undefined || code === '' || state === undefined) {
      throw new HttpError(400, 'oauth_state', 'Sign-in could not be verified');
    }
    const { verifier } = await readOAuthCookie(c, state);

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
      // Nothing is written to KV for someone who was not invited.
      c.header('Set-Cookie', oauthCookie('', 0));
      return c.html(NOT_INVITED_HTML, 403);
    }

    const key = await importEncryptionKey(env.TOKEN_ENC_KEY);
    const encRefreshToken = await encrypt(tokens.refreshToken, key);
    const existing = await findUserByEmail(kv, info.email);
    const user: User =
      existing === undefined
        ? {
            id: crypto.randomUUID(),
            email: info.email,
            createdAt: new Date().toISOString(),
            encRefreshToken,
          }
        : { ...existing, encRefreshToken };
    delete user.needsReauth;
    await putUser(kv, user);

    const session = await signSession({ userId: user.id }, env.SESSION_SECRET);
    c.header('Set-Cookie', sessionCookie(session, SESSION_TTL_SECONDS), {
      append: true,
    });
    c.header('Set-Cookie', oauthCookie('', 0), { append: true });
    return c.redirect(env.APP_ORIGIN, 302);
  });

  auth.post('/auth/logout', (c) => {
    c.header('Set-Cookie', clearSessionCookie());
    return c.body(null, 204);
  });

  auth.get('/me', requireSession, async (c) => {
    const env = c.get('env');
    const userId = c.get('userId');
    const user = await getUser(env.BOWER_KV, userId);
    if (user === undefined) throw unauthenticated();
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
    });
  });

  return auth;
}
