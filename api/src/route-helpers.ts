/**
 * What every route shares: the person object seen through one error mapping, the signed-in `sub`, and the JSON body
 * reader. Nothing else in `api/src` builds a person stub, maps an RPC failure or reads a body on its own.
 */

import type { Context } from 'hono';

import type { AppEnv, Env } from './env.js';
import { HttpError } from './errors.js';
import type { Person } from './person.js';

/** Cloudflare's text when a newer Worker calls a method an older Durable Object lacks (gradual deployments). */
const SKEW = /^The RPC receiver does not implement the method/;

/**
 * An RPC failure as the client sees it. A Worker and its Durable Object are deployed in steps, so for a while the
 * Worker may call a method the object does not have yet (https://developers.cloudflare.com/workers/configuration/
 * versions-and-deployments/gradual-deployments/): that is "temporarily unavailable", 503 (RFC 9110, 15.6.4), and
 * the error handler adds `Retry-After`. Anything else is `internal`. The cause is logged here and never travels on.
 */
function rpcError(method: string, err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  if (err instanceof TypeError && SKEW.test(err.message)) {
    console.error(`person object: ${method} failed (version skew)`, err);
    return new HttpError(503, 'internal');
  }
  console.error(`person object: ${method} failed`, err);
  return new HttpError(500, 'internal');
}

/** `stub` with every method call failing as `rpcError` says. */
export function mapped<T extends object>(stub: T): T {
  return new Proxy(stub, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop);
      if (typeof prop !== 'string' || prop === 'then' || typeof value !== 'function') return value;
      return async (...args: unknown[]): Promise<unknown> => {
        try {
          return await (Reflect.get(target, prop) as (...a: unknown[]) => unknown)(...args);
        } catch (err) {
          throw rpcError(prop, err);
        }
      };
    },
  });
}

/** The person object for `sub` (TL-P2-05: one per person, keyed by OIDC sub). */
export function personFor(env: Env, sub: string): DurableObjectStub<Person> {
  return mapped(env.PERSON.get(env.PERSON.idFromName(sub)));
}

/** The person object with the given id (a runner reaches it by the id its run carries). */
export function personById(env: Env, id: DurableObjectId): DurableObjectStub<Person> {
  return mapped(env.PERSON.get(id));
}

export function signedInSub(sub: string | undefined): string {
  if (sub === undefined) throw new HttpError(500, 'internal');
  return sub;
}

/** A body that fails validation is refused as the JSON guard refuses one: 415, no other code. */
export function unreadable(): HttpError {
  return new HttpError(415, 'unsupported-media-type');
}

/** The request's JSON body, validated by `parse` (which throws `unreadable()`); a body that is not JSON is 415. */
export async function jsonBody<T>(c: Context<AppEnv>, parse: (value: unknown) => T): Promise<T> {
  let value: unknown;
  try {
    value = await c.req.json();
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw unreadable();
  }
  return parse(value);
}
