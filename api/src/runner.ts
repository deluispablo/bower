/**
 * The runner's routes (worker contract, "Runner wire"; TL-P3-18). Stub: behaviour comes with
 * worker-runner-tickets.
 */
import { Hono } from 'hono';

import type { AuthDeps } from './auth.js';
import type { AppEnv } from './env.js';

/** `GET /runner/runs/:id/token` and `POST /runner/runs/:id/status`, mounted at `/` by `index.ts`. */
export function createRunnerRoutes(deps: AuthDeps = {}): Hono<AppEnv> {
  void deps;
  return new Hono<AppEnv>();
}
