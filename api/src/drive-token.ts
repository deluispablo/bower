/**
 * `GET /drive/token` and `accessTokenFor`. STUB (wrong values on purpose):
 * the tests come first, the implementation follows in the next commit.
 */

import { Hono } from 'hono';

import type { AuthDeps } from './auth.js';
import type { AppEnv, Env } from './env.js';

/** A Drive access token and when it stops working (epoch ms). */
export interface DriveToken {
  accessToken: string;
  expiresAt: number;
}

export interface DriveTokenOptions {
  /** Refresh even when a cached token is still valid. */
  fresh?: boolean;
  /** Google's token endpoint; tests pass a stub. */
  fetchImpl?: AuthDeps['fetchImpl'];
}

export async function accessTokenFor(_env: Env, _sub: string, _options: DriveTokenOptions = {}): Promise<DriveToken> {
  return { accessToken: '', expiresAt: 0 };
}

export function createDriveRoutes(_deps: AuthDeps = {}): Hono<AppEnv> {
  return new Hono<AppEnv>();
}
