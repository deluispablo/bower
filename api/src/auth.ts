/** Stub (METHOD step 6): sign-in routes; the implementation follows. */
import { Hono } from 'hono';
import type { JWTVerifyGetKey } from 'jose';

import type { AppEnv } from './env.js';
import { HttpError } from './errors.js';
import type { FetchLike } from './google.js';

export const OAUTH_COOKIE = 'bower_oauth';

export interface AuthDeps { fetchImpl?: FetchLike; keys?: JWTVerifyGetKey }

export function createAuthRoutes(_deps: AuthDeps = {}): Hono<AppEnv> {
  const auth = new Hono<AppEnv>();
  const todo = (): never => { throw new HttpError(500, 'internal'); };
  auth.get('/auth/login', todo);
  auth.get('/auth/callback', todo);
  auth.post('/auth/logout', todo);
  auth.get('/me', todo);
  return auth;
}
