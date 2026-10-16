import { encryptionKeyBytes } from './crypto.js';
import { HttpError } from './errors.js';
import type { Person, PersonAccount } from './person.js';

/**
 * The Worker's full binding contract: every secret (`wrangler secret put`)
 * and every var (`vars` in `wrangler.jsonc`), plus the KV namespace.
 * Secrets and vars are always strings on a Cloudflare Worker; `assertEnv`
 * is what turns "the type says string" into "it actually is one, and it
 * looks valid" at runtime.
 */
export interface Env {
  BOWER_KV: KVNamespace;
  /** One Durable Object per person, addressed by `idFromName(sub)`. */
  PERSON: DurableObjectNamespace<Person>;

  /** Rate Limiting bindings (`ratelimits` in `wrangler.jsonc`); absent where none is declared. */
  AUTH_RATE_LIMIT?: RateLimit;
  DRIVE_RATE_LIMIT?: RateLimit;
  VAULT_RATE_LIMIT?: RateLimit;

  // Secrets (wrangler secret put / .dev.vars) — no defaults, ever.
  /** A secret on the staging Worker (the lead's setup), though it travels in every sign-in address. */
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  TOKEN_ENC_KEY: string;
  /** Not required at this stage (TL-P3-06): without it a dispatch is refused. */
  GITHUB_TOKEN?: string;
  /**
   * Optional: when set, `verifySession` also accepts a session cookie
   * signed with this value, giving a `SESSION_SECRET` rotation a grace
   * window instead of signing everyone out at once (worker
   * contract). Absent on an instance that has never
   * rotated `SESSION_SECRET` this way.
   */
  SESSION_SECRET_PREVIOUS?: string;

  // Vars without a default: required, but not secret.
  APP_ORIGIN: string;
  API_ORIGIN: string;
  GITHUB_REPO: string;

  // Vars with a default (applied by assertEnv when absent).
  DAILY_RUN_LIMIT: string;
  TEMPLATE_FOLDER_NAME: string;

  // Pre-existing var (#6), unrelated to this issue's contract; passed
  // through as-is.
  APP_VERSION: string;
}

/**
 * The Hono generic for the whole app: `c.env` is the raw, unvalidated
 * bindings (`Env`), and `c.get('env')` is the result of `assertEnv` —
 * defaults applied, ready to read. Handlers should read `c.get('env')`,
 * never `c.env`, so they see the defaults `assertEnv` fills in.
 */
export interface AppEnv {
  Bindings: Env;
  Variables: {
    requestId: string;
    env: Env;
    /** The signed-in person's OIDC `sub`; set by `requireSession` (`auth.ts`) only. */
    userId?: string;
    /** The signed-in person's account, read once by `requireSession`. */
    account?: PersonAccount;
  };
}

/** The secrets this stage requires (TL-P3-06); a test pins the list. */
export const REQUIRED_SECRETS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'SESSION_SECRET',
  'TOKEN_ENC_KEY',
] as const satisfies readonly (keyof Env)[];

/** Secrets read when present, required by no route yet. */
export const OPTIONAL_SECRETS = [
  'SESSION_SECRET_PREVIOUS',
  'GITHUB_TOKEN',
] as const satisfies readonly (keyof Env)[];

const REQUIRED_VARS = [
  'APP_ORIGIN',
  'API_ORIGIN',
  'GITHUB_REPO',
] as const satisfies readonly (keyof Env)[];

/** The shortest `SESSION_SECRET` accepted: the SHA-256 output size (RFC 2104). */
const MIN_SESSION_SECRET_BYTES = 32;

const DEFAULTS = {
  DAILY_RUN_LIMIT: '100',
  TEMPLATE_FOLDER_NAME: 'Bower',
} as const satisfies Partial<Record<keyof Env, string>>;

type UnvalidatedEnv = Partial<Record<keyof Env, unknown>>;

/** Bad configuration is a 500 `internal`; the cause (never sent) goes to the log. */
function misconfigured(cause: string): never {
  throw new HttpError(500, 'internal', undefined, { cause: new Error(cause) });
}

function missing(key: string): never {
  return misconfigured(`missing ${key}`);
}

function requireString(source: UnvalidatedEnv, key: keyof Env): string {
  const value = source[key];
  if (typeof value !== 'string' || value.length === 0) {
    missing(key);
  }
  return value;
}

