/**
 * Operator administration of the allowlist: invite (`POST /admin/allow`),
 * remove (`DELETE /admin/allow/:email`) and list signed-in users
 * (`GET /admin/users`). Every route requires `Authorization: Bearer
 * <ADMIN_KEY>`, compared in constant time. Nothing here logs the admin key
 * or a refresh token — only a Google error code, on a best-effort revoke.
 */

import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';

import type { AuthDeps } from './auth.js';
import { decrypt, importEncryptionKey, timingSafeEqual } from './crypto.js';
import type { AppEnv } from './env.js';
import { HttpError } from './errors.js';
import { revokeToken } from './google.js';
import type { FetchLike } from './google.js';
import {
  allow,
  deleteUserData,
  disallow,
  findUserByEmail,
  listUsers,
} from './store.js';

function unauthorized(): HttpError {
  return new HttpError(401, 'unauthorized', 'Missing or invalid admin key');
}

/**
 * Requires `Authorization: Bearer <ADMIN_KEY>`, compared with
 * `timingSafeEqual`. Missing header, wrong scheme or wrong key are all a
 * 401 `unauthorized`; the key itself is never logged.
 */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header('authorization') ?? '';
  const [scheme, key] = header.split(' ');
  if (scheme !== 'Bearer' || key === undefined || key === '') {
    throw unauthorized();
  }
  if (!timingSafeEqual(key, c.get('env').ADMIN_KEY)) {
    throw unauthorized();
  }
  await next();
};

function invalidEmail(): HttpError {
  return new HttpError(400, 'invalid_email', 'email must be a valid address');
}

/** A non-empty string containing `@`; anything else is a 400 `invalid_email`. */
function parseEmail(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || !value.includes('@')) {
    throw invalidEmail();
  }
  return value;
}

/** The error `code` of `err`, for a log line that never contains a token. */
function errorCode(err: unknown): string {
  if (err instanceof HttpError) return err.code;
  if (err instanceof Error && 'code' in err && typeof err.code === 'string') {
    return err.code;
  }
  return 'unknown';
}

/** The admin routes as a Hono sub-app, mounted at `/` by `index.ts`. */
export function createAdminRoutes(deps: AuthDeps = {}): Hono<AppEnv> {
  const fetchImpl: FetchLike =
    deps.fetchImpl ?? ((input, init) => fetch(input, init));
  const admin = new Hono<AppEnv>();

  admin.use('/admin/*', requireAdmin);

  // 204 with no body: the caller already knows the email it sent, and this
  // stays consistent with DELETE below (no normalised-email echo to parse).
  admin.post('/admin/allow', async (c) => {
    const body: unknown = await c.req.json().catch(() => undefined);
    const email = parseEmail(
      body !== null && typeof body === 'object'
        ? (body as Record<string, unknown>).email
        : undefined,
    );
    await allow(c.get('env').BOWER_KV, email);
    return c.body(null, 204);
  });

  admin.delete('/admin/allow/:email', async (c) => {
    const env = c.get('env');
    const kv = env.BOWER_KV;
    const email = c.req.param('email');
    await disallow(kv, email);

    const user = await findUserByEmail(kv, email);
    if (user !== undefined) {
      try {
        const key = await importEncryptionKey(env.TOKEN_ENC_KEY);
        const refreshToken = await decrypt(user.encRefreshToken, key);
        await revokeToken(refreshToken, fetchImpl);
      } catch (err) {
        // Best effort: the user is removed either way. Only the error code
        // is logged, never the token or the decrypted refresh token.
        console.error(`admin revoke failed: ${errorCode(err)}`);
      }
      await deleteUserData(kv, user.id);
    }

    return c.body(null, 204);
  });

  admin.get('/admin/users', async (c) => {
    const users = await listUsers(c.get('env').BOWER_KV);
    return c.json(users);
  });

  return admin;
}
