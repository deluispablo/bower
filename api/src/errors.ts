import type { ErrorHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * The general error codes: status, code and message of the "General error
 * codes" table in docs/specs/2026-10-04-worker-contract.md (TL-P3-05). The
 * test reads that table and compares; change them together.
 */
export const GENERAL_ERRORS = {
  'signed-out': { status: 401, message: 'Sign in to continue.' },
  forbidden: { status: 403, message: "Bower can't do that from here." },
  'not-found': { status: 404, message: "Bower couldn't find that." },
  'payload-too-large': { status: 413, message: 'That is too large for Bower to take.' },
  'unsupported-media-type': { status: 415, message: "Bower couldn't read that request." },
  'rate-limited': { status: 429, message: 'Bower needs a short break. Try again later.' },
  internal: {
    status: 500,
    message: "Something went wrong on Bower's side. Try again later.",
  },
} as const satisfies Record<string, { status: ContentfulStatusCode; message: string }>;

export type GeneralErrorCode = keyof typeof GENERAL_ERRORS;

/** The codes of single calls in the contract (`POST /process`, `GET /drive/token`, `POST /session`, the runner wire). */
const ROUTE_CODES = ['no-folder', 'nothing', 'stale-session', 'stale-attempt', 'stale-report'] as const;

/** Every code the Worker sends in `error.code`: kebab-case, all in the contract. */
export const ERROR_CODES = [
  ...(Object.keys(GENERAL_ERRORS) as GeneralErrorCode[]),
  ...ROUTE_CODES,
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * An error meant to reach the client as-is: a stable `code` and a message
 * safe to show, mapped to `status` by the error middleware.
 */
export class HttpError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: ErrorCode;

  /**
   * A general code takes the contract's message (pass none); a route code
   * passes its own. `cause` is for the log only, never sent.
   */
  constructor(
    status: ContentfulStatusCode,
    code: GeneralErrorCode,
    message?: undefined,
    options?: ErrorOptions,
  );
  constructor(
    status: ContentfulStatusCode,
    code: ErrorCode,
    message: string,
    options?: ErrorOptions,
  );
  constructor(
    status: ContentfulStatusCode,
    code: ErrorCode,
    message?: string,
    options?: ErrorOptions,
  ) {
    super(
      message ?? (code in GENERAL_ERRORS ? GENERAL_ERRORS[code as GeneralErrorCode].message : code),
      options,
    );
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export interface Variables {
  requestId: string;
}

/**
 * Builds the error handler passed to `app.onError`. A thrown `HttpError`
 * keeps its status and code; anything else becomes a 500 with a generic
 * message, the original error logged to console only (never returned).
 * Generic over the caller's Hono environment so it can be reused by any
 * app (or test app) that has a `requestId` variable.
 */
export function createErrorHandler<
  E extends { Variables: Variables },
>(): ErrorHandler<E> {
  return (err, c) => {
    const requestId = c.get('requestId') ?? 'unknown';
    c.header('x-request-id', requestId);

    if (err instanceof HttpError) {
      console.error(`[${requestId}] ${err.code}: ${err.message}`, err.cause ?? '');
      if (err.status === 503) {
        c.header('Retry-After', '5');
      }
      return c.json(
        { error: { code: err.code, message: err.message } },
        err.status,
      );
    }

    console.error(`[${requestId}] unhandled error:`, err);
    return c.json(
      { error: { code: 'internal', message: GENERAL_ERRORS.internal.message } },
      GENERAL_ERRORS.internal.status,
    );
  };
}
