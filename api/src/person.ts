import { DurableObject } from 'cloudflare:workers';

import type { Env } from './env.js';
import { migrate, readSchemaVersion } from './person-schema.js';

/**
 * One person's Durable Object, addressed by `idFromName(sub)` (TL-P2-05:
 * people are keyed by their OIDC sub). It holds that person's session
 * lease, run admission, quota, control row and run tickets in its own
 * SQLite database (person-schema.ts).
 *
 * One at a time: a Durable Object is single-threaded, and every method here
 * reads and writes through the synchronous `ctx.storage.sql` API with no
 * `await` in between, so no other call can interleave inside it (Cloudflare,
 * "Rules of Durable Objects" and the input/output gates). Keep it that way:
 * an `await` on anything but storage between a read and its write would
 * open the input gate and let another call in.
 */
export class Person extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Cloudflare's documented pattern: set up the schema before any call is delivered.
    void ctx.blockConcurrencyWhile(async () => {
      try {
        ctx.storage.transactionSync(() => migrate(ctx.storage.sql));
      } catch (error) {
        console.error('person storage migration failed', error);
        throw error;
      }
    });
  }

  /** The schema version this person's storage is at. */
  schemaVersion(): number {
    return readSchemaVersion(this.ctx.storage.sql);
  }

  /** Adds one to the counter for `window` and returns the new count. */
  countQuota(window: string): number {
    return this.ctx.storage.sql
      .exec<{ counter: number }>(
        `INSERT INTO quota (window, counter) VALUES (?, 1)
         ON CONFLICT (window) DO UPDATE SET counter = counter + 1
         RETURNING counter`,
        window,
      )
      .one().counter;
  }
}
