/**
 * Request hardening shared by every route: CORS for the app's origin only,
 * security headers on every response, a bounded request id, input limits
 * (body size, JSON content type), the same-origin (CSRF) check for
 * state-changing session routes, and the rate limits.
 *
 * See `docs/security.md` for the threat model these serve.
 */

import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import type { Context, MiddlewareHandler } from 'hono';

import type { AppEnv } from './env.js';
import { HttpError } from './errors.js';

/**
 * CORS for `APP_ORIGIN` only, read from the validated env on each request
 * (so it must run after the `assertEnv` middleware). Cookies are allowed
 * (`credentials`); any other origin gets no `Access-Control-Allow-Origin`,
 * so the browser refuses the response and the preflight.
 */
export function appCors(): MiddlewareHandler<AppEnv> {
  return cors({
    origin: (origin: string, c: Context<AppEnv>) =>
      origin === c.get('env').APP_ORIGIN ? origin : null,
    credentials: true,
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Bower-Place', 'X-Bower-Epoch'],
    exposeHeaders: ['X-Request-Id'],
  });
}

/**
 * Adds `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`,
 * `Referrer-Policy: no-referrer`, `Strict-Transport-Security` and
 * a CSP to every response,
 * errors included. The response's `Content-Type` is left alone. The Worker
 * serves only JSON and redirects, so its policy loads nothing and cannot be
 * framed; the app's own pages carry the fuller policy in `public/_headers`
 * (static assets bypass the Worker), which carries the same four headers.
 */
export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'no-referrer');
  c.header(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload',
  );
  c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
};

/** What a client-supplied `x-request-id` may look like to be kept. */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * The request id for this request: the client's `x-request-id` when it is 1
 * to 64 characters of `A-Z a-z 0-9 . _ -`, else a fresh UUID. A value that
 * fails the check is never echoed or logged.
 */
export function requestIdFrom(header: string | undefined): string {
  return header !== undefined && REQUEST_ID_PATTERN.test(header)
    ? header
    : crypto.randomUUID();
}

/**
 * Sets the `requestId` variable (see `requestIdFrom`) and echoes it in the
 * `x-request-id` response header. Mounted right after `securityHeaders`, so
 * every log line and error response carries it.
 */
export const requestId: MiddlewareHandler<AppEnv> = async (c, next) => {
  const id = requestIdFrom(c.req.header('x-request-id'));
  c.set('requestId', id);
  c.header('x-request-id', id);
  await next();
};

/** Largest request body accepted, in bytes (64 KB). */
export const MAX_BODY_BYTES = 64 * 1024;

/**
 * Rejects a request body over `MAX_BODY_BYTES` with a 413
 * `payload-too-large`, before any handler parses it: on `Content-Length`
 * when the request declares one, else by counting the streamed body as it
 * is read (Hono's `bodyLimit`). Requests without a body pass untouched.
 */
export const limitBody: MiddlewareHandler<AppEnv> = bodyLimit({
  maxSize: MAX_BODY_BYTES,
  onError: () => {
    throw new HttpError(413, 'payload-too-large');
  },
});

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Whether `request` carries a body: a stream that is not declared empty. */
function carriesBody(request: Request): boolean {
  return request.body !== null && request.headers.get('content-length') !== '0';
}

/**
 * A write (`POST`, `PUT`, `PATCH`, `DELETE`) that carries a body must send
 * it as `Content-Type: application/json` (parameters such as `charset`
 * allowed), else a 415 `unsupported-media-type`. Writes that take no body
 * (`POST /auth/logout`, `POST /auth/logout-all`, `POST /process`,
 * `DELETE /me`, `DELETE /admin/allow/:email`) send none and are not checked. Also closes
 * the "simple request" door: a cross-site form can only send
 * `text/plain`, `multipart/form-data` or `application/x-www-form-urlencoded`.
 */
