import type { ErrorHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * An error meant to reach the client as-is: a stable `code` and a message
 * safe to show, mapped to `status` by the error middleware.
 */
export class HttpError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;

  constructor(
    status: ContentfulStatusCode,
    code: string,
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