/**
 * Like `requireString`, but the key may be entirely absent (an unset
 * Cloudflare secret): returns `undefined` then, instead of failing. A
 * present-but-empty value still fails loudly, same as a required secret —
 * an operator piping an empty value into `wrangler secret put` gets the
 * same clear error either way.
 */
function optionalString(
  source: UnvalidatedEnv,
  key: keyof Env,
): string | undefined {
  if (source[key] === undefined) return undefined;
  return requireString(source, key);
}

/** A non-negative integer, as Cloudflare gives us vars: a plain string. */
function requireCount(value: string, key: keyof Env): string {
  if (!/^\d+$/.test(value)) {
    misconfigured(`invalid ${key}: must be a whole number`);
  }
  return value;
}

/** A Rate Limiting binding as given, or `undefined` when it is not an object with `limit`. */
function rateLimiter(value: unknown): RateLimit | undefined {
  return typeof value === 'object' && value !== null && 'limit' in value ? (value as RateLimit) : undefined;
}

/**
 * Validates the Worker's bindings and returns them typed as `Env`, throwing
 * `HttpError(500, 'internal')` whose cause (logged, never sent) names the first
 * missing secret or var-without-a-default, or the first value that fails its own
 * validation (`TOKEN_ENC_KEY` as `encryptionKeyBytes` checks it, `SESSION_SECRET`'s length, the numeric var's format).
 * Vars with a default (`DAILY_RUN_LIMIT`, `TEMPLATE_FOLDER_NAME`) fall back to it when absent.
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
  try {
    encryptionKeyBytes(tokenEncKey);
  } catch (err) {
    misconfigured(`invalid TOKEN_ENC_KEY: ${err instanceof Error ? err.message : String(err)}`);
  }

  // RFC 2104: an HMAC key shorter than the hash output (32 bytes for SHA-256) weakens it.
  const sessionSecret = requireString(source, 'SESSION_SECRET');
  if (new TextEncoder().encode(sessionSecret).length < MIN_SESSION_SECRET_BYTES) {
    misconfigured(`invalid SESSION_SECRET: must be at least ${MIN_SESSION_SECRET_BYTES} bytes`);
  }

  if (typeof source.PERSON !== 'object' || source.PERSON === null) {
    missing('PERSON');
  }

  const dailyRunLimit = requireCount(
    typeof source.DAILY_RUN_LIMIT === 'string'
      ? source.DAILY_RUN_LIMIT
      : DEFAULTS.DAILY_RUN_LIMIT,
    'DAILY_RUN_LIMIT',
  );
  const templateFolderName =
    typeof source.TEMPLATE_FOLDER_NAME === 'string' &&
    source.TEMPLATE_FOLDER_NAME.length > 0
      ? source.TEMPLATE_FOLDER_NAME
      : DEFAULTS.TEMPLATE_FOLDER_NAME;

  return {
    BOWER_KV: source.BOWER_KV as KVNamespace,
    PERSON: source.PERSON as DurableObjectNamespace<Person>,

    GOOGLE_CLIENT_ID: requireString(source, 'GOOGLE_CLIENT_ID'),
    GOOGLE_CLIENT_SECRET: requireString(source, 'GOOGLE_CLIENT_SECRET'),
    SESSION_SECRET: sessionSecret,
    TOKEN_ENC_KEY: tokenEncKey,
    GITHUB_TOKEN: optionalString(source, 'GITHUB_TOKEN'),
    SESSION_SECRET_PREVIOUS: optionalString(source, 'SESSION_SECRET_PREVIOUS'),

    APP_ORIGIN: requireString(source, 'APP_ORIGIN'),
    API_ORIGIN: requireString(source, 'API_ORIGIN'),
    GITHUB_REPO: requireString(source, 'GITHUB_REPO'),

    AUTH_RATE_LIMIT: rateLimiter(source.AUTH_RATE_LIMIT),
    DRIVE_RATE_LIMIT: rateLimiter(source.DRIVE_RATE_LIMIT),
    VAULT_RATE_LIMIT: rateLimiter(source.VAULT_RATE_LIMIT),

    DAILY_RUN_LIMIT: dailyRunLimit,
    TEMPLATE_FOLDER_NAME: templateFolderName,

    APP_VERSION:
      typeof source.APP_VERSION === 'string' ? source.APP_VERSION : '',
  };
}