export const requireJsonBody: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (WRITE_METHODS.has(c.req.method) && carriesBody(c.req.raw)) {
    const type = c.req
      .header('content-type')
      ?.split(';')[0]
      ?.trim()
      .toLowerCase();
    if (type !== 'application/json') {
      throw new HttpError(415, 'unsupported-media-type');
    }
  }
  await next();
};

/**
 * CSRF check for state-changing session routes: the request's `Origin`
 * header must equal `APP_ORIGIN` (browsers send it on every request that is
 * not GET or HEAD, Fetch standard; OWASP checks it first). Anything else,
 * including none, is a 403 `forbidden`. Complements the `SameSite=Lax` session
 * cookie. Runner and admin routes (bearer keys, no cookie) and `GET` routes do not use it.
 */
export const requireSameOrigin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.req.header('origin') !== c.get('env').APP_ORIGIN) {
    throw new HttpError(403, 'forbidden');
  }
  await next();
};

/** The three rate-limit bindings (`ratelimits` in `wrangler.jsonc`), by name. */
export type RateLimitName = 'AUTH_RATE_LIMIT' | 'DRIVE_RATE_LIMIT' | 'VAULT_RATE_LIMIT';

/** Seconds a refused caller is told to wait: the binding's longest period (it reports no remaining time). */
export const RATE_LIMIT_RETRY_AFTER_SECONDS = 60;

/**
 * The client address as Cloudflare reports it (`cf-connecting-ip`), else
 * `unknown` (every such request then shares one bucket). A forwarding header
 * is never a key: the caller chooses it, so rotating it would escape the limit.
 */
export function clientIp<E extends AppEnv>(c: Context<E>): string {
  const cf = c.req.header('cf-connecting-ip')?.trim();
  return cf !== undefined && cf !== '' ? cf : 'unknown';
}

/** The binding is missing or threw: the limit cannot be checked, so the request is refused (a 500). */
export class RateLimitUnavailable extends Error {}

/**
 * Counts one request in `name`'s bucket for `key` and refuses it with a 429
 * `rate-limited` and `Retry-After` (RFC 9110 section 10.2.3, whole seconds) when the
 * binding says the limit is passed. This is the one rate-limit mechanism:
 * Cloudflare's Rate Limiting binding (developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/),
 * whose limit and period (10 or 60 seconds) are set in `wrangler.jsonc`. Its
 * count is per Cloudflare location and eventually consistent, so a limit is
 * approximate, never exact.
 *
 * A binding that is absent or throws fails closed with a 500, never a silent
 * pass; every environment declares them (`ratelimits` in `wrangler.jsonc`).
 */
export async function enforceRateLimit(
  c: Context<AppEnv>,
  name: RateLimitName,
  key: string,
): Promise<void> {
  const env = c.get('env');
  const binding = env[name];
  if (binding === undefined) {
    throw new HttpError(500, 'internal', undefined, { cause: new RateLimitUnavailable(`missing ${name}`) });
  }
  let allowed: boolean;
  try {
    allowed = (await binding.limit({ key })).success;
  } catch (err) {
    throw new HttpError(500, 'internal', undefined, { cause: new RateLimitUnavailable(`${name} failed`, { cause: err }) });
  }
  if (!allowed) {
    c.header('Retry-After', String(RATE_LIMIT_RETRY_AFTER_SECONDS));
    throw new HttpError(429, 'rate-limited');
  }
}

/**
 * Middleware form of `enforceRateLimit`, keyed by the client address by
 * default (`/auth/*`) or by the signed-in person (`personKey`, mounted after
 * `requireSession`). Mount it only after the checks that write nothing, so
 * only requests that could be legitimate are counted.
 */
export function rateLimit(
  name: RateLimitName,
  keyOf: (c: Context<AppEnv>) => string = clientIp,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    await enforceRateLimit(c, name, keyOf(c));
    await next();
  };
}

/** The key for a per-person limit: the session subject `requireSession` set. */
export function personKey(c: Context<AppEnv>): string {
  const sub = c.get('userId');
  if (sub === undefined) throw new HttpError(500, 'internal');
  return sub;
}
