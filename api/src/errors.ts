import type { ErrorHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * Every code the Worker sends in `error.code`: kebab-case, the vocabulary of
 * docs/specs/2026-10-04-worker-contract.md. The app reads `code`, so a new
 * one is added here and in the contract together.
 */
export const ERROR_CODES = [
  'config',
  'forbidden',
  'internal',
  'no-folder',
  'not-found',
  'nothing',
  'payload-too-large',
  'rate-limited',
  'stale-session',
  'unsupported-media-type',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * An error meant to reach the client as-is: a stable `code` and a message
 * safe to show, mapped to `status` by the error middleware.
 */
export class HttpError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: ErrorCode;

  constructor(
    status: ContentfulStatusCode,
    code: ErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
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
      console.error(`[${requestId}] ${err.code}: ${err.message}`);
      return c.json(
        { error: { code: err.code, message: err.message } },
        err.status,
      );
    }

    console.error(`[${requestId}] unhandled error:`, err);
    return c.json(
      { error: { code: 'internal', message: 'Internal error' } },
      500,
    );
  };
}
