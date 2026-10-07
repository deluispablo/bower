/**
 * `POST /vault`: find or make the person's Bower folder in their own Drive
 * and keep only its pointer (`folder_id`) in the person object.
 *
 * Stub: signatures only, behaviour comes with the tests (P3-5).
 */

import { Hono } from 'hono';

import type { AuthDeps } from './auth.js';
import type { AppEnv, Env } from './env.js';
import { HttpError } from './errors.js';
import type { FetchLike } from './google.js';
import type { TemplateFile } from './template.generated.js';

/** The marker every Bower folder carries in `appProperties` (private to this OAuth client). */
export const FOLDER_MARKER = { bowerFolder: '1' } as const;

export interface VaultResult {
  folderId: string;
  /** True when the person already had the folder; false when it was just made. */
  found: boolean;
}

export interface VaultOptions {
  fetchImpl?: FetchLike;
  files?: readonly TemplateFile[];
}

/** The pointer if it names a live folder, else the person's marked folder, else a new one from the template. */
export function ensureVault(_env: Env, _sub: string, _options: VaultOptions = {}): Promise<VaultResult> {
  return Promise.reject(new HttpError(500, 'internal', undefined, { cause: new Error('not implemented') }));
}

/** `POST /vault`, mounted at `/` by `index.ts`. */
export function createVaultRoutes(_deps: AuthDeps = {}): Hono<AppEnv> {
  return new Hono<AppEnv>();
}
