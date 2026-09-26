import { HttpError } from './errors.js';

/**
 * The Worker's full binding contract: every secret (`wrangler secret put`)
 * and every var (`[vars]` in `wrangler.toml`), plus the KV namespace.
 * Secrets and vars are always strings on a Cloudflare Worker; `assertEnv`
 * is what turns "the type says string" into "it actually is one, and it
 * looks valid" at runtime.
 */
export interface Env {
  BOWER_KV: KVNamespace;

  // Secrets (wrangler secret put / .dev.vars) — no defaults, ever.
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  TOKEN_ENC_KEY: string;
  BOWER_API_KEY: string;
  GITHUB_TOKEN: string;
  ADMIN_KEY: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;

  // Vars without a default: required, but not secret.
  APP_ORIGIN: string;
  API_ORIGIN: string;
  GITHUB_REPO: string;
  VAPID_SUBJECT: string;

  // Vars with a default (applied by assertEnv when absent).
  DAILY_RUN_LIMIT: string;
  DEFAULT_MAX_TURNS: string;
  TEMPLATE_FOLDER_NAME: string;

  // Pre-existing var (#6), unrelated to this issue's contract; passed
  // through as-is.
  APP_VERSION: string;
}

const REQUIRED_SECRETS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'SESSION_SECRET',
  'TOKEN_ENC_KEY',
  'BOWER_API_KEY',
  'GITHUB_TOKEN',
  'ADMIN_KEY',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
] as const satisfies readonly (keyof Env)[];

const REQUIRED_VARS = [
  'APP_ORIGIN',
  'API_ORIGIN',
  'GITHUB_REPO',
  'VAPID_SUBJECT',
] as const satisfies readonly (keyof Env)[];

const DEFAULTS = {
  DAILY_RUN_LIMIT: '20',
  DEFAULT_MAX_TURNS: '30',
  TEMPLATE_FOLDER_NAME: 'Bower',
} as const satisfies Partial<Record<keyof Env, string>>;

type UnvalidatedEnv = Partial<Record<keyof Env, unknown>>;

function missing(key: string): never {
  throw new HttpError(500, 'config', `missing ${key}`);
}

function requireString(source: UnvalidatedEnv, key: keyof Env): string {
  const value = source[key];
  if (typeof value !== 'string' || value.length === 0) {
    missing(key);
  }
  return value;
}

/** Decodes base64 and returns the byte length, or `null` if it isn't valid base64. */
function decodedByteLength(base64: string): number | null {
  try {
    return atob(base64).length;
  } catch {
    return null;
  }
}

/** A non-negative integer, as Cloudflare gives us vars: a plain string. */
function requireCount(value: string, key: keyof Env): string {
  if (!/^\d+$/.test(value)) {
    throw new HttpError(
      500,
      'config',
      `invalid ${key}: must be a whole number`,
    );
  }
  return value;
}

/**
 * Validates the Worker's bindings and returns them typed as `Env`, throwing
 * `HttpError(500, 'config', ...)` naming the first missing secret or
 * var-without-a-default, or the first var that fails its own validation
 * (`TOKEN_ENC_KEY`'s length, the numeric vars' format). Vars with a default
 * (`DAILY_RUN_LIMIT`, `DEFAULT_MAX_TURNS`, `TEMPLATE_FOLDER_NAME`) fall back
 * to it when absent.
 *
 * Cheap (string checks plus one base64 decode), so it is called on every
 * request via middleware rather than cached per isolate — simpler, and an
 * isolate that started with a bad binding never serves a second request
 * before failing anyway.
 */
export function assertEnv(env: unknown): Env {
  const source = (
    typeof env === 'object' && env !== null ? env : {}
  ) as UnvalidatedEnv;

  for (const key of REQUIRED_SECRETS) {
    requireString(source, key);
  }
  for (const key of REQUIRED_VARS) {
    requireString(source, key);
  }

  const tokenEncKey = requireString(source, 'TOKEN_ENC_KEY');
  if (decodedByteLength(tokenEncKey) !== 32) {
    throw new HttpError(
      500,
      'config',
      'invalid TOKEN_ENC_KEY: must be base64 for exactly 32 bytes',
    );
  }

  const dailyRunLimit = requireCount(
    typeof source.DAILY_RUN_LIMIT === 'string'
      ? source.DAILY_RUN_LIMIT
      : DEFAULTS.DAILY_RUN_LIMIT,
    'DAILY_RUN_LIMIT',
  );
  const defaultMaxTurns = requireCount(
    typeof source.DEFAULT_MAX_TURNS === 'string'
      ? source.DEFAULT_MAX_TURNS
      : DEFAULTS.DEFAULT_MAX_TURNS,
    'DEFAULT_MAX_TURNS',
  );
  const templateFolderName =
    typeof source.TEMPLATE_FOLDER_NAME === 'string' &&
    source.TEMPLATE_FOLDER_NAME.length > 0
      ? source.TEMPLATE_FOLDER_NAME
      : DEFAULTS.TEMPLATE_FOLDER_NAME;

  return {
    BOWER_KV: source.BOWER_KV as KVNamespace,

    GOOGLE_CLIENT_ID: requireString(source, 'GOOGLE_CLIENT_ID'),
    GOOGLE_CLIENT_SECRET: requireString(source, 'GOOGLE_CLIENT_SECRET'),
    SESSION_SECRET: requireString(source, 'SESSION_SECRET'),
    TOKEN_ENC_KEY: tokenEncKey,
    BOWER_API_KEY: requireString(source, 'BOWER_API_KEY'),
    GITHUB_TOKEN: requireString(source, 'GITHUB_TOKEN'),
    ADMIN_KEY: requireString(source, 'ADMIN_KEY'),
    VAPID_PUBLIC_KEY: requireString(source, 'VAPID_PUBLIC_KEY'),
    VAPID_PRIVATE_KEY: requireString(source, 'VAPID_PRIVATE_KEY'),

    APP_ORIGIN: requireString(source, 'APP_ORIGIN'),
    API_ORIGIN: requireString(source, 'API_ORIGIN'),
    GITHUB_REPO: requireString(source, 'GITHUB_REPO'),
    VAPID_SUBJECT: requireString(source, 'VAPID_SUBJECT'),

    DAILY_RUN_LIMIT: dailyRunLimit,
    DEFAULT_MAX_TURNS: defaultMaxTurns,
    TEMPLATE_FOLDER_NAME: templateFolderName,

    APP_VERSION:
      typeof source.APP_VERSION === 'string' ? source.APP_VERSION : '',
  };
}
